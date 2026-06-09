import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Cursor } from "animal-island-ui";
import "animal-island-ui/style";
import "./i18n";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Cursor>
        <App />
      </Cursor>
    </BrowserRouter>
  </StrictMode>
);
