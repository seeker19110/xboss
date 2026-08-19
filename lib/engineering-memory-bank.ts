// lib/engineering-memory-bank.ts — Cross-Project Memory Bank & Pattern Engine (PIN-4)
import crypto from "crypto";
import { query, queryOne, run } from "@/lib/db";

export type PatternType =
  | "labor_productivity_deviation"
  | "material_waste_rate"
  | "subcontractor_reliability"
  | "weather_impact_curve"
  | "rework_risk_fingerprint";

export interface KnowledgePatternRecord {
  id: string;
  pattern_type: PatternType;
  category: string;
  fingerprint_hash: string;
  pattern_metrics: Record<string, unknown>;
  confidence_score: number;
  sample_size_projects: number;
  sample_size_observations: number;
  lesson_learned: string;
  created_at: string;
  updated_at: string;
}

export interface CrossProjectLessonRecord {
  id: string;
  source_project_id: number | null;
  pattern_id: string | null;
  work_package_code: string | null;
  observed_problem: string;
  root_cause: string;
  prescribed_preventative_action: string;
  effectiveness_score: number;
  created_at: string;
  source_project_name?: string;
  pattern_type?: PatternType;
}

export interface LessonTransferResult {
  similarityScore: number; // 0..1
  matchedPattern: KnowledgePatternRecord;
  applicableLessons: CrossProjectLessonRecord[];
  recommendedAdjustments: {
    suggestedNormBufferPercent: number;
    riskClass: "low" | "medium" | "high";
    keyPreventativeAction: string;
  };
}

// ============================================================================
// 1. THUẬT TOÁN SINH MÃ VÂN TAY TRI THỨC (PATTERN FINGERPRINTING)
// ============================================================================

export function generatePatternFingerprint(
  patternType: PatternType,
  category: string,
  keyMetrics: Record<string, unknown>,
): string {
  const normalizedKeys = Object.keys(keyMetrics).sort();
  const metricString = normalizedKeys.map((k) => `${k}:${String(keyMetrics[k])}`).join("|");
  const rawInput = `${patternType}::${category.toLowerCase().trim()}::${metricString}`;

  return crypto.createHash("sha256").update(rawInput).digest("hex").slice(0, 32);
}

// ============================================================================
// 2. THUẬT TOÁN ĐỐI SOÁT & CHUYỂN GIAO TRI THỨC (SIMILARITY & LESSON TRANSFER)
// ============================================================================

export function computePatternSimilarity(
  targetParams: { category: string; floorCount?: number; totalAreaM2?: number },
  pattern: KnowledgePatternRecord,
): number {
  let score = 0;

  // Khớp danh mục / hệ thống
  if (pattern.category.toLowerCase().includes(targetParams.category.toLowerCase())) {
    score += 0.6;
  }

  // Tăng điểm theo độ tin cậy và số lượng mẫu dự án đã tích lũy
  const sampleBonus = Math.min(0.2, (pattern.sample_size_projects / 10) * 0.2);
  const confidenceBonus = pattern.confidence_score * 0.2;

  score += sampleBonus + confidenceBonus;
  return Math.min(1.0, Math.round(score * 100) / 100);
}

// ============================================================================
// 3. DATABASE QUERIES & CRUD
// ============================================================================

export async function listKnowledgePatterns(
  patternType?: PatternType,
): Promise<KnowledgePatternRecord[]> {
  let sql = `SELECT * FROM engineering_knowledge_patterns`;
  const params: unknown[] = [];

  if (patternType) {
    sql += ` WHERE pattern_type = ?`;
    params.push(patternType);
  }

  sql += ` ORDER BY confidence_score DESC, updated_at DESC LIMIT 100`;

  const rows = await query<KnowledgePatternRecord>(sql, params);
  return rows;
}

