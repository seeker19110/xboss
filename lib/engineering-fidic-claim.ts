import { query, queryOne, withProjectScope, withTransaction } from "@/lib/db";

export type DelayEventType =
  | "ACCESS_DELAY"
  | "DRAWING_DELAY"
  | "UNFORESEEABLE_CONDITIONS"
  | "ADVERSE_WEATHER"
  | "EMPLOYER_VARIATION"
  | "FORCE_MAJEURE"
  | "OTHER";

export type FidicContractType =
  | "FIDIC_RED_1999"
  | "FIDIC_YELLOW_1999"
  | "FIDIC_RED_2017"
  | "FIDIC_YELLOW_2017"
  | "VIETNAM_STANDARD";

export interface FidicClauseMapping {
  clause: string;
  clauseTitle: string;
  eotEntitlement: boolean;
  costEntitlement: boolean;
  profitEntitlement: boolean;
  legalRationale: string;
}

export interface DelayImpactEvent {
  title: string;
  eventType: DelayEventType;
  startDate: string;
  endDate: string;
  isOnCriticalPath: boolean;
  directDelayDays: number;
}

export interface TimeImpactAnalysisResult {
  totalCriticalDelayDays: number;
  eotDaysRecommended: number;
  prolongationCostVnd: number;
  eventsCount: number;
  criticalPathExplanation: string;
}

/**
 * Ánh xạ loại sự kiện chậm trễ sang điều khoản FIDIC tương ứng và quyền lợi (EOT / Cost / Profit)
 */
export function mapDelayEventToFidicClause(
  eventType: DelayEventType,
  contractType: FidicContractType = "FIDIC_RED_1999",
): FidicClauseMapping {
  switch (eventType) {
    case "ACCESS_DELAY":
      return {
        clause: "Sub-Clause 2.1",
        clauseTitle: "Right of Access to the Site (Quyền tiếp cận công trường)",
        eotEntitlement: true,
        costEntitlement: true,
        profitEntitlement: true,
        legalRationale: "Chủ đầu tư chậm bàn giao mặt bằng thi công hoặc không thể tiếp cận.",
      };

    case "DRAWING_DELAY":
      return {
        clause: "Sub-Clause 1.9",
        clauseTitle: "Delayed Drawings or Instructions (Chậm trễ bản vẽ hoặc chỉ dẫn kỹ thuật)",
        eotEntitlement: true,
        costEntitlement: true,
        profitEntitlement: true,
        legalRationale:
          "Tư vấn giám sát/CĐT chậm phê duyệt Shopdrawing hoặc phản hồi RFI kỹ thuật.",
      };

    case "UNFORESEEABLE_CONDITIONS":
      return {
        clause: "Sub-Clause 4.12",
        clauseTitle: "Unforeseeable Physical Conditions (Điều kiện vật chất không lường trước)",
        eotEntitlement: true,
        costEntitlement: true,
        profitEntitlement: false,
        legalRationale:
          "Gặp địa chất ngầm bất thường, công trình ngầm không có trong hồ sơ mời thầu.",
      };

    case "ADVERSE_WEATHER":
      return {
        clause: "Sub-Clause 8.4(c)",
        clauseTitle: "Exceptionally Adverse Climatic Conditions (Thời tiết bất lợi đặc biệt)",
        eotEntitlement: true,
        costEntitlement: false, // FIDIC chỉ cho EOT, không bồi thường chi phí do thời tiết
        profitEntitlement: false,
        legalRationale: "Mưa bão lũ lụt vượt định mức thống kê khí tượng 10 năm qua.",
      };

    case "EMPLOYER_VARIATION":
      return {
        clause: "Sub-Clause 13.3",
        clauseTitle: "Variation Procedure (Thủ tục thay đổi thiết kế / phát sinh)",
        eotEntitlement: true,
        costEntitlement: true,
        profitEntitlement: true,
        legalRationale: "Lệnh thay đổi thiết kế bổ sung hạng mục nằm trên đường găng tiến độ.",
      };

    case "FORCE_MAJEURE":
      return {
        clause: contractType.includes("2017") ? "Sub-Clause 18.1" : "Sub-Clause 19.1",
        clauseTitle: "Exceptional Events / Force Majeure (Sự kiện bất khả kháng)",
        eotEntitlement: true,
        costEntitlement: false,
        profitEntitlement: false,
        legalRationale: "Sự kiện nằm ngoài tầm kiểm soát hợp lý của các bên.",
      };

    default:
      return {
        clause: "Sub-Clause 8.4",
        clauseTitle: "Extension of Time for Completion (Gia hạn thời gian hoàn thành)",
        eotEntitlement: true,
        costEntitlement: false,
        profitEntitlement: false,
        legalRationale: "Sự kiện gây chậm trễ tiến độ thuộc trách nhiệm của Bên Giao Thầu.",
      };
  }
}

/**
 * Kiểm tra tính tuân thủ thời hạn 28 ngày thông báo khiếu nại (Sub-Clause 20.1 Time-Bar Sentinel)
 */
