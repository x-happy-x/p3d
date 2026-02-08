import React from "react";
import "./styles.scss";
import type { Selection } from "../../types/plan";

type Inputs = {
  distance: number;
  angle: number;
  length: number;
  thickness: number;
  scale: number;
};

type Props = {
  visible: boolean;
  position: { x: number; y: number };
  inputs: Inputs;
  selection: Selection;
  canSplit: boolean;
  onClose: () => void;
  onChange: (key: keyof Inputs, value: number) => void;
  onCollapseNodes: () => void;
  onDetachNodes: () => void;
  onSetDistance: () => void;
  onSplitWall: () => void;
  onSetLength: () => void;
  onSetThickness: () => void;
  onSetAngle: () => void;
  onScaleWalls: () => void;
};

export default function ContextMenu({
  visible,
  position,
  inputs,
  selection,
  canSplit,
  onClose,
  onChange,
  onCollapseNodes,
  onDetachNodes,
  onSetDistance,
  onSplitWall,
  onSetLength,
  onSetThickness,
  onSetAngle,
  onScaleWalls,
}: Props) {
  if (!visible) return null;

  const showNodes = selection.nodes.length > 0;
  const showWalls = selection.walls.length > 0 || canSplit;

  return (
    <div className="context-menu" style={{ left: position.x, top: position.y }}>
      <div className="menu-row">
        <strong>Действия</strong>
        <button className="ghost" onClick={onClose}>Закрыть</button>
      </div>
      {showNodes ? (
        <div className="menu-section">
          <div className="menu-title">Точки</div>
          {selection.nodes.length >= 2 ? (
            <div className="menu-row">
              <button onClick={onCollapseNodes}>Схлопнуть</button>
            </div>
          ) : null}
          {selection.nodes.length >= 1 ? (
            <div className="menu-row">
              <button onClick={onDetachNodes}>Отцепить</button>
            </div>
          ) : null}
          {selection.nodes.length === 2 ? (
            <div className="menu-row">
              <label>
                Расстояние (м)
                <input
                  type="number"
                  value={inputs.distance}
                  step={0.1}
                  onChange={(event) => onChange("distance", Number(event.target.value))}
                />
              </label>
              <button onClick={onSetDistance}>Применить</button>
            </div>
          ) : null}
        </div>
      ) : null}
      {showWalls ? (
        <div className="menu-section">
          <div className="menu-title">Стены</div>
          {canSplit ? (
            <div className="menu-row">
              <button onClick={onSplitWall}>Разделить</button>
            </div>
          ) : null}
          {selection.walls.length === 1 ? (
            <div className="menu-row">
              <label>
                Длина (м)
                <input
                  type="number"
                  value={inputs.length}
                  min={0.01}
                  max={100}
                  step={0.1}
                  onChange={(event) => onChange("length", Number(event.target.value))}
                />
              </label>
              <button onClick={onSetLength}>Применить</button>
            </div>
          ) : null}
          {selection.walls.length >= 1 ? (
            <div className="menu-row">
              <label>
                Толщина (м)
                <input
                  type="number"
                  value={inputs.thickness}
                  min={0.01}
                  max={1}
                  step={0.05}
                  onChange={(event) => onChange("thickness", Number(event.target.value))}
                />
              </label>
              <button onClick={onSetThickness}>Применить</button>
            </div>
          ) : null}
          {selection.walls.length === 2 ? (
            <div className="menu-row">
              <label>
                Угол (°)
                <input
                  type="number"
                  value={inputs.angle}
                  step={1}
                  onChange={(event) => onChange("angle", Number(event.target.value))}
                />
              </label>
              <button onClick={onSetAngle}>Применить</button>
            </div>
          ) : null}
          {selection.walls.length >= 1 ? (
            <div className="menu-row">
              <label>
                Масштаб
                <input
                  type="number"
                  value={inputs.scale}
                  step={0.1}
                  onChange={(event) => onChange("scale", Number(event.target.value))}
                />
              </label>
              <button onClick={onScaleWalls}>Применить</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
