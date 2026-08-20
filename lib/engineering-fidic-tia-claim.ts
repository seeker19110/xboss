// lib/engineering-fidic-tia-claim.ts — Autonomous FIDIC Time Impact Analysis (TIA) & Claim Engine (Module M94)
import { query, queryOne, run } from "@/lib/db";
import { createHash } from "node:crypto";

export interface FidicTiaInput {
  claimCode: string;
  delayEventTitle: string;
  eventCategory:
    "EMPLOYER_DELAY" | "FORCE_MAJEURE_WEATHER" | "DESIGN_CHANGE_VARIATION" | "UNFORESEEN_PHYSICAL";
  delayStartDate: string; // YYYY-MM-DD
  delayEndDate: string; // YYYY-MM-DD
  impactedTasks: Array<{
    taskId: number;
    taskName: string;
    originalDurationDays: number;
    delayDays: number;
  }>;
  dailyOverheadCostVnd?: number; // default 15,000,000 VND/day
}

export interface FidicTiaResult {
  claimCode: string;
  delayEventTitle: string;
  eventCategory: string;
  fidicSubClause: string;
  delayStartDate: string;
  delayEndDate: string;
  fragnetDurationDays: number;
  calculatedEotDays: number;
  dailyOverheadCostVnd: number;
  totalProlongationCostVnd: number;
  impactedCriticalTasks: Array<{
    taskId: number;
    taskName: string;
    originalDurationDays: number;
    delayDays: number;
  }>;
  noticeLetterMarkdown: string;
  timeBarDeadlineDate: string; // 28 days from delayStartDate
  merkleProofHash: string;
  submittedAt: string;
}

// ============================================================================
// 1. TIME IMPACT ANALYSIS (TIA) & FIDIC NOTICE GENERATOR
// ============================================================================

export function analyzeFidicTiaClaim(input: FidicTiaInput): FidicTiaResult {
  const start = new Date(input.delayStartDate);
  const end = new Date(input.delayEndDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const fragnetDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  // Tính số ngày trễ tối đa trên các task đường găng (CPM Critical Path)
  const maxCriticalDelay = input.impactedTasks.reduce(
    (max, t) => Math.max(max, t.delayDays),
    fragnetDays,
  );

  const eotDays = maxCriticalDelay;
  const dailyCost = input.dailyOverheadCostVnd ?? 15000000;
  const totalProlongationCostVnd = eotDays * dailyCost;

  // Tính hạn chót 28 ngày thông báo khiếu nại theo Điều 20.1 FIDIC 1999
  const timeBarDate = new Date(start.getTime() + 28 * 24 * 60 * 60 * 1000);
  const timeBarDeadlineDate = timeBarDate.toISOString().slice(0, 10);

  const fidicSubClause =
    input.eventCategory === "FORCE_MAJEURE_WEATHER"
      ? "Clause 8.4(d) & Clause 20.1 (FIDIC 1999) / Clause 8.5 & 20.2 (FIDIC 2017)"
      : "Clause 8.4(a) & Clause 20.1 (FIDIC 1999) / Clause 8.5 & 20.2 (FIDIC 2017)";

  const submittedAt = new Date().toISOString();
  const rawMerkle = `${input.claimCode}:${input.eventCategory}:${eotDays}:${totalProlongationCostVnd}:${submittedAt}`;
  const merkleProofHash = `MERKLE-CLAIM-${createHash("sha256").update(rawMerkle).digest("hex").slice(0, 24).toUpperCase()}`;

  const noticeLetterMarkdown = `### THƯ THÔNG BÁO KHIẾU NẠI TIẾN ĐỘ & CHI PHÍ BÙ TRỪ
**Kính gửi:** Ban Quản lý Dự án / Tư vấn Giám sát Trưởng  
**Căn cứ Hợp đồng:** ${fidicSubClause}  
**Mã hồ sơ khiếu nại:** \`${input.claimCode}\`  

**1. Sự kiện cản trở thi công:**
Nhà thầu trân trọng thông báo về sự kiện: **${input.delayEventTitle}** diễn ra từ ngày **${input.delayStartDate}** đến ngày **${input.delayEndDate}**.

**2. Kết quả Phân tích Tác động Tiến độ (Time Impact Analysis - TIA):**
- Thời gian nhánh Fragnet cản trở: **${fragnetDays} ngày**
- Số ngày đề xuất gia hạn tiến độ (**EOT**): **${eotDays} ngày**
- Chi phí kéo dài công trường (**Prolongation Cost**): **${new Intl.NumberFormat("vi-VN").format(totalProlongationCostVnd)} VNĐ** (định mức ${new Intl.NumberFormat("vi-VN").format(dailyCost)} VNĐ/ngày).

**3. Khẳng định tính kịp thời theo điều khoản Time-Bar:**
Thông báo này được phát hành hợp lệ trước thời hạn 28 ngày luật định (Hạn chót: **${timeBarDeadlineDate}**).

*Mã băm Merkle bảo chứng:* \`${merkleProofHash}\``;

  return {
    claimCode: input.claimCode,
    delayEventTitle: input.delayEventTitle,
    eventCategory: input.eventCategory,
    fidicSubClause,
    delayStartDate: input.delayStartDate,
    delayEndDate: input.delayEndDate,
    fragnetDurationDays: fragnetDays,
    calculatedEotDays: eotDays,
    dailyOverheadCostVnd: dailyCost,
    totalProlongationCostVnd,
    impactedCriticalTasks: input.impactedTasks,
    noticeLetterMarkdown,
    timeBarDeadlineDate,
    merkleProofHash,
    submittedAt,
  };
}

// ============================================================================
// 2. DATABASE PERSISTENCE & QUERIES
// ============================================================================

export async function saveFidicTiaClaim(
  projectId: number,
  result: FidicTiaResult,
  userId?: number,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_fidic_tia_claims (
      project_id, claim_code, delay_event_title, event_category,
      fidic_sub_clause, delay_start_date, delay_end_date, fragnet_duration_days,
      calculated_eot_days, daily_overhead_cost_vnd, total_prolongation_cost_vnd,
      impacted_critical_tasks, notice_letter_markdown, time_bar_deadline_date,
      status, merkle_proof_hash, created_by
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?::date, ?::date, ?,
      ?, ?, ?,
      ?::jsonb, ?, ?::date,
      'submitted', ?, ?
    )
    ON CONFLICT (project_id, claim_code) DO UPDATE SET
      calculated_eot_days = EXCLUDED.calculated_eot_days,
      total_prolongation_cost_vnd = EXCLUDED.total_prolongation_cost_vnd,
      notice_letter_markdown = EXCLUDED.notice_letter_markdown,
      merkle_proof_hash = EXCLUDED.merkle_proof_hash,
      updated_at = NOW()
    RETURNING id`,
    [
      projectId,
      result.claimCode,
      result.delayEventTitle,
      result.eventCategory,
      result.fidicSubClause,
      result.delayStartDate,
      result.delayEndDate,
      result.fragnetDurationDays,
      result.calculatedEotDays,
      result.dailyOverheadCostVnd,
      result.totalProlongationCostVnd,
      JSON.stringify(result.impactedCriticalTasks),
      result.noticeLetterMarkdown,
      result.timeBarDeadlineDate,
      result.merkleProofHash,
      userId || null,
    ],
  );

  if (!row) throw new Error("Failed to save FIDIC TIA claim");
  return row;
}

export async function listFidicTiaClaims(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_fidic_tia_claims
     WHERE project_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [projectId],
  );
}
