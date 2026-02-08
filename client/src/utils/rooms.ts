import type { NodePoint, Room, Wall } from "../types/plan";
import { pointInPolygon } from "./geometry";

export function buildRoomsFromWalls(nodes: NodePoint[], walls: Wall[]): Room[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map<number, number[]>();

  walls.forEach((wall) => {
    if (!adjacency.has(wall.a)) adjacency.set(wall.a, []);
    if (!adjacency.has(wall.b)) adjacency.set(wall.b, []);
    adjacency.get(wall.a)?.push(wall.b);
    adjacency.get(wall.b)?.push(wall.a);
  });

  const angleMap = new Map<number, number[]>();
  adjacency.forEach((neighbors, nodeId) => {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    const sorted = [...new Set(neighbors)].sort((a, b) => {
      const na = nodeMap.get(a);
      const nb = nodeMap.get(b);
      if (!na || !nb) return 0;
      const angleA = Math.atan2(na.y - node.y, na.x - node.x);
      const angleB = Math.atan2(nb.y - node.y, nb.x - node.x);
      return angleA - angleB;
    });
    angleMap.set(nodeId, sorted);
  });

  const polygonArea = (points: { x: number; y: number }[]) => {
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    return area / 2;
  };

  const nextNeighbor = (nodeId: number, fromId: number) => {
    const list = angleMap.get(nodeId);
    if (!list || list.length < 2) return null;
    const index = list.indexOf(fromId);
    if (index === -1) return null;
    const nextIndex = (index - 1 + list.length) % list.length;
    return list[nextIndex];
  };

  const visited = new Set<string>();
  const faces: { nodeIds: number[]; points: { x: number; y: number }[]; area: number }[] = [];

  walls.forEach((wall) => {
    const directions: [number, number][] = [
      [wall.a, wall.b],
      [wall.b, wall.a],
    ];
    directions.forEach(([startU, startV]) => {
      if (visited.has(`${startU}->${startV}`)) return;
      let currentU = startU;
      let currentV = startV;
      const path: number[] = [startU];
      const traversed: string[] = [];
      let safety = 0;
      let closed = false;

      while (safety < 500) {
        safety += 1;
        traversed.push(`${currentU}->${currentV}`);
        path.push(currentV);
        const next = nextNeighbor(currentV, currentU);
        if (next === null) break;
        currentU = currentV;
        currentV = next;
        if (currentU === startU && currentV === startV) {
          closed = true;
          break;
        }
      }

      if (closed && path.length >= 4) {
        traversed.forEach((edgeKey) => visited.add(edgeKey));
        const cycle = path.slice(0, -1);
        const points = cycle
          .map((id) => nodeMap.get(id))
          .filter(Boolean)
          .map((node) => ({ x: node!.x, y: node!.y }));
        if (points.length >= 3) {
          const area = polygonArea(points);
          if (Math.abs(area) > 0.0001) {
            faces.push({ nodeIds: cycle, points, area });
          }
        }
      }
    });
  });

  if (!faces.length) return [];

  const componentByNode = new Map<number, number>();
  let componentId = 0;
  adjacency.forEach((_, nodeId) => {
    if (componentByNode.has(nodeId)) return;
    const queue = [nodeId];
    componentByNode.set(nodeId, componentId);
    while (queue.length) {
      const current = queue.shift()!;
      const neighbors = adjacency.get(current) || [];
      neighbors.forEach((next) => {
        if (!componentByNode.has(next)) {
          componentByNode.set(next, componentId);
          queue.push(next);
        }
      });
    }
    componentId += 1;
  });

  const facesByComponent = new Map<number, typeof faces>();
  faces.forEach((face) => {
    const comp = componentByNode.get(face.nodeIds[0]) ?? -1;
    if (!facesByComponent.has(comp)) facesByComponent.set(comp, []);
    facesByComponent.get(comp)!.push(face);
  });

  const filtered: typeof faces = [];
  facesByComponent.forEach((group) => {
    if (group.length <= 1) {
      filtered.push(...group);
      return;
    }

    const positive = group.filter((face) => face.area > 0);
    const negative = group.filter((face) => face.area < 0);

    if (!positive.length || !negative.length) {
      filtered.push(...group);
      return;
    }

    // Keep one winding direction per connected component.
    // This removes mirrored/exterior traversals while preserving adjacent rooms.
    let preferred = positive;
    if (negative.length > positive.length) {
      preferred = negative;
    } else if (negative.length === positive.length) {
      const positiveAbs = positive.reduce((sum, face) => sum + Math.abs(face.area), 0);
      const negativeAbs = negative.reduce((sum, face) => sum + Math.abs(face.area), 0);
      preferred = negativeAbs < positiveAbs ? negative : positive;
    }

    filtered.push(...preferred);
  });

  return filtered.map((face, index) => ({
      id: index + 1,
      name: `Комната ${index + 1}`,
      nodeIds: face.nodeIds,
      points: face.points,
    }));
}

export function findRoomAtPoint(rooms: Room[], point: { x: number; y: number }) {
  for (let i = rooms.length - 1; i >= 0; i -= 1) {
    if (pointInPolygon(point, rooms[i].points)) return rooms[i];
  }
  return null;
}
