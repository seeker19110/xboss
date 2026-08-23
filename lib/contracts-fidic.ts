// lib/contracts-fidic.ts — Unified FIDIC Contracts, Claims & Time Impact Analysis (TIA) Engine (M40 / M79 / M87 / M92 / M94)
import { query, queryOne, run } from "@/lib/db";
import { createHash } from "node:crypto";

// ============================================================================
// 1. FIDIC CLAUSE MAPPING & CONTRACT STANDARDS
// ============================================================================

export type FidicContractBook =
  "FIDIC_RED_1999" | "FIDIC_YELLOW_1999" | "FIDIC_SILVER_1999" | "FIDIC_2017";

export type DelayEventType =
  | "ACCESS_DELAY"
  | "ADVERSE_WEATHER"
  | "EMPLOYER_VARIATION"
  | "FORCE_MAJEURE"
  | "UNFORESEEABLE_PHYSICAL_CONDITIONS"
  | "DRAWING_APPROVAL_DELAY"
  | "TESTING_INTERRUPTION"
  | "OTHER";

export interface FidicClauseMappingResult {
  contractBook: FidicContractBook;
  eventType: DelayEventType;
  clause: string;
  clauseTitle: string;
  eotEntitlement: boolean;
  costEntitlement: boolean;
  profitEntitlement: boolean;
  legalBasis: string;
  timeBarDays: number;
}

export function mapDelayEventToFidicClause(
  eventType: DelayEventType,
  contractBook: FidicContractBook = "FIDIC_RED_1999",
): FidicClauseMappingResult {
  switch (eventType) {
    case "ACCESS_DELAY":
      return {
        contractBook,
        eventType,
        clause: "Sub-Clause 2.1",
        clauseTitle: "Right of Access to the Site",
        eotEntitlement: true,
        costEntitlement: true,
        profitEntitlement: true,
        legalBasis:
          "Chậm bàn giao mặt bằng thi công hoặc cản trở tiếp cận công trường từ phía Chủ đầu tư.",
        timeBarDays: 28,
      };
    case "ADVERSE_WEATHER":
      return {
        contractBook,
        eventType,
        clause: "Sub-Clause 8.4(c)",
        clauseTitle: "Exceptionally Adverse Climatic Conditions",
        eotEntitlement: true,
        costEntitlement: false,
        profitEntitlement: false,
        legalBasis:
          "Điều kiện thời tiết bất lợi đặc biệt (bão lũ, mưa vượt định mức thống kê 10 năm). Chỉ được gia hạn thời gian EOT, không được bồi thường chi phí phát sinh.",
        timeBarDays: 28,
      };
    case "EMPLOYER_VARIATION":
      return {
        contractBook,
        eventType,
        clause: "Sub-Clause 13.3",
        clauseTitle: "Variation Procedure",
        eotEntitlement: true,
        costEntitlement: true,
        profitEntitlement: true,
        legalBasis:
          "Thay đổi thiết kế, bổ sung khối lượng công việc theo yêu cầu của Tư vấn/Chủ đầu tư.",
        timeBarDays: 28,
      };
    case "UNFORESEEABLE_PHYSICAL_CONDITIONS":
      return {
        contractBook,
        eventType,
        clause: "Sub-Clause 4.12",
        clauseTitle: "Unforeseeable Physical Conditions",
        eotEntitlement: true,
        costEntitlement: true,
        profitEntitlement: false,
        legalBasis:
          "Điều kiện địa chất công trình hoặc chướng ngại vật ngầm không thể lường trước bởi nhà thầu có kinh nghiệm.",
        timeBarDays: 28,
      };
    case "FORCE_MAJEURE":
      return {
        contractBook,
        eventType,
        clause: "Sub-Clause 19.4",
        clauseTitle: "Consequences of Force Majeure",
        eotEntitlement: true,
        costEntitlement: contractBook === "FIDIC_2017" ? true : false,
        profitEntitlement: false,
        legalBasis: "Sự kiện Bất khả kháng (Chiến tranh, dịch bệnh, thiên tai diện rộng).",
        timeBarDays: 28,
      };
    default:
      return {
        contractBook,
        eventType,
        clause: "Sub-Clause 20.1",
        clauseTitle: "Contractor's Claims",
        eotEntitlement: true,
        costEntitlement: true,
        profitEntitlement: false,
        legalBasis: "Khiếu nại chung của Nhà thầu theo Điều 20.1 (hoặc Điều 20.2 FIDIC 2017).",
        timeBarDays: 28,
      };
  }
}

// ============================================================================
// 2. TIME-BAR COMPLIANCE CHECKER (28-DAY INVARIANT)
// ============================================================================

export interface NoticeComplianceResult {
  eventDate: string;
  noticeDate: string;
  daysDifference: number;
  isCompliant: boolean;
  status: "COMPLIANT" | "TIME_BAR_RISK" | "TIME_BAR_BREACHED";
  warningMessage: string;
}

