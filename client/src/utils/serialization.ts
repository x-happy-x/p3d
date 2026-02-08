import type { NodePoint, Wall } from "../types/plan";

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

function normalizeNodesWalls(data: ExportData, fallbackThickness: number) {
  const nodes = Array.isArray(data.nodes)
    ? data.nodes.map((node, index) => ({
      id: Number(node.id) || index + 1,
      x: Number(node.x) || 0,
      y: Number(node.y) || 0,
    }))
    : [];
  const walls = Array.isArray(data.walls)
    ? data.walls.map((wall, index) => ({
      id: Number(wall.id) || index + 1,
      name: wall.name || `Стена ${index + 1}`,
      a: Number(wall.a),
      b: Number(wall.b),
      thickness: Number(wall.thickness) || fallbackThickness,
    })).filter((wall) => Number.isFinite(wall.a) && Number.isFinite(wall.b))
    : [];
  return { nodes, walls };
}

function buildFromRooms(rooms: { points: { x: number; y: number }[] }[], fallbackThickness: number) {
  const makeId = uniqueId(1);
  const nodes: NodePoint[] = [];
  const walls: Wall[] = [];

  rooms.forEach((room) => {
    const points = Array.isArray(room.points) ? room.points : [];
    if (points.length < 3) return;
    const nodeIds = points.map((point) => {
      const node = { id: makeId(), x: Number(point.x), y: Number(point.y) };
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

  return { nodes, walls };
}

export function normalizeImportData(data: Partial<ExportData>) {
  const fallbackThickness = Number(data.wallThickness) || 0.2;
  if (Array.isArray(data.nodes) && Array.isArray(data.walls)) {
    const normalized = normalizeNodesWalls(data as ExportData, fallbackThickness);
    return {
      scale: Number(data.scale) || 50,
      grid: Number(data.grid) || 0.5,
      wallThickness: fallbackThickness,
      nodes: normalized.nodes,
      walls: normalized.walls,
    };
  }

  if (Array.isArray((data as { rooms?: { points: { x: number; y: number }[] }[] }).rooms)) {
    const converted = buildFromRooms((data as { rooms: { points: { x: number; y: number }[] }[] }).rooms, fallbackThickness);
    return {
      scale: Number(data.scale) || 50,
      grid: Number(data.grid) || 0.5,
      wallThickness: fallbackThickness,
      nodes: converted.nodes,
      walls: converted.walls,
    };
  }

  return null;
}
