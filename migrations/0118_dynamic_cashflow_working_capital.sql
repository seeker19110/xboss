-- Migration 0118: Dynamic Cashflow & Working Capital Simulation Engine (Module M85)
CREATE TABLE IF NOT EXISTS engineering_cashflow_forecast_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    run_name TEXT NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_contract_value NUMERIC(15,2) NOT NULL,
    advance_percent NUMERIC(5,2) NOT NULL DEFAULT 15.00,
    retention_percent NUMERIC(5,2) NOT NULL DEFAULT 5.00,
    payment_delay_days INT NOT NULL DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'completed',
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engineering_cashflow_runs_project ON engineering_cashflow_forecast_runs(project_id);

CREATE TABLE IF NOT EXISTS engineering_cashflow_period_projections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES engineering_cashflow_forecast_runs(id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    period_index INT NOT NULL,
    period_label TEXT NOT NULL,
    projected_earned_value NUMERIC(15,2) NOT NULL DEFAULT 0,
    projected_cash_in NUMERIC(15,2) NOT NULL DEFAULT 0,
    projected_cash_out NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_cash_flow NUMERIC(15,2) NOT NULL DEFAULT 0,
    cumulative_cash_flow NUMERIC(15,2) NOT NULL DEFAULT 0,
    working_capital_gap NUMERIC(15,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_engineering_cashflow_projections_run ON engineering_cashflow_period_projections(run_id);
CREATE INDEX IF NOT EXISTS idx_engineering_cashflow_projections_project ON engineering_cashflow_period_projections(project_id);

CREATE TABLE IF NOT EXISTS engineering_working_capital_risks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES engineering_cashflow_forecast_runs(id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    risk_level TEXT NOT NULL DEFAULT 'LOW', -- LOW | MEDIUM | HIGH | CRITICAL
    dip_period TEXT,
    max_deficit_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    mitigation_recommendation TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engineering_working_capital_risks_project ON engineering_working_capital_risks(project_id);

ALTER TABLE engineering_cashflow_forecast_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_cashflow_period_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_working_capital_risks ENABLE ROW LEVEL SECURITY;

DO  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_cashflow_forecast_runs_project_scope') THEN
        CREATE POLICY engineering_cashflow_forecast_runs_project_scope ON engineering_cashflow_forecast_runs
            USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_cashflow_period_projections_project_scope') THEN
        CREATE POLICY engineering_cashflow_period_projections_project_scope ON engineering_cashflow_period_projections
            USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_working_capital_risks_project_scope') THEN
        CREATE POLICY engineering_working_capital_risks_project_scope ON engineering_working_capital_risks
            USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
    END IF;
END ;
