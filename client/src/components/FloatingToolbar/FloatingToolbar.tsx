import React from "react";
import iconDraw from "../../assets/icons/draw.svg";
import iconSelect from "../../assets/icons/select.svg";
import iconEdit from "../../assets/icons/edit.svg";
import iconPan from "../../assets/icons/pan.svg";
import iconZoomIn from "../../assets/icons/zoom-in.svg";
import iconZoomOut from "../../assets/icons/zoom-out.svg";
import iconZoomReset from "../../assets/icons/zoom-reset.svg";
import iconLayoutReset from "../../assets/icons/layout-reset.svg";
import iconClear from "../../assets/icons/clear.svg";
import iconTheme from "../../assets/icons/theme.svg";
import iconUndo from "../../assets/icons/undo.svg";
import iconRedo from "../../assets/icons/redo.svg";
import { EDITOR_LIMITS } from "../../config/editorConfig";
import Tooltip from "../Tooltip";
import "./styles.scss";

type Props = {
  mode: "draw" | "select" | "edit" | "pan";
  onModeChange: (mode: "draw" | "select" | "edit" | "pan") => void;
  onClear: () => void;
  scale: number;
  grid: number;
  snapEnabled: boolean;
  defaultWallThickness: number;
  zoom: number;
  onScaleChange: (value: number) => void;
  onGridChange: (value: number) => void;
  onSnapToggle: (value: boolean) => void;
  onWallThicknessChange: (value: number) => void;
  onZoomChange: (value: number) => void;
  onZoomReset: () => void;
  onResetLayout: () => void;
  onToggleTheme: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

function Icon({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} className="icon-img" />;
}

export default function FloatingToolbar({
  mode,
  onModeChange,
  onClear,
  scale,
  grid,
  snapEnabled,
  defaultWallThickness,
  zoom,
  onScaleChange,
  onGridChange,
  onSnapToggle,
  onWallThicknessChange,
  onZoomChange,
  onZoomReset,
  onResetLayout,
  onToggleTheme,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  return (
    <div className="floating-toolbar">
      <div className="toolbar-row">
        <Tooltip content="Отменить (Ctrl+Z)">
          <button className="icon-btn" onClick={onUndo} disabled={!canUndo}>
            <Icon src={iconUndo} alt="Undo" />
          </button>
        </Tooltip>
        <Tooltip content="Повторить (Ctrl+Y)">
          <button className="icon-btn" onClick={onRedo} disabled={!canRedo}>
            <Icon src={iconRedo} alt="Redo" />
          </button>
        </Tooltip>
        <div className="divider" />
        <Tooltip content="Рисование: ставьте точки и замыкайте комнату">
          <button className={`icon-btn ${mode === "draw" ? "active" : ""}`} onClick={() => onModeChange("draw")}>
            <Icon src={iconDraw} alt="Draw" />
          </button>
        </Tooltip>
        <Tooltip content="Выбор: точки, стены, комнаты">
          <button className={`icon-btn ${mode === "select" ? "active" : ""}`} onClick={() => onModeChange("select")}>
            <Icon src={iconSelect} alt="Select" />
          </button>
        </Tooltip>
        <Tooltip content="Редактирование: тяните точки и стены">
          <button className={`icon-btn ${mode === "edit" ? "active" : ""}`} onClick={() => onModeChange("edit")}>
            <Icon src={iconEdit} alt="Edit" />
          </button>
        </Tooltip>
        <Tooltip content="Панорама: перетаскивайте. Также работает с Ctrl">
          <button className={`icon-btn ${mode === "pan" ? "active" : ""}`} onClick={() => onModeChange("pan")}>
            <Icon src={iconPan} alt="Pan" />
          </button>
        </Tooltip>
        <Tooltip content="Очистить план">
          <button className="icon-btn danger" onClick={onClear}>
            <Icon src={iconClear} alt="Clear" />
          </button>
        </Tooltip>
        <div className="divider" />
        <Tooltip content="Отдалить">
          <button className="icon-btn" onClick={() => onZoomChange(zoom - EDITOR_LIMITS.zoom.step)}>
            <Icon src={iconZoomOut} alt="Zoom out" />
          </button>
        </Tooltip>
        <Tooltip content="Приблизить">
          <button className="icon-btn" onClick={() => onZoomChange(zoom + EDITOR_LIMITS.zoom.step)}>
            <Icon src={iconZoomIn} alt="Zoom in" />
          </button>
        </Tooltip>
        <Tooltip content="Сбросить зум">
          <button className="icon-btn" onClick={onZoomReset}>
            <Icon src={iconZoomReset} alt="Reset" />
          </button>
        </Tooltip>
        <Tooltip content="Сбросить панели">
          <button className="icon-btn" onClick={onResetLayout}>
            <Icon src={iconLayoutReset} alt="Reset panels" />
          </button>
        </Tooltip>
        <Tooltip content="Переключить тему">
          <button className="icon-btn" onClick={onToggleTheme}>
            <Icon src={iconTheme} alt="Theme" />
          </button>
        </Tooltip>
      </div>
      <div className="toolbar-row">
        <Tooltip content="Масштаб: пикселей на метр">
          <label className="tool-input">
            <span>Scale</span>
            <input
              type="number"
              value={scale}
              min={EDITOR_LIMITS.scale.min}
              max={EDITOR_LIMITS.scale.max}
              onChange={(event) => onScaleChange(Number(event.target.value))}
            />
          </label>
        </Tooltip>
        <Tooltip content="Шаг сетки в метрах">
          <label className="tool-input">
            <span>Grid</span>
            <input
              type="number"
              value={grid}
              min={EDITOR_LIMITS.grid.min}
              step={EDITOR_LIMITS.grid.step}
              onChange={(event) => onGridChange(Number(event.target.value))}
            />
          </label>
        </Tooltip>
        <Tooltip content="Толщина по умолчанию (м)">
          <label className="tool-input">
            <span>Wall</span>
          <input
            type="number"
            value={defaultWallThickness}
            min={EDITOR_LIMITS.wallThickness.min}
            max={EDITOR_LIMITS.wallThickness.max}
            step={EDITOR_LIMITS.wallThickness.step}
            onChange={(event) => onWallThicknessChange(Number(event.target.value))}
          />
          </label>
        </Tooltip>
        <Tooltip content="Снап к точкам и углам">
          <label className="toggle tool-toggle">
            <input
              type="checkbox"
              checked={snapEnabled}
              onChange={(event) => onSnapToggle(event.target.checked)}
            />
            <span>Snap</span>
          </label>
        </Tooltip>
      </div>
    </div>
  );
}
