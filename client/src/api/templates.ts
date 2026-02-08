const rawBase = (import.meta.env.VITE_API_BASE || "http://localhost:3001").replace(/\/+$/, "");
const API_BASE = rawBase.endsWith("/api") ? rawBase.slice(0, -4) : rawBase;
export const LAST_TEMPLATE_NAME_STORAGE_KEY = "p3d.last-template-name";

const templatesUrl = (name?: string) => (
  name
    ? `${API_BASE}/api/templates/${encodeURIComponent(name)}`
    : `${API_BASE}/api/templates`
);

export async function listTemplates() {
  const res = await fetch(templatesUrl());
  if (!res.ok) throw new Error("Failed to list templates");
  const data = await res.json();
  return data.names || [];
}

export async function loadTemplate(name: string) {
  const res = await fetch(templatesUrl(name));
  if (!res.ok) throw new Error("Failed to load template");
  const data = await res.json();
  return data.data;
}

export async function saveTemplate(name: string, templateData: unknown) {
  const res = await fetch(templatesUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, data: templateData }),
  });
  if (!res.ok) throw new Error("Failed to save template");
  return res.json();
}
