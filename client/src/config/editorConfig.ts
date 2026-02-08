export const EDITOR_LIMITS = {
  wallLength: { min: 0.01, max: 100, step: 0.01, quickStep: 0.1 },
  wallThickness: { min: 0.01, max: 1, step: 0.01, contextStep: 0.05 },
  scale: { min: 10, max: 200 },
  grid: { min: 0.1, step: 0.1 },
  zoom: { min: 0.2, max: 4, step: 0.1, wheelFactor: 0.0012 },
  sidePanelWidth: { min: 260, max: 640 },
} as const;

export const EDITOR_DEFAULTS = {
  scale: 50,
  grid: 0.5,
  wallThickness: 0.2,
  zoom: 1,
  viewOffset: { x: 40, y: 40 },
  menuInputs: {
    distance: 3,
    angle: 90,
    length: 3,
    thickness: 0.2,
    scale: 1.2,
  },
} as const;

export const HISTORY_CONFIG = {
  maxEntries: 100,
  mergeMs: 600,
} as const;

export const CANVAS_INTERACTION = {
  angleSnapDegrees: [0, 45, 90, 135, 180, -45, -90, -135],
  angleSnapThresholdDeg: 7,
  nodeSnapDistancePx: 12,
  closeRoomDistancePx: 14,
  hitThresholdPx: 10,
  mergeCollinearThresholdRad: 0.02,
} as const;
