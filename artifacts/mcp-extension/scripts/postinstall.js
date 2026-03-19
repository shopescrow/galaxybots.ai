#!/usr/bin/env node

"use strict";

const { execSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function c(color, text) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function isMcpbAvailable() {
  try {
    const result = spawnSync("mcpb", ["--version"], { encoding: "utf8", timeout: 5000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

function buildExtension() {
  console.log("");
  console.log(c("cyan", "  [GalaxyBots] Running post-install build step..."));

  if (!isMcpbAvailable()) {
    console.log(c("yellow", "  ⚠ mcpb CLI not found — skipping .mcpb package build."));
    console.log(c("dim", "    To build the installable .mcpb package, install the Anthropic mcpb CLI:"));
    console.log(c("dim", "    https://docs.anthropic.com/claude/desktop-extensions"));
    console.log(c("dim", "    Then run: mcpb build"));
    console.log("");
    console.log(c("green", "  ✓ Source files are ready. Extension will work via manifest.json in Claude Desktop."));
    return;
  }

  const manifestPath = path.join(__dirname, "..", "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(c("red", "  ✗ manifest.json not found. Cannot build extension."));
    process.exit(1);
  }

  console.log(c("dim", "  Running: mcpb build"));

  try {
    execSync("mcpb build", {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
      timeout: 60000,
    });
    console.log(c("green", "  ✓ Extension built successfully! Look for the .mcpb file in the dist/ directory."));
    console.log(c("dim", "    Double-click the .mcpb file to install it in Claude Desktop."));
  } catch (err) {
    console.error(c("red", `  ✗ Build failed: ${err.message}`));
    console.error(c("dim", "    Try running 'mcpb build' manually from the extension directory."));
    process.exit(1);
  }
}

buildExtension();
