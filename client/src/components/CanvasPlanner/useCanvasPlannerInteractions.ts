import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";

import { angleBetween, closestPointOnSegment, distance } from "../../utils/geometry";
import { findRoomAtPoint } from "../../utils/rooms";
import { CANVAS_INTERACTION, EDITOR_LIMITS } from "../../config/editorConfig";

import type { ContextHit, NodePoint, Room, Selection, Vec2, ViewState, Wall } from "../../types/plan";

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

type UseCanvasPlannerInteractionsArgs = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  mode: "draw" | "select" | "edit" | "pan";
  scale: number;
  snapEnabled: boolean;
  nodes: NodePoint[];
  walls: Wall[];
  rooms: Room[];
  selection: Selection;
  nodeMap: Map<number, NodePoint>;
  view: ViewState;
  onCreateWallChain: (points: Vec2[]) => void;
  onCreateRoomFromChain: (points: Vec2[]) => void;
  onUpdateNodes: Dispatch<SetStateAction<NodePoint[]>>;
  onSelectionChange: (selection: Selection) => void;
  onContextMenuOpen: (payload: { x: number; y: number; hit: ContextHit | null }) => void;
  onViewChange: (view: ViewState) => void;
  onEditStart?: () => void;
};

export function useCanvasPlannerInteractions({
  canvasRef,
  mode,
  scale,
  snapEnabled,
  nodes,
  walls,
  rooms,
  selection,
  nodeMap,
  view,
  onCreateWallChain,
  onCreateRoomFromChain,
  onUpdateNodes,
  onSelectionChange,
  onContextMenuOpen,
  onViewChange,
  onEditStart,
}: UseCanvasPlannerInteractionsArgs) {
  const dragRef = useRef<DragState>({ type: null });
  const spacePressed = useRef(false);
  const shiftPressed = useRef(false);
  const [currentPoints, setCurrentPoints] = useState<Vec2[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Vec2 | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [status, setStatus] = useState("Длина: 0 м · Угол: 0°");

  const metersFromPixels = (px: number) => px / scale;

  const screenToWorld = (point: Vec2): Vec2 => ({
    x: (point.x - view.offset.x) / view.zoom,
    y: (point.y - view.offset.y) / view.zoom,
  });

  const snapToAngle = (point: Vec2, origin?: Vec2) => {
    if (!snapEnabled || !origin) return point;
    const angle = angleBetween(origin, point);
    const deg = (angle * 180) / Math.PI;
    const snaps = CANVAS_INTERACTION.angleSnapDegrees;
    const threshold = CANVAS_INTERACTION.angleSnapThresholdDeg;
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
    const snapDist = CANVAS_INTERACTION.nodeSnapDistancePx / view.zoom;
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
    return distance(point, first) < CANVAS_INTERACTION.closeRoomDistancePx / view.zoom;
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
    if (
      diff < CANVAS_INTERACTION.mergeCollinearThresholdRad
      || Math.abs(diff - Math.PI) < CANVAS_INTERACTION.mergeCollinearThresholdRad
    ) {
      next.splice(next.length - 2, 1);
    }
    return next;
  };

  const findNodeHit = (screenPoint: Vec2): NodeHit | null => {
    const threshold = CANVAS_INTERACTION.hitThresholdPx;
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
    const threshold = CANVAS_INTERACTION.hitThresholdPx;
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
    const handleWheelEvent = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };
    window.addEventListener("wheel", handleWheelEvent, { passive: false });
    return () => window.removeEventListener("wheel", handleWheelEvent);
  }, []);

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
      const wallId = dragRef.current.wallId;
      const delta = {
        x: worldPoint.x - dragRef.current.start.x,
        y: worldPoint.y - dragRef.current.start.y,
      };
      dragRef.current.start = worldPoint;
      const wall = walls.find((item) => item.id === wallId);
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
    const zoomFactor = Math.exp(-event.deltaY * EDITOR_LIMITS.zoom.wheelFactor);
    const nextZoom = Math.min(
      EDITOR_LIMITS.zoom.max,
      Math.max(EDITOR_LIMITS.zoom.min, view.zoom * zoomFactor)
    );
    const nextOffset = {
      x: screenPoint.x - worldPoint.x * nextZoom,
      y: screenPoint.y - worldPoint.y * nextZoom,
    };
    onViewChange({ zoom: nextZoom, offset: nextOffset });
  };

  return {
    currentPoints,
    hoverPoint,
    selectionBox,
    status,
    setStatus,
    setHoverPoint,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
    handleContextMenu,
    handleWheel,
  };
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
