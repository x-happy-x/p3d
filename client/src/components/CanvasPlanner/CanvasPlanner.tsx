import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  angleBetween,
  closestPointOnSegment,
  distance,
  getRoomArea,
  offsetPolygon,
  polygonArea,
  polygonCentroid,
} from "../../utils/geometry";
import { findRoomAtPoint } from "../../utils/rooms";
import type { ContextHit, NodePoint, Room, Selection, Vec2, ViewState, Wall } from "../../types/plan";
import "./styles.scss";

type Props = {
  nodes: NodePoint[];
  walls: Wall[];
  rooms: Room[];
  mode: "draw" | "select" | "edit" | "pan";
  scale: number;
  grid: number;
  snapEnabled: boolean;
  soloView: boolean;
  showRoomNames: boolean;
  showRoomSizes: boolean;
  showWallNames: boolean;
  showWallLength: boolean;
  showWallWidth: boolean;
  showInnerMeasurements: boolean;
  showAngleLabels: boolean;
  defaultWallThickness: number;
  selection: Selection;
  hoveredWallId: number | null;
  onCreateWallChain: (points: Vec2[]) => void;
  onCreateRoomFromChain: (points: Vec2[]) => void;
  onUpdateNodes: React.Dispatch<React.SetStateAction<NodePoint[]>>;
  onSelectionChange: (selection: Selection) => void;
  onContextMenuOpen: (payload: { x: number; y: number; hit: ContextHit | null }) => void;
  view: ViewState;
  onViewChange: (view: ViewState) => void;
  onEditStart?: () => void;
  toolbar: React.ReactNode;
  overlays: React.ReactNode;
};

type DragState =
  | { type: null }
  | { type: "pan"; start: Vec2; originOffset: Vec2 }
  | { type: "box" }
  | { type: "node"; nodeId: number }
  | { type: "wall"; wallId: number; start: Vec2 };

type SelectionBox = { start: Vec2; end: Vec2 };

type NodeHit = { kind: "node"; nodeId: number; distance: number };

type WallHit = {
  kind: "wall";
  wallId: number;
  hitPoint: Vec2;
  anchorNodeId: number;
  distance: number;
};

