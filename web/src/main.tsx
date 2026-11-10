import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/demo.css";
import "./styles/app.css";

// restore the saved theme before first paint of the app
try {
  const saved = localStorage.getItem("sb_theme");
  if (saved) document.documentElement.dataset.theme = saved;
} catch { /* storage unavailable */ }

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
