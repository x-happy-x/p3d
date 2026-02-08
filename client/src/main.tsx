import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.scss";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing root element");
}

const root = createRoot(rootElement);
root.render(<App />);
