import { describe, expect, it } from "vitest";
import { buildRoomsFromWalls } from "./rooms";

const baseNodes = [
  { id: 1, x: 899.1336069423163, y: 204.23951232465745 },
  { id: 2, x: 845.6020715913673, y: 257.77104767560644 },
  { id: 3, x: 967.159244586193, y: 289.55343789345744 },
  { id: 4, x: 979.1859006086886, y: 219.46072842309732 },
  { id: 5, x: 1074.0835408137948, y: 259.48686665416534 },
  { id: 7, x: 1044.768622672731, y: 222.27947055204578 },
  { id: 8, x: 1043.8290304935906, y: 311.35172182681646 },
  { id: 9, x: 933.8980874646015, y: 185.63581427359776 },
  { id: 10, x: 999.1050001837665, y: 173.60918405745718 },
];

const baseWalls = [
  { id: 1, name: "Wall 1", a: 1, b: 2, thickness: 0.2 },
  { id: 2, name: "Wall 2", a: 3, b: 4, thickness: 0.2 },
  { id: 3, name: "Wall 3", a: 4, b: 1, thickness: 0.2 },
  { id: 4, name: "Wall 4", a: 2, b: 3, thickness: 0.2 },
  { id: 6, name: "Wall 5", a: 5, b: 7, thickness: 0.2 },
  { id: 7, name: "Wall 6", a: 7, b: 4, thickness: 0.2 },
  { id: 8, name: "Wall 8", a: 3, b: 8, thickness: 0.2 },
  { id: 9, name: "Wall 9", a: 8, b: 5, thickness: 0.2 },
  { id: 10, name: "Wall 10", a: 1, b: 9, thickness: 0.2 },
  { id: 11, name: "Wall 11", a: 7, b: 10, thickness: 0.2 },
];

describe("buildRoomsFromWalls", () => {
  it("keeps both adjacent rooms when a shared-wall node moves", () => {
    const rooms = buildRoomsFromWalls(baseNodes, baseWalls);
    expect(rooms.length).toBe(2);

    const movedNodes = baseNodes.map((node) => (
      node.id === 4 ? { ...node, x: node.x + 5, y: node.y - 6 } : node
    ));
    const movedRooms = buildRoomsFromWalls(movedNodes, baseWalls);
    expect(movedRooms.length).toBe(2);
  });

  it("keeps a room when a dangling wall is added", () => {
    const nodes = [
      { id: 1, x: 956.8238682495398, y: 196.9107827893915 },
      { id: 2, x: 956.8238682495398, y: 284.98093399603755 },
      { id: 3, x: 1076.9022829427433, y: 302.51965168662025 },
      { id: 4, x: 1076.9022829427433, y: 201.58226792677073 },
      { id: 5, x: 1050.9698553564178, y: 355.3240990384121 },
      { id: 6, x: 994.9708565307999, y: 141.85135033655922 },
    ];
    const walls = [
      { id: 1, name: "Wall 1", a: 1, b: 2, thickness: 0.2 },
      { id: 2, name: "Wall 2", a: 3, b: 4, thickness: 0.2 },
      { id: 3, name: "Wall 3", a: 1, b: 5, thickness: 0.2 },
      { id: 4, name: "Wall 4", a: 5, b: 3, thickness: 0.2 },
      { id: 5, name: "Wall 5", a: 4, b: 2, thickness: 0.2 },
      { id: 6, name: "Wall 6", a: 1, b: 6, thickness: 0.2 },
    ];
    const rooms = buildRoomsFromWalls(nodes, walls);
    expect(rooms.length).toBe(1);
  });

  it("does not create an extra combined room when two rooms share a wall", () => {
    const nodes = [
      { id: 7, x: 851.7787391759824, y: 128.50930999428215 },
      { id: 8, x: 776.0485454477255, y: 186.76331972729542 },
      { id: 9, x: 811.0009306424496, y: 269.63433831837955 },
      { id: 10, x: 926.193548584458, y: 206.87034117904875 },
      { id: 11, x: 854.2216547558168, y: 260.80226817818334 },
      { id: 12, x: 918.4889752958411, y: 257.60769950012065 },
      { id: 13, x: 892.36862583284, y: 270.76183516995894 },
    ];
    const walls = [
      { id: 7, name: "Wall 7", a: 7, b: 8, thickness: 0.2 },
      { id: 8, name: "Wall 8", a: 9, b: 7, thickness: 0.2 },
      { id: 9, name: "Wall 9", a: 8, b: 9, thickness: 0.2 },
      { id: 10, name: "Wall 10", a: 7, b: 10, thickness: 0.2 },
      { id: 11, name: "Wall 11", a: 9, b: 11, thickness: 0.2 },
      { id: 12, name: "Wall 12", a: 10, b: 12, thickness: 0.2 },
      { id: 13, name: "Wall 13", a: 11, b: 13, thickness: 0.2 },
      { id: 14, name: "Wall 14", a: 13, b: 12, thickness: 0.2 },
    ];
    const rooms = buildRoomsFromWalls(nodes, walls);
    expect(rooms.length).toBe(2);
  });

  it("keeps correct room count with a separate room present", () => {
    const nodes = [
      { id: 7, x: 851.7787391759824, y: 128.50930999428215 },
      { id: 8, x: 776.0485454477255, y: 186.76331972729542 },
      { id: 9, x: 811.0009306424496, y: 269.63433831837955 },
      { id: 10, x: 926.193548584458, y: 206.87034117904875 },
      { id: 11, x: 854.2216547558168, y: 260.80226817818334 },
      { id: 12, x: 918.4889752958411, y: 257.60769950012065 },
      { id: 13, x: 892.36862583284, y: 270.76183516995894 },
      { id: 14, x: 1036.8761447116756, y: 199.16577649255026 },
      { id: 15, x: 1011.1316217977887, y: 241.07107327554428 },
      { id: 16, x: 1057.358992712543, y: 251.78229336554836 },
    ];
    const walls = [
      { id: 7, name: "Wall 7", a: 7, b: 8, thickness: 0.2 },
      { id: 8, name: "Wall 8", a: 9, b: 7, thickness: 0.2 },
      { id: 9, name: "Wall 9", a: 8, b: 9, thickness: 0.2 },
      { id: 10, name: "Wall 10", a: 7, b: 10, thickness: 0.2 },
      { id: 11, name: "Wall 11", a: 9, b: 11, thickness: 0.2 },
      { id: 12, name: "Wall 12", a: 10, b: 12, thickness: 0.2 },
      { id: 13, name: "Wall 13", a: 11, b: 13, thickness: 0.2 },
      { id: 14, name: "Wall 14", a: 13, b: 12, thickness: 0.2 },
      { id: 15, name: "Wall 15", a: 14, b: 15, thickness: 0.2 },
      { id: 16, name: "Wall 16", a: 15, b: 16, thickness: 0.2 },
      { id: 17, name: "Wall 17", a: 14, b: 16, thickness: 0.2 },
    ];
    const rooms = buildRoomsFromWalls(nodes, walls);
    expect(rooms.length).toBe(3);
  });
});
