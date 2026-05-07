/**
 * Pre-deploy validation script.
 * Catches deployment-killing issues before the deploy button is pressed.
 * Exits with code 1 if any hard blocker is found.
 *
 * Usage: npx tsx scripts/pre-deploy-check.ts [--tsc]
 */
import { existsSync, readFileSync } from "fs";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";

let passed = 0;
let failed = 0;
let warned = 0;

function pass(label: string, detail?: string) {
  console.log(`  ${GREEN}✓${RESET} ${label}${detail ? ` — ${detail}` : ""}`);
  passed++;
}
function fail(label: string, detail?: string) {
  console.log(`  ${RED}✗${RESET} ${BOLD}${label}${RESET}${detail ? ` — ${detail}` : ""}`);
  failed++;
}
function warn(label: string, detail?: string) {
  console.log(`  ${YELLOW}⚠${RESET} ${label}${detail ? ` — ${detail}` : ""}`);
  warned++;
}
function section(title: string) {
  console.log(`\n${CYAN}${BOLD}${title}${RESET}`);
}

// ── CUSTOMIZE THESE ────────────────────────────────────────────────────────
const HARD_REQUIRED = [
  { key: "DATABASE_URL", reason: "PostgreSQL connection" },
  { key: "JWT_SECRET", reason: "API auth token signing" },
  { key: "CREDENTIAL_ENCRYPTION_KEY", reason: "AES-256-GCM credential encryption" },
];

const FEATURE_SECRETS = [
  { key: "OPENAI_API_KEY", reason: "AI bot conversations + Liberator vision extraction" },
  { key: "ELEVENLABS_API_KEY", reason: "Vera AI Receptionist voice" },
  { key: "REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE", reason: "Liberator headless browser" },
  { key: "GODADDY_WEBHOOK_SECRET", reason: "GoDaddy billing webhook verification" },
];

const OPTIONAL_SECRETS = [
  { key: "GODADDY_PAYMENT_LINK_SINGLE", reason: "GoDaddy billing — Single tier" },
  { key: "GODADDY_PAYMENT_LINK_TEAM", reason: "GoDaddy billing — Team tier" },
  { key: "GODADDY_PAYMENT_LINK_ENTERPRISE", reason: "GoDaddy billing — Enterprise tier" },
];

// ── CHECKS ─────────────────────────────────────────────────────────────────
section("1. Required Secrets (Hard Blockers)");
for (const { key, reason } of HARD_REQUIRED) {
  process.env[key] ? pass(key, reason) : fail(key, `${reason} — server will refuse to start`);
}

section("2. Feature Secrets (Graceful Degradation)");
for (const { key, reason } of FEATURE_SECRETS) {
  process.env[key] ? pass(key, reason) : warn(key, `${reason} — feature will be disabled`);
}

section("3. Optional Secrets");
for (const { key, reason } of OPTIONAL_SECRETS) {
  process.env[key] ? pass(key, reason) : warn(key, `${reason} — optional, skipped`);
}

section("4. Deployment Configuration (.replit)");
try {
  const replit = readFileSync(".replit", "utf-8");
  replit.includes("run") ? pass(".replit run command", "found") : fail(".replit run command", "missing — deployment will not start");
  replit.includes("build") ? pass(".replit build command", "found") : warn(".replit build command", "not found");
} catch {
  fail(".replit file", "could not read");
}

section("5. Build Output");
const apiBuild = "artifacts/api-server/dist/index.cjs";
const galaxybotsBuild = "artifacts/galaxybots/dist/index.html";
const liberatorBuild = "artifacts/liberator/dist/index.html";

existsSync(apiBuild)
  ? pass(apiBuild, `exists (${(readFileSync(apiBuild).length / 1024 / 1024).toFixed(1)} MB)`)
  : warn(apiBuild, "not found — run pnpm build before deploying");
existsSync(galaxybotsBuild)
  ? pass(galaxybotsBuild, "client build present")
  : warn(galaxybotsBuild, "client build missing");
existsSync(liberatorBuild)
  ? pass(liberatorBuild, "client build present")
  : warn(liberatorBuild, "client build missing");

section("6. TypeScript Check");
const runTsc = process.argv.includes("--tsc");
if (!runTsc) {
  warn("TypeScript check skipped", "pass --tsc flag to enable");
} else {
  const { execSync } = await import("child_process");
  try {
    execSync("pnpm -r exec tsc --noEmit 2>&1", { stdio: "pipe", timeout: 180_000 });
    pass("TypeScript", "no type errors");
  } catch (err: any) {
    const count = (err.stdout?.toString().match(/error TS/g) || []).length;
    warn("TypeScript", `${count} type error(s) — review before deploying`);
  }
}

// ── SUMMARY ────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}─────────────────────────────────────────${RESET}`);
console.log(`${GREEN}${passed} passed${RESET}  ${YELLOW}${warned} warnings${RESET}  ${RED}${failed} failed${RESET}`);

if (failed > 0) {
  console.log(`\n${RED}${BOLD}✗ Pre-deploy check FAILED — fix blockers before deploying.${RESET}`);
  process.exit(1);
} else if (warned > 0) {
  console.log(`\n${YELLOW}⚠ Passed with warnings — review before deploying.${RESET}`);
} else {
  console.log(`\n${GREEN}${BOLD}✓ All checks passed — safe to deploy.${RESET}`);
}