export function checkNoticeCompliance(
  eventDate: string,
  noticeDate: string,
): {
  isCompliant: boolean;
  daysDifference: number;
  warningMessage: string;
} {
  const dEvent = new Date(eventDate);
  const dNotice = new Date(noticeDate);
  const diffTime = dNotice.getTime() - dEvent.getTime();
  const daysDifference = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

  const isCompliant = daysDifference <= 28;
  const warningMessage = isCompliant
    ? `Thông báo nộp sau ${daysDifference} ngày kể từ sự kiện (Hợp lệ trong khung 28 ngày của Điều 20.1).`
    : `CẢNH BÁO TIME-BAR: Thông báo nộp sau ${daysDifference} ngày (> 28 ngày). Có rủi ro bị Bác bỏ quyền khiếu nại theo Điều 20.1 FIDIC.`;

  return {
    isCompliant,
    daysDifference,
    warningMessage,
  };
}

/**
 * Thuật toán Phân tích tác động tiến độ TIA (Time Impact Analysis) & Chi phí kéo dài dự án (Prolongation Costs)
 */
export function calculateTimeImpactAnalysis(
  events: DelayImpactEvent[],
  dailyOverheadCostVnd = 25000000, // Định mức chi phí gián tiếp cố định / ngày (VD: 25 triệu VND)
): TimeImpactAnalysisResult {
  let totalCriticalDelayDays = 0;

  for (const ev of events) {
    if (ev.isOnCriticalPath) {
      totalCriticalDelayDays += ev.directDelayDays;
    }
  }

  const eotDaysRecommended = totalCriticalDelayDays;
  const prolongationCostVnd = totalCriticalDelayDays * dailyOverheadCostVnd;

  const criticalPathExplanation =
    totalCriticalDelayDays > 0
      ? `Phát hiện ${events.filter((e) => e.isOnCriticalPath).length} sự kiện chậm trễ nằm trên Đường găng tiến độ (Critical Path), gây kéo dài tổng thời gian dự án ${totalCriticalDelayDays} ngày.`
      : `Các sự kiện không nằm trên đường găng (thuộc vùng phao thời gian Float), không đủ điều kiện xin gia hạn tiến độ EOT.`;

  return {
    totalCriticalDelayDays,
    eotDaysRecommended,
    prolongationCostVnd,
    eventsCount: events.length,
    criticalPathExplanation,
  };
}

/**
 * Tự động biên soạn Hồ sơ khiếu nại chính thức (FIDIC Claim Dossier)
 */
export function generateFidicClaimDossier(params: {
  claimCode: string;
  projectName: string;
  contractType: FidicContractType;
  clauseMapping: FidicClauseMapping;
  eventTitle: string;
  eventDate: string;
  noticeDate: string;
  eotDays: number;
  costVnd: number;
  evidences: Array<{ referenceCode: string; description: string; type: string }>;
}): string {
  const {
    claimCode,
    projectName,
    contractType,
    clauseMapping,
    eventTitle,
    eventDate,
    noticeDate,
    eotDays,
    costVnd,
    evidences,
  } = params;

  return `# HỒ SƠ YÊU CẦU GIA HẠN TIẾN ĐỘ & BỒI THƯỜNG CHI PHÍ
## CLAIM FOR EXTENSION OF TIME (EOT) & PROLONGATION COSTS
**Mã Hồ Sơ:** ${claimCode}  
**Dự Án:** ${projectName}  
**Loại Hợp Đồng Áp Dụng:** ${contractType}  
**Căn Cứ Điều Khoản:** ${clauseMapping.clause} — ${clauseMapping.clauseTitle}  

---

### 1. BỐI CẢNH & DIỄN BIẾN SỰ KIỆN CHẬM TRỄ (EXECUTIVE SUMMARY)
- **Tên Sự Kiện:** ${eventTitle}
- **Ngày Phát Sinh Sự Kiện:** ${eventDate}
- **Ngày Nộp Thông Báo Ban Đầu (Notice of Claim):** ${noticeDate}
- **Cơ Sở Pháp Lý:** Theo quy định tại **${clauseMapping.clause}**, Nhà thầu có quyền được gia hạn thời gian hoàn thành (EOT) ${clauseMapping.costEntitlement ? "và thanh toán toàn bộ chi phí kéo dài thực tế phát sinh (Prolongation Costs)" : ""}.

### 2. PHÂN TÍCH TÁC ĐỘNG ĐƯỜNG GĂNG (TIME IMPACT ANALYSIS - TIA)
- Sự kiện nêu trên đã tác động trực tiếp lên các công tác thuộc Đường găng tiến độ (Critical Path) của dự án.
- **Tổng số ngày xin gia hạn tiến độ (EOT Requested):** **${eotDays} ngày làm việc**.
- **Tổng chi phí kéo dài dự án phát sinh (Prolongation Costs):** **${costVnd.toLocaleString("vi-VN")} VND**.

### 3. TẬP HỢP TÀI LIỆU CHỨNG CỨ HIỆN TRƯỜNG (CONTEMPORANEOUS RECORDS)
${
  evidences.length > 0
    ? evidences
        .map(
          (ev, i) =>
            `${i + 1}. [${ev.type.toUpperCase()}] **${ev.referenceCode}**: ${ev.description}`,
        )
        .join("\n")
    : "- Đính kèm các trang Nhật ký thi công, Biên bản hiện trường NCR và Thông cáo giao dịch RFI tương ứng."
}

### 4. ĐỀ NGHỊ CỦA NHÀ THẦU (CONTRACTOR'S SUBMISSION)
Kính đề nghị Kỹ sư Tư Vấn Giám Sát và Chủ Đầu Tư:
1. Thẩm tra và chấp thuận gia hạn thêm **${eotDays} ngày** vào Ngày Hoàn Thành Hợp Đồng.
2. Xác nhận bù đắp các chi phí phát sinh hợp lý liên quan theo đúng thủ tục của Hợp đồng.

---
*Hồ sơ được sinh tự động và bảo chứng bởi XBoss FIDIC Contract Dispute & Delay Defense Engine.*
`;
}

