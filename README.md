# Amberd Lite

**Give every AI agent a place to run — safely, and in full view.**

Amberd Lite is an enterprise AI agent control platform (hackathon MVP). Teams build agents without code —
or as validated JSON — connect them to governed enterprise data, run them on a real LLM (Claude), enforce
resource policies, and monitor every run, token, and dollar.

The demo agent is an **Invoice Audit Agent**: it compares a supplier invoice with its purchase order and
automatically detects a **$700 overbilling**, then produces an audit report you can download as a PDF.

![Stack](https://img.shields.io/badge/stack-Next.js%20·%20NestJS%20·%20PostgreSQL%20·%20Claude-0b1733)

---

## What it does

| Capability | What is real in this MVP |
| --- | --- |
| **Agent builder** | No-code configuration with a synchronized, schema-validated JSON definition: identity, LLM, trigger, variables, data inputs, compute, conditions, actions, resource limits. Create, edit, duplicate, activate/deactivate, import/export. |
| **Execution engine** | Validates the definition and inputs → enforces governance limits → reads authorized documents through a connector → calls **Claude** with structured output → validates the output → runs deterministic checks in code → evaluates IF/THEN conditions → executes actions → records the run. |
| **Invoice Audit Agent** | Claude extracts both documents; Amberd Lite computes every discrepancy **in code** (the model never does the arithmetic and is never told the answer), listing expected value, actual value, and source document. No human approval step. |
| **Audit report** | Shown in the run, downloadable as a **PDF**, and emailed automatically with the PDF attached when SMTP is configured. Per-recipient delivery status is stored in the run history. |
| **Governance** | Enforced: concurrency limits, execution timeouts, per-run data limits, rolling AI spend caps, agents per data source. |
| **Observability** | Dashboard, runs, execution timelines, token usage, cost from published model prices, alerts, audit logs. |
| **Platform** | Multi-tenant auth, organizations, and roles (built on a NestJS + Next.js starter). |

**Illustrative or not connected in this MVP (labeled in the app):** GPU pools and utilization, scheduled and
continuous triggers (saved, no scheduler), external connectors (Google Drive, Snowflake, Databricks,
Salesforce, databases, ERP, object storage), non-Anthropic models. The demo reads documents through the
**Local Enterprise Document Connector** — a working sample repository with server-side permission checks.

---

## Run it locally

### Requirements

- **Node.js 22+** and **pnpm** (`corepack enable` provides pnpm)
- **Docker Desktop** (runs PostgreSQL, Redis, and a local email inbox)
- An **Anthropic API key** — https://console.anthropic.com/settings/keys

### Setup

```bash
git clone <this-repository-url> amberd-lite
cd amberd-lite
pnpm bootstrap      # installs dependencies, starts Postgres/Redis/Mailpit, migrates, seeds demo data
```

Add your Anthropic key to `apps/api/.env` (this file is created by `pnpm bootstrap` and is git-ignored):

```bash
echo "ANTHROPIC_API_KEY=your-key-here" >> apps/api/.env
```

Start the app:

```bash
pnpm dev
```

| | |
| --- | --- |
| Web app | http://localhost:3000 |
| API | http://localhost:3001 (docs at `/api/docs`) |
| Local email inbox (Mailpit) | http://localhost:8025 |

Sign in with the seeded demo account: **owner@example.com / Password123!**

---

## Run the Invoice Audit Agent

1. Sign in and click **Agents** in the left sidebar, then **Invoice Audit Agent**.
2. On **Overview & run**, the documents are preselected:
   purchase order **PO-2026-1042** ($8,500) and supplier invoice **INV-2026-2087** ($9,200).
3. Click **Run agent**. After ~10 seconds the run opens:
   - **$700.00 overbilling detected** — unit price $850 on the PO vs $920 on the invoice
   - the discrepancy table (expected vs actual, with source documents)
   - the execution timeline, conditions evaluated, and actions generated
4. Click **Download PDF** to get the audit report.
5. Explore **Runs**, **Costs**, **Resource Policies**, and **Logs** for monitoring and governance, and
   **Agents → Create agent** to build a new agent from scratch or from a template.

The sample documents live in [`apps/api/enterprise-docs/`](apps/api/enterprise-docs).

### Optional: email the report

Set any SMTP provider in `apps/api/.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
`SMTP_FROM_EMAIL`), then enter recipients in **Edit configuration → H Actions → Email audit report** or on
the Run screen. Without SMTP settings, emails are captured by the local Mailpit inbox.

---

## Architecture

```
apps/api      NestJS API — agents, execution engine, connectors, governance, reports (src/amberd)
apps/web      Next.js web app — dashboard, agent builder, runs, governance pages
packages/shared  Agent definition schema + validator, templates, model catalog, API types
```

Key files:

- Agent definition schema and validator — `packages/shared/src/amberd/agent-definition.ts`
- Execution engine — `apps/api/src/amberd/engine/execution-engine.service.ts`
- Deterministic invoice reconciliation — `apps/api/src/amberd/engine/invoice-reconciliation.ts`
- Claude provider (structured output) — `apps/api/src/amberd/llm/anthropic.provider.ts`
- PDF report — `apps/api/src/amberd/reports/report-pdf.ts`

Security notes: API keys and SMTP credentials live only in server environment files (git-ignored) and are
never sent to the browser or the model. Every API call is scoped to the caller's organization, and
connectors check document permissions server-side before any content is read.

## Tests

```bash
pnpm verify    # type-check, lint, and the full test suite
```

Includes automated Invoice Audit acceptance tests: discrepancy detection, matching invoice, unauthorized
document, missing document, model failure, and email delivery.

## Credits

Built for a hackathon on top of the MIT-licensed [app-starter](https://github.com/digohq/app-starter)
(NestJS + Next.js multi-tenant starter; original README in [`docs/STARTER-README.md`](docs/STARTER-README.md)).
Powered by Claude (Anthropic).
