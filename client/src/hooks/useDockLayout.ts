import { useCallback, useEffect, useState } from "react";

const PANEL_MARGIN = 16;
const PANEL_GAP = 12;

export type Dock = "left" | "right" | "bottom";

export type PanelPosition = {
  x: number;
  y: number;
  custom?: boolean;
};

export type PanelSize = {
  width: number;
  height: number;
};

export type PanelDef<TPanelId extends string> = {
  id: TPanelId;
  dock: Dock;
  order: number;
};

function computeDockLayout<TPanelId extends string>(
  defs: readonly PanelDef<TPanelId>[],
  sizes: Partial<Record<TPanelId, PanelSize>>,
  positions: Partial<Record<TPanelId, PanelPosition>>
) {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const next: Partial<Record<TPanelId, PanelPosition>> = { ...positions };

  const rightPanels = defs.filter((panel) => panel.dock === "right");
  let yRight = PANEL_MARGIN;
  rightPanels
    .sort((a, b) => a.order - b.order)
    .forEach((panel) => {
      const size = sizes[panel.id] || { width: 280, height: 160 };
      const existing = positions[panel.id];
      if (existing && existing.custom) return;
      next[panel.id] = {
        x: viewport.width - size.width - PANEL_MARGIN,
        y: yRight,
        custom: false,
      };
      yRight += size.height + PANEL_GAP;
    });

  const leftPanels = defs.filter((panel) => panel.dock === "left");
  leftPanels
    .sort((a, b) => a.order - b.order)
    .forEach((panel) => {
      const size = sizes[panel.id] || { width: 260, height: 140 };
      const existing = positions[panel.id];
      if (existing && existing.custom) return;
      next[panel.id] = {
        x: PANEL_MARGIN,
        y: viewport.height - size.height - PANEL_MARGIN,
        custom: false,
      };
    });

  const bottomPanels = defs.filter((panel) => panel.dock === "bottom");
  bottomPanels
    .sort((a, b) => a.order - b.order)
    .forEach((panel) => {
      const size = sizes[panel.id] || { width: 500, height: 200 };
      const existing = positions[panel.id];
      if (existing && existing.custom) return;
      next[panel.id] = {
        x: (viewport.width - size.width) / 2,
        y: viewport.height - size.height - PANEL_MARGIN,
        custom: false,
      };
    });

  return next;
}

export function useDockLayout<TPanelId extends string>(
  panels: readonly PanelDef<TPanelId>[],
  initialSizes: Partial<Record<TPanelId, PanelSize>>,
  initialPositions: Partial<Record<TPanelId, PanelPosition>>
) {
  const [panelSizes, setPanelSizes] = useState<Partial<Record<TPanelId, PanelSize>>>(initialSizes);
  const [panelPositions, setPanelPositions] = useState<Partial<Record<TPanelId, PanelPosition>>>(initialPositions);

  const toPanelId = useCallback(
    (panelId: string): TPanelId | null =>
      panels.some((panel) => panel.id === panelId) ? (panelId as TPanelId) : null,
    [panels]
  );

  const handlePanelSize = useCallback(
    (panelId: string, size: PanelSize) => {
      const validId = toPanelId(panelId);
      if (!validId) return;
      setPanelSizes((prev) => {
        const nextSizes = { ...prev, [validId]: size };
        setPanelPositions((posPrev) => computeDockLayout(panels, nextSizes, posPrev));
        return nextSizes;
      });
    },
    [panels, toPanelId]
  );

  const handlePanelDrag = useCallback(
    (panelId: string, pos: PanelPosition) => {
      const validId = toPanelId(panelId);
      if (!validId) return;
      setPanelPositions((prev) => ({
        ...prev,
        [validId]: { ...prev[validId], x: pos.x, y: pos.y, custom: true },
      }));
    },
    [toPanelId]
  );

  const recomputePositions = useCallback(() => {
    setPanelPositions((prev) => computeDockLayout(panels, panelSizes, prev));
  }, [panels, panelSizes]);

  const resetDockLayout = useCallback(() => {
    setPanelPositions(() => computeDockLayout(panels, panelSizes, {}));
  }, [panels, panelSizes]);

  useEffect(() => {
    const handleResize = () => recomputePositions();
    window.addEventListener("resize", handleResize);
    recomputePositions();
    return () => window.removeEventListener("resize", handleResize);
  }, [recomputePositions]);

  return {
    panelSizes,
    panelPositions,
    setPanelSizes,
    setPanelPositions,
    handlePanelSize,
    handlePanelDrag,
    resetDockLayout,
  };
}
