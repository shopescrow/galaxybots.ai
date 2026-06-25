import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules/")) return;

          // Core React framework — always cached first
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "vendor-react";
          }
          // Routing & data layer — mounted at the app root
          // (@tanstack/ catches both react-query and its query-core dependency)
          if (
            id.includes("node_modules/wouter") ||
            id.includes("node_modules/@tanstack/")
          ) {
            return "vendor-router";
          }
          // Tiny class-name utilities used by nearly every component (incl. root).
          // Kept separate so the root never pulls a heavy vendor chunk for `cn()`.
          if (
            id.includes("node_modules/clsx") ||
            id.includes("node_modules/tailwind-merge") ||
            id.includes("node_modules/class-variance-authority")
          ) {
            return "vendor-utils";
          }
          // Radix UI primitives
          if (id.includes("node_modules/@radix-ui")) {
            return "vendor-radix";
          }
          // Icon sets — loaded with the pages that use them
          if (
            id.includes("node_modules/lucide-react") ||
            id.includes("node_modules/react-icons")
          ) {
            return "vendor-icons";
          }
          // Animation — loaded with the pages that animate, not the root.
          // motion-dom/motion-utils are framer-motion's own runtime deps; keep them
          // together so they don't leak onto the entry chunk.
          if (
            id.includes("node_modules/framer-motion") ||
            id.includes("node_modules/motion-dom") ||
            id.includes("node_modules/motion-utils")
          ) {
            return "vendor-motion";
          }
          // Charts — dashboards/analytics routes only (react-smooth is recharts' animator)
          if (
            id.includes("node_modules/recharts") ||
            id.includes("node_modules/react-smooth") ||
            id.includes("node_modules/victory-vendor") ||
            id.includes("node_modules/internmap") ||
            id.includes("node_modules/d3-")
          ) {
            return "vendor-charts";
          }
          // lodash — heavy CJS util pulled in transitively (recharts family, etc.).
          // Isolate it so it loads only with the routes that need it, never the root.
          if (id.includes("node_modules/lodash")) {
            return "vendor-lodash";
          }
          // Rich-text editor — document/proposal studios only
          if (
            id.includes("node_modules/@tiptap") ||
            id.includes("node_modules/prosemirror") ||
            id.includes("node_modules/lowlight") ||
            id.includes("node_modules/highlight.js")
          ) {
            return "vendor-editor";
          }
          // Flow diagram — process studio only
          if (id.includes("node_modules/@xyflow")) {
            return "vendor-flow";
          }
          // Forms & validation — auth/settings forms, not the landing
          if (
            id.includes("node_modules/react-hook-form") ||
            id.includes("node_modules/@hookform") ||
            id.includes("node_modules/zod") ||
            id.includes("node_modules/input-otp")
          ) {
            return "vendor-forms";
          }
          // Date utilities — calendars/pickers, not the landing
          if (
            id.includes("node_modules/date-fns") ||
            id.includes("node_modules/react-day-picker")
          ) {
            return "vendor-dates";
          }
          // Overlay / widget libraries — route-specific, never on the landing
          if (
            id.includes("node_modules/sonner") ||
            id.includes("node_modules/vaul") ||
            id.includes("node_modules/cmdk") ||
            id.includes("node_modules/embla-carousel") ||
            id.includes("node_modules/react-resizable-panels") ||
            id.includes("node_modules/next-themes")
          ) {
            return "vendor-overlay";
          }
          // Everything else — small, route-specific widgets
          return "vendor-misc";
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
