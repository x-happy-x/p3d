import type { NodePoint, Wall } from "../types/plan";
import { EDITOR_DEFAULTS } from "../config/editorConfig";

export type ExportData = {
  scale: number;
  grid: number;
  wallThickness: number;
  nodes: NodePoint[];
  walls: Wall[];
};

function uniqueId(seed = 1) {
  let id = seed;
  return () => id++;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null
);

const asFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asNonEmptyString = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
};

const normalizeNode = (raw: unknown, fallbackId: number): NodePoint | null => {
  if (!isRecord(raw)) return null;
  const id = asFiniteNumber(raw.id);
  const x = asFiniteNumber(raw.x);
  const y = asFiniteNumber(raw.y);
  if (x === null || y === null) return null;
  return {
    id: id !== null ? Math.max(1, Math.trunc(id)) : fallbackId,
    x,
    y,
  };
};

const normalizeWall = (
  raw: unknown,
  fallbackId: number,
  fallbackThickness: number,
  nodeIdSet: Set<number>
): Wall | null => {
  if (!isRecord(raw)) return null;
  const id = asFiniteNumber(raw.id);
  const a = asFiniteNumber(raw.a);
  const b = asFiniteNumber(raw.b);
  if (a === null || b === null) return null;
  const nodeA = Math.max(1, Math.trunc(a));
  const nodeB = Math.max(1, Math.trunc(b));
  if (nodeA === nodeB || !nodeIdSet.has(nodeA) || !nodeIdSet.has(nodeB)) return null;

  const thickness = asFiniteNumber(raw.thickness);
  return {
    id: id !== null ? Math.max(1, Math.trunc(id)) : fallbackId,
    name: asNonEmptyString(raw.name, `Стена ${fallbackId}`),
    a: nodeA,
    b: nodeB,
    thickness: thickness !== null && thickness > 0 ? thickness : fallbackThickness,
  };
};

export function buildExportData({ nodes, walls, scale, grid, wallThickness }: ExportData) {
  return {
    scale,
    grid,
    wallThickness,
    nodes: nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
    walls: walls.map((wall) => ({
      id: wall.id,
      name: wall.name,
      a: wall.a,
      b: wall.b,
      thickness: wall.thickness,
    })),
  };
}

export function serializeToYaml(data: ExportData) {
  const lines = [];
  lines.push(`scale: ${data.scale}`);
  lines.push(`grid: ${data.grid}`);
  lines.push(`wallThickness: ${data.wallThickness}`);
  lines.push("nodes:");
  data.nodes.forEach((node) => {
    lines.push(`  - id: ${node.id}`);
    lines.push(`    x: ${node.x}`);
    lines.push(`    y: ${node.y}`);
  });
  lines.push("walls:");
  data.walls.forEach((wall) => {
    lines.push(`  - id: ${wall.id}`);
    lines.push(`    name: "${String(wall.name || "").replace(/"/g, '\\"')}"`);
    lines.push(`    a: ${wall.a}`);
    lines.push(`    b: ${wall.b}`);
    lines.push(`    thickness: ${wall.thickness}`);
  });
  return lines.join("\n");
}

export function parseYaml(text: string) {
  const data: Partial<ExportData> & { nodes: NodePoint[]; walls: Wall[] } = { nodes: [], walls: [] };
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length);
  let section: "nodes" | "walls" | null = null;
  let currentNode: Partial<NodePoint> | null = null;
  let currentWall: Partial<Wall> | null = null;

  lines.forEach((line) => {
    if (line.startsWith("scale:")) {
      data.scale = Number(line.split(":")[1]);
      return;
    }
    if (line.startsWith("grid:")) {
      data.grid = Number(line.split(":")[1]);
      return;
    }
    if (line.startsWith("wallThickness:")) {
      data.wallThickness = Number(line.split(":")[1]);
      return;
    }
    if (line === "nodes:") {
      section = "nodes";
      currentNode = null;
      currentWall = null;
      return;
    }
    if (line === "walls:") {
      section = "walls";
      currentNode = null;
      currentWall = null;
      return;
    }
    if (line.startsWith("- id:")) {
      if (section === "walls") {
        currentWall = { id: Number(line.split(":")[1]) } as Partial<Wall>;
        data.walls.push(currentWall as Wall);
      } else {
        currentNode = { id: Number(line.split(":")[1]) } as Partial<NodePoint>;
        data.nodes.push(currentNode as NodePoint);
      }
      return;
    }
    if (section === "nodes" && currentNode) {
      if (line.startsWith("x:")) {
        currentNode.x = Number(line.split(":")[1]);
      } else if (line.startsWith("y:")) {
        currentNode.y = Number(line.split(":")[1]);
      }
      return;
    }
    if (section === "walls" && currentWall) {
      if (line.startsWith("name:")) {
        currentWall.name = line.replace("name:", "").trim().replace(/^"|"$/g, "");
      } else if (line.startsWith("a:")) {
        currentWall.a = Number(line.split(":")[1]);
      } else if (line.startsWith("b:")) {
        currentWall.b = Number(line.split(":")[1]);
      } else if (line.startsWith("thickness:")) {
        currentWall.thickness = Number(line.split(":")[1]);
      }
    }
  });

  return data as ExportData;
}

