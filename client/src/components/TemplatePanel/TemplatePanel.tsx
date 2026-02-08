import React, { useEffect, useState } from "react";
import { buildExportData, normalizeImportData, parseYaml, serializeToYaml } from "../../utils/serialization";
import { LAST_TEMPLATE_NAME_STORAGE_KEY, listTemplates, loadTemplate, saveTemplate } from "../../api/templates";
import type { NodePoint, Wall } from "../../types/plan";
import "./styles.scss";

type Props = {
  nodes: NodePoint[];
  walls: Wall[];
  scale: number;
  grid: number;
  wallThickness: number;
  onApplyData: (data: { scale: number; grid: number; wallThickness: number; nodes: NodePoint[]; walls: Wall[] }) => void;
};

export default function TemplatePanel({ nodes, walls, scale, grid, wallThickness, onApplyData }: Props) {
  const [text, setText] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [status, setStatus] = useState("");

  const refreshTemplates = async () => {
    try {
      const names = await listTemplates();
      setTemplates(names);
      setSelectedTemplate((prev) => prev || names[0] || "");
    } catch (_error) {
      setStatus("Не удалось загрузить список шаблонов.");
    }
  };

  useEffect(() => {
    refreshTemplates();
  }, []);

  const handleExportJson = () => {
    setText(JSON.stringify(buildExportData({ nodes, walls, scale, grid, wallThickness }), null, 2));
  };

  const handleExportYaml = () => {
    setText(serializeToYaml(buildExportData({ nodes, walls, scale, grid, wallThickness })));
  };

  const handleImport = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch (_error) {
      data = parseYaml(trimmed);
    }
    const normalized = normalizeImportData(data);
    if (!normalized) {
      setStatus("Не удалось импортировать. Проверьте формат.");
      return;
    }
    onApplyData(normalized);
    setStatus("Импорт выполнен.");
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    try {
      await saveTemplate(name, buildExportData({ nodes, walls, scale, grid, wallThickness }));
      localStorage.setItem(LAST_TEMPLATE_NAME_STORAGE_KEY, name);
      setStatus("Шаблон сохранен.");
      setTemplateName("");
      refreshTemplates();
    } catch (_error) {
      setStatus("Не удалось сохранить шаблон.");
    }
  };

  const handleLoadTemplate = async () => {
    if (!selectedTemplate) return;
    try {
      const data = await loadTemplate(selectedTemplate);
      const normalized = normalizeImportData(data);
      if (!normalized) {
        setStatus("Шаблон поврежден.");
        return;
      }
      onApplyData(normalized);
      localStorage.setItem(LAST_TEMPLATE_NAME_STORAGE_KEY, selectedTemplate);
      setStatus("Шаблон загружен.");
    } catch (_error) {
      setStatus("Не удалось загрузить шаблон.");
    }
  };

  return (
    <div className="io-panel">
      <div className="tool-group">
        <button onClick={handleExportJson}>Экспорт JSON</button>
        <button onClick={handleExportYaml}>Экспорт YAML</button>
        <button onClick={handleImport}>Импорт</button>
      </div>
      <div className="tool-group">
        <label>
          Шаблон
          <input
            type="text"
            placeholder="Название"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
          />
        </label>
        <button onClick={handleSaveTemplate}>Сохранить шаблон</button>
        <select
          value={selectedTemplate}
          onChange={(event) => setSelectedTemplate(event.target.value)}
        >
          <option value="">Выберите шаблон</option>
          {templates.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button onClick={handleLoadTemplate}>Загрузить шаблон</button>
      </div>
      <textarea
        rows={6}
        placeholder="JSON или YAML плана появится здесь"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {status ? <div className="status-message">{status}</div> : null}
    </div>
  );
}
