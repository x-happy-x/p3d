import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LAST_TEMPLATE_NAME_STORAGE_KEY, listTemplates, loadTemplate } from "./api/templates";
import CanvasPlanner from "./components/CanvasPlanner";
import ContextMenu from "./components/ContextMenu";
import FloatingPanel from "./components/FloatingPanel";
import FloatingToolbar from "./components/FloatingToolbar";
import HistoryPanel from "./components/HistoryPanel";
import MainSidePanelContent from "./components/MainSidePanelContent";
import SidePanel from "./components/SidePanel";
import TemplatePanel from "./components/TemplatePanel";
import { useDockLayout } from "./hooks/useDockLayout";
import { useHistory } from "./hooks/useHistory";
import {
  DEFAULT_SECTION_ORDER,
  DEFAULT_SIDE_SECTIONS,
  usePersistUiPrefs,
  useUiPrefs,
  type MenuInputs,
  type SideSectionId,
  type UiPrefs,
} from "./hooks/useUiPrefs";
import { getRoomArea, offsetPolygon, polygonArea } from "./utils/geometry";
import { buildRoomsFromWalls } from "./utils/rooms";
import { normalizeImportData } from "./utils/serialization";
import type { ContextMenuState, NodePoint, Room, Selection, Vec2, ViewState, Wall } from "./types/plan";
import "./App.scss";

const PANELS = [{ id: "tips", dock: "left", order: 0 }] as const;

type PanelId = (typeof PANELS)[number]["id"];

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

const MIN_WALL_LENGTH = 0.01;
const MAX_WALL_LENGTH = 100;
const MIN_WALL_WIDTH = 0.01;
const MAX_WALL_WIDTH = 1;
const MAX_HISTORY = 100;
const HISTORY_MERGE_MS = 600;

const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

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

export default function App() {
  const uiPrefs = useUiPrefs();

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

  const {
    panelSizes,
    panelPositions,
    handlePanelSize,
    handlePanelDrag,
    resetDockLayout,
  } = useDockLayout(PANELS, uiPrefs.panelSizes ?? {}, uiPrefs.panelPositions ?? {});
  const [floatingPanelCollapsed, setFloatingPanelCollapsed] = useState<Partial<Record<PanelId, boolean>>>(
    uiPrefs.floatingPanelCollapsed ?? { tips: true }
  );
  const [sidePanelWidth, setSidePanelWidth] = useState(uiPrefs.sidePanelWidth ?? 360);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(uiPrefs.sidePanelCollapsed ?? false);
  const [sidePanelActive, setSidePanelActive] = useState<string | null>(uiPrefs.sidePanelActive ?? "main");
  const [sideSections, setSideSections] = useState<Record<SideSectionId, boolean>>(uiPrefs.sideSections ?? DEFAULT_SIDE_SECTIONS);
  const [sectionOrder, setSectionOrder] = useState<SideSectionId[]>(uiPrefs.sectionOrder ?? DEFAULT_SECTION_ORDER);
  const [draggingSection, setDraggingSection] = useState<SideSectionId | null>(null);

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

  const applySnapshot = useCallback((snapshot: HistoryState) => {
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
  }, []);

  const {
    recordHistory,
    undo: handleUndo,
    redo: handleRedo,
    jumpTo: handleHistoryJump,
    entries: historyEntries,
    canUndo,
    canRedo,
  } = useHistory<HistoryState>({
    createSnapshot,
    applySnapshot,
    watch: [nodes, walls, roomNames, defaultWallThickness, scale, grid, snapEnabled, selection],
    mergeMs: HISTORY_MERGE_MS,
    maxEntries: MAX_HISTORY,
  });

  const uiPrefsPayload = useMemo<UiPrefs>(
    () => ({
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
    }),
    [
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
    ]
  );

  usePersistUiPrefs(uiPrefsPayload, theme);

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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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
    resetDockLayout();
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
      const nextNodes = [...nodes];
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

  const formatHistoryTime = (time: number) => {
    const diff = Date.now() - time;
    if (diff < 10_000) return "только что";
    if (diff < 60_000) return `${Math.round(diff / 1000)} сек назад`;
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)} мин назад`;
    return new Date(time).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

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
                    <MainSidePanelContent
                      sectionOrder={sectionOrder}
                      sideSections={sideSections}
                      draggingSection={draggingSection}
                      onToggleSection={toggleSection}
                      onSectionDragStart={(sectionId, event) => {
                        setDraggingSection(sectionId);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", sectionId);
                      }}
                      onSectionDragEnd={() => setDraggingSection(null)}
                      onSectionDrop={handleSectionDrop}
                      rooms={rooms}
                      walls={walls}
                      nodes={nodes}
                      selection={selection}
                      totalArea={totalArea}
                      scale={scale}
                      showInnerMeasurements={showInnerMeasurements}
                      roomAreaById={roomAreaById}
                      soloView={soloView}
                      setSoloView={setSoloView}
                      showRoomNames={showRoomNames}
                      setShowRoomNames={setShowRoomNames}
                      showRoomSizes={showRoomSizes}
                      setShowRoomSizes={setShowRoomSizes}
                      showWallNames={showWallNames}
                      setShowWallNames={setShowWallNames}
                      showWallLength={showWallLength}
                      setShowWallLength={setShowWallLength}
                      showWallWidth={showWallWidth}
                      setShowWallWidth={setShowWallWidth}
                      showAngleLabels={showAngleLabels}
                      setShowAngleLabels={setShowAngleLabels}
                      setShowInnerMeasurements={setShowInnerMeasurements}
                      showRoomsPanel={showRoomsPanel}
                      setShowRoomsPanel={setShowRoomsPanel}
                      showWallsPanel={showWallsPanel}
                      setShowWallsPanel={setShowWallsPanel}
                      expandedRooms={expandedRooms}
                      setExpandedRooms={setExpandedRooms}
                      expandedOrphans={expandedOrphans}
                      setExpandedOrphans={setExpandedOrphans}
                      editingRoomId={editingRoomId}
                      setEditingRoomId={setEditingRoomId}
                      roomNameDraft={roomNameDraft}
                      setRoomNameDraft={setRoomNameDraft}
                      commitRoomEdit={commitRoomEdit}
                      startRoomEdit={startRoomEdit}
                      handleRoomSelect={handleRoomSelect}
                      wallGroups={wallGroups}
                      selectedWallIds={selection.walls}
                      hoveredWallId={hoveredWallId}
                      setHoveredWallId={setHoveredWallId}
                      innerLengthByWallId={innerLengthByWallId}
                      handleWallSelect={handleWallSelect}
                      handleWallRename={handleWallRename}
                      handleWallLengthChange={handleWallLengthChange}
                      handleWallWidthChange={handleWallWidthChange}
                    />
                  )
                  : item.id === "history"
                    ? (
                      <HistoryPanel
                        entries={historyEntries}
                        onJump={handleHistoryJump}
                        formatTime={formatHistoryTime}
                      />
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