export function checkNoticeCompliance(
  eventDateStr: string,
  noticeDateStr: string,
): NoticeComplianceResult {
  const eventDate = new Date(eventDateStr);
  const noticeDate = new Date(noticeDateStr);
  const diffMs = noticeDate.getTime() - eventDate.getTime();
  const daysDiff = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (daysDiff <= 28) {
    return {
      eventDate: eventDateStr,
      noticeDate: noticeDateStr,
      daysDifference: daysDiff,
      isCompliant: true,
      status: "COMPLIANT",
      warningMessage: `Thông báo khiếu nại nộp đúng hạn (${daysDiff}/28 ngày). Hợp lệ theo FIDIC Điều 20.1.`,
    };
  }

  return {
    eventDate: eventDateStr,
    noticeDate: noticeDateStr,
    daysDifference: daysDiff,
    isCompliant: false,
    status: daysDiff > 42 ? "TIME_BAR_BREACHED" : "TIME_BAR_RISK",
    warningMessage: `CẢNH BÁO RỦI RO TIME-BAR: Thông báo khiếu nại nộp sau ${daysDiff} ngày (> 28 ngày quy định). Nguy cơ bị Chủ đầu tư bác bỏ toàn bộ quyền đòi EOT và Chi phí. Cần vận dụng điều khoản sự kiện tiếp diễn (Clause 20.1(c)).`,
  };
}

// ============================================================================
// 3. TIME IMPACT ANALYSIS (TIA) & DOSSIER GENERATOR
// ============================================================================

export interface DelayFragnetEvent {
  title: string;
  eventType: DelayEventType;
  startDate: string;
  endDate: string;
  isOnCriticalPath: boolean;
  directDelayDays: number;
}

export interface TimeImpactAnalysisResult {
  totalEventsAnalyzed: number;
  criticalEventsCount: number;
  totalDirectDelayDays: number;
  totalCriticalDelayDays: number;
  totalCriticalEotClaimDays: number;
  eotDaysRecommended: number;
  justifiedCostClaimDays: number;
  prolongationCostVnd: number;
  eventsBreakdown: Array<DelayFragnetEvent & { fidicClause: string; eotGrantedDays: number }>;
}

export function calculateTimeImpactAnalysis(
  events: DelayFragnetEvent[],
  dailyOverheadRateVnd = 15_000_000,
): TimeImpactAnalysisResult {
  let criticalEotDays = 0;
  let justifiedCostDays = 0;
  let totalDirectDelay = 0;
  let criticalCount = 0;

  const breakdown = events.map((ev) => {
    const clause = mapDelayEventToFidicClause(ev.eventType);
    totalDirectDelay += ev.directDelayDays;

    let eotDays = 0;
    if (ev.isOnCriticalPath) {
      criticalCount++;
      eotDays = ev.directDelayDays;
      criticalEotDays += eotDays;

      if (clause.costEntitlement) {
        justifiedCostDays += eotDays;
      }
    }

    return {
      ...ev,
      fidicClause: clause.clause,
      eotGrantedDays: eotDays,
    };
  });

  const prolongationCostVnd = justifiedCostDays * dailyOverheadRateVnd;

  return {
    totalEventsAnalyzed: events.length,
    criticalEventsCount: criticalCount,
    totalDirectDelayDays: totalDirectDelay,
    totalCriticalDelayDays: criticalEotDays,
    totalCriticalEotClaimDays: criticalEotDays,
    eotDaysRecommended: criticalEotDays,
    justifiedCostClaimDays: justifiedCostDays,
    prolongationCostVnd,
    eventsBreakdown: breakdown,
  };
}

export function generateFidicClaimDossier(input: any, contractorNameArg = "Nhà thầu MEPF"): string {
  const claimCode = input.claimCode || "CLM-01";
  const projectName = input.projectName || "Dự án";
  const contractorName = input.contractorName || contractorNameArg;
  const eotDays = input.eotDays ?? input.totalEotDaysRequested ?? (input.calculatedEotDays || 0);
  const cost =
    input.costVnd ??
    input.prolongationCost ??
    input.totalCostClaimVnd ??
    (input.totalProlongationCostVnd || 0);

  return `# CLAIM FOR EXTENSION OF TIME (EOT) & ADDITIONAL PAYMENT
**Mã hồ sơ:** ${claimCode}  
**Dự án:** ${projectName}  
**Đơn vị đề nghị:** ${contractorName}  
**Sự kiện:** ${input.eventTitle || ""}  
**Căn cứ pháp lý:** ${input.clauseMapping?.clause || "FIDIC Sub-Clause 20.1"} (${input.clauseMapping?.clauseTitle || ""})  

---

## 1. TỔNG HỢP ĐỀ XUẤT
- **Thời gian gia hạn đề xuất (EOT):** **${eotDays} ngày**
- **Chi phí phát sinh đề xuất:** **${cost.toLocaleString("vi-VN")} VNĐ**
- **Phương pháp phân tích:** Phương pháp Phân tích Tác động Chậm trễ Đường găng (Time Impact Analysis - TIA).

## 2. DANH MỤC CHỨNG CỨ HIỆN TRƯỜNG
${(input.evidences || []).map((e: any) => `- [${e.type || e.evidenceType}] ${e.referenceCode}: ${e.description}`).join("\n")}

## 3. KẾT LUẬN & KIẾN NGHỊ
Căn cứ các chứng cứ hiện trường và nhật ký thi công, Nhà thầu kính đề nghị Tư vấn Giám sát và Chủ đầu tư xem xét chấp thuận gia hạn ngày hoàn thành thêm **${eotDays} ngày** và phê duyệt chi phí **${cost.toLocaleString("vi-VN")} VNĐ**.
`;
}

