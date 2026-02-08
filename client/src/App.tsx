import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CanvasPlanner from "./components/CanvasPlanner";
import WallList from "./components/WallList";
import TemplatePanel from "./components/TemplatePanel";
import FloatingToolbar from "./components/FloatingToolbar";
import FloatingPanel from "./components/FloatingPanel";
import SidePanel from "./components/SidePanel";
import ContextMenu from "./components/ContextMenu";
import { buildRoomsFromWalls } from "./utils/rooms";
import { getRoomArea, offsetPolygon, polygonArea } from "./utils/geometry";
import { normalizeImportData } from "./utils/serialization";
import { LAST_TEMPLATE_NAME_STORAGE_KEY, listTemplates, loadTemplate } from "./api/templates";
import type { ContextMenuState, NodePoint, Selection, Vec2, ViewState, Wall } from "./types/plan";
import "./App.scss";

const PANEL_MARGIN = 16;
const PANEL_GAP = 12;

const PANELS = [
  { id: "tips", dock: "left", order: 0 },
] as const;

type PanelId = (typeof PANELS)[number]["id"];

type PanelPosition = {
  x: number;
  y: number;
  custom?: boolean;
};

type PanelSize = {
  width: number;
  height: number;
};

type Dock = (typeof PANELS)[number]["dock"];

type PanelDef = {
  id: PanelId;
  dock: Dock;
  order: number;
};

const panelIconStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const PANEL_ICON_TIPS = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle {...panelIconStroke} cx="12" cy="12" r="9" />
    <path {...panelIconStroke} d="M12 10v6" />
    <circle cx="12" cy="7" r="1" fill="currentColor" />
  </svg>
);

const SIDE_PANEL_ITEMS = [
  {
    id: "main",
    title: "Панель редактирования",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect {...panelIconStroke} x="4" y="4" width="16" height="16" rx="3" />
        <path {...panelIconStroke} d="M4 9H20" />
        <path {...panelIconStroke} d="M9 4V20" />
      </svg>
    ),
  },
  {
    id: "history",
    title: "История",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...panelIconStroke} cx="12" cy="12" r="9" />
        <path {...panelIconStroke} d="M12 7v6l4 2" />
      </svg>
    ),
  },
  {
    id: "export",
    title: "Экспорт",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...panelIconStroke} d="M12 3v10" />
        <path {...panelIconStroke} d="M8 7l4-4 4 4" />
        <path {...panelIconStroke} d="M4 13v6h16v-6" />
      </svg>
    ),
  },
] as const;

type SideSectionId = "stats" | "preview" | "view" | "objects";

type MenuInputs = {
  distance: number;
  angle: number;
  length: number;
  thickness: number;
  scale: number;
};

type HistoryState = {
  nodes: NodePoint[];
  walls: Wall[];
  roomNames: Record<string, string>;
  defaultWallThickness: number;
  scale: number;
  grid: number;
  snapEnabled: boolean;
  selection: Selection;
};

type HistoryEntry = {
  snapshot: HistoryState;
  label: string;
  time: number;
};

const PREVIEW_SIZE = 220;
const PREVIEW_PADDING = 16;
const MIN_WALL_LENGTH = 0.01;
const MAX_WALL_LENGTH = 100;
const MIN_WALL_WIDTH = 0.01;
const MAX_WALL_WIDTH = 1;
const MAX_HISTORY = 100;
const HISTORY_MERGE_MS = 600;
const UI_PREFS_STORAGE_KEY = "p3d.ui-preferences.v1";

const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

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
  const offsetX = PREVIEW_PADDING + (PREVIEW_SIZE - PREVIEW_PADDING * 2 - width * scale) / 2 - minX * scale;
  const offsetY = PREVIEW_PADDING + (PREVIEW_SIZE - PREVIEW_PADDING * 2 - height * scale) / 2 - minY * scale;
  return points.map((point) => ({
    x: point.x * scale + offsetX,
    y: point.y * scale + offsetY,
  }));
};
 
const previewPolyline = (points: Vec2[]) => (
  points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")
);

const getRoomKey = (cycle: number[]) => {
  if (!cycle.length) return "";
  const minId = Math.min(...cycle);
  const rotate = (arr: number[], index: number) => arr.slice(index).concat(arr.slice(0, index));
  const idx = cycle.indexOf(minId);
  const forward = rotate(cycle, idx);
  const backward = rotate([...cycle].reverse(), cycle.length - 1 - idx);
  const forwardKey = forward.join("-");
  const backwardKey = backward.join("-");
  return forwardKey < backwardKey ? forwardKey : backwardKey;
};

const DEFAULT_SIDE_SECTIONS: Record<SideSectionId, boolean> = {
  stats: true,
  preview: true,
  view: true,
  objects: true,
};

const DEFAULT_SECTION_ORDER: SideSectionId[] = ["stats", "preview", "view", "objects"];

type UiPrefs = {
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
  panelSizes: Partial<Record<PanelId, PanelSize>>;
  panelPositions: Partial<Record<PanelId, PanelPosition>>;
  floatingPanelCollapsed: Partial<Record<PanelId, boolean>>;
  lastMenuInputs: MenuInputs;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const asBoolean = (value: unknown) => (typeof value === "boolean" ? value : undefined);
const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

const parseSectionOrder = (value: unknown): SideSectionId[] => {
  if (!Array.isArray(value)) return DEFAULT_SECTION_ORDER;
  const allowed = new Set<SideSectionId>(DEFAULT_SECTION_ORDER);
  const next = value
    .filter((item): item is SideSectionId => typeof item === "string" && allowed.has(item as SideSectionId));
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

    const mode = parsed.mode === "draw" || parsed.mode === "select" || parsed.mode === "edit" || parsed.mode === "pan"
      ? parsed.mode
      : undefined;
    const theme = parsed.theme === "light" || parsed.theme === "dark"
      ? parsed.theme
      : undefined;
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

    const panelSizes: Partial<Record<PanelId, PanelSize>> = {};
    if (isRecord(parsed.panelSizes) && isRecord(parsed.panelSizes.tips)) {
      const width = asNumber(parsed.panelSizes.tips.width);
      const height = asNumber(parsed.panelSizes.tips.height);
      if (width !== undefined && height !== undefined) {
        panelSizes.tips = { width, height };
      }
    }

    const panelPositions: Partial<Record<PanelId, PanelPosition>> = {};
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

    const floatingPanelCollapsed: Partial<Record<PanelId, boolean>> = {};
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
      sidePanelWidth: sidePanelWidth !== undefined ? clampValue(sidePanelWidth, 260, 640) : undefined,
      sidePanelCollapsed: asBoolean(parsed.sidePanelCollapsed),
      sidePanelActive,
      sideSections,
      sectionOrder: parseSectionOrder(parsed.sectionOrder),
      panelSizes,
      panelPositions,
      floatingPanelCollapsed,
      lastMenuInputs: {
        distance: asNumber(menuInputsRaw.distance) ?? 3,
        angle: asNumber(menuInputsRaw.angle) ?? 90,
        length: clampValue(asNumber(menuInputsRaw.length) ?? 3, MIN_WALL_LENGTH, MAX_WALL_LENGTH),
        thickness: clampValue(asNumber(menuInputsRaw.thickness) ?? 0.2, MIN_WALL_WIDTH, MAX_WALL_WIDTH),
        scale: asNumber(menuInputsRaw.scale) ?? 1.2,
      },
    };
  } catch {
    return {};
  }
};

