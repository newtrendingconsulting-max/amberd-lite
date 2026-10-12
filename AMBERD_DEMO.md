# Amberd Lite — Hackathon Demo Guide

**Amberd Lite — Give every AI agent a place to run — safely, and in full view.**

Local URL: http://localhost:3000 · sign in as `owner@example.com` / `Password123!`

## Before the judges arrive

1. Make sure Docker Desktop is running and the app is up (http://localhost:3000 loads).
2. Sign in as `owner@example.com` / `Password123!`. Use a full-screen browser window.
3. Click through every sidebar item once so each page is warm.

## Click-by-click walkthrough (about 6 minutes)

**1. Dashboard (Overview → Dashboard).** Point at agent operations, execution metrics, AI spending, the
illustrative Infrastructure card, and the Alerts list. Click any card, agent, or alert to drill in.

**2. Agents (Operations → Agents).** One table for every agent: department, model, status, last run,
runs, cost. Click **Invoice Audit Agent**.

**3. Agent details (Overview & run tab, scroll down).** Sections A–I are laid out read-only; *Edit configuration* opens the builder. Highlight: **A Identity**, **B LLM** (Claude Opus 5.5, shows
*Available*), **E Data Inputs** (Finance Document Repository, `purchase-orders` + `invoices`, read-only),
**G Conditions** (`IF discrepancy_amount greater than {{discrepancy_threshold}}` → flag, report, notify;
ELSE → passed, confirmation), **H Actions**, **I Resource Limits** (four *Enforced* badges).

**4. JSON definition tab.** Same definition as JSON — schema-validated, no code allowed.
Mention **Export** / **Import JSON** in the toolbar.

**5. Data Connections (Infrastructure).** On *Finance Document Repository* click **Browse resources** →
click `PO-2026-1042` to preview it. Click **Try to list hr-confidential/** → red 🔒 denial from the server.

**6. Run it (Agents → Invoice Audit Agent → Overview & run).** Purchase order: `PO-2026-1042`. Supplier invoice:
`INV-2026-2087`. Threshold: `0`. Click **Run agent** (about 5–10 seconds, real Claude call).

**7. Run detail (opens automatically).** Top: *Succeeded · Flagged*, duration, model, tokens, cost.
Yellow box: **$700.00 overbilling detected**. Walk the report rows (unit price $850 → $920). On the right,
the **Execution timeline**. Below: **Conditions evaluated** (`700 greater than 0` → TRUE) and
**Actions generated** — Flag invoice, Generate discrepancy report, Notify finance admins, Save audit
result — all *Completed* automatically, no human step. Bell icon shows the notification.

**8. Matching invoice.** Back to the agent → Overview & run → `PO-2026-1042` + `INV-2026-2091` → **Run agent**
→ green **Invoice matches purchase order**, audit passed.

**9. Runs (Operations → Runs).** Every execution with status, outcome, duration, tokens, cost.

**10. Create a new agent (Agents → Create agent, or Templates → Use template).** Rename it, show
the builder sections, click **Create agent**. Point out any team can build their own agent.

**11. Govern & monitor.** **GPU & Resources** (clearly marked *Illustrative*), **Resource Policies**
(what is enforced), **Costs** (by agent, department, model; spend cap), **Logs** (full audit trail).

## 90-second pitch

> Every enterprise is about to run hundreds of AI agents. The hard part isn't building one — it's running
> them safely: which data can they touch, which model do they use, what do they cost, and who signs off
> when they find something?
>
> This is Amberd Lite. *(Dashboard)* One control center for every agent, run, and dollar.
>
> **Build.** Here's an Invoice Audit Agent, configured without code: its model, its inputs, its rules,
> its actions, its limits. The same definition is plain JSON you can version, export, and import.
>
> **Connect.** Agents only reach data through governed connectors. This finance repository grants
> purchase orders and invoices — and watch: HR files are denied by the server before any model sees them.
>
> **Execute.** I pick a purchase order and a supplier invoice and run it. Claude reads both documents
> and extracts the facts; Amberd Lite then does the arithmetic in code — never trusting the model with the
> math. Result: a $700 overbilling, flagged, with a full audit report.
>
> **Govern.** Because the discrepancy crossed the threshold, Amberd Lite's rule engine flagged the invoice,
> generated the report, and notified finance — automatically, with every step audited.
>
> **Monitor.** Every run is traced: timeline, tokens, latency, real cost. Spend caps, concurrency, and
> timeouts are enforced by the engine. And any team can create its own agent the same way.
>
> Amberd Lite isn't just where enterprises create AI agents. It's where they run, secure, control, and
> monitor them.

## What is real vs. illustrative

| Real and working | Configuration only / illustrative |
| --- | --- |
| Agent builder (visual + JSON), validation, import/export, duplicate, activate | Scheduled & continuous triggers (saved, no scheduler running) |
| Generic execution engine with persisted runs and timelines | Google Drive, database, API, object-storage connectors (not configured) |
| Local Enterprise Document Connector with server-side permissions (simulated enterprise repository) | GPU pools, utilization, and per-workload GPU share (static demo data) |
| Real Anthropic model calls with structured output (once the API key is set) | Priority tiers (recorded, no GPU scheduler) |
| Deterministic reconciliation, conditions, automated actions, notifications | YAML semantic layer (example only) |
| Enforced limits: concurrency, timeout, data resources per run, spend caps, agents per data source | OpenAI / Gemini / open models (listed, not integrated) |
| Costs from real token usage × published prices; in-app notifications; audit logs | |

## Acceptance tests

`pnpm --filter @app-starter/api exec jest src/amberd` runs the automated Invoice Audit acceptance tests
(discrepancy, matching invoice, unauthorized resource, missing document, model failure).