// ============================================================================
// 4. AUTONOMOUS FIDIC TIA CLAIM ENGINE (MODULE M94)
// ============================================================================

export interface FidicTiaInput {
  claimCode: string;
  delayEventTitle: string;
  eventCategory:
    "EMPLOYER_DELAY" | "FORCE_MAJEURE_WEATHER" | "DESIGN_CHANGE_VARIATION" | "UNFORESEEN_PHYSICAL";
  delayStartDate: string;
  delayEndDate: string;
  impactedTasks: Array<{
    taskId: number;
    taskName: string;
    originalDurationDays: number;
    delayDays: number;
  }>;
  dailyOverheadCostVnd?: number;
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
  timeBarDeadlineDate: string;
  merkleProofHash: string;
  submittedAt: string;
}

export function analyzeFidicTiaClaim(input: FidicTiaInput): FidicTiaResult {
  const start = new Date(input.delayStartDate);
  const end = new Date(input.delayEndDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const fragnetDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  const maxCriticalDelay = input.impactedTasks.reduce(
    (max, t) => Math.max(max, t.delayDays),
    fragnetDays,
  );

  const eotDays = maxCriticalDelay;
  const dailyCost = input.dailyOverheadCostVnd ?? 15000000;
  const totalProlongationCostVnd = eotDays * dailyCost;

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

// ============================================================================
// 5. GENERAL FIDIC CLAIM DATABASE PERSISTENCE
// ============================================================================

export async function createFidicClaim(
  inputOrProjectId: any,
  claimCodeArg?: string,
  dossierArg?: any,
  userIdArg?: number | null,
): Promise<{ id: string; claimCode: string; [key: string]: unknown }> {
  if (typeof inputOrProjectId === "object") {
    const input = inputOrProjectId;
    const dossierMd = generateFidicClaimDossier(input);
    const row = await queryOne<{ id: string }>(
      `INSERT INTO engineering_fidic_claims (
        project_id, claim_code, event_title, event_date, notice_date,
        eot_days_claimed, cost_claimed_vnd, dossier_content, created_by
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
      ON CONFLICT (claim_code) DO UPDATE SET
        event_title = EXCLUDED.event_title,
        event_date = EXCLUDED.event_date,
        notice_date = EXCLUDED.notice_date,
        eot_days_claimed = EXCLUDED.eot_days_claimed,
        cost_claimed_vnd = EXCLUDED.cost_claimed_vnd,
        dossier_content = EXCLUDED.dossier_content,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id`,
      input.projectId,
      input.claimCode,
      input.eventTitle || `Khiếu nại ${input.claimCode}`,
      input.eventDate,
      input.noticeDate,
      input.eotDaysClaimed || 0,
      input.costClaimedVnd || 0,
      dossierMd,
      input.userId ?? input.createdBy ?? null,
    );
    if (!row) throw new Error("Failed to save FIDIC claim");
    return { ...row, claimCode: input.claimCode };
  }

  const projectId = inputOrProjectId;
  const claimCode = claimCodeArg!;
  const dossier = dossierArg;
  const today = new Date().toISOString().slice(0, 10);
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_fidic_claims (
      project_id, claim_code, event_title, event_date, notice_date,
      eot_days_claimed, cost_claimed_vnd, dossier_content, created_by
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    )
    ON CONFLICT (claim_code) DO UPDATE SET
      event_title = EXCLUDED.event_title,
      event_date = EXCLUDED.event_date,
      notice_date = EXCLUDED.notice_date,
      eot_days_claimed = EXCLUDED.eot_days_claimed,
      cost_claimed_vnd = EXCLUDED.cost_claimed_vnd,
      dossier_content = EXCLUDED.dossier_content,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id`,
    projectId,
    claimCode,
    typeof dossier === "string"
      ? `Hồ sơ Khiếu nại ${claimCode}`
      : dossier.documentTitle || `Hồ sơ ${claimCode}`,
    today,
    today,
    typeof dossier === "string" ? 0 : dossier.totalEotDaysRequested || 0,
    typeof dossier === "string" ? 0 : dossier.totalCostClaimVnd || 0,
    typeof dossier === "string" ? dossier : dossier.claimDossierMarkdown || "",
    userIdArg ?? null,
  );
  if (!row) throw new Error("Failed to save FIDIC claim");
  return { ...row, claimCode };
}

export async function listFidicClaims(projectId: number): Promise<Array<Record<string, unknown>>> {
  return await query(
    `SELECT * FROM engineering_fidic_claims WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    projectId,
  );
}
