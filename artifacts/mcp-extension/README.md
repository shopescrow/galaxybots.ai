# GalaxyBots AI Directors — Claude Desktop Extension

**Fortune 500 Intelligence. For Everyone.**

Deploy an entire AI executive team — CFO, CMO, COO, Legal, HR, and more — directly in Claude Desktop. One file. Double-click. Done.

---

## One-Click Installation

### Step 1: Download

Download the latest `galaxybots-ai-directors.mcpb` file from:
**https://galaxybots.ai/claude-extension**

### Step 2: Install

**macOS / Windows / Linux:** Double-click the `.mcpb` file.

Claude Desktop will open an installation prompt. Click **Install**.

### Step 3: Start Using (No API Key Required)

Open a new Claude conversation and try:

```
List my available GalaxyBots AI Directors
```

You get **3 free trial calls** with no account needed.

### Step 4: Get Full Access

Visit **https://galaxybots.ai/api-access** to create an account and get your API key. Then:

1. Open Claude Desktop → Settings → Extensions → GalaxyBots AI Directors
2. Paste your API key (format: `gb_live_...`) into the **GalaxyBots API Key** field
3. Optionally choose a **Default Department** to open sessions in

---

## AI Director Departments

| Department | Director | Title | Specialty |
|---|---|---|---|
| Executive | Optima Prime | CEO / Chief Orchestrator | Team assembly, strategic planning, cross-department coordination |
| Finance | FinBot Forte | CFO | Budgeting, forecasting, financial modeling, ROI analysis |
| Marketing | MarketMind Max | CMO | Brand strategy, campaigns, content, market positioning |
| Operations | OpsBot Olivia | COO | Process design, logistics, supply chain, efficiency |
| Legal | LexBot Lara | CLO | Contract review, compliance, regulatory guidance |
| HR | HRBot Hana | CHRO | Talent acquisition, culture, performance, people strategy |
| Sales | SalesBot Sterling | CRO | Pipeline, proposals, negotiation, revenue growth |
| Technology | TechBot Tara | CTO | Architecture, engineering, product development, security |
| Strategy | StratBot Shaw | CSO | Competitive analysis, market entry, long-term planning |

---

## Example Prompts

### Consult a Specific Director

```
Ask FinBot Forte to review our Q3 financials and identify three areas to reduce overhead.
```

```
Have LexBot Lara check this vendor contract for unfavorable terms.
```

```
Ask MarketMind Max to draft a go-to-market strategy for our EU expansion.
```

### Assemble a Task Team

```
Analyze this task: We need to launch a new SaaS product in 90 days. Which AI Directors should lead this?
```

```
Create a task session for our annual budget planning with FinBot Forte, StratBot Shaw, and OpsBot Olivia.
```

### AEO Intelligence (AI Search Visibility)

```
What is the Cloud 9 AEO score for our website, example.com?
```

```
Run an AEO scan on example.com and give me the top 5 recommendations to improve our AI search visibility.
```

```
Compare AEO scores for example.com, competitor1.com, and competitor2.com.
```

### ROI & Pricing

```
Calculate the ROI of replacing 5 executive hires with GalaxyBots AI Directors at $200,000 average salary.
```

```
What GalaxyBots plan is right for a 250-person company with $15M in annual revenue?
```

```
Generate an ROI report I can share with my board.
```

---

## Available Tools

| Tool | Description | Access |
|---|---|---|
| `list_bots` | List all AI Directors | Free trial |
| `get_bot` | Get Director profile | Free trial |
| `send_message_to_bot` | Consult any Director | Full access |
| `analyze_task` | Get team recommendation | Full access |
| `create_task_session` | Launch Task Room | Full access |
| `list_task_sessions` | View session history | Full access |
| `memory_search` | Search Director memory | Full access |
| `pm_get_score` | AEO Cloud 9 score | Full access |
| `pm_request_scan` | Request AEO scan | Full access |
| `pm_get_recommendations` | AEO recommendations | Full access |
| `pm_compare_urls` | Compare AEO scores | Full access |
| `calculate_roi` | ROI calculator | Free trial |
| `get_pricing_recommendation` | Pricing guidance | Free trial |
| `generate_roi_report` | Shareable ROI report | Free trial |
| `request_demo` | Book a live demo | Free trial |

---

## Pricing

| Plan | Price | Directors | AEO Scans | Support |
|---|---|---|---|---|
| Starter | $299/mo | 3 Directors | 50 scans/mo | Email |
| Growth | $799/mo | 9 Directors | 250 scans/mo | Priority |
| Enterprise | $2,499/mo | All Directors + custom | Unlimited | Dedicated CSM |
| White Label | Custom | All Directors | Unlimited | Full reseller rights |

Free trial: 3 API calls, no credit card required.
Book a demo: **https://calendly.com/galaxybots/demo**

---

## Troubleshooting

### Extension not appearing in Claude Desktop

- Make sure you are running Claude Desktop version 0.8.0 or later
- Try re-opening Claude Desktop after installation
- On macOS, check System Settings → Privacy & Security if prompted

### "Invalid API key" error

- Verify your key starts with `gb_live_`
- Check for accidental whitespace when pasting
- Confirm your account is active at https://galaxybots.ai/dashboard

### "Rate limit exceeded" error

- Wait a few minutes and retry, or upgrade your plan at https://galaxybots.ai/api-access

### Connection issues (remote server)

- Check your internet connection
- Verify the GalaxyBots service status at https://status.galaxybots.ai
- If you need offline/local use, contact support for a local stdio configuration

### Log files

Logs are written to: `~/.gifted-productions/logs/`

---

## Development / Local Mode

For developers who want to run the MCP server locally (stdio mode):

```bash
# Install server dependencies
cd server && npm install

# Set your API key
export MCP_API_KEY=gb_live_your_key_here

# Run the local server
npm start
```

Claude Desktop will use the `dev_server` configuration from `manifest.json` when running in development mode.

---

## Support

- Documentation: **https://galaxybots.ai/docs**
- Support: **https://galaxybots.ai/support**
- Status page: **https://status.galaxybots.ai**
- Email: **support@galaxybots.ai**
- Book a demo: **https://calendly.com/galaxybots/demo**

---

*GalaxyBots AI Directors is a product of GalaxyBots.ai. All AI Director interactions are logged for quality and safety purposes. See our [Privacy Policy](https://galaxybots.ai/privacy) and [Terms of Service](https://galaxybots.ai/terms).*