// ---------------------------------------------------------------------------
// DB Helpers
// ---------------------------------------------------------------------------

export async function createFidicClaim(params: {
  projectId: number;
  claimCode: string;
  contractType?: FidicContractType;
  eventType: DelayEventType;
  eventTitle: string;
  eventDate: string;
  noticeDate: string;
  eotDaysClaimed: number;
  costClaimedVnd?: number;
  evidences?: Array<{
    evidenceType: string;
    referenceCode: string;
    description: string;
    impactDays?: number;
  }>;
  createdBy?: number;
}) {
  const {
    projectId,
    claimCode,
    contractType = "FIDIC_RED_1999",
    eventType,
    eventTitle,
    eventDate,
    noticeDate,
    eotDaysClaimed,
    costClaimedVnd = 0,
    evidences = [],
    createdBy = null,
  } = params;

  const clauseMapping = mapDelayEventToFidicClause(eventType, contractType);
  const compliance = checkNoticeCompliance(eventDate, noticeDate);

  const dossierContent = generateFidicClaimDossier({
    claimCode,
    projectName: `Dự Án Project #${projectId}`,
    contractType,
    clauseMapping,
    eventTitle,
    eventDate,
    noticeDate,
    eotDays: eotDaysClaimed,
    costVnd: costClaimedVnd,
    evidences: evidences.map((e) => ({
      referenceCode: e.referenceCode,
      description: e.description,
      type: e.evidenceType,
    })),
  });

  return withProjectScope(projectId, async () => {
    return withTransaction(async () => {
      const rows = await query<any>(
        `INSERT INTO engineering_fidic_claims
           (project_id, claim_code, contract_type, fidic_clause, event_title, event_date,
            notice_date, eot_days_claimed, cost_claimed_vnd, is_time_bar_compliant,
            status, dossier_content, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
         RETURNING id, project_id AS "projectId", claim_code AS "claimCode", contract_type AS "contractType",
                   fidic_clause AS "fidicClause", event_title AS "eventTitle", eot_days_claimed AS "eotDaysClaimed",
                   cost_claimed_vnd::text AS "costClaimedVnd", is_time_bar_compliant AS "isTimeBarCompliant",
                   status, dossier_content AS "dossierContent", created_at AS "createdAt"`,
        projectId,
        claimCode,
        contractType,
        clauseMapping.clause,
        eventTitle,
        eventDate,
        noticeDate,
        eotDaysClaimed,
        costClaimedVnd,
        compliance.isCompliant,
        dossierContent,
        createdBy,
      );

      const claim = rows[0];

      for (const ev of evidences) {
        await query(
          `INSERT INTO engineering_fidic_claim_evidences
             (project_id, claim_id, evidence_type, reference_code, description, impact_days)
           VALUES (?, ?, ?, ?, ?, ?)`,
          projectId,
          claim.id,
          ev.evidenceType,
          ev.referenceCode,
          ev.description,
          ev.impactDays || 0,
        );
      }

      return claim;
    });
  });
}

export async function listFidicClaims(projectId: number) {
  return withProjectScope(projectId, async () => {
    return query<any>(
      `SELECT id, project_id AS "projectId", claim_code AS "claimCode", contract_type AS "contractType",
              fidic_clause AS "fidicClause", event_title AS "eventTitle", event_date AS "eventDate",
              notice_date AS "noticeDate", eot_days_claimed AS "eotDaysClaimed",
              cost_claimed_vnd::text AS "costClaimedVnd", is_time_bar_compliant AS "isTimeBarCompliant",
              status, dossier_content AS "dossierContent", created_at AS "createdAt"
       FROM engineering_fidic_claims
       WHERE project_id = ?
       ORDER BY created_at DESC`,
      projectId,
    );
  });
}
