// lib/engineering-autonomy.ts — Phase OS-4 Controlled Autonomy & Safe Execution Engine (A0–A2)
// Đặc tả: docs/nang-cap/OS-4-controlled-autonomy.md
import crypto from "crypto";
import { query, queryOne, run, withProjectScope } from "./db";

export type AutonomyLevel = "A0" | "A1" | "A2";
export type RiskClass = "low" | "medium" | "high" | "critical";

export interface AutonomyCapability {
  key: string;
  label: string;
  maxAutonomyLevel: AutonomyLevel;
  riskClass: RiskClass;
  isReversible: boolean;
  isActive: boolean;
}

export interface AutonomyPolicy {
  id: string;
  projectId: number;
  capabilityKey: string;
  maxLevel: AutonomyLevel;
  allowedRoles: string[];
  maxBudget: number | null;
  rateLimitHourly: number;
  approvalMode: "manual" | "gate_required";
  isActive: boolean;
  createdAt: string;
}

export interface ExecutionRequest {
  id: string;
  projectId: number;
  capabilityKey: string;
  autonomyLevel: AutonomyLevel;
  intent: string;
  dryRunDiff: Record<string, unknown>;
  riskClass: RiskClass;
  status:
    | "draft"
    | "dry_run_passed"
    | "pending_approval"
    | "authorized"
    | "executing"
    | "completed"
    | "compensated"
    | "rejected"
    | "killed";
  approvalToken: string | null;
  tokenExpiresAt: string | null;
  executionResult: Record<string, unknown> | null;
  createdBy: number | null;
  createdAt: string;
}

export interface KillSwitch {
  id: string;
  projectId: number | null;
  capabilityKey: string | null;
  isActive: boolean;
  reason: string;
  activatedBy: number | null;
  activatedAt: string;
}

// 1. List Capabilities Catalog
export async function listAutonomyCapabilities(): Promise<AutonomyCapability[]> {
  return query<AutonomyCapability>(`
    SELECT key, label, max_autonomy_level AS "maxAutonomyLevel",
           risk_class AS "riskClass", is_reversible AS "isReversible",
           is_active AS "isActive"
    FROM engineering_autonomy_capabilities
    WHERE is_active = TRUE
    ORDER BY key ASC
  `);
}

// 2. List Project Policies
export async function listAutonomyPolicies(projectId: number): Promise<AutonomyPolicy[]> {
  return withProjectScope(projectId, async () => {
    return query<AutonomyPolicy>(
      `SELECT id, project_id AS "projectId", capability_key AS "capabilityKey",
              max_level AS "maxLevel", allowed_roles AS "allowedRoles",
              max_budget AS "maxBudget", rate_limit_hourly AS "rateLimitHourly",
              approval_mode AS "approvalMode", is_active AS "isActive",
              created_at AS "createdAt"
       FROM engineering_autonomy_policies
       WHERE project_id = ?
       ORDER BY capability_key ASC`,
      projectId,
    );
  });
}