function normalizeNodesWalls(data: unknown, fallbackThickness: number) {
  if (!isRecord(data)) return null;
  if (!Array.isArray(data.nodes) || !Array.isArray(data.walls)) return null;

  const nodes = data.nodes
    .map((node, index) => normalizeNode(node, index + 1))
    .filter((node): node is NodePoint => Boolean(node));

  if (!nodes.length) return null;

  const nodeIdSet = new Set(nodes.map((node) => node.id));
  const walls = data.walls
    .map((wall, index) => normalizeWall(wall, index + 1, fallbackThickness, nodeIdSet))
    .filter((wall): wall is Wall => Boolean(wall));

  return { nodes, walls };
}

function buildFromRooms(rooms: unknown, fallbackThickness: number) {
  if (!Array.isArray(rooms)) return null;
  const makeId = uniqueId(1);
  const nodes: NodePoint[] = [];
  const walls: Wall[] = [];

  rooms.forEach((room) => {
    if (!isRecord(room) || !Array.isArray(room.points)) return;
    const points = room.points
      .map((point) => {
        if (!isRecord(point)) return null;
        const x = asFiniteNumber(point.x);
        const y = asFiniteNumber(point.y);
        if (x === null || y === null) return null;
        return { x, y };
      })
      .filter((point): point is { x: number; y: number } => Boolean(point));

    if (points.length < 3) return;

    const nodeIds = points.map((point) => {
      const node = { id: makeId(), x: point.x, y: point.y };
      nodes.push(node);
      return node.id;
    });

    nodeIds.forEach((nodeId, index) => {
      const nextId = nodeIds[(index + 1) % nodeIds.length];
      walls.push({
        id: makeId(),
        name: "",
        a: nodeId,
        b: nextId,
        thickness: fallbackThickness,
      });
    });
  });

  if (!nodes.length) return null;
  return { nodes, walls };
}

export function normalizeImportData(data: unknown) {
  const fallbackThicknessRaw = isRecord(data) ? asFiniteNumber(data.wallThickness) : null;
  const fallbackThickness = fallbackThicknessRaw !== null && fallbackThicknessRaw > 0
    ? fallbackThicknessRaw
    : EDITOR_DEFAULTS.wallThickness;

  const normalizedNodesWalls = normalizeNodesWalls(data, fallbackThickness);
  if (normalizedNodesWalls) {
    const scale = isRecord(data) ? asFiniteNumber(data.scale) : null;
    const grid = isRecord(data) ? asFiniteNumber(data.grid) : null;
    return {
      scale: scale !== null && scale > 0 ? scale : EDITOR_DEFAULTS.scale,
      grid: grid !== null && grid > 0 ? grid : EDITOR_DEFAULTS.grid,
      wallThickness: fallbackThickness,
      nodes: normalizedNodesWalls.nodes,
      walls: normalizedNodesWalls.walls,
    };
  }

  const roomBased = isRecord(data) ? buildFromRooms(data.rooms, fallbackThickness) : null;
  if (roomBased) {
    const scale = isRecord(data) ? asFiniteNumber(data.scale) : null;
    const grid = isRecord(data) ? asFiniteNumber(data.grid) : null;
    return {
      scale: scale !== null && scale > 0 ? scale : EDITOR_DEFAULTS.scale,
      grid: grid !== null && grid > 0 ? grid : EDITOR_DEFAULTS.grid,
      wallThickness: fallbackThickness,
      nodes: roomBased.nodes,
      walls: roomBased.walls,
    };
  }

  return null;
}