export async function upsertKnowledgePattern(params: {
  pattern_type: PatternType;
  category: string;
  pattern_metrics: Record<string, unknown>;
  confidence_score: number;
  lesson_learned: string;
}): Promise<KnowledgePatternRecord> {
  const hash = generatePatternFingerprint(
    params.pattern_type,
    params.category,
    params.pattern_metrics,
  );

  const [row] = await query<KnowledgePatternRecord>(
    `INSERT INTO engineering_knowledge_patterns (
      pattern_type, category, fingerprint_hash, pattern_metrics, confidence_score, lesson_learned, sample_size_projects, sample_size_observations
    ) VALUES (?, ?, ?, ?::jsonb, ?, ?, 1, 1)
    ON CONFLICT (fingerprint_hash) DO UPDATE SET
      confidence_score = GREATEST(engineering_knowledge_patterns.confidence_score, EXCLUDED.confidence_score),
      sample_size_observations = engineering_knowledge_patterns.sample_size_observations + 1,
      lesson_learned = EXCLUDED.lesson_learned,
      updated_at = NOW()
    RETURNING *`,
    [
      params.pattern_type,
      params.category,
      hash,
      JSON.stringify(params.pattern_metrics),
      params.confidence_score,
      params.lesson_learned,
    ],
  );

  return row;
}

export async function listCrossProjectLessons(
  workPackageCode?: string,
): Promise<CrossProjectLessonRecord[]> {
  let sql = `
    SELECT
      l.*,
      p.name AS source_project_name,
      kp.pattern_type
    FROM engineering_cross_project_lessons l
    LEFT JOIN projects p ON p.id = l.source_project_id
    LEFT JOIN engineering_knowledge_patterns kp ON kp.id = l.pattern_id
  `;

  const params: unknown[] = [];
  if (workPackageCode) {
    sql += ` WHERE l.work_package_code = ?`;
    params.push(workPackageCode);
  }

  sql += ` ORDER BY l.effectiveness_score DESC, l.created_at DESC LIMIT 100`;

  const rows = await query<CrossProjectLessonRecord>(sql, params);
  return rows;
}

export async function addCrossProjectLesson(lesson: {
  source_project_id?: number;
  pattern_id?: string;
  work_package_code?: string;
  observed_problem: string;
  root_cause: string;
  prescribed_preventative_action: string;
  effectiveness_score?: number;
}): Promise<CrossProjectLessonRecord> {
  const [created] = await query<CrossProjectLessonRecord>(
    `INSERT INTO engineering_cross_project_lessons (
      source_project_id, pattern_id, work_package_code, observed_problem, root_cause, prescribed_preventative_action, effectiveness_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING *`,
    [
      lesson.source_project_id || null,
      lesson.pattern_id || null,
      lesson.work_package_code || null,
      lesson.observed_problem,
      lesson.root_cause,
      lesson.prescribed_preventative_action,
      lesson.effectiveness_score || 1.0,
    ],
  );
  return created;
}

export async function queryTransferredLessons(params: {
  category: string;
  workPackageCode?: string;
}): Promise<LessonTransferResult[]> {
  const patterns = await listKnowledgePatterns();
  const allLessons = await listCrossProjectLessons(params.workPackageCode);

  const results: LessonTransferResult[] = [];

  for (const pattern of patterns) {
    const similarity = computePatternSimilarity(params, pattern);
    if (similarity >= 0.5) {
      const applicable = allLessons.filter(
        (l) => l.pattern_id === pattern.id || l.work_package_code === params.workPackageCode,
      );

      results.push({
        similarityScore: similarity,
        matchedPattern: pattern,
        applicableLessons: applicable,
        recommendedAdjustments: {
          suggestedNormBufferPercent: similarity > 0.8 ? 8.5 : 4.0,
          riskClass: similarity > 0.8 ? "high" : "medium",
          keyPreventativeAction:
            applicable[0]?.prescribed_preventative_action || pattern.lesson_learned,
        },
      });
    }
  }

  return results.sort((a, b) => b.similarityScore - a.similarityScore);
}
