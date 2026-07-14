import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./theme.css";
import "./styles.css";

document.documentElement.dataset.theme = "yarju";

createRoot(document.getElementById("root")).render(<App />);