const getCssVar = (name: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

export default function CanvasPlanner({
  nodes,
  walls,
  rooms,
  mode,
  scale,
  grid,
  snapEnabled,
  soloView,
  showRoomNames,
  showRoomSizes,
  showWallNames,
  showWallLength,
  showWallWidth,
  showInnerMeasurements,
  showAngleLabels,
  defaultWallThickness,
  selection,
  hoveredWallId,
  onCreateWallChain,
  onCreateRoomFromChain,
  onUpdateNodes,
  onSelectionChange,
  onContextMenuOpen,
  view,
  onViewChange,
  onEditStart,
  toolbar,
  overlays,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState>({ type: null });
  const spacePressed = useRef(false);
  const shiftPressed = useRef(false);
  const [currentPoints, setCurrentPoints] = useState<Vec2[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Vec2 | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [status, setStatus] = useState("Длина: 0 м · Угол: 0°");
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0, dpr: 1 });

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const wallEdgeMap = useMemo(() => {
    const map = new Map<string, Wall[]>();
    walls.forEach((wall) => {
      const a = Math.min(wall.a, wall.b);
      const b = Math.max(wall.a, wall.b);
      const key = `${a}-${b}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(wall);
    });
    return map;
  }, [walls]);

  const innerLengthByWallId = useMemo(() => {
    const map = new Map<number, number>();
    if (!showInnerMeasurements) return map;
    rooms.forEach((room) => {
      const offsets = room.nodeIds.map((nodeId, index) => {
        const nextId = room.nodeIds[(index + 1) % room.nodeIds.length];
        const a = Math.min(nodeId, nextId);
        const b = Math.max(nodeId, nextId);
        const key = `${a}-${b}`;
        const wall = (wallEdgeMap.get(key) || [])[0];
        const thickness = wall?.thickness ?? defaultWallThickness;
        return (thickness * scale) / 2;
      });
      const inner = offsetPolygon(room.points, offsets);
      if (!inner || inner.length !== room.points.length) return;
      for (let i = 0; i < inner.length; i += 1) {
        const nodeId = room.nodeIds[i];
        const nextId = room.nodeIds[(i + 1) % room.nodeIds.length];
        const a = Math.min(nodeId, nextId);
        const b = Math.max(nodeId, nextId);
        const key = `${a}-${b}`;
        const wall = (wallEdgeMap.get(key) || [])[0];
        if (!wall) continue;
        const length = distance(inner[i], inner[(i + 1) % inner.length]) / scale;
        const existing = map.get(wall.id);
        map.set(wall.id, existing ? Math.min(existing, length) : length);
      }
    });
    return map;
  }, [rooms, wallEdgeMap, defaultWallThickness, scale, showInnerMeasurements]);

  const getRoomInnerArea = (room: Room) => {
    const offsets = room.nodeIds.map((nodeId, index) => {
      const nextId = room.nodeIds[(index + 1) % room.nodeIds.length];
      const a = Math.min(nodeId, nextId);
      const b = Math.max(nodeId, nextId);
      const key = `${a}-${b}`;
      const wall = (wallEdgeMap.get(key) || [])[0];
      const thickness = wall?.thickness ?? defaultWallThickness;
      return (thickness * scale) / 2;
    });
    const inner = offsetPolygon(room.points, offsets);
    if (!inner || inner.length < 3) return getRoomArea(room, scale);
    return polygonArea(inner) / (scale * scale);
  };

  const getRoomPolygon = (room: Room) => {
    if (!showInnerMeasurements) return room.points;
    const offsets = room.nodeIds.map((nodeId, index) => {
      const nextId = room.nodeIds[(index + 1) % room.nodeIds.length];
      const a = Math.min(nodeId, nextId);
      const b = Math.max(nodeId, nextId);
      const key = `${a}-${b}`;
      const wall = (wallEdgeMap.get(key) || [])[0];
      const thickness = wall?.thickness ?? defaultWallThickness;
      return (thickness * scale) / 2;
    });
    const inner = offsetPolygon(room.points, offsets);
    return inner && inner.length >= 3 ? inner : room.points;
  };

  const getRoomPerimeter = (room: Room) => {
    const points = getRoomPolygon(room);
    if (!points.length) return 0;
    let sum = 0;
    for (let i = 0; i < points.length; i += 1) {
      sum += distance(points[i], points[(i + 1) % points.length]);
    }
    return sum / scale;
  };

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const rect = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      setCanvasSize({ width: rect.width, height: rect.height, dpr });
    });
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spacePressed.current = true;
      }
      if (event.key === "Shift") {
        shiftPressed.current = true;
      }
      if (event.key === "Escape") {
        setCurrentPoints([]);
        setSelectionBox(null);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spacePressed.current = false;
      }
      if (event.key === "Shift") {
        shiftPressed.current = false;
        if (mode === "draw" && currentPoints.length >= 2) {
          onCreateWallChain(currentPoints);
          setCurrentPoints([]);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [mode, currentPoints, onCreateWallChain]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvasSize.width * canvasSize.dpr;
    canvas.height = canvasSize.height * canvasSize.dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    ctx.setTransform(
      canvasSize.dpr * view.zoom,
      0,
      0,
      canvasSize.dpr * view.zoom,
      view.offset.x * canvasSize.dpr,
      view.offset.y * canvasSize.dpr
    );
    draw(ctx);
  }, [
    canvasSize,
    nodes,
    walls,
    rooms,
    currentPoints,
    hoverPoint,
    selectionBox,
    scale,
    grid,
    soloView,
    showRoomNames,
    showRoomSizes,
    showWallNames,
    showWallLength,
    showWallWidth,
    showInnerMeasurements,
    showAngleLabels,
    selection,
    hoveredWallId,
    defaultWallThickness,
    view,
  ]);

  useEffect(() => {
    if (mode === "draw") return;
    if (selection.walls.length >= 2) {
      const wallA = walls.find((item) => item.id === selection.walls[0]);
      const wallB = walls.find((item) => item.id === selection.walls[1]);
      if (wallA && wallB) {
        const shared = [wallA.a, wallA.b].find((id) => id === wallB.a || id === wallB.b);
        if (!shared) {
          setStatus("Угол: —");
          return;
        }
        const otherA = wallA.a === shared ? wallA.b : wallA.a;
        const otherB = wallB.a === shared ? wallB.b : wallB.a;
        const nodeShared = nodeMap.get(shared);
        const nodeA = nodeMap.get(otherA);
        const nodeB = nodeMap.get(otherB);
        if (!nodeShared || !nodeA || !nodeB) return;
        const v1 = { x: nodeA.x - nodeShared.x, y: nodeA.y - nodeShared.y };
        const v2 = { x: nodeB.x - nodeShared.x, y: nodeB.y - nodeShared.y };
        const mag1 = Math.hypot(v1.x, v1.y);
        const mag2 = Math.hypot(v2.x, v2.y);
        if (!mag1 || !mag2) return;
        const cos = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2)));
        const angle = (Math.acos(cos) * 180) / Math.PI;
        setStatus(`Угол: ${angle.toFixed(1)}°`);
        return;
      }
    }

    if (selection.walls.length === 1) {
      const wall = walls.find((item) => item.id === selection.walls[0]);
      if (!wall) return;
      const start = nodeMap.get(wall.a);
      const end = nodeMap.get(wall.b);
      if (!start || !end) return;
      const length = distance(start, end) / scale;
      const innerLength = innerLengthByWallId.get(wall.id);
      const lengthValue = showInnerMeasurements && innerLength !== undefined ? innerLength : length;
      const thickness = wall.thickness ?? defaultWallThickness;
      setStatus(`Длина: ${lengthValue.toFixed(2)} м · Ширина: ${thickness.toFixed(2)} м`);
      return;
    }

    if (selection.rooms.length === 1) {
      const room = rooms.find((item) => item.id === selection.rooms[0]);
      if (!room) return;
      const area = showInnerMeasurements ? getRoomInnerArea(room) : getRoomArea(room, scale);
      const perimeter = getRoomPerimeter(room);
      setStatus(`Площадь: ${area.toFixed(2)} м² · Периметр: ${perimeter.toFixed(2)} м`);
      return;
    }

    if (selection.nodes.length === 2) {
      const nodeA = nodeMap.get(selection.nodes[0]);
      const nodeB = nodeMap.get(selection.nodes[1]);
      if (!nodeA || !nodeB) return;
      const dist = distance(nodeA, nodeB) / scale;
      setStatus(`Расстояние: ${dist.toFixed(2)} м`);
      return;
    }

    if (selection.nodes.length === 1) {
      const node = nodeMap.get(selection.nodes[0]);
      if (!node) return;
      setStatus(`X: ${(node.x / scale).toFixed(2)} м · Y: ${(node.y / scale).toFixed(2)} м`);
      return;
    }

    const counts = [
      selection.rooms.length ? `Комнат: ${selection.rooms.length}` : null,
      selection.walls.length ? `Стен: ${selection.walls.length}` : null,
      selection.nodes.length ? `Точек: ${selection.nodes.length}` : null,
    ].filter(Boolean);
    if (counts.length) {
      setStatus(counts.join(" · "));
      return;
    }

    setStatus("Готово");
  }, [
    mode,
    selection.walls,
    selection.nodes,
    selection.rooms,
    walls,
    rooms,
    nodeMap,
    scale,
    innerLengthByWallId,
    showInnerMeasurements,
    defaultWallThickness,
  ]);

  const metersFromPixels = (px: number) => px / scale;
  const pixelsFromMeters = (m: number) => m * scale;

  const screenToWorld = (point: Vec2): Vec2 => ({
    x: (point.x - view.offset.x) / view.zoom,
    y: (point.y - view.offset.y) / view.zoom,
  });

  const snapToAngle = (point: Vec2, origin?: Vec2) => {
    if (!snapEnabled || !origin) return point;
    const angle = angleBetween(origin, point);
    const deg = (angle * 180) / Math.PI;
    const snaps = [0, 45, 90, 135, 180, -45, -90, -135];
    const threshold = 7;
    let closest: number | null = null;
    let minDiff = Infinity;
    snaps.forEach((snapDeg) => {
      const diff = Math.abs(deg - snapDeg);
      if (diff < minDiff) {
        minDiff = diff;
        closest = snapDeg;
      }
    });
    if (minDiff > threshold || closest === null) return point;
    const length = distance(origin, point);
    const rad = (closest * Math.PI) / 180;
    return {
      x: origin.x + Math.cos(rad) * length,
      y: origin.y + Math.sin(rad) * length,
    };
  };

  const snapPoint = (point: Vec2) => {
    if (!snapEnabled) return point;
    const snapDist = 12 / view.zoom;
    let snapped = point;
    let best = snapDist;
    nodes.forEach((node) => {
      const d = distance(point, node);
      if (d < best) {
        best = d;
        snapped = { x: node.x, y: node.y };
      }
    });
    const origin = currentPoints[currentPoints.length - 1];
    return snapToAngle(snapped, origin);
  };

  const shouldCloseRoom = (point: Vec2) => {
    if (currentPoints.length < 3) return false;
    const first = currentPoints[0];
    return distance(point, first) < 14 / view.zoom;
  };

  const mergeCollinear = (points: Vec2[]) => {
    if (points.length < 3) return points;
    const next = [...points];
    const a = next[next.length - 3];
    const b = next[next.length - 2];
    const c = next[next.length - 1];
    const ab = angleBetween(a, b);
    const bc = angleBetween(b, c);
    const diff = Math.abs(ab - bc);
    if (diff < 0.02 || Math.abs(diff - Math.PI) < 0.02) {
      next.splice(next.length - 2, 1);
    }
    return next;
  };

  const findNodeHit = (screenPoint: Vec2): NodeHit | null => {
    const threshold = 10;
    let hit: NodeHit | null = null;
    nodes.forEach((node) => {
      const screen = {
        x: node.x * view.zoom + view.offset.x,
        y: node.y * view.zoom + view.offset.y,
      };
      const d = Math.hypot(screenPoint.x - screen.x, screenPoint.y - screen.y);
      if (d <= threshold && (!hit || d < hit.distance)) {
        hit = { kind: "node", nodeId: node.id, distance: d };
      }
    });
    return hit;
  };

  const findWallHit = (screenPoint: Vec2): WallHit | null => {
    const threshold = 10;
    const worldPoint = screenToWorld(screenPoint);
    let best: WallHit | null = null;
    walls.forEach((wall) => {
      const start = nodeMap.get(wall.a);
      const end = nodeMap.get(wall.b);
      if (!start || !end) return;
      const projection = closestPointOnSegment(worldPoint, start, end);
      const distWorld = distance(worldPoint, projection.point);
      const distScreen = distWorld * view.zoom;
      if (distScreen <= threshold && (!best || distScreen < best.distance)) {
        best = {
          kind: "wall",
          wallId: wall.id,
          hitPoint: projection.point,
          anchorNodeId: distance(worldPoint, start) < distance(worldPoint, end) ? start.id : end.id,
          distance: distScreen,
        };
      }
    });
    return best;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    if (event.button === 2) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const screenPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const wantsPan = event.button === 1 || mode === "pan" || spacePressed.current || (event.ctrlKey && mode !== "select");
    let cachedNodeHit: NodeHit | null = null;
    let cachedWallHit: WallHit | null = null;
    let cachedRoomHit: Room | null = null;

    if (mode === "select" && event.shiftKey) {
      dragRef.current = { type: "box" };
      setSelectionBox({ start: screenToWorld(screenPoint), end: screenToWorld(screenPoint) });
      canvasRef.current.setPointerCapture(event.pointerId);
      return;
    }

    if (mode === "select" && event.ctrlKey) {
      cachedNodeHit = findNodeHit(screenPoint);
      cachedWallHit = cachedNodeHit ? null : findWallHit(screenPoint);
      cachedRoomHit =
        !cachedNodeHit && !cachedWallHit ? findRoomAtPoint(rooms, screenToWorld(screenPoint)) : null;
      if (!cachedNodeHit && !cachedWallHit && !cachedRoomHit) {
        dragRef.current = {
          type: "pan",
          start: screenPoint,
          originOffset: { ...view.offset },
        };
        canvasRef.current.setPointerCapture(event.pointerId);
        return;
      }
    }

    if (wantsPan) {
      dragRef.current = {
        type: "pan",
        start: screenPoint,
        originOffset: { ...view.offset },
      };
      canvasRef.current.setPointerCapture(event.pointerId);
      return;
    }

    if (mode === "edit") {
      const nodeHit = findNodeHit(screenPoint);
      if (nodeHit) {
        if (onEditStart) onEditStart();
        dragRef.current = { type: "node", nodeId: nodeHit.nodeId };
        canvasRef.current.setPointerCapture(event.pointerId);
        return;
      }
      const wallHit = findWallHit(screenPoint);
      if (wallHit) {
        if (onEditStart) onEditStart();
        dragRef.current = { type: "wall", wallId: wallHit.wallId, start: screenToWorld(screenPoint) };
        canvasRef.current.setPointerCapture(event.pointerId);
      }
      return;
    }

    if (mode === "select") {
      const nodeHit = cachedNodeHit || findNodeHit(screenPoint);
      const wallHit = cachedNodeHit ? null : cachedWallHit || findWallHit(screenPoint);
      const roomHit =
        !nodeHit && !wallHit
          ? cachedRoomHit || findRoomAtPoint(rooms, screenToWorld(screenPoint))
          : null;
      let nextSelection = {
        nodes: [...selection.nodes],
        walls: [...selection.walls],
        rooms: [...selection.rooms],
      };
      if (nodeHit) {
        nextSelection = updateSelectionWithTarget(nextSelection, "node", nodeHit.nodeId, event.ctrlKey);
      } else if (wallHit) {
        nextSelection = updateSelectionWithTarget(nextSelection, "wall", wallHit.wallId, event.ctrlKey);
      } else if (roomHit) {
        nextSelection = updateSelectionWithTarget(nextSelection, "room", roomHit.id, event.ctrlKey);
      } else if (!event.ctrlKey) {
        nextSelection.nodes = [];
        nextSelection.walls = [];
        nextSelection.rooms = [];
      }
      onSelectionChange(nextSelection);
      return;
    }

    if (mode === "draw") {
      const worldPoint = screenToWorld(screenPoint);
      const snapped = snapPoint(worldPoint);
      if (event.shiftKey) {
        if (shouldCloseRoom(snapped)) {
          if (currentPoints.length >= 3) {
            onCreateRoomFromChain(currentPoints);
          }
          setCurrentPoints([]);
          return;
        }
        setCurrentPoints((prev) => mergeCollinear([...prev, snapped]));
        return;
      }

      if (!currentPoints.length) {
        setCurrentPoints([snapped]);
        return;
      }

      const nextPoints = mergeCollinear([...currentPoints, snapped]);
      if (nextPoints.length >= 2) {
        onCreateWallChain(nextPoints);
      }
      setCurrentPoints([]);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const screenPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const worldPoint = screenToWorld(screenPoint);

    if (dragRef.current.type === "pan") {
      const deltaX = screenPoint.x - dragRef.current.start.x;
      const deltaY = screenPoint.y - dragRef.current.start.y;
      const nextOffset = {
        x: dragRef.current.originOffset.x + deltaX,
        y: dragRef.current.originOffset.y + deltaY,
      };
      onViewChange({ ...view, offset: nextOffset });
      return;
    }

    if (dragRef.current.type === "box" && selectionBox) {
      setSelectionBox((prev) => (prev ? { ...prev, end: worldPoint } : prev));
      return;
    }

    if (dragRef.current.type === "node") {
      const nodeId = dragRef.current.nodeId;
      onUpdateNodes((prev) => prev.map((node) => (
        node.id === nodeId ? { ...node, x: worldPoint.x, y: worldPoint.y } : node
      )));
      return;
    }

    if (dragRef.current.type === "wall") {
      const delta = {
        x: worldPoint.x - dragRef.current.start.x,
        y: worldPoint.y - dragRef.current.start.y,
      };
      dragRef.current.start = worldPoint;
      const wall = walls.find((item) => item.id === dragRef.current.wallId);
      if (!wall) return;
      onUpdateNodes((prev) => prev.map((node) => {
        if (node.id === wall.a || node.id === wall.b) {
          return { ...node, x: node.x + delta.x, y: node.y + delta.y };
        }
        return node;
      }));
      return;
    }

    if (mode === "draw") {
      const snapped = snapPoint(worldPoint);
      setHoverPoint(snapped);
      if (currentPoints.length) {
        const last = currentPoints[currentPoints.length - 1];
        const len = metersFromPixels(distance(last, snapped));
        const angle = (angleBetween(last, snapped) * 180) / Math.PI;
        setStatus(`Длина: ${len.toFixed(2)} м · Угол: ${angle.toFixed(1)}°`);
      }
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current.type === "box" && selectionBox) {
      const box = normalizeBox(selectionBox);
      const nodesInBox = nodes.filter((node) => isPointInBox(node, box)).map((node) => node.id);
      const wallsInBox = walls.filter((wall) => {
        const a = nodeMap.get(wall.a);
        const b = nodeMap.get(wall.b);
        return a && b && (isPointInBox(a, box) || isPointInBox(b, box));
      }).map((wall) => wall.id);
      const roomsInBox = rooms.filter((room) => {
        const bounds = getRoomBounds(room.points);
        return bounds && bounds.minX >= box.minX && bounds.maxX <= box.maxX
          && bounds.minY >= box.minY && bounds.maxY <= box.maxY;
      }).map((room) => room.id);
      onSelectionChange({ nodes: nodesInBox, walls: wallsInBox, rooms: roomsInBox });
      setSelectionBox(null);
    }

    if (dragRef.current.type !== null) {
      dragRef.current = { type: null };
      if (canvasRef.current) {
        canvasRef.current.releasePointerCapture(event.pointerId);
      }
    }
  };

  const handleDoubleClick = () => {
    if (mode !== "draw") return;
    if (currentPoints.length >= 2) {
      onCreateWallChain(currentPoints);
      setCurrentPoints([]);
    }
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    event.preventDefault();
    if (mode === "draw" && shiftPressed.current) {
      setCurrentPoints([]);
      setHoverPoint(null);
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const screenPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const nodeHit = findNodeHit(screenPoint);
    const wallHit = nodeHit ? null : findWallHit(screenPoint);
    const roomHit = !nodeHit && !wallHit ? findRoomAtPoint(rooms, screenToWorld(screenPoint)) : null;

    const hasSelection = selection.nodes.length || selection.walls.length || selection.rooms.length;
    if (!hasSelection) {
      let nextSelection = { ...selection };
      if (nodeHit) {
        nextSelection = updateSelectionWithTarget({ ...selection }, "node", nodeHit.nodeId, false);
      } else if (wallHit) {
        nextSelection = updateSelectionWithTarget({ ...selection }, "wall", wallHit.wallId, false);
      } else if (roomHit) {
        nextSelection = updateSelectionWithTarget({ ...selection }, "room", roomHit.id, false);
      }
      onSelectionChange(nextSelection);
    }
    onContextMenuOpen({
      x: screenPoint.x,
      y: screenPoint.y,
      hit: nodeHit || wallHit || (roomHit ? { kind: "room", roomId: roomHit.id } : null),
    });
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    if (!event.ctrlKey) return;
    event.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const screenPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const worldPoint = screenToWorld(screenPoint);
    const zoomFactor = Math.exp(-event.deltaY * 0.0012);
    const nextZoom = Math.min(4, Math.max(0.2, view.zoom * zoomFactor));
    const nextOffset = {
      x: screenPoint.x - worldPoint.x * nextZoom,
      y: screenPoint.y - worldPoint.y * nextZoom,
    };
    onViewChange({ zoom: nextZoom, offset: nextOffset });
  };

  const drawGrid = (ctx: CanvasRenderingContext2D) => {
    const step = pixelsFromMeters(grid);
    if (!step) return;
    const startX = (-view.offset.x) / view.zoom;
    const startY = (-view.offset.y) / view.zoom;
    const endX = (canvasSize.width - view.offset.x) / view.zoom;
    const endY = (canvasSize.height - view.offset.y) / view.zoom;
    const firstX = Math.floor(startX / step) * step;
    const firstY = Math.floor(startY / step) * step;

    ctx.strokeStyle = getCssVar("--grid", "rgba(0, 0, 0, 0.05)");
    ctx.lineWidth = 1 / view.zoom;

    for (let x = firstX; x <= endX; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    for (let y = firstY; y <= endY; y += step) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }
  };

  const drawRooms = (ctx: CanvasRenderingContext2D) => {
    const solo = soloView && selection.rooms.length > 0;
    rooms.forEach((room) => {
      if (solo && !selection.rooms.includes(room.id)) return;
      ctx.beginPath();
      room.points.forEach((p, index) => {
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      const isSelected = selection.rooms.includes(room.id);
      ctx.fillStyle = isSelected ? "rgba(212, 90, 62, 0.35)" : "rgba(45, 106, 124, 0.15)";
      ctx.strokeStyle = isSelected ? "#d45a3e" : "#2d6a7c";
      ctx.lineWidth = Math.max(1, (defaultWallThickness * scale) / view.zoom);
      ctx.fill();
      ctx.stroke();

      if (showRoomNames || showRoomSizes) {
        const center = polygonCentroid(room.points);
        const lines: string[] = [];
        if (showRoomNames) lines.push(room.name || `Комната ${room.id}`);
        if (showRoomSizes) {
          const area = showInnerMeasurements ? getRoomInnerArea(room) : getRoomArea(room, scale);
          lines.push(`${area.toFixed(2)} м²`);
        }
        if (lines.length) drawLabel(ctx, lines, center.x, center.y);
      }
    });
  };

  const drawWalls = (ctx: CanvasRenderingContext2D) => {
    walls.forEach((wall) => {
      const start = nodeMap.get(wall.a);
      const end = nodeMap.get(wall.b);
      if (!start || !end) return;
      ctx.save();
      ctx.lineCap = "square";
      const isSelected = selection.walls.includes(wall.id);
      const isHovered = hoveredWallId === wall.id;
      const thickness = wall.thickness || defaultWallThickness;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = isSelected
        ? "#d45a3e"
        : isHovered
          ? "#2d6a7c"
          : getCssVar("--wall", "#1f1b16");
      ctx.lineWidth = Math.max(1, (thickness * scale) / view.zoom) + (isSelected ? 2 : 0);
      if (isSelected) {
        ctx.shadowColor = "rgba(212, 90, 62, 0.6)";
        ctx.shadowBlur = 8 / view.zoom;
      }
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle as string;
      ctx.beginPath();
      ctx.arc(start.x, start.y, thickness / 2, 0, Math.PI * 2);
      ctx.arc(end.x, end.y, thickness / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (showWallNames || showWallLength || showWallWidth) {
        const lengthPx = distance(start, end);
        if (lengthPx > 0) {
          const length = lengthPx / scale;
          const lengthValue = showInnerMeasurements
            ? (innerLengthByWallId.get(wall.id) ?? length)
            : length;
          const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
          const nx = (end.y - start.y) / lengthPx;
          const ny = -(end.x - start.x) / lengthPx;
          const offset = 10 / view.zoom;
          const labelX = mid.x + nx * offset;
          const labelY = mid.y + ny * offset;
          const lines: string[] = [];
          if (showWallNames) lines.push(wall.name || `Стена ${wall.id}`);
          if (showWallLength || showWallWidth) {
            const parts: string[] = [];
            if (showWallLength) parts.push(`Длина: ${lengthValue.toFixed(2)} м`);
            if (showWallWidth) parts.push(`Ширина: ${thickness.toFixed(2)} м`);
            lines.push(parts.join(" · "));
          }
          if (lines.length) drawLabel(ctx, lines, labelX, labelY);
        }
      }
    });
  };

  const drawAngles = (ctx: CanvasRenderingContext2D) => {
    if (!showAngleLabels) return;
    const nodeToWalls = new Map<number, Wall[]>();
    walls.forEach((wall) => {
      if (!nodeToWalls.has(wall.a)) nodeToWalls.set(wall.a, []);
      if (!nodeToWalls.has(wall.b)) nodeToWalls.set(wall.b, []);
      nodeToWalls.get(wall.a)!.push(wall);
      nodeToWalls.get(wall.b)!.push(wall);
    });

    nodeToWalls.forEach((list, nodeId) => {
      if (list.length !== 2) return;
      const node = nodeMap.get(nodeId);
      if (!node) return;
      const otherA = list[0].a === nodeId ? list[0].b : list[0].a;
      const otherB = list[1].a === nodeId ? list[1].b : list[1].a;
      const nodeA = nodeMap.get(otherA);
      const nodeB = nodeMap.get(otherB);
      if (!nodeA || !nodeB) return;
      const v1 = { x: nodeA.x - node.x, y: nodeA.y - node.y };
      const v2 = { x: nodeB.x - node.x, y: nodeB.y - node.y };
      const mag1 = Math.hypot(v1.x, v1.y);
      const mag2 = Math.hypot(v2.x, v2.y);
      if (mag1 === 0 || mag2 === 0) return;
      const cos = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2)));
      const angle = (Math.acos(cos) * 180) / Math.PI;
      drawLabel(ctx, [`${angle.toFixed(1)}°`], node.x + 8 / view.zoom, node.y - 8 / view.zoom);
    });
  };

  const drawLabel = (ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number) => {
    const fontSize = 11 / view.zoom;
    ctx.save();
    ctx.font = `${fontSize}px 'Space Grotesk', sans-serif`;
    const paddingX = 4 / view.zoom;
    const paddingY = 3 / view.zoom;
    const lineHeight = fontSize + 2 / view.zoom;
    const widths = lines.map((line) => ctx.measureText(line).width);
    const width = Math.max(...widths, 0) + paddingX * 2;
    const height = lineHeight * lines.length + paddingY * 2;
    ctx.fillStyle = "rgba(15, 14, 12, 0.65)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1 / view.zoom;
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - height / 2, width, height, 6 / view.zoom);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f4ede6";
    lines.forEach((line, index) => {
      ctx.fillText(line, x - width / 2 + paddingX, y - height / 2 + paddingY + lineHeight * (index + 0.9));
    });
    ctx.restore();
  };

  const drawNodes = (ctx: CanvasRenderingContext2D) => {
    nodes.forEach((node) => {
      ctx.beginPath();
      const isSelected = selection.nodes.includes(node.id);
      const colorIndex = node.id % 6;
      const palette = ["#1f1b16", "#2d6a7c", "#d45a3e", "#4c7d62", "#c48b5f", "#9e6f6f"];
      ctx.fillStyle = isSelected ? "#d45a3e" : palette[colorIndex];
      ctx.arc(node.x, node.y, (isSelected ? 5 : 3.5) / view.zoom, 0, Math.PI * 2);
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1 / view.zoom;
        ctx.stroke();
      }
    });
  };

  const drawSelectionBox = (ctx: CanvasRenderingContext2D) => {
    if (!selectionBox) return;
    const box = normalizeBox(selectionBox);
    ctx.strokeStyle = "rgba(45, 106, 124, 0.7)";
    ctx.lineWidth = 1 / view.zoom;
    ctx.setLineDash([6 / view.zoom, 4 / view.zoom]);
    ctx.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
    ctx.setLineDash([]);
  };

  const drawCurrentPath = (ctx: CanvasRenderingContext2D) => {
    if (!currentPoints.length) return;
    ctx.strokeStyle = "#1f1b16";
    ctx.lineWidth = Math.max(1, (defaultWallThickness * scale) / view.zoom);
    ctx.beginPath();
    currentPoints.forEach((p, index) => {
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    if (hoverPoint) ctx.lineTo(hoverPoint.x, hoverPoint.y);
    ctx.stroke();

    currentPoints.forEach((p, index) => {
      ctx.beginPath();
      ctx.fillStyle = index === 0 ? "#d45a3e" : "#1f1b16";
      ctx.arc(p.x, p.y, 4 / view.zoom, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    drawGrid(ctx);
    drawRooms(ctx);
    drawWalls(ctx);
    drawAngles(ctx);
    drawNodes(ctx);
    drawCurrentPath(ctx);
    drawSelectionBox(ctx);
  };

  return (
    <div className="canvas-view">
      <div className="canvas-wrap" ref={wrapRef}>
        {toolbar}
        {overlays}
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => setHoverPoint(null)}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onWheel={handleWheel}
        />
        <div className="hud">
          <div className="hint">
            {mode === "draw"
              ? "Кликните дважды для стены. Shift — рисование комнаты, ПКМ при Shift — отмена."
              : mode === "edit"
                ? "Тяните точки или стены для редактирования."
                : mode === "pan"
            ? "Перетаскивайте, чтобы перемещаться по плану."
            : "Кликните для выбора. Ctrl — мультивыбор/панорама, Shift — рамка, ПКМ — меню."}
          </div>
          <div className="status">{status}</div>
        </div>
      </div>
    </div>
  );
}

function updateSelectionWithTarget(selection: Selection, kind: "node" | "wall" | "room", id: number, additive: boolean) {
  const result: Selection = { nodes: [...selection.nodes], walls: [...selection.walls], rooms: [...selection.rooms] };
  if (!additive) {
    result.nodes = [];
    result.walls = [];
    result.rooms = [];
  }
  const list = kind === "node" ? result.nodes : kind === "wall" ? result.walls : result.rooms;
  const index = list.indexOf(id);
  if (additive) {
    if (index >= 0) list.splice(index, 1);
    else list.push(id);
  } else if (index === -1) {
    list.push(id);
  }
  return result;
}

function normalizeBox(box: SelectionBox) {
  return {
    minX: Math.min(box.start.x, box.end.x),
    minY: Math.min(box.start.y, box.end.y),
    maxX: Math.max(box.start.x, box.end.x),
    maxY: Math.max(box.start.y, box.end.y),
  };
}

function isPointInBox(point: Vec2, box: { minX: number; minY: number; maxX: number; maxY: number }) {
  return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;
}

function getRoomBounds(points: Vec2[]) {
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}
