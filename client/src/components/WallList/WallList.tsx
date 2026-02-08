import React, { useMemo, useState } from "react";
import type { NodePoint, Wall } from "../../types/plan";
import "./styles.scss";

type Props = {
  walls: Wall[];
  nodes: NodePoint[];
  scale: number;
  selectedWallIds: number[];
  hoveredWallId: number | null;
  showInnerMeasurements: boolean;
  innerLengthByWallId: Map<number, number>;
  onHover: (wallId: number | null) => void;
  onSelect: (wallId: number, event: React.MouseEvent<HTMLDivElement>) => void;
  onRename: (wallId: number, name: string) => void;
  onLengthChange: (wallId: number, lengthMeters: number) => void;
  onWidthChange: (wallId: number, widthMeters: number) => void;
};

export default function WallList({
  walls,
  nodes,
  scale,
  selectedWallIds,
  hoveredWallId,
  showInnerMeasurements,
  innerLengthByWallId,
  onHover,
  onSelect,
  onRename,
  onLengthChange,
  onWidthChange,
}: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [editingLengthId, setEditingLengthId] = useState<number | null>(null);
  const [draftLength, setDraftLength] = useState("");
  const [editingWidthId, setEditingWidthId] = useState<number | null>(null);
  const [draftWidth, setDraftWidth] = useState("");

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const startEdit = (wall: Wall) => {
    setEditingId(wall.id);
    setDraft(wall.name || `Стена ${wall.id}`);
  };

  const commitEdit = () => {
    if (editingId === null) return;
    onRename(editingId, draft);
    setEditingId(null);
  };

  const startLengthEdit = (wall: Wall) => {
    const nodeA = nodeMap.get(wall.a);
    const nodeB = nodeMap.get(wall.b);
    if (!nodeA || !nodeB) return;
    const length = Math.hypot(nodeB.x - nodeA.x, nodeB.y - nodeA.y) / scale;
    const innerLength = innerLengthByWallId.get(wall.id);
    const lengthValue = showInnerMeasurements && innerLength !== undefined ? innerLength : length;
    setEditingLengthId(wall.id);
    setDraftLength(lengthValue.toFixed(2));
  };

  const commitLengthEdit = () => {
    if (editingLengthId === null) return;
    const nextValue = Number(draftLength);
    if (!Number.isNaN(nextValue)) {
      onLengthChange(editingLengthId, nextValue);
    }
    setEditingLengthId(null);
  };

  const startWidthEdit = (wall: Wall) => {
    setEditingWidthId(wall.id);
    setDraftWidth((wall.thickness ?? 0).toFixed(2));
  };

  const commitWidthEdit = () => {
    if (editingWidthId === null) return;
    const nextValue = Number(draftWidth);
    if (!Number.isNaN(nextValue)) {
      onWidthChange(editingWidthId, nextValue);
    }
    setEditingWidthId(null);
  };

  if (!walls.length) {
    return <div className="wall-empty">Стен пока нет.</div>;
  }
  return (
    <div className="wall-list">
      {walls.map((wall) => {
        const isActive = selectedWallIds.includes(wall.id);
        const isHover = hoveredWallId === wall.id;
        const thickness = wall.thickness ?? 0;
        const isEditing = editingId === wall.id;
        const isEditingLength = editingLengthId === wall.id;
        const isEditingWidth = editingWidthId === wall.id;
        const nodeA = nodeMap.get(wall.a);
        const nodeB = nodeMap.get(wall.b);
        const length = nodeA && nodeB ? Math.hypot(nodeB.x - nodeA.x, nodeB.y - nodeA.y) / scale : 0;
        const innerLength = innerLengthByWallId.get(wall.id);
        const lengthValue = showInnerMeasurements && innerLength !== undefined ? innerLength : length;
        return (
          <div
            key={wall.id}
            className={`wall-list-item wall-item${isActive ? " active" : ""}${isHover ? " hover" : ""}`}
            onMouseEnter={() => onHover(wall.id)}
            onMouseLeave={() => onHover(null)}
            onClick={(event) => onSelect(wall.id, event)}
          >
            <div className="wall-title">
              <svg className="wall-brick-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 10h18M8 5v5M16 10v5M12 15v4" />
              </svg>
              {isEditing ? (
                <input
                  className="wall-name-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitEdit();
                    if (event.key === "Escape") setEditingId(null);
                  }}
                  onClick={(event) => event.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span
                  className="wall-name"
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    startEdit(wall);
                  }}
                >
                  {wall.name || `Стена ${wall.id}`}
                </span>
              )}
            </div>
            <div className="wall-meta">
              {isEditingLength ? (
                <input
                  type="number"
                  className="wall-name-input"
                  value={draftLength}
                  onChange={(event) => setDraftLength(event.target.value)}
                  min={0.01}
                  max={100}
                  step={0.01}
                  onBlur={commitLengthEdit}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitLengthEdit();
                    if (event.key === "Escape") setEditingLengthId(null);
                  }}
                  onClick={(event) => event.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span
                  className="wall-length"
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    startLengthEdit(wall);
                  }}
                >
                  Длина: {lengthValue.toFixed(2)} м
                </span>
              )}
              {isEditingWidth ? (
                <input
                  type="number"
                  className="wall-name-input"
                  value={draftWidth}
                  onChange={(event) => setDraftWidth(event.target.value)}
                  min={0.01}
                  max={1}
                  step={0.01}
                  onBlur={commitWidthEdit}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitWidthEdit();
                    if (event.key === "Escape") setEditingWidthId(null);
                  }}
                  onClick={(event) => event.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span
                  className="wall-width"
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    startWidthEdit(wall);
                  }}
                >
                  Ширина: {thickness.toFixed(2)} м
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
