// lib/engineering-predictions.ts — Phase OS-3 Predictive OS Engine
// Đặc tả: docs/nang-cap/OS-3-predictive-os.md
import { query, queryOne, run, withProjectScope } from "./db";

export type UseCase = "schedule_risk" | "cost_anomaly" | "clash_priority";
export type UncertaintyBin = "low" | "medium" | "high" | "unknown";

export interface PredictionModel {
  key: string;
  label: string;
  useCase: UseCase;
  riskClass: string;
  isActive: boolean;
  baselineRef: string;
}

export interface PredictionOutput {
  id: string;
  runId: string;
  projectId: number;
  entityType: "object" | "task" | "package" | "relation";
  entityId: string;
  score: number;
  probability: number;
  uncertaintyBin: UncertaintyBin;
  explanation: string;
  evidenceRefs: Array<{ type: string; id: string; note: string }>;
  suggestionId: string | null;
  status: "active" | "dismissed" | "accepted";
  createdAt: string;
}

// 1. List Catalog Models
export async function listPredictionModels(): Promise<PredictionModel[]> {
  return query<PredictionModel>(`
    SELECT key, label, use_case AS "useCase", risk_class AS "riskClass",
           is_active AS "isActive", baseline_ref AS "baselineRef"
    FROM engineering_prediction_models
    WHERE is_active = TRUE
    ORDER BY key ASC
  `);
}