export default function App() {
  const uiPrefs = useMemo(() => parseUiPrefs(), []);

  const [mode, setMode] = useState<"draw" | "select" | "edit" | "pan">(uiPrefs.mode ?? "draw");
  const [theme, setTheme] = useState<"light" | "dark">(uiPrefs.theme ?? "light");
  const [nodes, setNodes] = useState<NodePoint[]>([]);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [selection, setSelection] = useState<Selection>({ nodes: [], walls: [], rooms: [] });
  const [hoveredWallId, setHoveredWallId] = useState<number | null>(null);
  const [lastSelectedWallId, setLastSelectedWallId] = useState<number | null>(null);
  const [scale, setScale] = useState(50);
  const [grid, setGrid] = useState(0.5);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [soloView, setSoloView] = useState(uiPrefs.soloView ?? false);
  const [showRoomNames, setShowRoomNames] = useState(uiPrefs.showRoomNames ?? true);
  const [showRoomSizes, setShowRoomSizes] = useState(uiPrefs.showRoomSizes ?? true);
  const [showWallNames, setShowWallNames] = useState(uiPrefs.showWallNames ?? true);
  const [showWallLength, setShowWallLength] = useState(uiPrefs.showWallLength ?? true);
  const [showWallWidth, setShowWallWidth] = useState(uiPrefs.showWallWidth ?? true);
  const [showInnerMeasurements, setShowInnerMeasurements] = useState(uiPrefs.showInnerMeasurements ?? false);
  const [showAngleLabels, setShowAngleLabels] = useState(uiPrefs.showAngleLabels ?? true);
  const [showRoomsPanel, setShowRoomsPanel] = useState(uiPrefs.showRoomsPanel ?? true);
  const [showWallsPanel, setShowWallsPanel] = useState(uiPrefs.showWallsPanel ?? true);
  const [expandedRooms, setExpandedRooms] = useState<Record<number, boolean>>(uiPrefs.expandedRooms ?? {});
  const [expandedOrphans, setExpandedOrphans] = useState(uiPrefs.expandedOrphans ?? false);
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [roomNameDraft, setRoomNameDraft] = useState("");
  const [roomNames, setRoomNames] = useState<Record<string, string>>({});
  const [defaultWallThickness, setDefaultWallThickness] = useState(0.2);
  const [view, setView] = useState<ViewState>({ zoom: 1, offset: { x: 40, y: 40 } });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, hit: null });
  const [menuInputs, setMenuInputs] = useState<MenuInputs>(uiPrefs.lastMenuInputs ?? {
    distance: 3,
    angle: 90,
    length: 3,
    thickness: 0.2,
    scale: 1.2,
  });

  const [panelSizes, setPanelSizes] = useState<Partial<Record<PanelId, PanelSize>>>(uiPrefs.panelSizes ?? {});
  const [panelPositions, setPanelPositions] = useState<Partial<Record<PanelId, PanelPosition>>>(uiPrefs.panelPositions ?? {});
  const [floatingPanelCollapsed, setFloatingPanelCollapsed] = useState<Partial<Record<PanelId, boolean>>>(
    uiPrefs.floatingPanelCollapsed ?? { tips: true }
  );
  const [sidePanelWidth, setSidePanelWidth] = useState(uiPrefs.sidePanelWidth ?? 360);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(uiPrefs.sidePanelCollapsed ?? false);
  const [sidePanelActive, setSidePanelActive] = useState<string | null>(uiPrefs.sidePanelActive ?? "main");
  const [sideSections, setSideSections] = useState<Record<SideSectionId, boolean>>(uiPrefs.sideSections ?? DEFAULT_SIDE_SECTIONS);
  const [sectionOrder, setSectionOrder] = useState<SideSectionId[]>(uiPrefs.sectionOrder ?? DEFAULT_SECTION_ORDER);
  const [draggingSection, setDraggingSection] = useState<SideSectionId | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  const toggleSection = (id: SideSectionId) => {
    setSideSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSectionDrop = (targetId: SideSectionId) => {
    if (!draggingSection || draggingSection === targetId) return;
    setSectionOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(draggingSection);
      const to = next.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      next.splice(from, 1);
      next.splice(to, 0, draggingSection);
      return next;
    });
    setDraggingSection(null);
  };

  const nodeIdRef = useRef(1);
  const wallIdRef = useRef(1);
  const historyEntriesRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);
  const historyPendingRef = useRef<{ label: string; time: number } | null>(null);
  const historyBusyRef = useRef(false);
  const historyLastAtRef = useRef(0);
  const historyLastLabelRef = useRef("");
  const historyInitializedRef = useRef(false);

  const createSnapshot = useCallback((): HistoryState => ({
    nodes: nodes.map((node) => ({ ...node })),
    walls: walls.map((wall) => ({ ...wall })),
    roomNames: { ...roomNames },
    defaultWallThickness,
    scale,
    grid,
    snapEnabled,
    selection: {
      nodes: [...selection.nodes],
      walls: [...selection.walls],
      rooms: [...selection.rooms],
    },
  }), [nodes, walls, roomNames, defaultWallThickness, scale, grid, snapEnabled, selection]);

  const recordHistory = useCallback((label = "Изменение") => {
    if (historyBusyRef.current) return;
    historyPendingRef.current = { label, time: Date.now() };
  }, []);


  const applySnapshot = useCallback((snapshot: HistoryState) => {
    historyBusyRef.current = true;
    setNodes(snapshot.nodes);
    setWalls(snapshot.walls);
    setRoomNames(snapshot.roomNames);
    setDefaultWallThickness(snapshot.defaultWallThickness);
    setScale(snapshot.scale);
    setGrid(snapshot.grid);
    setSnapEnabled(snapshot.snapEnabled);
    setSelection(snapshot.selection);
    nodeIdRef.current = snapshot.nodes.reduce((max, node) => Math.max(max, node.id), 0) + 1;
    wallIdRef.current = snapshot.walls.reduce((max, wall) => Math.max(max, wall.id), 0) + 1;
    historyLastAtRef.current = 0;
    historyLastLabelRef.current = "";
    historyBusyRef.current = false;
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const entry = historyEntriesRef.current[historyIndexRef.current];
    if (!entry) return;
    applySnapshot(entry.snapshot);
    setHistoryVersion((prev) => prev + 1);
  }, [applySnapshot]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyEntriesRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const entry = historyEntriesRef.current[historyIndexRef.current];
    if (!entry) return;
    applySnapshot(entry.snapshot);
    setHistoryVersion((prev) => prev + 1);
  }, [applySnapshot]);

  useEffect(() => {
    if (historyInitializedRef.current) return;
    historyInitializedRef.current = true;
    historyEntriesRef.current = [
      {
        snapshot: createSnapshot(),
        label: "Начальное состояние",
        time: Date.now(),
      },
    ];
    historyIndexRef.current = 0;
    setHistoryVersion((prev) => prev + 1);
  }, [createSnapshot]);
  useEffect(() => {
    const pending = historyPendingRef.current;
    if (!pending || historyBusyRef.current) return;
    historyPendingRef.current = null;
    const now = pending.time;
    if (
      historyEntriesRef.current.length
      && now - historyLastAtRef.current < HISTORY_MERGE_MS
      && historyLastLabelRef.current === pending.label
    ) {
      const last = historyEntriesRef.current[historyEntriesRef.current.length - 1];
      if (last) {
        last.snapshot = createSnapshot();
        last.time = now;
      }
    } else {
      if (historyIndexRef.current < historyEntriesRef.current.length - 1) {
        historyEntriesRef.current = historyEntriesRef.current.slice(0, historyIndexRef.current + 1);
      }
      historyEntriesRef.current.push({
        snapshot: createSnapshot(),
        label: pending.label,
        time: now,
      });
      if (historyEntriesRef.current.length > MAX_HISTORY) {
        historyEntriesRef.current.shift();
      }
      historyIndexRef.current = historyEntriesRef.current.length - 1;
    }
    historyLastAtRef.current = now;
    historyLastLabelRef.current = pending.label;
    setHistoryVersion((prev) => prev + 1);
  }, [createSnapshot, nodes, walls, roomNames, defaultWallThickness, scale, grid, snapEnabled, selection]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (key === "y") {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRedo, handleUndo]);

  const rooms = useMemo(() => (
    buildRoomsFromWalls(nodes, walls).map((room) => {
      const key = getRoomKey(room.nodeIds);
      const name = roomNames[key];
      return name ? { ...room, name } : room;
    })
  ), [nodes, walls, roomNames]);
  const roomAreaById = useMemo(() => {
    const edgeMap = new Map<string, Wall[]>();
    walls.forEach((wall) => {
      const a = Math.min(wall.a, wall.b);
      const b = Math.max(wall.a, wall.b);
      const key = `${a}-${b}`;
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key)!.push(wall);
    });
    edgeMap.forEach((list, key) => {
      edgeMap.set(key, [...list].sort((a, b) => a.id - b.id));
    });

    const areas: Record<number, number> = {};
    rooms.forEach((room) => {
      const offsets = room.nodeIds.map((nodeId, index) => {
        const nextId = room.nodeIds[(index + 1) % room.nodeIds.length];
        const a = Math.min(nodeId, nextId);
        const b = Math.max(nodeId, nextId);
        const key = `${a}-${b}`;
        const wall = (edgeMap.get(key) || [])[0];
        const thickness = wall?.thickness ?? defaultWallThickness;
        return (thickness * scale) / 2;
      });
      const inner = offsetPolygon(room.points, offsets);
      const areaPx = inner && inner.length >= 3 ? polygonArea(inner) : polygonArea(room.points);
      areas[room.id] = areaPx / (scale * scale);
    });
    return areas;
  }, [rooms, walls, defaultWallThickness, scale]);

  const totalArea = useMemo(() => (
    rooms.reduce((sum, room) => {
      const area = showInnerMeasurements
        ? (roomAreaById[room.id] ?? getRoomArea(room, scale))
        : getRoomArea(room, scale);
      return sum + area;
    }, 0)
  ), [rooms, roomAreaById, scale, showInnerMeasurements]);

  const innerLengthByWallId = useMemo(() => {
    const edgeMap = new Map<string, Wall[]>();
    walls.forEach((wall) => {
      const a = Math.min(wall.a, wall.b);
      const b = Math.max(wall.a, wall.b);
      const key = `${a}-${b}`;
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key)!.push(wall);
    });
    edgeMap.forEach((list, key) => {
      edgeMap.set(key, [...list].sort((a, b) => a.id - b.id));
    });

    const map = new Map<number, number>();
    rooms.forEach((room) => {
      const offsets = room.nodeIds.map((nodeId, index) => {
        const nextId = room.nodeIds[(index + 1) % room.nodeIds.length];
        const a = Math.min(nodeId, nextId);
        const b = Math.max(nodeId, nextId);
        const key = `${a}-${b}`;
        const wall = (edgeMap.get(key) || [])[0];
        const thickness = wall?.thickness ?? defaultWallThickness;
        return (thickness * scale) / 2;
      });
      const inner = offsetPolygon(room.points, offsets);
      if (!inner || inner.length !== room.points.length) return;
      for (let i = 0; i < inner.length; i += 1) {
        const nodeId = room.nodeIds[i];
        const nextId = room.nodeIds[(i + 1) % room.nodeIds.length];
        const a = Math.min(nodeId, nextId);
        const b = Math.max(nodeId, nextId);
        const key = `${a}-${b}`;
        const wall = (edgeMap.get(key) || [])[0];
        if (!wall) continue;
        const length = distance(inner[i], inner[(i + 1) % inner.length]) / scale;
        const existing = map.get(wall.id);
        map.set(wall.id, existing ? Math.min(existing, length) : length);
      }
    });
    return map;
  }, [rooms, walls, defaultWallThickness, scale]);

  const getWallLengthMeters = useCallback((wall: Wall) => {
    const nodeA = nodes.find((node) => node.id === wall.a);
    const nodeB = nodes.find((node) => node.id === wall.b);
    if (!nodeA || !nodeB) return 0;
    const outerLength = distance(nodeA, nodeB) / scale;
    if (!showInnerMeasurements) return outerLength;
    const innerLength = innerLengthByWallId.get(wall.id);
    return innerLength ?? outerLength;
  }, [nodes, scale, showInnerMeasurements, innerLengthByWallId]);

  const getAngleBetweenWalls = useCallback((wallA: Wall, wallB: Wall) => {
    const shared = [wallA.a, wallA.b].find((id) => id === wallB.a || id === wallB.b);
    if (!shared) return null;
    const otherA = wallA.a === shared ? wallA.b : wallA.a;
    const otherB = wallB.a === shared ? wallB.b : wallB.a;
    const nodeShared = nodes.find((node) => node.id === shared);
    const nodeA = nodes.find((node) => node.id === otherA);
    const nodeB = nodes.find((node) => node.id === otherB);
    if (!nodeShared || !nodeA || !nodeB) return null;
    const v1 = { x: nodeA.x - nodeShared.x, y: nodeA.y - nodeShared.y };
    const v2 = { x: nodeB.x - nodeShared.x, y: nodeB.y - nodeShared.y };
    const mag1 = Math.hypot(v1.x, v1.y);
    const mag2 = Math.hypot(v2.x, v2.y);
    if (!mag1 || !mag2) return null;
    const cos = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2)));
    return (Math.acos(cos) * 180) / Math.PI;
  }, [nodes]);

  const handlePanelSize = (panelId: PanelId, size: PanelSize) => {
    setPanelSizes((prev) => {
      const nextSizes = { ...prev, [panelId]: size };
      setPanelPositions((posPrev) => computeDockLayout(PANELS, nextSizes, posPrev));
      return nextSizes;
    });
  };

  const handlePanelDrag = (panelId: PanelId, pos: PanelPosition) => {
    setPanelPositions((prev) => ({
      ...prev,
      [panelId]: { ...prev[panelId], x: pos.x, y: pos.y, custom: true },
    }));
  };

  const computePositions = () => {
    setPanelPositions((prev) => computeDockLayout(PANELS, panelSizes, prev));
  };

  useEffect(() => {
    const handleResize = () => computePositions();
    window.addEventListener("resize", handleResize);
    computePositions();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const payload: UiPrefs = {
      mode,
      theme,
      soloView,
      showRoomNames,
      showRoomSizes,
      showWallNames,
      showWallLength,
      showWallWidth,
      showInnerMeasurements,
      showAngleLabels,
      showRoomsPanel,
      showWallsPanel,
      expandedRooms,
      expandedOrphans,
      sidePanelWidth,
      sidePanelCollapsed,
      sidePanelActive,
      sideSections,
      sectionOrder,
      panelSizes,
      panelPositions,
      floatingPanelCollapsed,
      lastMenuInputs: menuInputs,
    };
    try {
      localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(payload));
      localStorage.setItem("theme", theme);
    } catch {
      // Ignore storage quota and private mode errors.
    }
  }, [
    mode,
    theme,
    soloView,
    showRoomNames,
    showRoomSizes,
    showWallNames,
    showWallLength,
    showWallWidth,
    showInnerMeasurements,
    showAngleLabels,
    showRoomsPanel,
    showWallsPanel,
    expandedRooms,
    expandedOrphans,
    sidePanelWidth,
    sidePanelCollapsed,
    sidePanelActive,
    sideSections,
    sectionOrder,
    panelSizes,
    panelPositions,
    floatingPanelCollapsed,
    menuInputs,
  ]);

  const handleCreateWallChain = (points: Vec2[]) => {
    const wallCount = Math.max(0, points.length - 1);
    const nextCount = walls.length + wallCount;
    recordHistory(`Стены: ${walls.length} → ${nextCount}`);
    const nextNodes = [...nodes];
    const nextWalls = [...walls];
    const createdNodes = points.map((point) => {
      const existing = nextNodes.find((node) => distance(node, point) < 0.001);
      if (existing) return existing.id;
      const id = nodeIdRef.current++;
      nextNodes.push({ id, x: point.x, y: point.y });
      return id;
    });
    for (let i = 0; i < createdNodes.length - 1; i += 1) {
      const a = createdNodes[i];
      const b = createdNodes[i + 1];
      const wallId = wallIdRef.current++;
      nextWalls.push({
        id: wallId,
        name: `Стена ${wallId}`,
        a,
        b,
        thickness: defaultWallThickness,
      });
    }
    setNodes(nextNodes);
    setWalls(nextWalls);
  };

  const handleCreateRoomFromChain = (points: Vec2[]) => {
    const nextWallCount = walls.length + points.length;
    recordHistory(`Комната: +1 (стены ${walls.length} → ${nextWallCount})`);
    const nextNodes = [...nodes];
    const nextWalls = [...walls];
    const createdNodes = points.map((point) => {
      const existing = nextNodes.find((node) => distance(node, point) < 0.001);
      if (existing) return existing.id;
      const id = nodeIdRef.current++;
      nextNodes.push({ id, x: point.x, y: point.y });
      return id;
    });
    for (let i = 0; i < createdNodes.length; i += 1) {
      const a = createdNodes[i];
      const b = createdNodes[(i + 1) % createdNodes.length];
      const wallId = wallIdRef.current++;
      nextWalls.push({
        id: wallId,
        name: `Стена ${wallId}`,
        a,
        b,
        thickness: defaultWallThickness,
      });
    }
    setNodes(nextNodes);
    setWalls(nextWalls);
  };

  const handleClear = () => {
    recordHistory(`Очистка: ${nodes.length} точек, ${walls.length} стен → 0`);
    setNodes([]);
    setWalls([]);
    setSelection({ nodes: [], walls: [], rooms: [] });
    nodeIdRef.current = 1;
    wallIdRef.current = 1;
  };

  const handleApplyImport = (data: {
    scale: number;
    grid: number;
    wallThickness: number;
    nodes: NodePoint[];
    walls: Wall[];
  }) => {
    recordHistory(`Импорт: ${nodes.length}→${data.nodes?.length ?? 0} точек, ${walls.length}→${data.walls?.length ?? 0} стен`);
    const fallbackThickness = clampValue(data.wallThickness ?? 0.2, MIN_WALL_WIDTH, MAX_WALL_WIDTH);
    setScale(data.scale);
    setGrid(data.grid);
    setDefaultWallThickness(fallbackThickness);
    setNodes(data.nodes || []);
    setWalls((data.walls || []).map((wall) => ({
      ...wall,
      thickness: clampValue(wall.thickness ?? fallbackThickness, MIN_WALL_WIDTH, MAX_WALL_WIDTH),
    })));
    setSelection({ nodes: [], walls: [], rooms: [] });
    nodeIdRef.current = (data.nodes || []).reduce((max, node) => Math.max(max, node.id), 0) + 1;
    wallIdRef.current = (data.walls || []).reduce((max, wall) => Math.max(max, wall.id), 0) + 1;
  };

  useEffect(() => {
    let cancelled = false;

    const autoLoadLastTemplate = async () => {
      try {
        const names = await listTemplates();
        if (!names.length || cancelled) return;

        const savedName = localStorage.getItem(LAST_TEMPLATE_NAME_STORAGE_KEY)?.trim() || "";
        const targetName = savedName && names.includes(savedName) ? savedName : names[names.length - 1];
        if (!targetName) return;

        const raw = await loadTemplate(targetName);
        if (cancelled) return;
        const normalized = normalizeImportData(raw);
        if (!normalized) return;
        handleApplyImport(normalized);
      } catch (error) {
        console.warn("Не удалось автоматически загрузить последний шаблон.", error);
      }
    };

    autoLoadLastTemplate();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleZoomChange = (nextZoom: number) => {
    const clamped = Math.min(4, Math.max(0.2, Number(nextZoom)));
    setView((prev) => ({ ...prev, zoom: clamped }));
  };

  const handleZoomReset = () => {
    setView((prev) => ({ ...prev, zoom: 1, offset: { x: 40, y: 40 } }));
  };

  const handleResetLayout = () => {
    setPanelPositions(() => computeDockLayout(PANELS, panelSizes, {}));
    setSidePanelWidth(360);
    setSidePanelCollapsed(false);
    setSidePanelActive("main");
    setFloatingPanelCollapsed({ tips: true });
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const handleSelectionChange = (nextSelection: Selection) => {
    setSelection(nextSelection);
    setContextMenu((prev) => ({ ...prev, visible: false }));
    if (nextSelection.walls.length) {
      setLastSelectedWallId(nextSelection.walls[nextSelection.walls.length - 1]);
    }
    if (nextSelection.walls.length === 2) {
      const [wallAId, wallBId] = nextSelection.walls;
      const wallA = walls.find((wall) => wall.id === wallAId);
      const wallB = walls.find((wall) => wall.id === wallBId);
      if (wallA && wallB) {
        const shared = [wallA.a, wallA.b].find((id) => id === wallB.a || id === wallB.b);
        if (shared) {
          const otherA = wallA.a === shared ? wallA.b : wallA.a;
          const otherB = wallB.a === shared ? wallB.b : wallB.a;
          const nodeShared = nodes.find((node) => node.id === shared);
          const nodeA = nodes.find((node) => node.id === otherA);
          const nodeB = nodes.find((node) => node.id === otherB);
          if (nodeShared && nodeA && nodeB) {
            const v1 = { x: nodeA.x - nodeShared.x, y: nodeA.y - nodeShared.y };
            const v2 = { x: nodeB.x - nodeShared.x, y: nodeB.y - nodeShared.y };
            const dot = v1.x * v2.x + v1.y * v2.y;
            const mag1 = Math.hypot(v1.x, v1.y);
            const mag2 = Math.hypot(v2.x, v2.y);
            if (mag1 > 0 && mag2 > 0) {
              const cos = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
              const angle = (Math.acos(cos) * 180) / Math.PI;
              setMenuInputs((prev) => ({ ...prev, angle: Number(angle.toFixed(1)) }));
            }
          }
        }
      }
    }
  };

  const handleRoomRename = (roomId: number, name: string) => {
    const room = rooms.find((item) => item.id === roomId);
    if (!room) return;
    const key = getRoomKey(room.nodeIds);
    const prevName = roomNames[key] || `Комната ${roomId}`;
    const nextName = name.trim() || `Комната ${roomId}`;
    recordHistory(`Комната ${roomId}: "${prevName}" → "${nextName}"`);
    setRoomNames((prev) => {
      const next = { ...prev };
      const trimmed = name.trim();
      if (!trimmed) {
        delete next[key];
      } else {
        next[key] = trimmed;
      }
      return next;
    });
  };

  const startRoomEdit = (room: Room) => {
    setEditingRoomId(room.id);
    setRoomNameDraft(room.name || `Комната ${room.id}`);
  };

  const commitRoomEdit = () => {
    if (editingRoomId === null) return;
    handleRoomRename(editingRoomId, roomNameDraft);
    setEditingRoomId(null);
  };

  const handleWallRename = (wallId: number, name: string) => {
    const wall = walls.find((item) => item.id === wallId);
    const prevName = wall?.name || `Стена ${wallId}`;
    const nextName = name.trim() || `Стена ${wallId}`;
    recordHistory(`Стена ${wallId}: "${prevName}" → "${nextName}"`);
    const trimmed = name.trim();
    setWalls((prev) => prev.map((wall) => (
      wall.id === wallId ? { ...wall, name: trimmed || `Стена ${wallId}` } : wall
    )));
  };

  const handleWallLengthChange = (wallId: number, lengthMeters: number) => {
    const clamped = clampValue(lengthMeters, MIN_WALL_LENGTH, MAX_WALL_LENGTH);
    const wall = walls.find((item) => item.id === wallId);
    if (!wall) return;
    const prevLength = getWallLengthMeters(wall);
    recordHistory(`Длина стены ${wallId}: ${prevLength.toFixed(2)} → ${clamped.toFixed(2)} м`);
    const nodeA = nodes.find((node) => node.id === wall.a);
    const nodeB = nodes.find((node) => node.id === wall.b);
    if (!nodeA || !nodeB) return;
    const dirX = nodeB.x - nodeA.x;
    const dirY = nodeB.y - nodeA.y;
    const current = Math.hypot(dirX, dirY);
    if (!current) return;
    let targetMeters = clamped;
    if (showInnerMeasurements) {
      const innerLength = innerLengthByWallId.get(wallId);
      if (innerLength !== undefined) {
        const outerLength = current / scale;
        const delta = outerLength - innerLength;
        targetMeters = clampValue(clamped + delta, MIN_WALL_LENGTH, MAX_WALL_LENGTH);
      }
    }
    const targetPx = targetMeters * scale;
    const nextX = nodeA.x + (dirX / current) * targetPx;
    const nextY = nodeA.y + (dirY / current) * targetPx;
    setNodes((prev) => prev.map((node) => (
      node.id === wall.b ? { ...node, x: nextX, y: nextY } : node
    )));
  };

  const handleWallWidthChange = (wallId: number, widthMeters: number) => {
    const clamped = clampValue(widthMeters, MIN_WALL_WIDTH, MAX_WALL_WIDTH);
    const wall = walls.find((item) => item.id === wallId);
    const prevWidth = wall?.thickness ?? defaultWallThickness;
    recordHistory(`Ширина стены ${wallId}: ${prevWidth.toFixed(2)} → ${clamped.toFixed(2)} м`);
    setWalls((prev) => prev.map((wall) => (
      wall.id === wallId ? { ...wall, thickness: clamped } : wall
    )));
  };

  const wallGroups = useMemo(() => {
    const edgeMap = new Map<string, Wall[]>();
    walls.forEach((wall) => {
      const a = Math.min(wall.a, wall.b);
      const b = Math.max(wall.a, wall.b);
      const key = `${a}-${b}`;
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key)!.push(wall);
    });
    edgeMap.forEach((list, key) => {
      edgeMap.set(key, [...list].sort((a, b) => a.id - b.id));
    });

    const wallToGroups = new Map<number, number>();
    const roomWalls = new Map<number, Wall[]>();
    rooms.forEach((room) => {
      const roomWallList: Wall[] = [];
      const roomWallIds = new Set<number>();
      const ids = room.nodeIds;
      ids.forEach((nodeId, index) => {
        const nextId = ids[(index + 1) % ids.length];
        const a = Math.min(nodeId, nextId);
        const b = Math.max(nodeId, nextId);
        const key = `${a}-${b}`;
        const matching = edgeMap.get(key) || [];
        const wall = matching[0];
        if (wall && !roomWallIds.has(wall.id)) {
          roomWallList.push(wall);
          roomWallIds.add(wall.id);
          wallToGroups.set(wall.id, (wallToGroups.get(wall.id) || 0) + 1);
        }
      });
      roomWalls.set(room.id, roomWallList);
    });

    const orphanWalls = walls.filter((wall) => !wallToGroups.get(wall.id));
    return { roomWalls, orphanWalls };
  }, [rooms, walls]);

  const handleContextMenuOpen = ({ x, y, hit }: { x: number; y: number; hit: ContextMenuState["hit"] }) => {
    setContextMenu({ visible: true, x, y, hit });
    if (hit && hit.kind === "wall") {
      const wall = walls.find((item) => item.id === hit.wallId);
      if (wall) {
        const a = nodes.find((node) => node.id === wall.a);
        const b = nodes.find((node) => node.id === wall.b);
        if (a && b) {
          const lengthMeters = distance(a, b) / scale;
          const innerLength = innerLengthByWallId.get(wall.id);
          const lengthValue = showInnerMeasurements && innerLength !== undefined ? innerLength : lengthMeters;
          setMenuInputs((prev) => ({
            ...prev,
            length: Number(lengthValue.toFixed(2)),
            thickness: Number((wall.thickness ?? defaultWallThickness).toFixed(2)),
          }));
        }
      }
    }
    if (selection.nodes.length === 2) {
      const [idA, idB] = selection.nodes;
      const nodeA = nodes.find((node) => node.id === idA);
      const nodeB = nodes.find((node) => node.id === idB);
      if (nodeA && nodeB) {
        setMenuInputs((prev) => ({
          ...prev,
          distance: Number((distance(nodeA, nodeB) / scale).toFixed(2)),
        }));
      }
    }
  };

  const handleContextMenuClose = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const handleMenuInputChange = (key: keyof MenuInputs, value: number) => {
    if (key === "length") {
      setMenuInputs((prev) => ({ ...prev, [key]: clampValue(value, MIN_WALL_LENGTH, MAX_WALL_LENGTH) }));
      return;
    }
    if (key === "thickness") {
      setMenuInputs((prev) => ({ ...prev, [key]: clampValue(value, MIN_WALL_WIDTH, MAX_WALL_WIDTH) }));
      return;
    }
    setMenuInputs((prev) => ({ ...prev, [key]: value }));
  };

  const collapseNodes = () => {
    if (selection.nodes.length < 2) return;
    recordHistory(`Схлопнуть точки: ${selection.nodes.length} → 1`);
    const selected = nodes.filter((node) => selection.nodes.includes(node.id));
    const targetId = selected[0].id;
    const centroid = selected.reduce((acc, node) => ({ x: acc.x + node.x, y: acc.y + node.y }), { x: 0, y: 0 });
    centroid.x /= selected.length;
    centroid.y /= selected.length;
    const removedIds = new Set(selected.slice(1).map((node) => node.id));

    setNodes((prev) => prev.filter((node) => !removedIds.has(node.id)).map((node) => (
      node.id === targetId ? { ...node, x: centroid.x, y: centroid.y } : node
    )));
    setWalls((prev) => prev.map((wall) => ({
      ...wall,
      a: removedIds.has(wall.a) ? targetId : wall.a,
      b: removedIds.has(wall.b) ? targetId : wall.b,
    })).filter((wall) => wall.a !== wall.b));
    handleContextMenuClose();
  };

  const detachNodes = () => {
    if (selection.nodes.length < 1) return;
    recordHistory(`Отцепить точки: ${selection.nodes.length}`);
    setWalls((prevWalls) => {
      let nextWalls = [...prevWalls];
      let nextNodes = [...nodes];
      selection.nodes.forEach((nodeId) => {
        nextWalls = nextWalls.map((wall) => {
          if (wall.a !== nodeId && wall.b !== nodeId) return wall;
          const node = nextNodes.find((item) => item.id === nodeId);
          if (!node) return wall;
          const newNodeId = nodeIdRef.current++;
          nextNodes.push({ id: newNodeId, x: node.x, y: node.y });
          if (wall.a === nodeId) return { ...wall, a: newNodeId };
          return { ...wall, b: newNodeId };
        });
      });
      setNodes(nextNodes.filter((node) => nextWalls.some((wall) => wall.a === node.id || wall.b === node.id)));
      return nextWalls;
    });
    handleContextMenuClose();
  };

  const setDistanceBetweenNodes = () => {
    if (selection.nodes.length !== 2) return;
    const [idA, idB] = selection.nodes;
    const nodeA = nodes.find((node) => node.id === idA);
    const nodeB = nodes.find((node) => node.id === idB);
    if (!nodeA || !nodeB) return;
    const prevDistance = distance(nodeA, nodeB) / scale;
    recordHistory(`Расстояние: ${prevDistance.toFixed(2)} → ${Number(menuInputs.distance).toFixed(2)} м`);
    const target = Number(menuInputs.distance) * scale;
    const current = distance(nodeA, nodeB);
    if (current === 0) return;
    const mid = { x: (nodeA.x + nodeB.x) / 2, y: (nodeA.y + nodeB.y) / 2 };
    const dx = (nodeB.x - nodeA.x) / current;
    const dy = (nodeB.y - nodeA.y) / current;
    const half = target / 2;
    setNodes((prev) => prev.map((node) => {
      if (node.id === idA) return { ...node, x: mid.x - dx * half, y: mid.y - dy * half };
      if (node.id === idB) return { ...node, x: mid.x + dx * half, y: mid.y + dy * half };
      return node;
    }));
    handleContextMenuClose();
  };

  const splitWall = () => {
    if (!contextMenu.hit || contextMenu.hit.kind !== "wall") return;
    recordHistory(`Разделить стену ${contextMenu.hit.wallId}: 1 → 2`);
    const wallId = contextMenu.hit.wallId;
    const hitPoint = contextMenu.hit.hitPoint;
    if (!hitPoint) return;
    const wall = walls.find((item) => item.id === wallId);
    if (!wall) return;
    const newNodeId = nodeIdRef.current++;
    setNodes((prev) => [...prev, { id: newNodeId, x: hitPoint.x, y: hitPoint.y }]);
    setWalls((prev) => {
      const nextWalls = prev.filter((item) => item.id !== wallId);
      nextWalls.push({
        ...wall,
        id: wallIdRef.current++,
        a: wall.a,
        b: newNodeId,
      });
      nextWalls.push({
        ...wall,
        id: wallIdRef.current++,
        a: newNodeId,
        b: wall.b,
      });
      return nextWalls;
    });
    handleContextMenuClose();
  };

  const setWallLength = () => {
    if (selection.walls.length !== 1) return;
    const wall = walls.find((item) => item.id === selection.walls[0]);
    if (!wall) return;
    const prevLength = getWallLengthMeters(wall);
    recordHistory(`Длина стены ${wall.id}: ${prevLength.toFixed(2)} → ${Number(menuInputs.length).toFixed(2)} м`);
    const anchor = contextMenu.hit && contextMenu.hit.kind === "wall" ? contextMenu.hit.anchorNodeId : wall.a;
    const fixedId = anchor === wall.b ? wall.b : wall.a;
    const moveId = anchor === wall.b ? wall.a : wall.b;
    const fixed = nodes.find((node) => node.id === fixedId);
    const move = nodes.find((node) => node.id === moveId);
    if (!fixed || !move) return;
    const current = distance(fixed, move);
    if (current === 0) return;
    const desired = clampValue(Number(menuInputs.length), MIN_WALL_LENGTH, MAX_WALL_LENGTH) * scale;
    let targetPx = desired;
    if (showInnerMeasurements) {
      const innerLength = innerLengthByWallId.get(wall.id);
      if (innerLength !== undefined) {
        const outerLength = current / scale;
        const delta = outerLength - innerLength;
        const nextMeters = clampValue(Number(menuInputs.length) + delta, MIN_WALL_LENGTH, MAX_WALL_LENGTH);
        targetPx = nextMeters * scale;
      }
    }
    const dx = (move.x - fixed.x) / current;
    const dy = (move.y - fixed.y) / current;
    setNodes((prev) => prev.map((node) => (
      node.id === moveId
        ? { ...node, x: fixed.x + dx * targetPx, y: fixed.y + dy * targetPx }
        : node
    )));
    handleContextMenuClose();
  };

  const setWallThickness = () => {
    if (selection.walls.length < 1) return;
    const prevThickness = selection.walls.length === 1
      ? (walls.find((wall) => wall.id === selection.walls[0])?.thickness ?? defaultWallThickness)
      : Number(menuInputs.thickness);
    recordHistory(`Ширина стен: ${prevThickness.toFixed(2)} → ${Number(menuInputs.thickness).toFixed(2)} м`);
    const thickness = clampValue(Number(menuInputs.thickness), MIN_WALL_WIDTH, MAX_WALL_WIDTH);
    setWalls((prev) => prev.map((wall) => (
      selection.walls.includes(wall.id) ? { ...wall, thickness } : wall
    )));
    handleContextMenuClose();
  };

  const setAngleBetweenWalls = () => {
    if (selection.walls.length !== 2) return;
    const [wallAId, wallBId] = selection.walls;
    const wallA = walls.find((wall) => wall.id === wallAId);
    const wallB = walls.find((wall) => wall.id === wallBId);
    if (!wallA || !wallB) return;
    const prevAngle = getAngleBetweenWalls(wallA, wallB);
    if (prevAngle !== null) {
      recordHistory(`Угол: ${prevAngle.toFixed(1)}° → ${Number(menuInputs.angle).toFixed(1)}°`);
    } else {
      recordHistory(`Угол: ${Number(menuInputs.angle).toFixed(1)}°`);
    }
    const shared = [wallA.a, wallA.b].find((id) => id === wallB.a || id === wallB.b);
    if (!shared) return;
    const moveWallId = selection.walls.includes(lastSelectedWallId ?? -1) ? lastSelectedWallId : wallBId;
    if (!moveWallId) return;
    const fixedWallId = moveWallId === wallAId ? wallBId : wallAId;
    const fixedWall = walls.find((wall) => wall.id === fixedWallId);
    const moveWall = walls.find((wall) => wall.id === moveWallId);
    if (!fixedWall || !moveWall) return;
    const fixedOtherId = fixedWall.a === shared ? fixedWall.b : fixedWall.a;
    const moveOtherId = moveWall.a === shared ? moveWall.b : moveWall.a;
    const refNode = nodes.find((node) => node.id === shared);
    const refOther = nodes.find((node) => node.id === fixedOtherId);
    const targetOther = nodes.find((node) => node.id === moveOtherId);
    if (!refNode || !refOther || !targetOther) return;
    const length = distance(refNode, targetOther);
    const baseAngle = Math.atan2(refOther.y - refNode.y, refOther.x - refNode.x);
    const angleRad = (Number(menuInputs.angle) * Math.PI) / 180;
    const nextAngle = baseAngle + angleRad;
    setNodes((prev) => prev.map((node) => (
      node.id === moveOtherId
        ? { ...node, x: refNode.x + Math.cos(nextAngle) * length, y: refNode.y + Math.sin(nextAngle) * length }
        : node
    )));
    handleContextMenuClose();
  };

  const scaleWalls = () => {
    if (selection.walls.length < 1) return;
    recordHistory(`Масштабирование стен: ${selection.walls.length} (x${Number(menuInputs.scale).toFixed(2)})`);
    const wallIds = new Set(selection.walls);
    const nodeIds = new Set<number>();
    walls.forEach((wall) => {
      if (wallIds.has(wall.id)) {
        nodeIds.add(wall.a);
        nodeIds.add(wall.b);
      }
    });
    const selectedNodes = nodes.filter((node) => nodeIds.has(node.id));
    if (!selectedNodes.length) return;
    const centroid = selectedNodes.reduce((acc, node) => ({ x: acc.x + node.x, y: acc.y + node.y }), { x: 0, y: 0 });
    centroid.x /= selectedNodes.length;
    centroid.y /= selectedNodes.length;
    const factor = Number(menuInputs.scale);
    setNodes((prev) => prev.map((node) => {
      if (!nodeIds.has(node.id)) return node;
      return {
        ...node,
        x: centroid.x + (node.x - centroid.x) * factor,
        y: centroid.y + (node.y - centroid.y) * factor,
      };
    }));
    handleContextMenuClose();
  };

  const handleRoomSelect = (roomId: number, event: React.MouseEvent<HTMLDivElement>) => {
    const next = {
      nodes: [...selection.nodes],
      walls: [...selection.walls],
      rooms: [...selection.rooms],
    };
    toggleSelection(next.rooms, roomId, event.ctrlKey);
    if (!event.ctrlKey) {
      next.nodes = [];
      next.walls = [];
    }
    setSelection(next);
  };

  const handleWallSelect = (wallId: number, event: React.MouseEvent<HTMLDivElement>) => {
    const next = {
      nodes: [...selection.nodes],
      walls: [...selection.walls],
      rooms: [...selection.rooms],
    };
    toggleSelection(next.walls, wallId, event.ctrlKey);
    setLastSelectedWallId(wallId);
    if (!event.ctrlKey) {
      next.nodes = [];
      next.rooms = [];
    }
    setSelection(next);
  };

  const canUndo = historyVersion >= 0 && historyIndexRef.current > 0;
  const canRedo = historyVersion >= 0 && historyIndexRef.current < historyEntriesRef.current.length - 1;
  const historyEntries = useMemo(() => {
    const list = historyEntriesRef.current;
    const currentIndex = historyIndexRef.current;
    return list.map((entry, index) => ({
      key: `entry-${entry.time}-${index}`,
      label: entry.label,
      time: entry.time,
      kind: "entry" as const,
      index,
      disabled: index === currentIndex,
    }));
  }, [historyVersion]);

  const formatHistoryTime = (time: number) => {
    const diff = Date.now() - time;
    if (diff < 10_000) return "только что";
    if (diff < 60_000) return `${Math.round(diff / 1000)} сек назад`;
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)} мин назад`;
    return new Date(time).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

  const handleHistoryJump = useCallback((index: number) => {
    if (index < 0 || index >= historyEntriesRef.current.length) return;
    if (index === historyIndexRef.current) return;
    historyIndexRef.current = index;
    const entry = historyEntriesRef.current[index];
    if (!entry) return;
    applySnapshot(entry.snapshot);
    setHistoryVersion((prev) => prev + 1);
  }, [applySnapshot]);

  return (
    <div className="canvas-shell">
      <CanvasPlanner
        nodes={nodes}
        walls={walls}
        rooms={rooms}
        mode={mode}
        scale={scale}
        grid={grid}
        snapEnabled={snapEnabled}
        soloView={soloView}
        showRoomNames={showRoomNames}
        showRoomSizes={showRoomSizes}
        showWallNames={showWallNames}
        showWallLength={showWallLength}
        showWallWidth={showWallWidth}
        showInnerMeasurements={showInnerMeasurements}
        showAngleLabels={showAngleLabels}
        defaultWallThickness={defaultWallThickness}
        selection={selection}
        hoveredWallId={hoveredWallId}
        onCreateWallChain={handleCreateWallChain}
        onCreateRoomFromChain={handleCreateRoomFromChain}
        onUpdateNodes={setNodes}
        onSelectionChange={handleSelectionChange}
        onContextMenuOpen={handleContextMenuOpen}
        view={view}
        onViewChange={setView}
        toolbar={(
          <FloatingToolbar
            mode={mode}
            onModeChange={setMode}
            onClear={handleClear}
            scale={scale}
            grid={grid}
            snapEnabled={snapEnabled}
            defaultWallThickness={defaultWallThickness}
            zoom={view.zoom}
            onScaleChange={(value) => {
              recordHistory(`Масштаб: ${scale.toFixed(2)} → ${Number(value).toFixed(2)}`);
              setScale(value);
            }}
            onGridChange={(value) => {
              recordHistory(`Сетка: ${grid.toFixed(2)} → ${Number(value).toFixed(2)}`);
              setGrid(value);
            }}
            onSnapToggle={(value) => {
              recordHistory(`Снап: ${snapEnabled ? "вкл" : "выкл"} → ${value ? "вкл" : "выкл"}`);
              setSnapEnabled(value);
            }}
            onWallThicknessChange={(value) => {
              recordHistory(`Толщина по умолчанию: ${defaultWallThickness.toFixed(2)} → ${Number(value).toFixed(2)} м`);
              setDefaultWallThickness(clampValue(value, MIN_WALL_WIDTH, MAX_WALL_WIDTH));
            }}
            onZoomChange={handleZoomChange}
            onZoomReset={handleZoomReset}
            onResetLayout={handleResetLayout}
            onToggleTheme={handleToggleTheme}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        )}
        onEditStart={() => {
          const parts = [];
          if (selection.nodes.length) parts.push(`${selection.nodes.length} точек`);
          if (selection.walls.length) parts.push(`${selection.walls.length} стен`);
          if (selection.rooms.length) parts.push(`${selection.rooms.length} комнат`);
          recordHistory(parts.length ? `Перемещение: ${parts.join(", ")}` : "Перемещение");
        }}
        overlays={(
          <>
            <SidePanel
              items={SIDE_PANEL_ITEMS.map((item) => ({
                ...item,
                content: item.id === "main"
                  ? (
                    <div className="side-sections">
                      {sectionOrder.map((sectionId) => {
                        const isOpen = sideSections[sectionId];
                        const title = sectionId === "stats"
                          ? "Статистика"
                          : sectionId === "preview"
                            ? "Превью"
                            : sectionId === "view"
                              ? "Настройки просмотра"
                              : "Комнаты и стены";
                        const content = sectionId === "stats"
                          ? (
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
                          )
                          : sectionId === "preview"
                            ? (
                              <div className="selection-preview">
                                {selection.nodes.length
                                || selection.walls.length
                                || selection.rooms.length ? (
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

                                    const normalized = normalizePreviewPoints(previewPoints.length ? previewPoints : [{ x: 0, y: 0 }]);
                                    let index = 0;
                                    const roomNormalized = roomItems.map((roomItem) => {
                                      const points = normalized.slice(index, index + roomItem.points.length);
                                      index += roomItem.points.length;
                                      return { id: roomItem.id, points };
                                    });
                                    const wallNormalized = wallItems.map((wallItem) => {
                                      const nodeA = nodes.find((node) => node.id === wallItem.a);
                                      const nodeB = nodes.find((node) => node.id === wallItem.b);
                                      if (!nodeA || !nodeB) return null;
                                      const points = normalized.slice(index, index + 2);
                                      index += 2;
                                      return { id: wallItem.id, points };
                                    }).filter(Boolean);
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
                            )
                            : sectionId === "view"
                              ? (
                                <div className="view-controls">
                                  <div className="chip-group">
                                    <button
                                      className={`chip ${soloView ? "active" : ""}`}
                                      onClick={() => setSoloView((prev) => !prev)}
                                      type="button"
                                    >
                                      Только выбранные
                                    </button>
                                    <button
                                      className={`chip ${showRoomNames ? "active" : ""}`}
                                      onClick={() => setShowRoomNames((prev) => !prev)}
                                      type="button"
                                    >
                                      Названия комнат
                                    </button>
                                    <button
                                      className={`chip ${showRoomSizes ? "active" : ""}`}
                                      onClick={() => setShowRoomSizes((prev) => !prev)}
                                      type="button"
                                    >
                                      Площади комнат
                                    </button>
                                    <button
                                      className={`chip ${showWallNames ? "active" : ""}`}
                                      onClick={() => setShowWallNames((prev) => !prev)}
                                      type="button"
                                    >
                                      Названия стен
                                    </button>
                                    <button
                                      className={`chip ${showWallLength ? "active" : ""}`}
                                      onClick={() => setShowWallLength((prev) => !prev)}
                                      type="button"
                                    >
                                      Длина стен
                                    </button>
                                    <button
                                      className={`chip ${showWallWidth ? "active" : ""}`}
                                      onClick={() => setShowWallWidth((prev) => !prev)}
                                      type="button"
                                    >
                                      Ширина стен
                                    </button>
                                    <button
                                      className={`chip ${showAngleLabels ? "active" : ""}`}
                                      onClick={() => setShowAngleLabels((prev) => !prev)}
                                      type="button"
                                    >
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
                              )
                            : (
                              <div className="objects-panel">
                                <div className="chip-group">
                                  <button
                                    className={`chip ${showRoomsPanel ? "active" : ""}`}
                                    onClick={() => setShowRoomsPanel((prev) => !prev)}
                                    type="button"
                                  >
                                    Комнаты
                                  </button>
                                  <button
                                    className={`chip ${showWallsPanel ? "active" : ""}`}
                                    onClick={() => setShowWallsPanel((prev) => !prev)}
                                    type="button"
                                  >
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
                                                ? (roomAreaById[room.id] ?? getRoomArea(room, scale))
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
                                              selectedWallIds={selection.walls}
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
                                              selectedWallIds={selection.walls}
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
                                    selectedWallIds={selection.walls}
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
                              onClick={() => toggleSection(sectionId)}
                              draggable
                              onDragStart={(event) => {
                                setDraggingSection(sectionId);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", sectionId);
                              }}
                              onDragEnd={() => setDraggingSection(null)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => handleSectionDrop(sectionId)}
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
                            {isOpen && (
                              <div className="side-section-body">
                                {content}
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  )
                  : item.id === "history"
                    ? (
                      <div className="history-list">
                        {historyEntries.length ? (
                          [...historyEntries].reverse().map((entry) => (
                            <button
                              key={entry.key}
                              className={`history-item${entry.disabled ? " disabled" : ""}`}
                              type="button"
                              disabled={entry.disabled}
                              onClick={() => {
                                handleHistoryJump(entry.index);
                              }}
                            >
                              <span className="history-title">{entry.label}</span>
                              <span className="history-time">{formatHistoryTime(entry.time)}</span>
                            </button>
                          ))
                        ) : (
                          <div className="history-empty">История пуста.</div>
                        )}
                      </div>
                    )
                    : (
                    <TemplatePanel
                      nodes={nodes}
                      walls={walls}
                      scale={scale}
                      grid={grid}
                      wallThickness={defaultWallThickness}
                      onApplyData={handleApplyImport}
                    />
                  ),
              }))}
              activeId={sidePanelActive}
              collapsed={sidePanelCollapsed}
              width={sidePanelWidth}
              onToggleItem={(id) => {
                setSidePanelActive((prev) => (prev === id ? null : id));
              }}
              onToggleCollapsed={() => setSidePanelCollapsed((prev) => !prev)}
              onResize={setSidePanelWidth}
            />
            <FloatingPanel
              panelId="tips"
              title="Подсказки"
              defaultCollapsed={true}
              collapsed={floatingPanelCollapsed.tips}
              onCollapsedChange={(next) => {
                setFloatingPanelCollapsed((prev) => ({ ...prev, tips: next }));
              }}
              position={panelPositions.tips || { x: 16, y: 640 }}
              onDrag={handlePanelDrag}
              onSize={handlePanelSize}
              icon={PANEL_ICON_TIPS}
            >
              <ul>
                <li>Esc отменяет текущую стену.</li>
                <li>Ctrl + перетаскивание — панорама.</li>
                <li>Ctrl добавляет/убирает из выделения.</li>
                <li>Shift в режиме выбора — рамка.</li>
                <li>Shift в рисовании — цепочка до замыкания.</li>
              </ul>
            </FloatingPanel>
            <ContextMenu
              visible={contextMenu.visible}
              position={{ x: contextMenu.x, y: contextMenu.y }}
              inputs={menuInputs}
              selection={selection}
              canSplit={!!(contextMenu.hit && contextMenu.hit.kind === "wall")}
              onClose={handleContextMenuClose}
              onChange={handleMenuInputChange}
              onCollapseNodes={collapseNodes}
              onDetachNodes={detachNodes}
              onSetDistance={setDistanceBetweenNodes}
              onSplitWall={splitWall}
              onSetLength={setWallLength}
              onSetThickness={setWallThickness}
              onSetAngle={setAngleBetweenWalls}
              onScaleWalls={scaleWalls}
            />
          </>
        )}
      />
    </div>
  );
}

function distance(a: Vec2, b: Vec2) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function toggleSelection(list: number[], id: number, additive: boolean) {
  if (!additive) {
    list.length = 0;
    list.push(id);
    return;
  }
  const index = list.indexOf(id);
  if (index >= 0) list.splice(index, 1);
  else list.push(id);
}

function computeDockLayout(
  defs: readonly PanelDef[],
  sizes: Partial<Record<PanelId, PanelSize>>,
  positions: Partial<Record<PanelId, PanelPosition>>
) {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const next: Partial<Record<PanelId, PanelPosition>> = { ...positions };

  const rightPanels = defs.filter((panel) => panel.dock === "right");
  let yRight = PANEL_MARGIN;
  rightPanels.sort((a, b) => a.order - b.order).forEach((panel) => {
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
  leftPanels.sort((a, b) => a.order - b.order).forEach((panel) => {
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
  bottomPanels.sort((a, b) => a.order - b.order).forEach((panel) => {
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
