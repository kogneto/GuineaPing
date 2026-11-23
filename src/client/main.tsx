import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// The typeface is bundled with the app, so no page view is reported to a font host.
import "@fontsource-variable/nunito";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
