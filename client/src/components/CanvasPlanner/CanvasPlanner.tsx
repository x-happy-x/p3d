import React, { useEffect, useMemo, useRef, useState } from "react";

import { distance, getRoomArea } from "../../utils/geometry";
import {
  buildWallEdgeMap,
  getInnerLengthByWallId,
  getRoomInnerArea,
  getRoomPerimeter,
} from "../../utils/planMetrics";

import { drawCanvas } from "./renderer";
import { useCanvasPlannerInteractions } from "./useCanvasPlannerInteractions";

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
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0, dpr: 1 });

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const wallEdgeMap = useMemo(() => buildWallEdgeMap(walls), [walls]);

  const innerLengthByWallId = useMemo(
    () => (showInnerMeasurements ? getInnerLengthByWallId(rooms, wallEdgeMap, defaultWallThickness, scale) : new Map()),
    [rooms, wallEdgeMap, defaultWallThickness, scale, showInnerMeasurements]
  );

  const innerRoomAreaById = useMemo(() => {
    const areas: Record<number, number> = {};
    rooms.forEach((room) => {
      areas[room.id] = getRoomInnerArea(room, wallEdgeMap, defaultWallThickness, scale);
    });
    return areas;
  }, [rooms, wallEdgeMap, defaultWallThickness, scale]);

  const outerRoomAreaById = useMemo(() => {
    const areas: Record<number, number> = {};
    rooms.forEach((room) => {
      areas[room.id] = getRoomArea(room, scale);
    });
    return areas;
  }, [rooms, scale]);

  const {
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
  } = useCanvasPlannerInteractions({
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
  });

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
    drawCanvas({
      ctx,
      nodes,
      walls,
      rooms,
      selection,
      hoveredWallId,
      view,
      grid,
      scale,
      canvasWidth: canvasSize.width,
      canvasHeight: canvasSize.height,
      soloView,
      showRoomNames,
      showRoomSizes,
      showWallNames,
      showWallLength,
      showWallWidth,
      showAngleLabels,
      defaultWallThickness,
      showInnerMeasurements,
      innerLengthByWallId,
      roomAreaById: showInnerMeasurements ? innerRoomAreaById : outerRoomAreaById,
      currentPoints,
      hoverPoint,
      selectionBox,
      nodeMap,
    });
  }, [
    canvasSize,
    nodes,
    walls,
    rooms,
    selection,
    hoveredWallId,
    view,
    grid,
    scale,
    soloView,
    showRoomNames,
    showRoomSizes,
    showWallNames,
    showWallLength,
    showWallWidth,
    showAngleLabels,
    defaultWallThickness,
    showInnerMeasurements,
    innerLengthByWallId,
    innerRoomAreaById,
    outerRoomAreaById,
    currentPoints,
    hoverPoint,
    selectionBox,
    nodeMap,
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
      const area = showInnerMeasurements
        ? getRoomInnerArea(room, wallEdgeMap, defaultWallThickness, scale)
        : getRoomArea(room, scale);
      const perimeter = getRoomPerimeter(room, wallEdgeMap, defaultWallThickness, scale, showInnerMeasurements);
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
    wallEdgeMap,
    setStatus,
  ]);

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
