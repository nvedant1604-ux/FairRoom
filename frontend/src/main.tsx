import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { BuildingProvider } from "./context/BuildingContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BuildingProvider><App /></BuildingProvider>
  </React.StrictMode>
);
