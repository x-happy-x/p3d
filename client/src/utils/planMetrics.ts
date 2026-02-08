import { distance, getRoomArea, offsetPolygon, polygonArea } from "./geometry";

import type { Room, Vec2, Wall } from "../types/plan";

export type WallEdgeMap = Map<string, Wall[]>;

const edgeKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

export function buildWallEdgeMap(walls: Wall[]): WallEdgeMap {
  const map: WallEdgeMap = new Map();
  walls.forEach((wall) => {
    const key = edgeKey(wall.a, wall.b);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(wall);
  });
  map.forEach((list, key) => {
    map.set(key, [...list].sort((a, b) => a.id - b.id));
  });
  return map;
}

function getRoomOffsets(room: Room, wallEdgeMap: WallEdgeMap, defaultWallThickness: number, scale: number) {
  return room.nodeIds.map((nodeId, index) => {
    const nextId = room.nodeIds[(index + 1) % room.nodeIds.length];
    const wall = (wallEdgeMap.get(edgeKey(nodeId, nextId)) || [])[0];
    const thickness = wall?.thickness ?? defaultWallThickness;
    return (thickness * scale) / 2;
  });
}

export function getRoomInnerPolygon(
  room: Room,
  wallEdgeMap: WallEdgeMap,
  defaultWallThickness: number,
  scale: number
): Vec2[] | null {
  const offsets = getRoomOffsets(room, wallEdgeMap, defaultWallThickness, scale);
  const inner = offsetPolygon(room.points, offsets);
  if (!inner || inner.length < 3) return null;
  return inner;
}

export function getRoomInnerArea(
  room: Room,
  wallEdgeMap: WallEdgeMap,
  defaultWallThickness: number,
  scale: number
) {
  const inner = getRoomInnerPolygon(room, wallEdgeMap, defaultWallThickness, scale);
  if (!inner) return getRoomArea(room, scale);
  return polygonArea(inner) / (scale * scale);
}

export function getRoomPerimeter(
  room: Room,
  wallEdgeMap: WallEdgeMap,
  defaultWallThickness: number,
  scale: number,
  useInnerPolygon: boolean
) {
  const points = useInnerPolygon
    ? (getRoomInnerPolygon(room, wallEdgeMap, defaultWallThickness, scale) ?? room.points)
    : room.points;
  if (!points.length) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    sum += distance(points[i], points[(i + 1) % points.length]);
  }
  return sum / scale;
}

export function getInnerLengthByWallId(
  rooms: Room[],
  wallEdgeMap: WallEdgeMap,
  defaultWallThickness: number,
  scale: number
) {
  const map = new Map<number, number>();
  rooms.forEach((room) => {
    const inner = getRoomInnerPolygon(room, wallEdgeMap, defaultWallThickness, scale);
    if (!inner || inner.length !== room.points.length) return;
    for (let i = 0; i < inner.length; i += 1) {
      const nodeId = room.nodeIds[i];
      const nextId = room.nodeIds[(i + 1) % room.nodeIds.length];
      const wall = (wallEdgeMap.get(edgeKey(nodeId, nextId)) || [])[0];
      if (!wall) continue;
      const length = distance(inner[i], inner[(i + 1) % inner.length]) / scale;
      const existing = map.get(wall.id);
      map.set(wall.id, existing ? Math.min(existing, length) : length);
    }
  });
  return map;
}
