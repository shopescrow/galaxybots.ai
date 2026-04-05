# GalaxyBots Frontend — Folder Structure

## Pages (`src/pages/`)

Organized by domain/feature. Each subdirectory contains page-level components.

| Directory | Pages |
|---|---|
| `activity/` | Activity stream |
| `analytics/` | Analytics dashboard |
| `auth/` | Login, Register, Forgot Password/Username, SSO callback |
| `billing/` | Billing management |
| `blog/` | Blog listing, blog post |
| `boardroom/` | AI Boardroom |
| `bots/` | Bot roster, bot detail, AI receptionist, CFO dashboard |
| `briefs/` | Intelligence briefs |
| `client-portal/` | Client-facing portal |
| `clients/` | Client management, detail tabs |
| `command-center/` | Command center |
| `compliance/` | Compliance dashboard |
| `demo/` | Book demo |
| `developers/` | Developer portal |
| `documents/` | Document studio |
| `general/` | Home, Assembly, Global, 404 |
| `governance/` | Governance |
| `marketing/` | How it Works, Pricing, Valuation |
| `settings/` | User settings, Org admin |
| … | (and more feature-specific directories) |

## Components (`src/components/`)

Organized by domain/feature. Shared UI primitives live in `ui/`.

| Directory | Purpose |
|---|---|
| `billing/` | Billing widget |
| `command/` | Command palette, AEO scan modal, keyboard shortcuts |
| `layout/` | AppLayout, Navbar, Sidebar, TopBar, LanguageSelector |
| `missions/` | Mission templates, save-as-template, tool step card |
| `notifications/` | Notification bell, dashboard feed |
| `ui/` | shadcn/ui primitives (button, card, dialog, etc.) |
| … | (and more feature-specific directories) |
