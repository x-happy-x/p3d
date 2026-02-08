import React from "react";

import WallList from "../WallList";
import { getRoomArea } from "../../utils/geometry";
import type { SideSectionId } from "../../hooks/useUiPrefs";
import type { NodePoint, Room, Selection, Vec2, Wall } from "../../types/plan";

const PREVIEW_SIZE = 220;
const PREVIEW_PADDING = 16;

const normalizePreviewPoints = (points: Vec2[]) => {
  if (!points.length) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const scale = Math.min(
    (PREVIEW_SIZE - PREVIEW_PADDING * 2) / width,
    (PREVIEW_SIZE - PREVIEW_PADDING * 2) / height
  );
  const offsetX =
    PREVIEW_PADDING + (PREVIEW_SIZE - PREVIEW_PADDING * 2 - width * scale) / 2 - minX * scale;
  const offsetY =
    PREVIEW_PADDING + (PREVIEW_SIZE - PREVIEW_PADDING * 2 - height * scale) / 2 - minY * scale;
  return points.map((point) => ({
    x: point.x * scale + offsetX,
    y: point.y * scale + offsetY,
  }));
};

const previewPolyline = (points: Vec2[]) =>
  points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");

type Props = {
  sectionOrder: SideSectionId[];
  sideSections: Record<SideSectionId, boolean>;
  draggingSection: SideSectionId | null;
  onToggleSection: (id: SideSectionId) => void;
  onSectionDragStart: (id: SideSectionId, event: React.DragEvent<HTMLButtonElement>) => void;
  onSectionDragEnd: () => void;
  onSectionDrop: (targetId: SideSectionId) => void;
  rooms: Room[];
  walls: Wall[];
  nodes: NodePoint[];
  selection: Selection;
  totalArea: number;
  scale: number;
  showInnerMeasurements: boolean;
  roomAreaById: Record<number, number>;
  soloView: boolean;
  setSoloView: React.Dispatch<React.SetStateAction<boolean>>;
  showRoomNames: boolean;
  setShowRoomNames: React.Dispatch<React.SetStateAction<boolean>>;
  showRoomSizes: boolean;
  setShowRoomSizes: React.Dispatch<React.SetStateAction<boolean>>;
  showWallNames: boolean;
  setShowWallNames: React.Dispatch<React.SetStateAction<boolean>>;
  showWallLength: boolean;
  setShowWallLength: React.Dispatch<React.SetStateAction<boolean>>;
  showWallWidth: boolean;
  setShowWallWidth: React.Dispatch<React.SetStateAction<boolean>>;
  showAngleLabels: boolean;
  setShowAngleLabels: React.Dispatch<React.SetStateAction<boolean>>;
  setShowInnerMeasurements: React.Dispatch<React.SetStateAction<boolean>>;
  showRoomsPanel: boolean;
  setShowRoomsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  showWallsPanel: boolean;
  setShowWallsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  expandedRooms: Record<number, boolean>;
  setExpandedRooms: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  expandedOrphans: boolean;
  setExpandedOrphans: React.Dispatch<React.SetStateAction<boolean>>;
  editingRoomId: number | null;
  setEditingRoomId: React.Dispatch<React.SetStateAction<number | null>>;
  roomNameDraft: string;
  setRoomNameDraft: React.Dispatch<React.SetStateAction<string>>;
  commitRoomEdit: () => void;
  startRoomEdit: (room: Room) => void;
  handleRoomSelect: (roomId: number, event: React.MouseEvent<HTMLDivElement>) => void;
  wallGroups: { roomWalls: Map<number, Wall[]>; orphanWalls: Wall[] };
  selectedWallIds: number[];
  hoveredWallId: number | null;
  setHoveredWallId: React.Dispatch<React.SetStateAction<number | null>>;
  innerLengthByWallId: Map<number, number>;
  handleWallSelect: (wallId: number, event: React.MouseEvent<HTMLDivElement>) => void;
  handleWallRename: (wallId: number, name: string) => void;
  handleWallLengthChange: (wallId: number, lengthMeters: number) => void;
  handleWallWidthChange: (wallId: number, widthMeters: number) => void;
};

