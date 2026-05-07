#!/usr/bin/env node

"use strict";

const os = require("os");
const fs = require("fs");
const path = require("path");

const REQUIRED_NODE_MAJOR = 18;
const CONFIG_DIR = path.join(os.homedir(), ".gifted-productions");
const LOGS_DIR = path.join(CONFIG_DIR, "logs");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  blue: "\x1b[34m",
  gold: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function c(color, text) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function printBanner() {
  console.log("");
  console.log(c("blue", "  ╔══════════════════════════════════════════════════════════╗"));
  console.log(c("blue", "  ║") + c("bold", "           GalaxyBots AI Directors                        ") + c("blue", "║"));
  console.log(c("blue", "  ║") + c("gold", "       Fortune 500 Intelligence. For Everyone.            ") + c("blue", "║"));
  console.log(c("blue", "  ╚══════════════════════════════════════════════════════════╝"));
  console.log("");
}

function checkNodeVersion() {
  const versionString = process.version;
  const major = parseInt(versionString.slice(1).split(".")[0], 10);

  if (major < REQUIRED_NODE_MAJOR) {
    console.error(c("red", `  ✗ Node.js ${REQUIRED_NODE_MAJOR}+ is required. You have ${versionString}.`));
    console.error(c("dim", `    Download the latest Node.js at https://nodejs.org`));
    process.exit(1);
  }

  console.log(c("green", `  ✓ Node.js ${versionString} detected (>= ${REQUIRED_NODE_MAJOR} required)`));
}

function createConfigDirectory() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
      console.log(c("green", `  ✓ Created config directory: ${CONFIG_DIR}`));
    } else {
      console.log(c("green", `  ✓ Config directory already exists: ${CONFIG_DIR}`));
    }

    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true, mode: 0o700 });
      console.log(c("green", `  ✓ Created logs directory: ${LOGS_DIR}`));
    } else {
      console.log(c("green", `  ✓ Logs directory already exists: ${LOGS_DIR}`));
    }
  } catch (err) {
    console.error(c("red", `  ✗ Failed to create config directory: ${err.message}`));
    process.exit(1);
  }
}

function writeDefaultConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    console.log(c("dim", `  - Config file already exists, skipping: ${CONFIG_FILE}`));
    return;
  }

  const defaultConfig = {
    default_department: "Executive",
    log_level: "info",
    telemetry: true,
    installed_at: new Date().toISOString(),
    version: "1.0.0",
  };

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), { mode: 0o600 });
    console.log(c("green", `  ✓ Created default config: ${CONFIG_FILE}`));
  } catch (err) {
    console.error(c("red", `  ✗ Failed to write config file: ${err.message}`));
  }
}

function printApiKeyInstructions() {
  console.log("");
  console.log(c("bold", "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(c("bold", "  Next Step: Add Your API Key"));
  console.log(c("bold", "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log("");
  console.log("  GalaxyBots AI Directors is installed and ready to connect.");
  console.log("");
  console.log("  " + c("gold", "FREE TRIAL") + " — No API key needed to get started.");
  console.log("  You get 3 free calls to explore the tools.");
  console.log("");
  console.log("  " + c("cyan", "TO GET FULL ACCESS:"));
  console.log("  1. Visit " + c("bold", "https://galaxybots.ai/api-access"));
  console.log("  2. Sign up and copy your API key (starts with " + c("dim", "gb_live_...") + ")");
  console.log("  3. In Claude Desktop, open the GalaxyBots extension settings");
  console.log("  4. Paste your API key into the " + c("bold", "GalaxyBots API Key") + " field");
  console.log("");
  console.log("  " + c("cyan", "BOOK A DEMO:"));
  console.log("  Ask Claude: " + c("dim", '"Use the request_demo tool to schedule a GalaxyBots demo"'));
  console.log("  Or visit: " + c("bold", "https://calendly.com/galaxybots/demo"));
  console.log("");
  console.log(c("bold", "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log("");
}

function printSuccess() {
  console.log(c("green", "  ✓ GalaxyBots AI Directors installed successfully!"));
  console.log("");
  console.log("  Open Claude Desktop and start with:");
  console.log(c("dim", '  "List my available GalaxyBots AI Directors"'));
  console.log("");
}

function main() {
  printBanner();
  console.log("  Setting up GalaxyBots AI Directors...");
  console.log("");

  checkNodeVersion();
  createConfigDirectory();
  writeDefaultConfig();
  printApiKeyInstructions();
  printSuccess();
}

main();
