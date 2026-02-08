import type { Vec2 } from "../types/plan";

export function distance(a: Vec2, b: Vec2) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function angleBetween(a: Vec2, b: Vec2) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function polygonArea(points: Vec2[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

export function polygonAreaSigned(points: Vec2[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function offsetPolygon(points: Vec2[], offsets: number[]) {
  if (points.length < 3 || offsets.length !== points.length) return null;
  const area = polygonAreaSigned(points);
  const sign = area >= 0 ? 1 : -1;
  const EPS = 1e-6;
  const result: Vec2[] = [];

  const lineIntersection = (p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2) => {
    const cross = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(cross) < EPS) return null;
    const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / cross;
    return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
  };

  const getEdge = (index: number) => {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (sign * -dy) / len;
    const ny = (sign * dx) / len;
    const offset = offsets[index];
    return {
      p: { x: a.x + nx * offset, y: a.y + ny * offset },
      n: { x: nx, y: ny },
      o: offset,
      a,
      d: { x: dx, y: dy },
    };
  };

  for (let i = 0; i < points.length; i += 1) {
    const prevEdge = getEdge((i - 1 + points.length) % points.length);
    const nextEdge = getEdge(i);
    const intersect = lineIntersection(prevEdge.p, prevEdge.d, nextEdge.p, nextEdge.d);
    if (intersect) {
      result.push(intersect);
      continue;
    }
    const prevOffset = { x: prevEdge.a.x + prevEdge.n.x * prevEdge.o, y: prevEdge.a.y + prevEdge.n.y * prevEdge.o };
    const nextOffset = { x: nextEdge.a.x + nextEdge.n.x * nextEdge.o, y: nextEdge.a.y + nextEdge.n.y * nextEdge.o };
    result.push({ x: (prevOffset.x + nextOffset.x) / 2, y: (prevOffset.y + nextOffset.y) / 2 });
  }

  return result;
}

export function polygonCentroid(points: Vec2[]) {
  let x = 0;
  let y = 0;
  points.forEach((p) => {
    x += p.x;
    y += p.y;
  });
  return { x: x / points.length, y: y / points.length };
}

export function pointInPolygon(point: Vec2, polygon: Vec2[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = (yi > point.y) !== (yj > point.y)
      && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function getRoomArea(room: { points: Vec2[] }, scale: number) {
  if (!room || !Array.isArray(room.points)) return 0;
  const areaPx = polygonArea(room.points);
  return areaPx / (scale * scale);
}

export function closestPointOnSegment(point: Vec2, a: Vec2, b: Vec2) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq === 0) return { point: { x: a.x, y: a.y }, t: 0 };
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  let t = (apx * abx + apy * aby) / abLenSq;
  t = Math.max(0, Math.min(1, t));
  return { point: { x: a.x + abx * t, y: a.y + aby * t }, t };
}
