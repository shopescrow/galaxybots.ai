import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installGlobalErrorReporter } from "./services/guardian-reporter";

installGlobalErrorReporter();

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

if (import.meta.env.DEV) {
  import("@axe-core/react").then(({ default: axe }) => {
    import("react").then((React) => {
      import("react-dom").then((ReactDOM) => {
        axe(React, ReactDOM, 1000);
      });
    });
  });
}
