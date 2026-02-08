import { useEffect, useMemo } from "react";
import { EDITOR_DEFAULTS, EDITOR_LIMITS } from "../config/editorConfig";

export type SideSectionId = "stats" | "preview" | "view" | "objects";

export type MenuInputs = {
  distance: number;
  angle: number;
  length: number;
  thickness: number;
  scale: number;
};

export type PanelPosition = {
  x: number;
  y: number;
  custom?: boolean;
};

export type PanelSize = {
  width: number;
  height: number;
};

export type UiPrefs = {
  mode: "draw" | "select" | "edit" | "pan";
  theme: "light" | "dark";
  soloView: boolean;
  showRoomNames: boolean;
  showRoomSizes: boolean;
  showWallNames: boolean;
  showWallLength: boolean;
  showWallWidth: boolean;
  showInnerMeasurements: boolean;
  showAngleLabels: boolean;
  showRoomsPanel: boolean;
  showWallsPanel: boolean;
  expandedRooms: Record<number, boolean>;
  expandedOrphans: boolean;
  sidePanelWidth: number;
  sidePanelCollapsed: boolean;
  sidePanelActive: string | null;
  sideSections: Record<SideSectionId, boolean>;
  sectionOrder: SideSectionId[];
  panelSizes: Partial<Record<"tips", PanelSize>>;
  panelPositions: Partial<Record<"tips", PanelPosition>>;
  floatingPanelCollapsed: Partial<Record<"tips", boolean>>;
  lastMenuInputs: MenuInputs;
};

export const DEFAULT_SIDE_SECTIONS: Record<SideSectionId, boolean> = {
  stats: true,
  preview: true,
  view: true,
  objects: true,
};

export const DEFAULT_SECTION_ORDER: SideSectionId[] = ["stats", "preview", "view", "objects"];

const UI_PREFS_STORAGE_KEY = "p3d.ui-preferences.v1";

const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const asBoolean = (value: unknown) => (typeof value === "boolean" ? value : undefined);
const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

const parseSectionOrder = (value: unknown): SideSectionId[] => {
  if (!Array.isArray(value)) return DEFAULT_SECTION_ORDER;
  const allowed = new Set<SideSectionId>(DEFAULT_SECTION_ORDER);
  const next = value.filter(
    (item): item is SideSectionId => typeof item === "string" && allowed.has(item as SideSectionId)
  );
  const unique: SideSectionId[] = [];
  next.forEach((item) => {
    if (!unique.includes(item)) unique.push(item);
  });
  DEFAULT_SECTION_ORDER.forEach((item) => {
    if (!unique.includes(item)) unique.push(item);
  });
  return unique;
};