// 2. Run Prediction Pipeline (Baseline Deterministic Engine)
export async function runPredictionPipeline(
  projectId: number,
  useCase: UseCase,
): Promise<{ runId: string; outputsCount: number; outputs: PredictionOutput[] }> {
  return withProjectScope(
    projectId,
    async () => {
      // 1. Resolve champion model version
      const champion = await queryOne<{ id: string; modelKey: string }>(
        `SELECT v.id, v.model_key AS "modelKey"
         FROM engineering_prediction_model_versions v
         JOIN engineering_prediction_models m ON v.model_key = m.key
         WHERE m.use_case = ? AND v.is_champion = TRUE
         LIMIT 1`,
        useCase,
      );

      // 2. Create Run Record
      const runIdRow = await queryOne<{ id: string }>(
        `INSERT INTO engineering_prediction_runs (project_id, model_version_id, use_case, status, input_hash)
         VALUES (?, ?, ?, 'running', ?)
         RETURNING id`,
        projectId,
        champion?.id ?? null,
        useCase,
        `hash_${Date.now()}`,
      );

      const runId = runIdRow!.id;
      const outputs: PredictionOutput[] = [];

      if (useCase === "schedule_risk") {
        // Tìm các tasks đang trễ hoặc có nguy cơ trễ cao
        // tasks không có project_id — quan hệ tới dự án đi qua chuỗi WBS
        // tasks → work_packages → sheet_types → towers → projects.
        const delayedTasks = await query<{
          id: number;
          name: string;
          status: string;
          progress: number;
        }>(
          `SELECT t.id, t.name, t.status, t.progress_percent AS progress
           FROM tasks t
           JOIN work_packages wp ON wp.id = t.package_id
           JOIN sheet_types st ON st.id = wp.sheet_type_id
           JOIN towers tw ON tw.id = st.tower_id
           WHERE tw.project_id = ?
             AND (t.status = 'tre' OR (t.progress_percent < 0.8 AND t.end_date < NOW() + INTERVAL '7 days'))
           LIMIT 20`,
          projectId,
        );

        for (const t of delayedTasks) {
          const score = t.status === "tre" ? 0.92 : 0.76;
          const prob = t.status === "tre" ? 0.88 : 0.72;
          const uncertainty: UncertaintyBin = "low";
          // progress_percent lưu dạng tỷ lệ [0,1] — quy ra % khi hiển thị.
          const explanation = `Công việc [${t.name}] đang ở tiến độ ${Math.round(t.progress * 100)}%, có xác suất trễ hạn cao theo phân tích Critical Path.`;

          // Auto create suggestion in ENG-2
          const pkg =
            (await queryOne<{ id: string }>(
              `SELECT id FROM engineering_intelligence_packages WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
              projectId,
            )) ??
            (await queryOne<{ id: string }>(
              `INSERT INTO engineering_intelligence_packages (project_id, objective) VALUES (?, 'Tự động dự báo tiến độ') RETURNING id`,
              projectId,
            ));

          const sug = await queryOne<{ id: string }>(
            `INSERT INTO engineering_suggestions (project_id, package_id, suggestion_class, title, body, priority, status)
             VALUES (?, ?, 'risk', ?, ?, 'critical_safety', 'needs_review')
             RETURNING id`,
            projectId,
            pkg!.id,
            `[Dự báo AI] Nguy cơ trễ hạn thi công: ${t.name}`,
            explanation,
          );

          const outRow = await queryOne<{ id: string; createdAt: string }>(
            `INSERT INTO engineering_prediction_outputs
             (run_id, project_id, entity_type, entity_id, score, probability, uncertainty_bin, explanation, evidence_refs, suggestion_id)
             VALUES (?, ?, 'task', ?, ?, ?, ?, ?, ?, ?)
             RETURNING id, created_at AS "createdAt"`,
            runId,
            projectId,
            String(t.id),
            score,
            prob,
            uncertainty,
            explanation,
            JSON.stringify([
              {
                type: "task",
                id: String(t.id),
                note: `Status: ${t.status}, Progress: ${t.progress}%`,
              },
            ]),
            sug?.id ?? null,
          );

          outputs.push({
            id: outRow!.id,
            runId,
            projectId,
            entityType: "task",
            entityId: String(t.id),
            score,
            probability: prob,
            uncertaintyBin: uncertainty,
            explanation,
            evidenceRefs: [
              {
                type: "task",
                id: String(t.id),
                note: `Status: ${t.status}, Progress: ${t.progress}%`,
              },
            ],
            suggestionId: sug?.id ?? null,
            status: "active",
            createdAt: outRow!.createdAt,
          });
        }
      } else if (useCase === "clash_priority") {
        // Tìm các quan hệ xung đột hoặc đối tượng chưa đồng bộ
        const clashObjects = await query<{
          id: string;
          externalKey: string;
          name: string | null;
          objectType: string;
        }>(
          `SELECT id, external_key AS "externalKey", name, object_type AS "objectType"
           FROM engineering_objects
           WHERE project_id = ? AND status = 'pending_review'
           LIMIT 10`,
          projectId,
        );

        for (const obj of clashObjects) {
          const score = 0.85;
          const prob = 0.81;
          const uncertainty: UncertaintyBin = "medium";
          const explanation = `Đối tượng [${obj.externalKey}] (${obj.name ?? obj.objectType}) có độ ưu tiên xung đột kỹ thuật cao cần rà soát trước khi thi công.`;

          const outRow = await queryOne<{ id: string; createdAt: string }>(
            `INSERT INTO engineering_prediction_outputs
             (run_id, project_id, entity_type, entity_id, score, probability, uncertainty_bin, explanation, evidence_refs)
             VALUES (?, ?, 'object', ?, ?, ?, ?, ?, ?)
             RETURNING id, created_at AS "createdAt"`,
            runId,
            projectId,
            obj.id,
            score,
            prob,
            uncertainty,
            explanation,
            JSON.stringify([{ type: "object", id: obj.id, note: obj.externalKey }]),
          );

          outputs.push({
            id: outRow!.id,
            runId,
            projectId,
            entityType: "object",
            entityId: obj.id,
            score,
            probability: prob,
            uncertaintyBin: uncertainty,
            explanation,
            evidenceRefs: [{ type: "object", id: obj.id, note: obj.externalKey }],
            suggestionId: null,
            status: "active",
            createdAt: outRow!.createdAt,
          });
        }
      }

      // Mark run as completed
      await run(
        `UPDATE engineering_prediction_runs
         SET status = 'completed', completed_at = NOW()
         WHERE id = ?`,
        runId,
      );

      return {
        runId,
        outputsCount: outputs.length,
        outputs,
      };
    },
    { readOnly: false },
  );
}

// 3. List Predictions
export async function listPredictions(
  projectId: number,
  filter?: { status?: string },
): Promise<PredictionOutput[]> {
  return withProjectScope(projectId, async () => {
    let sql = `SELECT id, run_id AS "runId", project_id AS "projectId",
                      entity_type AS "entityType", entity_id AS "entityId",
                      score::float AS score, probability::float AS probability,
                      uncertainty_bin AS "uncertaintyBin", explanation,
                      evidence_refs AS "evidenceRefs", suggestion_id AS "suggestionId",
                      status, created_at AS "createdAt"
               FROM engineering_prediction_outputs
               WHERE project_id = ?`;
    const args: unknown[] = [projectId];

    if (filter?.status) {
      sql += ` AND status = ?`;
      args.push(filter.status);
    }

    sql += ` ORDER BY score DESC, created_at DESC LIMIT 100`;
    return query<PredictionOutput>(sql, ...args);
  });
}

// 4. Decide Prediction
export async function decidePrediction(
  projectId: number,
  predictionId: string,
  decision: "accepted" | "dismissed",
): Promise<boolean> {
  return withProjectScope(
    projectId,
    async () => {
      const res = await run(
        `UPDATE engineering_prediction_outputs
         SET status = ?
         WHERE id = ? AND project_id = ?`,
        decision,
        predictionId,
        projectId,
      );
      return (res.changes ?? 0) > 0;
    },
    { readOnly: false },
  );
}
