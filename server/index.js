import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

const app = express();
const port = process.env.PORT || 3001;
const storagePath = path.resolve("./storage/templates.json");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function readTemplates() {
  if (!fs.existsSync(storagePath)) {
    return {};
  }
  const raw = fs.readFileSync(storagePath, "utf-8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function writeTemplates(templates) {
  const dir = path.dirname(storagePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(storagePath, JSON.stringify(templates, null, 2));
}

function normalizeName(name) {
  return String(name || "").trim();
}

function isValidTemplateData(data) {
  if (!data || typeof data !== "object") return false;
  const planShape = Array.isArray(data.nodes) && Array.isArray(data.walls);
  const legacyShape = Array.isArray(data.rooms);
  return planShape || legacyShape;
}

app.get("/api/templates", (req, res) => {
  const templates = readTemplates();
  res.json({ names: Object.keys(templates) });
});

app.get("/api/templates/:name", (req, res) => {
  const templates = readTemplates();
  const name = normalizeName(req.params.name);
  if (!templates[name]) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json({ name, data: templates[name] });
});

app.post("/api/templates", (req, res) => {
  const { name, data } = req.body || {};
  const normalized = normalizeName(name);
  if (!normalized) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  if (!isValidTemplateData(data)) {
    res.status(400).json({ error: "Invalid template data" });
    return;
  }
  const templates = readTemplates();
  templates[normalized] = data;
  writeTemplates(templates);
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Template server running on http://localhost:${port}`);
});