export default function MainSidePanelContent({
  sectionOrder,
  sideSections,
  draggingSection,
  onToggleSection,
  onSectionDragStart,
  onSectionDragEnd,
  onSectionDrop,
  rooms,
  walls,
  nodes,
  selection,
  totalArea,
  scale,
  showInnerMeasurements,
  roomAreaById,
  soloView,
  setSoloView,
  showRoomNames,
  setShowRoomNames,
  showRoomSizes,
  setShowRoomSizes,
  showWallNames,
  setShowWallNames,
  showWallLength,
  setShowWallLength,
  showWallWidth,
  setShowWallWidth,
  showAngleLabels,
  setShowAngleLabels,
  setShowInnerMeasurements,
  showRoomsPanel,
  setShowRoomsPanel,
  showWallsPanel,
  setShowWallsPanel,
  expandedRooms,
  setExpandedRooms,
  expandedOrphans,
  setExpandedOrphans,
  editingRoomId,
  setEditingRoomId,
  roomNameDraft,
  setRoomNameDraft,
  commitRoomEdit,
  startRoomEdit,
  handleRoomSelect,
  wallGroups,
  selectedWallIds,
  hoveredWallId,
  setHoveredWallId,
  innerLengthByWallId,
  handleWallSelect,
  handleWallRename,
  handleWallLengthChange,
  handleWallWidthChange,
}: Props) {
  return (
    <div className="side-sections">
      {sectionOrder.map((sectionId) => {
        const isOpen = sideSections[sectionId];
        const title =
          sectionId === "stats"
            ? "Статистика"
            : sectionId === "preview"
              ? "Превью"
              : sectionId === "view"
                ? "Настройки просмотра"
                : "Комнаты и стены";

        const content =
          sectionId === "stats" ? (
            <div className="stats-grid">
              <div>
                <span className="label">Комнат</span>
                <span className="value">{rooms.length}</span>
              </div>
              <div>
                <span className="label">Стен</span>
                <span className="value">{walls.length}</span>
              </div>
              <div>
                <span className="label">Площадь</span>
                <span className="value">{totalArea.toFixed(2)} м²</span>
              </div>
            </div>
          ) : sectionId === "preview" ? (
            <div className="selection-preview">
              {selection.nodes.length || selection.walls.length || selection.rooms.length ? (
                (() => {
                  const roomItems = selection.rooms
                    .map((roomId) => rooms.find((itemRoom) => itemRoom.id === roomId))
                    .filter((roomItem): roomItem is NonNullable<typeof roomItem> => Boolean(roomItem));
                  const wallItems = selection.walls
                    .map((wallId) => walls.find((itemWall) => itemWall.id === wallId))
                    .filter((wallItem): wallItem is NonNullable<typeof wallItem> => Boolean(wallItem));
                  const nodeItems = selection.nodes
                    .map((nodeId) => nodes.find((itemNode) => itemNode.id === nodeId))
                    .filter((nodeItem): nodeItem is NonNullable<typeof nodeItem> => Boolean(nodeItem));

                  const previewPoints: Vec2[] = [];
                  roomItems.forEach((roomItem) => previewPoints.push(...roomItem.points));
                  wallItems.forEach((wallItem) => {
                    const nodeA = nodes.find((node) => node.id === wallItem.a);
                    const nodeB = nodes.find((node) => node.id === wallItem.b);
                    if (nodeA && nodeB) {
                      previewPoints.push(nodeA, nodeB);
                    }
                  });
                  nodeItems.forEach((nodeItem) => previewPoints.push(nodeItem));

                  const normalized = normalizePreviewPoints(
                    previewPoints.length ? previewPoints : [{ x: 0, y: 0 }]
                  );
                  let index = 0;
                  const roomNormalized = roomItems.map((roomItem) => {
                    const points = normalized.slice(index, index + roomItem.points.length);
                    index += roomItem.points.length;
                    return { id: roomItem.id, points };
                  });
                  const wallNormalized = wallItems
                    .map((wallItem) => {
                      const nodeA = nodes.find((node) => node.id === wallItem.a);
                      const nodeB = nodes.find((node) => node.id === wallItem.b);
                      if (!nodeA || !nodeB) return null;
                      const points = normalized.slice(index, index + 2);
                      index += 2;
                      return { id: wallItem.id, points };
                    })
                    .filter(Boolean);
                  const nodeNormalized = nodeItems.map((nodeItem) => {
                    const [point] = normalized.slice(index, index + 1);
                    index += 1;
                    return { id: nodeItem.id, point };
                  });

                  return (
                    <div className="preview-panel">
                      <svg
                        width={PREVIEW_SIZE}
                        height={PREVIEW_SIZE}
                        viewBox={`0 0 ${PREVIEW_SIZE} ${PREVIEW_SIZE}`}
                        className="preview-svg preview-svg-large"
                      >
                        {roomNormalized.map((roomItem) => (
                          <polygon
                            key={`room-${roomItem.id}`}
                            points={previewPolyline(roomItem.points)}
                            className="preview-room"
                          />
                        ))}
                        {wallNormalized.map((wallItem) => (
                          <line
                            key={`wall-${wallItem?.id}`}
                            x1={wallItem!.points[0].x}
                            y1={wallItem!.points[0].y}
                            x2={wallItem!.points[1].x}
                            y2={wallItem!.points[1].y}
                            className="preview-wall"
                          />
                        ))}
                        {nodeNormalized.map((nodeItem) => (
                          <circle
                            key={`node-${nodeItem.id}`}
                            cx={nodeItem.point.x}
                            cy={nodeItem.point.y}
                            r={4}
                            className="preview-node"
                          />
                        ))}
                      </svg>
                      <div className="preview-labels">
                        {!!roomItems.length && (
                          <div>Комнаты: {roomItems.map((roomItem) => roomItem.id).join(", ")}</div>
                        )}
                        {!!wallItems.length && (
                          <div>Стены: {wallItems.map((wallItem) => wallItem.id).join(", ")}</div>
                        )}
                        {!!nodeItems.length && (
                          <div>Точки: {nodeItems.map((nodeItem) => nodeItem.id).join(", ")}</div>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="preview-empty">Нет выбранных объектов.</div>
              )}
            </div>
          ) : sectionId === "view" ? (
            <div className="view-controls">
              <div className="chip-group">
                <button className={`chip ${soloView ? "active" : ""}`} onClick={() => setSoloView((prev) => !prev)} type="button">
                  Только выбранные
                </button>
                <button className={`chip ${showRoomNames ? "active" : ""}`} onClick={() => setShowRoomNames((prev) => !prev)} type="button">
                  Названия комнат
                </button>
                <button className={`chip ${showRoomSizes ? "active" : ""}`} onClick={() => setShowRoomSizes((prev) => !prev)} type="button">
                  Площади комнат
                </button>
                <button className={`chip ${showWallNames ? "active" : ""}`} onClick={() => setShowWallNames((prev) => !prev)} type="button">
                  Названия стен
                </button>
                <button className={`chip ${showWallLength ? "active" : ""}`} onClick={() => setShowWallLength((prev) => !prev)} type="button">
                  Длина стен
                </button>
                <button className={`chip ${showWallWidth ? "active" : ""}`} onClick={() => setShowWallWidth((prev) => !prev)} type="button">
                  Ширина стен
                </button>
                <button className={`chip ${showAngleLabels ? "active" : ""}`} onClick={() => setShowAngleLabels((prev) => !prev)} type="button">
                  Углы
                </button>
              </div>
              <div className="view-subsection">
                <div className="view-subtitle">Внутренние размеры</div>
                <div className="chip-group">
                  <button
                    className={`chip ${showInnerMeasurements ? "active" : ""}`}
                    onClick={() => setShowInnerMeasurements((prev) => !prev)}
                    type="button"
                  >
                    Внутренняя длина и площадь
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="objects-panel">
              <div className="chip-group">
                <button className={`chip ${showRoomsPanel ? "active" : ""}`} onClick={() => setShowRoomsPanel((prev) => !prev)} type="button">
                  Комнаты
                </button>
                <button className={`chip ${showWallsPanel ? "active" : ""}`} onClick={() => setShowWallsPanel((prev) => !prev)} type="button">
                  Стены
                </button>
              </div>
              {showRoomsPanel && (
                <div className="objects-subsection">
                  {rooms.map((room) => {
                    const isExpanded = !!expandedRooms[room.id];
                    const isEditing = editingRoomId === room.id;
                    const roomWalls = wallGroups.roomWalls.get(room.id) || [];
                    return (
                      <div key={room.id} className="room-entry">
                        <div
                          className={`room-item${selection.rooms.includes(room.id) ? " active" : ""}`}
                          onClick={(event) => handleRoomSelect(room.id, event)}
                        >
                          <button
                            className="room-toggle"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedRooms((prev) => ({ ...prev, [room.id]: !prev[room.id] }));
                            }}
                            type="button"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d={isExpanded ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6"}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          {isEditing ? (
                            <input
                              className="room-name-input"
                              value={roomNameDraft}
                              onChange={(event) => setRoomNameDraft(event.target.value)}
                              onBlur={commitRoomEdit}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") commitRoomEdit();
                                if (event.key === "Escape") setEditingRoomId(null);
                              }}
                              onClick={(event) => event.stopPropagation()}
                              autoFocus
                            />
                          ) : (
                            <span
                              className="room-name"
                              onDoubleClick={(event) => {
                                event.stopPropagation();
                                startRoomEdit(room);
                              }}
                            >
                              {room.name || `Комната ${room.id}`}
                            </span>
                          )}
                          <strong>
                            {(showInnerMeasurements
                              ? roomAreaById[room.id] ?? getRoomArea(room, scale)
                              : getRoomArea(room, scale)
                            ).toFixed(2)} м²
                          </strong>
                        </div>
                        {showWallsPanel && isExpanded && (
                          <div className="room-walls">
                            {roomWalls.length ? (
                              <WallList
                                walls={roomWalls}
                                nodes={nodes}
                                scale={scale}
                                selectedWallIds={selectedWallIds}
                                hoveredWallId={hoveredWallId}
                                showInnerMeasurements={showInnerMeasurements}
                                innerLengthByWallId={innerLengthByWallId}
                                onHover={setHoveredWallId}
                                onSelect={handleWallSelect}
                                onRename={handleWallRename}
                                onLengthChange={handleWallLengthChange}
                                onWidthChange={handleWallWidthChange}
                              />
                            ) : (
                              <div className="wall-empty">Стен нет.</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {showWallsPanel && wallGroups.orphanWalls.length > 0 && (
                    <div className="room-entry">
                      <div className="room-item orphan-title">
                        <button
                          className="room-toggle"
                          onClick={() => setExpandedOrphans((prev) => !prev)}
                          type="button"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d={expandedOrphans ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6"}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <span className="room-name">Отдельные</span>
                      </div>
                      {expandedOrphans && (
                        <div className="room-walls">
                          <WallList
                            walls={wallGroups.orphanWalls}
                            nodes={nodes}
                            scale={scale}
                            selectedWallIds={selectedWallIds}
                            hoveredWallId={hoveredWallId}
                            showInnerMeasurements={showInnerMeasurements}
                            innerLengthByWallId={innerLengthByWallId}
                            onHover={setHoveredWallId}
                            onSelect={handleWallSelect}
                            onRename={handleWallRename}
                            onLengthChange={handleWallLengthChange}
                            onWidthChange={handleWallWidthChange}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {showWallsPanel && !showRoomsPanel && (
                <WallList
                  walls={walls}
                  nodes={nodes}
                  scale={scale}
                  selectedWallIds={selectedWallIds}
                  hoveredWallId={hoveredWallId}
                  showInnerMeasurements={showInnerMeasurements}
                  innerLengthByWallId={innerLengthByWallId}
                  onHover={setHoveredWallId}
                  onSelect={handleWallSelect}
                  onRename={handleWallRename}
                  onLengthChange={handleWallLengthChange}
                  onWidthChange={handleWallWidthChange}
                />
              )}
            </div>
          );

        return (
          <section key={sectionId} className={`side-section ${isOpen ? "open" : "collapsed"}`}>
            <button
              className={`side-section-toggle ${draggingSection === sectionId ? "dragging" : ""}`}
              onClick={() => onToggleSection(sectionId)}
              draggable
              onDragStart={(event) => onSectionDragStart(sectionId, event)}
              onDragEnd={onSectionDragEnd}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onSectionDrop(sectionId)}
            >
              <span>{title}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d={isOpen ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6"}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {isOpen && <div className="side-section-body">{content}</div>}
          </section>
        );
      })}
    </div>
  );
}
