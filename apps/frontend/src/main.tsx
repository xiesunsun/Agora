import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BlackboardApp } from "./app/BlackboardApp";
import "./styles/global.css";

if ("fonts" in document) {
  document.fonts.ready.then(() => {
    document.documentElement.dataset.fonts = "ready";
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BlackboardApp />
  </StrictMode>,
);
