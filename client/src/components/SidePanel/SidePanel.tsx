import React, { useEffect, useRef, useState } from "react";
import Tooltip from "../Tooltip";
import "./styles.scss";

export type SidePanelItem = {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
};

type Props = {
  items: SidePanelItem[];
  activeId: string | null;
  collapsed: boolean;
  width: number;
  onToggleItem: (id: string) => void;
  onToggleCollapsed: () => void;
  onResize: (width: number) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default function SidePanel({
  items,
  activeId,
  collapsed,
  width,
  onToggleItem,
  onToggleCollapsed,
  onResize,
}: Props) {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - event.clientX;
      const max = Math.min(640, window.innerWidth - 160);
      onResize(clamp(dragRef.current.startWidth + delta, 260, max));
    };
    const handleUp = () => {
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragging, onResize]);

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
  };

  const activeItem = items.find((item) => item.id === activeId) || null;

  return (
    <>
      {collapsed && (
        <button
          className="side-panel-toggle collapsed"
          onClick={onToggleCollapsed}
          aria-label="Показать панель"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 6l-6 6 6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      {!collapsed && (
        <aside className="side-panel" style={{ width }}>
          <div className="side-panel-resizer" onPointerDown={handleResizeStart} />
          <div className="side-panel-tabs">
            {items.map((item) => (
              <Tooltip key={item.id} content={item.title}>
                <button
                  className={`side-panel-tab ${activeId === item.id ? "active" : ""}`}
                  onClick={() => onToggleItem(item.id)}
                  aria-label={item.title}
                >
                  {item.icon}
                </button>
              </Tooltip>
            ))}
          </div>
          <div className="side-panel-body">
            {activeItem ? (
              <div className="side-panel-section">
                <h3>{activeItem.title}</h3>
                <div className="side-panel-content">{activeItem.content}</div>
              </div>
            ) : (
              <div className="side-panel-empty">Выберите раздел.</div>
            )}
          </div>
          <button
            className="side-panel-toggle side-panel-toggle-inline"
            onClick={onToggleCollapsed}
            aria-label="Скрыть панель"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M9 6l6 6-6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </aside>
      )}
    </>
  );
}