const parseUiPrefs = (): Partial<UiPrefs> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(UI_PREFS_STORAGE_KEY);
    if (!raw) {
      const legacyTheme = window.localStorage.getItem("theme");
      return legacyTheme === "light" || legacyTheme === "dark" ? { theme: legacyTheme } : {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    const mode =
      parsed.mode === "draw" || parsed.mode === "select" || parsed.mode === "edit" || parsed.mode === "pan"
        ? parsed.mode
        : undefined;
    const theme = parsed.theme === "light" || parsed.theme === "dark" ? parsed.theme : undefined;
    const sidePanelActiveRaw = parsed.sidePanelActive;
    const sidePanelActive = sidePanelActiveRaw === null ? null : asString(sidePanelActiveRaw);
    const sidePanelWidth = asNumber(parsed.sidePanelWidth);

    const sideSections = isRecord(parsed.sideSections)
      ? {
          stats: asBoolean(parsed.sideSections.stats) ?? DEFAULT_SIDE_SECTIONS.stats,
          preview: asBoolean(parsed.sideSections.preview) ?? DEFAULT_SIDE_SECTIONS.preview,
          view: asBoolean(parsed.sideSections.view) ?? DEFAULT_SIDE_SECTIONS.view,
          objects: asBoolean(parsed.sideSections.objects) ?? DEFAULT_SIDE_SECTIONS.objects,
        }
      : undefined;

    const expandedRooms: Record<number, boolean> = {};
    if (isRecord(parsed.expandedRooms)) {
      Object.entries(parsed.expandedRooms).forEach(([key, value]) => {
        const roomId = Number(key);
        if (Number.isInteger(roomId) && roomId > 0 && typeof value === "boolean") {
          expandedRooms[roomId] = value;
        }
      });
    }

    const panelSizes: Partial<Record<"tips", PanelSize>> = {};
    if (isRecord(parsed.panelSizes) && isRecord(parsed.panelSizes.tips)) {
      const width = asNumber(parsed.panelSizes.tips.width);
      const height = asNumber(parsed.panelSizes.tips.height);
      if (width !== undefined && height !== undefined) {
        panelSizes.tips = { width, height };
      }
    }

    const panelPositions: Partial<Record<"tips", PanelPosition>> = {};
    if (isRecord(parsed.panelPositions) && isRecord(parsed.panelPositions.tips)) {
      const x = asNumber(parsed.panelPositions.tips.x);
      const y = asNumber(parsed.panelPositions.tips.y);
      if (x !== undefined && y !== undefined) {
        panelPositions.tips = {
          x,
          y,
          custom: asBoolean(parsed.panelPositions.tips.custom),
        };
      }
    }

    const floatingPanelCollapsed: Partial<Record<"tips", boolean>> = {};
    if (isRecord(parsed.floatingPanelCollapsed) && typeof parsed.floatingPanelCollapsed.tips === "boolean") {
      floatingPanelCollapsed.tips = parsed.floatingPanelCollapsed.tips;
    }

    const menuInputsRaw = isRecord(parsed.lastMenuInputs) ? parsed.lastMenuInputs : {};

    return {
      mode,
      theme,
      soloView: asBoolean(parsed.soloView),
      showRoomNames: asBoolean(parsed.showRoomNames),
      showRoomSizes: asBoolean(parsed.showRoomSizes),
      showWallNames: asBoolean(parsed.showWallNames),
      showWallLength: asBoolean(parsed.showWallLength),
      showWallWidth: asBoolean(parsed.showWallWidth),
      showInnerMeasurements: asBoolean(parsed.showInnerMeasurements),
      showAngleLabels: asBoolean(parsed.showAngleLabels),
      showRoomsPanel: asBoolean(parsed.showRoomsPanel),
      showWallsPanel: asBoolean(parsed.showWallsPanel),
      expandedRooms,
      expandedOrphans: asBoolean(parsed.expandedOrphans),
      sidePanelWidth: sidePanelWidth !== undefined
        ? clampValue(sidePanelWidth, EDITOR_LIMITS.sidePanelWidth.min, EDITOR_LIMITS.sidePanelWidth.max)
        : undefined,
      sidePanelCollapsed: asBoolean(parsed.sidePanelCollapsed),
      sidePanelActive,
      sideSections,
      sectionOrder: parseSectionOrder(parsed.sectionOrder),
      panelSizes,
      panelPositions,
      floatingPanelCollapsed,
      lastMenuInputs: {
        distance: asNumber(menuInputsRaw.distance) ?? EDITOR_DEFAULTS.menuInputs.distance,
        angle: asNumber(menuInputsRaw.angle) ?? EDITOR_DEFAULTS.menuInputs.angle,
        length: clampValue(
          asNumber(menuInputsRaw.length) ?? EDITOR_DEFAULTS.menuInputs.length,
          EDITOR_LIMITS.wallLength.min,
          EDITOR_LIMITS.wallLength.max
        ),
        thickness: clampValue(
          asNumber(menuInputsRaw.thickness) ?? EDITOR_DEFAULTS.menuInputs.thickness,
          EDITOR_LIMITS.wallThickness.min,
          EDITOR_LIMITS.wallThickness.max
        ),
        scale: asNumber(menuInputsRaw.scale) ?? EDITOR_DEFAULTS.menuInputs.scale,
      },
    };
  } catch {
    return {};
  }
};

export function useUiPrefs(): Partial<UiPrefs> {
  return useMemo(() => parseUiPrefs(), []);
}

export function usePersistUiPrefs(payload: UiPrefs, theme: UiPrefs["theme"]) {
  useEffect(() => {
    try {
      localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(payload));
      localStorage.setItem("theme", theme);
    } catch {
      // Ignore storage quota and private mode errors.
    }
  }, [payload, theme]);
}
