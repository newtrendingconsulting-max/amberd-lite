# Amberd Lite — Hackathon Submission

**Give every AI agent a place to run — safely, and in full view.**

Amberd Lite is an enterprise AI agent control platform: build agents without code (or as JSON), connect them to
governed enterprise data, execute them on a real LLM, enforce resource policies, and monitor every run,
token, and dollar.

## What is real in this build

- **Agent builder** — visual no-code configuration and a synchronized, schema-validated JSON definition
  (identity, LLM, trigger, variables, data inputs, compute, conditions, actions, resource limits).
  Create, edit, duplicate, activate/deactivate, import/export.
- **Execution engine** — loads the definition, validates inputs, enforces governance limits, retrieves
  authorized documents through a connector, calls **Claude Opus 5.5** with structured output, validates
  the output, runs deterministic backend checks, evaluates IF/THEN conditions in code, and executes actions.
- **Invoice Audit Agent** — Claude extracts the purchase order and invoice; Amberd Lite computes every
  discrepancy in code (never trusting the model with arithmetic) and lists each one with expected value,
  actual value, and source document. Detects the intentional **$700 overbilling** with no human step.
- **Audit report** — shown in the run, downloadable as **PDF**, and **emailed automatically** to the
  recipients configured on the agent (or typed on the Run screen) with the PDF attached. Delivery status
  is recorded per recipient in the run history.
- **Governance** — enforced concurrency limits, timeouts, per-run data limits, and rolling spend caps.
- **Observability** — runs, timelines, tokens, real cost from published prices, alerts, audit logs.
- Built on a multi-tenant NestJS + Next.js + PostgreSQL starter: authentication, organizations, roles.

## Illustrative / not yet connected (clearly labeled in the app)

GPU pools and utilization; scheduled and continuous triggers (saved, no scheduler running); Google Drive,
Snowflake, Databricks, Salesforce, databases, ERP and object storage connectors (not connected in this
build — the demo uses the Local Enterprise Document Connector, a working sample repository with
server-side permissions); non-Anthropic models.

## Run it locally

Requirements: Node 22, pnpm, Docker Desktop.

```bash
pnpm bootstrap          # installs, starts Postgres/Redis/Mailpit, migrates, seeds
pnpm dev                # web http://localhost:3000 · API http://localhost:3001
```

In `apps/api/.env` set `ANTHROPIC_API_KEY`, and SMTP settings for real email (any SMTP provider, e.g.
Brevo: `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASSWORD`,
`SMTP_FROM_EMAIL`). Without SMTP, email lands in the local Mailpit inbox at http://localhost:8025.

Sign in: `owner@example.com` / `Password123!`

## Demo (3 minutes)

1. **Dashboard** — agents, runs, success rate, spend, alerts. Click any card to drill in.
2. **Agents → Invoice Audit Agent** — the full configuration (sections A–I) and JSON definition.
3. **Overview & run** — the purchase order `PO-2026-1042` and invoice `INV-2026-2087` are preselected;
   click **Run agent**.
4. The run opens: **$700.00 overbilling detected**, discrepancy table (expected $850 vs actual $920),
   timeline, conditions evaluated, and actions generated. Click **Download PDF** for the report.
   (With SMTP configured and a recipient entered, the report is also emailed with the PDF attached.)
5. **Runs**, **Costs**, **Resource Policies**, **Logs** — every execution, token, and dollar.
6. **Agents → Create agent** — build a new agent from scratch or from **Templates**.

## Tests

`pnpm verify` — type-check, lint, and 400+ tests, including the Invoice Audit acceptance tests
(discrepancy, matching invoice, unauthorized document, missing document, model failure, email delivery).
