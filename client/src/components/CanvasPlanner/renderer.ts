import { NODE_PALETTE } from "../../constants";
import { distance, polygonCentroid } from "../../utils/geometry";

import type { Room, Selection, Vec2, ViewState, Wall } from "../../types/plan";

type SelectionBox = { start: Vec2; end: Vec2 };

type DrawParams = {
  ctx: CanvasRenderingContext2D;
  nodes: { id: number; x: number; y: number }[];
  walls: Wall[];
  rooms: Room[];
  selection: Selection;
  hoveredWallId: number | null;
  view: ViewState;
  grid: number;
  scale: number;
  canvasWidth: number;
  canvasHeight: number;
  soloView: boolean;
  showRoomNames: boolean;
  showRoomSizes: boolean;
  showWallNames: boolean;
  showWallLength: boolean;
  showWallWidth: boolean;
  showAngleLabels: boolean;
  defaultWallThickness: number;
  showInnerMeasurements: boolean;
  innerLengthByWallId: Map<number, number>;
  roomAreaById: Record<number, number>;
  currentPoints: Vec2[];
  hoverPoint: Vec2 | null;
  selectionBox: SelectionBox | null;
  nodeMap: Map<number, { id: number; x: number; y: number }>;
};

const getCssVar = (name: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

const normalizeBox = (box: SelectionBox) => ({
  minX: Math.min(box.start.x, box.end.x),
  minY: Math.min(box.start.y, box.end.y),
  maxX: Math.max(box.start.x, box.end.x),
  maxY: Math.max(box.start.y, box.end.y),
});

const drawLabel = (ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, zoom: number) => {
  const fontSize = 11 / zoom;
  ctx.save();
  ctx.font = `${fontSize}px 'Space Grotesk', sans-serif`;
  const paddingX = 4 / zoom;
  const paddingY = 3 / zoom;
  const lineHeight = fontSize + 2 / zoom;
  const widths = lines.map((line) => ctx.measureText(line).width);
  const width = Math.max(...widths, 0) + paddingX * 2;
  const height = lineHeight * lines.length + paddingY * 2;
  ctx.fillStyle = "rgba(15, 14, 12, 0.65)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, 6 / zoom);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f4ede6";
  lines.forEach((line, index) => {
    ctx.fillText(line, x - width / 2 + paddingX, y - height / 2 + paddingY + lineHeight * (index + 0.9));
  });
  ctx.restore();
};

export function drawCanvas({
  ctx,
  nodes,
  walls,
  rooms,
  selection,
  hoveredWallId,
  view,
  grid,
  scale,
  canvasWidth,
  canvasHeight,
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
  roomAreaById,
  currentPoints,
  hoverPoint,
  selectionBox,
  nodeMap,
}: DrawParams) {
  const pixelsFromMeters = (m: number) => m * scale;

  const drawGrid = () => {
    const step = pixelsFromMeters(grid);
    if (!step) return;
    const startX = (-view.offset.x) / view.zoom;
    const startY = (-view.offset.y) / view.zoom;
    const endX = (canvasWidth - view.offset.x) / view.zoom;
    const endY = (canvasHeight - view.offset.y) / view.zoom;
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

  const drawRooms = () => {
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
          const area = showInnerMeasurements ? (roomAreaById[room.id] ?? 0) : roomAreaById[room.id] ?? 0;
          lines.push(`${area.toFixed(2)} м²`);
        }
        if (lines.length) drawLabel(ctx, lines, center.x, center.y, view.zoom);
      }
    });
  };

  const drawWalls = () => {
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
          if (lines.length) drawLabel(ctx, lines, labelX, labelY, view.zoom);
        }
      }
    });
  };

  const drawAngles = () => {
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
      drawLabel(ctx, [`${angle.toFixed(1)}°`], node.x + 8 / view.zoom, node.y - 8 / view.zoom, view.zoom);
    });
  };

  const drawNodes = () => {
    nodes.forEach((node) => {
      ctx.beginPath();
      const isSelected = selection.nodes.includes(node.id);
      const colorIndex = node.id % NODE_PALETTE.length;
      ctx.fillStyle = isSelected ? "#d45a3e" : NODE_PALETTE[colorIndex];
      ctx.arc(node.x, node.y, (isSelected ? 5 : 3.5) / view.zoom, 0, Math.PI * 2);
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1 / view.zoom;
        ctx.stroke();
      }
    });
  };

  const drawCurrentPath = () => {
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

  const drawSelectionBox = () => {
    if (!selectionBox) return;
    const box = normalizeBox(selectionBox);
    ctx.strokeStyle = "rgba(45, 106, 124, 0.7)";
    ctx.lineWidth = 1 / view.zoom;
    ctx.setLineDash([6 / view.zoom, 4 / view.zoom]);
    ctx.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
    ctx.setLineDash([]);
  };

  drawGrid();
  drawRooms();
  drawWalls();
  drawAngles();
  drawNodes();
  drawCurrentPath();
  drawSelectionBox();
}
