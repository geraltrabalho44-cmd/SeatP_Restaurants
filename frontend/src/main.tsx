// Entry point: loads the design system once, then mounts the app.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { I18nProvider } from "./i18n/I18nProvider";
import { ToastProvider } from "./design/components";
// Order matters: tokens first, because every later stylesheet reads them.
import "./design/tokens.css";
import "./design/base.css";
import "./design/components.css";
import "./design/restaurant-theme.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("index.html must contain <div id=\"root\">");

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider><ToastProvider>
        <App />
      </ToastProvider></I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
