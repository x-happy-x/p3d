import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import Tooltip from "../Tooltip";
import "./styles.scss";

type Position = { x: number; y: number };

type Size = { width: number; height: number };

type Props = {
  panelId: string;
  title: string;
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  position: Position;
  onDrag: (panelId: string, pos: Position) => void;
  onSize: (panelId: string, size: Size) => void;
  icon: React.ReactNode;
  children: React.ReactNode;
};

export default function FloatingPanel({
  panelId,
  title,
  defaultCollapsed = false,
  collapsed: collapsedProp,
  onCollapsedChange,
  position,
  onDrag,
  onSize,
  icon,
  children,
}: Props) {
  const [collapsedState, setCollapsedState] = useState(defaultCollapsed);
  const collapsed = collapsedProp ?? collapsedState;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const sizeRef = useRef<{ expanded?: Size; collapsed?: Size }>({});
  const prevCollapsedRef = useRef(collapsed);
  const lastDeltaRef = useRef<{ dx: number; dy: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    captureEl: HTMLElement | null;
    moved: boolean;
  } | null>(null);

  const clampPosition = (x: number, y: number, size: Size) => {
    const margin = 8;
    const maxX = Math.max(margin, window.innerWidth - size.width - margin);
    const maxY = Math.max(margin, window.innerHeight - size.height - margin);
    return {
      x: Math.min(Math.max(x, margin), maxX),
      y: Math.min(Math.max(y, margin), maxY),
    };
  };

  const getCurrentSize = () => {
    if (!panelRef.current) return null;
    const rect = panelRef.current.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  useEffect(() => {
    if (!panelRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      onSize(panelId, { width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(panelRef.current);
    return () => observer.disconnect();
  }, [panelId, onSize]);

  useLayoutEffect(() => {
    const currentSize = getCurrentSize();
    if (!currentSize) return;
    if (collapsed) {
      sizeRef.current.collapsed = currentSize;
    } else {
      sizeRef.current.expanded = currentSize;
    }

    let desired = { x: position.x, y: position.y };
    if (prevCollapsedRef.current !== collapsed) {
      const expanded = sizeRef.current.expanded;
      const collapsedSize = sizeRef.current.collapsed;
      const dx = expanded && collapsedSize ? Math.max(0, expanded.width - collapsedSize.width) : 0;
      const dy = expanded && collapsedSize ? Math.max(0, expanded.height - collapsedSize.height) : 0;

      if (collapsed) {
        lastDeltaRef.current = { dx, dy };
        desired = { x: position.x + dx, y: position.y + dy };
      } else {
        const lastDelta = lastDeltaRef.current;
        const useDx = lastDelta ? lastDelta.dx : dx;
        const useDy = lastDelta ? lastDelta.dy : dy;
        desired = { x: position.x - useDx, y: position.y - useDy };
      }
      prevCollapsedRef.current = collapsed;
    }

    const clamped = clampPosition(desired.x, desired.y, currentSize);
    if (clamped.x !== position.x || clamped.y !== position.y) {
      onDrag(panelId, clamped);
    }
  }, [collapsed, onDrag, panelId, position.x, position.y]);

  useEffect(() => {
    const handleResize = () => {
      const currentSize = getCurrentSize();
      if (!currentSize) return;
      const clamped = clampPosition(position.x, position.y, currentSize);
      if (clamped.x !== position.x || clamped.y !== position.y) {
        onDrag(panelId, clamped);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [onDrag, panelId, position.x, position.y]);

  const shouldStartDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return false;
    const target = event.target as HTMLElement | null;
    if (!target) return true;
    if (target.closest("[data-no-drag]")) return false;
    if (target.closest("[data-drag-handle]")) return true;
    if (target.closest("button, input, textarea, select, a")) return false;
    return true;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!panelRef.current || !shouldStartDrag(event)) return;
    const captureEl = event.currentTarget as HTMLElement | null;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      captureEl,
      moved: false,
    };
    if (captureEl) {
      captureEl.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    const deltaX = event.clientX - dragRef.current.startX;
    const deltaY = event.clientY - dragRef.current.startY;
    if (!dragRef.current.moved && Math.hypot(deltaX, deltaY) > 3) {
      dragRef.current.moved = true;
    }
    const nextX = dragRef.current.originX + (event.clientX - dragRef.current.startX);
    const nextY = dragRef.current.originY + (event.clientY - dragRef.current.startY);
    const currentSize = getCurrentSize();
    if (!currentSize) {
      onDrag(panelId, { x: nextX, y: nextY });
      return;
    }
    onDrag(panelId, clampPosition(nextX, nextY, currentSize));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const captureEl = dragRef.current?.captureEl;
    if (captureEl && captureEl.hasPointerCapture(event.pointerId)) {
      captureEl.releasePointerCapture(event.pointerId);
    }
    suppressClickRef.current = Boolean(dragRef.current?.moved);
    dragRef.current = null;
  };

  const handlePointerCancel = () => {
    dragRef.current = null;
  };

  const setCollapsed = (next: boolean) => {
    if (collapsedProp === undefined) {
      setCollapsedState(next);
    }
    onCollapsedChange?.(next);
  };

  return (
    <div
      className={`floating-panel ${collapsed ? "collapsed" : ""}`}
      ref={panelRef}
      style={{ left: position.x, top: position.y }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {collapsed ? (
        <Tooltip content={`Развернуть: ${title}`}>
          <button
            className="panel-icon"
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              setCollapsed(false);
            }}
            onPointerDown={handlePointerDown}
            data-drag-handle
            aria-label={`Развернуть: ${title}`}
          >
            {icon}
          </button>
        </Tooltip>
      ) : (
        <>
          <div
            className="panel-header"
            onPointerDown={handlePointerDown}
            data-drag-handle
          >
            <h3>{title}</h3>
            <Tooltip content="Свернуть">
              <button className="panel-action" onClick={() => setCollapsed(true)} data-no-drag aria-label="Свернуть">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6 9l6 6 6-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </Tooltip>
          </div>
          <div className="panel-body">{children}</div>
        </>
      )}
    </div>
  );
}
