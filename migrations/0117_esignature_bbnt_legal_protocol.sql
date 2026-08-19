-- Migration 0117: Paperless Smart e-Signature & Legal PKI BBNT Protocol (Module M84)
CREATE TABLE IF NOT EXISTS engineering_esign_envelopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    document_type TEXT NOT NULL, -- BBNT | RFA | MATERIAL_APPROVAL | METHOD_STATEMENT | SAFETY_PERMIT
    reference_id BIGINT,
    reference_code TEXT,
    status TEXT NOT NULL DEFAULT 'draft', -- draft | pending | signed | rejected | cancelled
    document_hash TEXT NOT NULL,
    document_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_engineering_esign_envelopes_project ON engineering_esign_envelopes(project_id);
CREATE INDEX IF NOT EXISTS idx_engineering_esign_envelopes_status ON engineering_esign_envelopes(project_id, status);

CREATE TABLE IF NOT EXISTS engineering_esign_signatories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES engineering_esign_envelopes(id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    signer_name TEXT NOT NULL,
    signer_role TEXT NOT NULL, -- CONTRACTOR_ENGINEER | SUPERVISION_CONSULTANT | PROJECT_MANAGER | CLIENT_REP
    signing_order INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'waiting', -- waiting | ready | signed | rejected
    signature_data TEXT,
    otp_code TEXT,
    otp_expires_at TIMESTAMPTZ,
    signed_at TIMESTAMPTZ,
    ip_address TEXT,
    geo_location JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engineering_esign_signatories_envelope ON engineering_esign_signatories(envelope_id);
CREATE INDEX IF NOT EXISTS idx_engineering_esign_signatories_project ON engineering_esign_signatories(project_id);

CREATE TABLE IF NOT EXISTS engineering_esign_audit_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES engineering_esign_envelopes(id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    certificate_code TEXT NOT NULL UNIQUE,
    merkle_leaf_hash TEXT NOT NULL,
    tamper_proof_token TEXT NOT NULL,
    legal_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    signatory_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engineering_esign_audit_certificates_project ON engineering_esign_audit_certificates(project_id);

ALTER TABLE engineering_esign_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_esign_signatories ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_esign_audit_certificates ENABLE ROW LEVEL SECURITY;

DO  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_esign_envelopes_project_scope') THEN
        CREATE POLICY engineering_esign_envelopes_project_scope ON engineering_esign_envelopes
            USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_esign_signatories_project_scope') THEN
        CREATE POLICY engineering_esign_signatories_project_scope ON engineering_esign_signatories
            USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_esign_audit_certificates_project_scope') THEN
        CREATE POLICY engineering_esign_audit_certificates_project_scope ON engineering_esign_audit_certificates
            USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
    END IF;
END ;