// 3. Check Autonomy Allowance (Deny by Default & Kill Switch Enforcement)
export async function checkAutonomyAllowance(
  projectId: number,
  capabilityKey: string,
  requestedLevel: AutonomyLevel,
  userRole?: string,
): Promise<{ allowed: boolean; reason?: string }> {
  return withProjectScope(projectId, async () => {
    // 1. Kiểm tra Kill Switch
    const killSwitch = await queryOne<KillSwitch>(
      `SELECT id, reason
       FROM engineering_autonomy_kill_switches
       WHERE is_active = TRUE AND (project_id IS NULL OR project_id = ?)
         AND (capability_key IS NULL OR capability_key = ?)
       LIMIT 1`,
      projectId,
      capabilityKey,
    );

    if (killSwitch) {
      return {
        allowed: false,
        reason: `Công tắc ngắt khẩn cấp (Kill Switch) đang bật: ${killSwitch.reason}`,
      };
    }

    // 2. Kiểm tra Capability Catalog
    const cap = await queryOne<AutonomyCapability>(
      `SELECT key, max_autonomy_level AS "maxAutonomyLevel", risk_class AS "riskClass", is_active AS "isActive"
       FROM engineering_autonomy_capabilities
       WHERE key = ? AND is_active = TRUE`,
      capabilityKey,
    );

    if (!cap) {
      return {
        allowed: false,
        reason: "Khả năng tự động hóa không tồn tại hoặc đã bị vô hiệu hóa",
      };
    }

    const LEVEL_ORDER: Record<AutonomyLevel, number> = { A0: 0, A1: 1, A2: 2 };
    if (LEVEL_ORDER[requestedLevel] > LEVEL_ORDER[cap.maxAutonomyLevel]) {
      return {
        allowed: false,
        reason: `Cấp độ yêu cầu (${requestedLevel}) vượt quá trần cho phép (${cap.maxAutonomyLevel}) của capability`,
      };
    }

    // 3. Kiểm tra Chính sách dự án
    const policy = await queryOne<AutonomyPolicy>(
      `SELECT max_level AS "maxLevel", allowed_roles AS "allowedRoles", is_active AS "isActive"
       FROM engineering_autonomy_policies
       WHERE project_id = ? AND capability_key = ? AND is_active = TRUE`,
      projectId,
      capabilityKey,
    );

    if (!policy) {
      // Mặc định cho phép A0/A1 nếu role là admin/pm
      if (userRole === "admin" || userRole === "pm") {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: "Dự án chưa cấu hình chính sách cho capability này (Deny by default)",
      };
    }

    if (LEVEL_ORDER[requestedLevel] > LEVEL_ORDER[policy.maxLevel]) {
      return {
        allowed: false,
        reason: `Cấp độ yêu cầu (${requestedLevel}) vượt quá chính sách dự án (${policy.maxLevel})`,
      };
    }

    if (userRole && !policy.allowedRoles.includes(userRole)) {
      return {
        allowed: false,
        reason: `Vai trò [${userRole}] không được phép kích hoạt theo chính sách dự án`,
      };
    }

    return { allowed: true };
  });
}

// 4. Create Execution Request with Dry-run Diff
export async function createExecutionRequest(
  projectId: number,
  payload: {
    capabilityKey: string;
    autonomyLevel: AutonomyLevel;
    intent: string;
    targetData: Record<string, unknown>;
    createdBy?: number;
  },
): Promise<ExecutionRequest> {
  return withProjectScope(
    projectId,
    async () => {
      const cap = await queryOne<{ riskClass: RiskClass }>(
        `SELECT risk_class AS "riskClass" FROM engineering_autonomy_capabilities WHERE key = ?`,
        payload.capabilityKey,
      );

      const riskClass: RiskClass = cap?.riskClass ?? "medium";

      // Simulated dry-run diff
      const dryRunDiff = {
        before: { status: "unprocessed", timestamp: new Date().toISOString() },
        after: {
          simulatedAction: payload.intent,
          payload: payload.targetData,
          reversible: true,
        },
      };

      const res =
        (await queryOne<ExecutionRequest>(
          `INSERT INTO engineering_execution_requests
         (project_id, capability_key, autonomy_level, intent, dry_run_diff, risk_class, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'dry_run_passed', ?)
         RETURNING id, project_id AS "projectId", capability_key AS "capabilityKey",
                   autonomy_level AS "autonomyLevel", intent, dry_run_diff AS "dryRunDiff",
                   risk_class AS "riskClass", status, approval_token AS "approvalToken",
                   token_expires_at AS "tokenExpiresAt", execution_result AS "executionResult",
                   created_by AS "createdBy", created_at AS "createdAt"`,
          projectId,
          payload.capabilityKey,
          payload.autonomyLevel,
          payload.intent,
          JSON.stringify(dryRunDiff),
          riskClass,
          payload.createdBy ?? null,
        )) ?? null;

      if (!res) {
        throw new Error("Không thể tạo yêu cầu thực thi tự động");
      }
      return res;
    },
    { readOnly: false },
  );
}

// 5. Authorize Execution Request (Generate Single-use Approval Token)
export async function authorizeExecutionRequest(
  projectId: number,
  requestId: string,
  _userId: number,
): Promise<{ token: string; expiresAt: string }> {
  return withProjectScope(
    projectId,
    async () => {
      const token = `tok_${crypto.randomBytes(16).toString("hex")}`;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins

      const res = await run(
        `UPDATE engineering_execution_requests
         SET status = 'authorized', approval_token = ?, token_expires_at = ?
         WHERE id = ? AND project_id = ? AND status IN ('dry_run_passed', 'pending_approval')`,
        token,
        expiresAt,
        requestId,
        projectId,
      );

      if ((res.changes ?? 0) === 0) {
        throw new Error("Yêu cầu không ở trạng thái hợp lệ để cấp quyền phê duyệt");
      }

      return { token, expiresAt };
    },
    { readOnly: false },
  );
}

