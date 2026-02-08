import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./styles.scss";

type Placement = "right" | "bottom" | "left" | "top";

type Position = {
  x: number;
  y: number;
  placement: Placement;
};

type Props = {
  content: string;
  children: React.ReactElement;
};

const GAP = 8;
const MARGIN = 8;
const ORDER: Placement[] = ["right", "bottom", "left", "top"];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default function Tooltip({ content, children }: Props) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;

    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };

    const spaceRight = viewport.width - anchorRect.right - MARGIN;
    const spaceLeft = anchorRect.left - MARGIN;
    const spaceTop = anchorRect.top - MARGIN;
    const spaceBottom = viewport.height - anchorRect.bottom - MARGIN;

    const fits = {
      right: spaceRight >= tooltipRect.width + GAP,
      bottom: spaceBottom >= tooltipRect.height + GAP,
      left: spaceLeft >= tooltipRect.width + GAP,
      top: spaceTop >= tooltipRect.height + GAP,
    };

    let placement = ORDER.find((side) => fits[side]) || "right";
    if (!fits[placement]) {
      const bySpace: Record<Placement, number> = {
        right: spaceRight,
        bottom: spaceBottom,
        left: spaceLeft,
        top: spaceTop,
      };
      placement = ORDER.reduce((best, side) => (bySpace[side] > bySpace[best] ? side : best), "right");
    }

    let x = 0;
    let y = 0;

    if (placement === "right") {
      x = anchorRect.right + GAP;
      y = anchorRect.top + (anchorRect.height - tooltipRect.height) / 2;
    } else if (placement === "left") {
      x = anchorRect.left - tooltipRect.width - GAP;
      y = anchorRect.top + (anchorRect.height - tooltipRect.height) / 2;
    } else if (placement === "bottom") {
      x = anchorRect.left + (anchorRect.width - tooltipRect.width) / 2;
      y = anchorRect.bottom + GAP;
    } else {
      x = anchorRect.left + (anchorRect.width - tooltipRect.width) / 2;
      y = anchorRect.top - tooltipRect.height - GAP;
    }

    const maxX = viewport.width - tooltipRect.width - MARGIN;
    const maxY = viewport.height - tooltipRect.height - MARGIN;

    setPosition({
      x: clamp(Math.round(x), MARGIN, maxX),
      y: clamp(Math.round(y), MARGIN, maxY),
      placement,
    });
  }, []);

  useLayoutEffect(() => {
    if (!visible || dragging) return;
    updatePosition();
  }, [visible, dragging, content, updatePosition]);

  useEffect(() => {
    if (!visible || dragging) return;
    const handle = () => updatePosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [visible, dragging, updatePosition]);

  useEffect(() => {
    const handleDragStart = () => {
      setDragging(true);
      setVisible(false);
    };
    const handleDragEnd = () => setDragging(false);
    window.addEventListener("dragstart", handleDragStart);
    window.addEventListener("dragend", handleDragEnd);
    window.addEventListener("drop", handleDragEnd);
    window.addEventListener("pointerup", handleDragEnd);
    return () => {
      window.removeEventListener("dragstart", handleDragStart);
      window.removeEventListener("dragend", handleDragEnd);
      window.removeEventListener("drop", handleDragEnd);
      window.removeEventListener("pointerup", handleDragEnd);
    };
  }, []);

  return (
    <span
      className="tooltip-anchor"
      ref={anchorRef}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && !dragging && (
        <>
          {createPortal(
            <div
              className="tooltip-bubble"
              ref={tooltipRef}
              data-placement={position?.placement || "right"}
              style={{
                left: position?.x ?? -9999,
                top: position?.y ?? -9999,
              }}
            >
              {content}
            </div>,
            document.body
          )}
        </>
      )}
    </span>
  );
}
