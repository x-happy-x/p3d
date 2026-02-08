export type Vec2 = { x: number; y: number };

export type NodePoint = {
  id: number;
  x: number;
  y: number;
};

export type Wall = {
  id: number;
  name: string;
  a: number;
  b: number;
  thickness: number;
};

export type Room = {
  id: number;
  name: string;
  nodeIds: number[];
  points: Vec2[];
};

export type Selection = {
  nodes: number[];
  walls: number[];
  rooms: number[];
};

export type ViewState = {
  zoom: number;
  offset: Vec2;
};

export type ContextHit =
  | { kind: "node"; nodeId: number }
  | { kind: "wall"; wallId: number; hitPoint?: Vec2; anchorNodeId?: number }
  | { kind: "room"; roomId: number };

export type ContextMenuState = {
  visible: boolean;
  x: number;
  y: number;
  hit: ContextHit | null;
};