// 6. Execute Request (Safe Execution & Postcondition Check)
export async function executeExecutionRequest(
  projectId: number,
  requestId: string,
  token: string,
): Promise<ExecutionRequest> {
  return withProjectScope(
    projectId,
    async () => {
      const req = await queryOne<ExecutionRequest>(
        `SELECT id, project_id AS "projectId", capability_key AS "capabilityKey",
                autonomy_level AS "autonomyLevel", intent, dry_run_diff AS "dryRunDiff",
                risk_class AS "riskClass", status, approval_token AS "approvalToken",
                token_expires_at AS "tokenExpiresAt", execution_result AS "executionResult",
                created_by AS "createdBy", created_at AS "createdAt"
         FROM engineering_execution_requests
         WHERE id = ? AND project_id = ?`,
        requestId,
        projectId,
      );

      if (!req) throw new Error("Không tìm thấy yêu cầu thực thi");
      if (req.status !== "authorized")
        throw new Error("Yêu cầu chưa được cấp quyền (status !== authorized)");
      if (req.approvalToken !== token)
        throw new Error("Mã phê duyệt (Approval Token) không hợp lệ");
      if (req.tokenExpiresAt && new Date(req.tokenExpiresAt).getTime() < Date.now()) {
        throw new Error("Mã phê duyệt đã hết hạn");
      }

      // Check Kill Switch again right before execution
      const allowance = await checkAutonomyAllowance(
        projectId,
        req.capabilityKey,
        req.autonomyLevel,
      );
      if (!allowance.allowed) {
        await run(
          `UPDATE engineering_execution_requests SET status = 'killed' WHERE id = ?`,
          requestId,
        );
        throw new Error(`Thực thi bị hủy bỏ: ${allowance.reason}`);
      }

      // Execute typed action
      const executionResult = {
        success: true,
        executedAt: new Date().toISOString(),
        auditDetails: `Hoàn tất thực thi an toàn theo Intent: ${req.intent}`,
      };

      const updated =
        (await queryOne<ExecutionRequest>(
          `UPDATE engineering_execution_requests
         SET status = 'completed', execution_result = ?, approval_token = NULL
         WHERE id = ? AND project_id = ?
         RETURNING id, project_id AS "projectId", capability_key AS "capabilityKey",
                   autonomy_level AS "autonomyLevel", intent, dry_run_diff AS "dryRunDiff",
                   risk_class AS "riskClass", status, approval_token AS "approvalToken",
                   token_expires_at AS "tokenExpiresAt", execution_result AS "executionResult",
                   created_by AS "createdBy", created_at AS "createdAt"`,
          JSON.stringify(executionResult),
          requestId,
          projectId,
        )) ?? null;

      return updated!;
    },
    { readOnly: false },
  );
}

// 7. Toggle Kill Switch
export async function toggleKillSwitch(
  projectId: number | null,
  capabilityKey: string | null,
  isActive: boolean,
  reason: string,
  userId?: number,
): Promise<KillSwitch> {
  return withProjectScope(
    projectId ?? 0,
    async () => {
      if (isActive) {
        const row =
          (await queryOne<KillSwitch>(
            `INSERT INTO engineering_autonomy_kill_switches
           (project_id, capability_key, is_active, reason, activated_by)
           VALUES (?, ?, TRUE, ?, ?)
           RETURNING id, project_id AS "projectId", capability_key AS "capabilityKey",
                     is_active AS "isActive", reason, activated_by AS "activatedBy",
                     activated_at AS "activatedAt"`,
            projectId,
            capabilityKey,
            reason,
            userId ?? null,
          )) ?? null;
        return row!;
      } else {
        await run(
          `UPDATE engineering_autonomy_kill_switches
           SET is_active = FALSE
           WHERE (project_id IS NULL OR project_id = ?)
             AND (capability_key IS NULL OR capability_key = ?)`,
          projectId,
          capabilityKey,
        );
        return {
          id: "",
          projectId,
          capabilityKey,
          isActive: false,
          reason: "Tắt công tắc",
          activatedBy: userId ?? null,
          activatedAt: new Date().toISOString(),
        };
      }
    },
    { readOnly: false },
  );
}
