-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DRAFT');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "RunActionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "department" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "priority_tier" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "triggered_by_id" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
    "outcome" TEXT,
    "inputs" JSONB NOT NULL,
    "definition_snapshot" JSONB NOT NULL,
    "connection_id" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "extracted" JSONB,
    "results" JSONB,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "report" JSONB,
    "error" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DOUBLE PRECISION,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_actions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "action_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "RunActionStatus" NOT NULL DEFAULT 'PENDING',
    "detail" JSONB NOT NULL DEFAULT '{}',
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "run_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_connections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "is_simulated" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "authorized_resources" TEXT[],
    "permissions" TEXT[],
    "last_activity_at" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "data_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "max_concurrent_runs" INTEGER NOT NULL DEFAULT 3,
    "max_connections_per_source" INTEGER NOT NULL DEFAULT 5,
    "spend_cap_usd" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "spend_window_days" INTEGER NOT NULL DEFAULT 30,
    "timeout_seconds" INTEGER NOT NULL DEFAULT 180,
    "default_priority_tier" TEXT NOT NULL DEFAULT 'STANDARD',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resource_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agents_organization_id_archived_at_idx" ON "agents"("organization_id", "archived_at");

-- CreateIndex
CREATE INDEX "agent_runs_organization_id_started_at_idx" ON "agent_runs"("organization_id", "started_at");

-- CreateIndex
CREATE INDEX "agent_runs_agent_id_status_idx" ON "agent_runs"("agent_id", "status");

-- CreateIndex
CREATE INDEX "run_actions_organization_id_status_idx" ON "run_actions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "run_actions_run_id_idx" ON "run_actions"("run_id");

-- CreateIndex
CREATE INDEX "data_connections_organization_id_idx" ON "data_connections"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_policies_organization_id_key" ON "resource_policies"("organization_id");

-- CreateIndex
CREATE INDEX "platform_logs_organization_id_createdAt_idx" ON "platform_logs"("organization_id", "createdAt");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_actions" ADD CONSTRAINT "run_actions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_actions" ADD CONSTRAINT "run_actions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_connections" ADD CONSTRAINT "data_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_policies" ADD CONSTRAINT "resource_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_logs" ADD CONSTRAINT "platform_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
