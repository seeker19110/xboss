"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  HardHat,
  CalendarCheck,
  Package,
  Coins,
  Brain,
  Landmark,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Lock,
  Unlock,
  ShieldCheck,
  ShieldAlert,
  FileText,
  ChevronRight,
  Search,
  Printer,
  Layers,
  Zap,
  Droplets,
  Wind,
  Flame,
  Check,
  X,
  Eye,
  BadgeCheck,
  Workflow,
  CheckSquare,
  Square,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import { PageSkeleton } from "@/app/components/Skeleton";
import { fetchMe, type Me } from "@/app/lib/me";

// ── TYPES & INTERFACES ──

export type TradeDiscipline = "all" | "M" | "E" | "P" | "F" | "ELV";
export type GateStatus = "approved" | "pending" | "rejected" | "locked";

export interface StepItem {
  id: string;
  code: string;
  seq: number;
  title: string;
  desc: string;
  discipline: ("M" | "E" | "P" | "F" | "ELV")[];
  stageIndex: number;
  isHoldPoint: boolean;
  standards: string[];
  deliverables: string[];
  roles: {
    responsible: string;
    approver: string;
  };
  criteria: string[];
  gateStatus: GateStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  hashSignature?: string;
}

export interface StageData {
  index: number;
  stageCode: string;
  name: string;
  shortDesc: string;
  statusBadge: string;
  statusColor: string;
  statusBg: string;
  statusBorder: string;
  href: string;
  durationEst: string;
  milestoneKey: string;
}

// ── 6 GIAI ĐOẠN VÒNG ĐỜI DỰ ÁN ──

const STAGES: StageData[] = [
  {
    index: 0,
    stageCode: "GĐ 0",
    name: "Khởi Động & Pháp Lý",
    shortDesc: "Điều 107 • ĐTM • BOQ TT12",
    statusBadge: "Đạt chuẩn",
    statusColor: "text-emerald-400",
    statusBg: "bg-emerald-500/10",
    statusBorder: "border-emerald-500/30",
    href: "/governance",
    durationEst: "2-4 Tuần",
    milestoneKey: "Permit to Start",
  },
  {
    index: 1,
    stageCode: "GĐ 1",
    name: "Kỹ Thuật Không Gian",
    shortDesc: "3D BIM • Routing • Nesting",
    statusBadge: "LOD 400",
    statusColor: "text-amber-400",
    statusBg: "bg-amber-500/10",
    statusBorder: "border-amber-500/30",
    href: "/engineering/god-tier-studio",
    durationEst: "4-6 Tuần",
    milestoneKey: "Approved for Construction (AFC)",
  },
  {
    index: 2,
    stageCode: "GĐ 2",
    name: "Cung Ứng & Vật Tư",
    shortDesc: "PO 6 bước • QR GRN Cổng",
    statusBadge: "100% Khớp",
    statusColor: "text-blue-400",
    statusBg: "bg-blue-500/10",
    statusBorder: "border-blue-500/30",
    href: "/procurement",
    durationEst: "6-8 Tuần",
    milestoneKey: "Material Inspection Report (MIR)",
  },
  {
    index: 3,
    stageCode: "GĐ 3",
    name: "Hiện Trường & HSE",
    shortDesc: "Nhật ký TT06 • AI Vision",
    statusBadge: "Đang thi công",
    statusColor: "text-emerald-400",
    statusBg: "bg-emerald-500/10",
    statusBorder: "border-emerald-500/30",
    href: "/site",
    durationEst: "16-24 Tuần",
    milestoneKey: "Pour-Permit & Riser Complete",
  },
  {
    index: 4,
    stageCode: "GĐ 4",
    name: "Nghiệm Thu & IPC",
    shortDesc: "Ký số e-Sign • TT96 • FIDIC",
    statusBadge: "Quyết toán kỳ 6",
    statusColor: "text-violet-400",
    statusBg: "bg-violet-500/10",
    statusBorder: "border-violet-500/30",
    href: "/commercial",
    durationEst: "8-12 Tuần",
    milestoneKey: "T&C & Integrated Fire Matrix",
  },
  {
    index: 5,
    stageCode: "GĐ 5",
    name: "Hoàn Công & Bàn Giao",
    shortDesc: "T&C • Điều 24 • Digital Twin",
    statusBadge: "Chuẩn bị",
    statusColor: "text-zinc-300",
    statusBg: "bg-zinc-900",
    statusBorder: "border-zinc-700",
    href: "/governance",
    durationEst: "4-6 Tuần",
    milestoneKey: "Sở Xây Dựng Điều 24 & COBie LOD 500",
  },
];

// ── MASTER 36 BƯỚC THI CÔNG CHI TIẾT ──

const MASTER_STEPS: StepItem[] = [
  // ── GIAI ĐOẠN 0: KHỞI ĐỘNG & PHÁP LÝ (6 BƯỚC) ──
  {
    id: "step-0-1",
    code: "B0.1",
    seq: 1,
    stageIndex: 0,
    title: "Kiểm Soát 6 Điều Kiện Khởi Công (Điều 107 Luật Xây Dựng)",
    desc: "Rà soát mặt bằng sạch, GPXD, Hợp đồng thi công, Biện pháp bảo vệ môi trường, Biện pháp an toàn và Thông báo khởi công 03 ngày trước.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: true,
    standards: ["Luật Xây dựng số 62/2020/QH14", "Nghị định 06/2021/NĐ-CP", "Điều 107"],
    deliverables: [
      "Hồ sơ Pháp lý Dự án",
      "Giấy phép Xây dựng",
      "Thông báo Khởi công có dấu tiếp nhận",
    ],
    roles: { responsible: "Chủ Đầu Tư / TVGS", approver: "Cơ quan Quản lý Nhà nước" },
    criteria: [
      "Mặt bằng thi công đã bàn giao không vướng giải phóng",
      "Giấy phép xây dựng còn hiệu lực pháp lý",
      "Hồ sơ thiết kế bản vẽ thi công đã được thẩm duyệt",
    ],
    gateStatus: "approved",
    approvedBy: "Lê Văn Tuấn (Kỹ sư Trưởng TVGS)",
    approvedAt: "2026-03-10 09:00",
    hashSignature: "SHA256:8f2a9c1e7d4b0051b88e1a7",
  },
  {
    id: "step-0-2",
    code: "B0.2",
    seq: 2,
    stageIndex: 0,
    title: "Thẩm Duyệt Thiết Kế PCCC & ĐTM",
    desc: "Tiếp nhận và kiểm tra Giấy chứng nhận Thẩm duyệt Thiết kế PCCC của Cục/Phòng Cảnh sát PCCC và Quyết định phê duyệt ĐTM.",
    discipline: ["F", "M", "P"],
    isHoldPoint: true,
    standards: ["Nghị định 136/2020/NĐ-CP", "Nghị định 50/2024/NĐ-CP", "QCVN 06:2022/BXD"],
    deliverables: [
      "Giấy Chứng nhận Thẩm duyệt PCCC",
      "Bản vẽ PCCC có dấu thẩm duyệt",
      "Quyết định ĐTM",
    ],
    roles: { responsible: "Chủ Đầu Tư / Nhà thầu PCCC", approver: "Cục Cảnh Sát PCCC & CNCH" },
    criteria: [
      "100% bản vẽ PCCC có đóng dấu thẩm duyệt của cơ quan Công an",
      "Các giải pháp ngăn cháy, thoát nạn khớp phương án kiến trúc",
    ],
    gateStatus: "approved",
    approvedBy: "Cục Cảnh Sát PCCC & CNCH",
    approvedAt: "2026-03-15 14:30",
    hashSignature: "SHA256:4c9b2f1a8e036d77299a3c1",
  },
  {
    id: "step-0-3",
    code: "B0.3",
    seq: 3,
    stageIndex: 0,
    title: "Rà Soát Định Mức BOQ Hợp Đồng Theo Thông Tư 12/2021/TT-BXD",
    desc: "Đối soát mã hiệu định mức vật tư, đơn giá định mức nhân công, máy thi công và bóc tách bảng BOQ tổng thể MEPF khớp hợp đồng A-B.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: false,
    standards: ["Thông tư 12/2021/TT-BXD", "Thông tư 11/2021/TT-BXD", "Hợp đồng A-B"],
    deliverables: [
      "Bảng Dự toán BOQ Chi tiết MEPF",
      "Bảng Phân tích Đơn giá Đầy đủ",
      "Bảng Danh mục Vật tư Chính",
    ],
    roles: { responsible: "Kỹ sư QS Nhà thầu", approver: "Kỹ sư QS TVGS / Ban QLDA" },
    criteria: [
      "Mã hiệu BOQ khớp 100% hợp đồng đã ký",
      "Định mức hao hụt vật tư tuân thủ đúng quy định nhà nước",
    ],
    gateStatus: "approved",
    approvedBy: "Nguyễn Thị Mai (Lead QS TVGS)",
    approvedAt: "2026-03-20 16:45",
    hashSignature: "SHA256:1a8f902e4d5c7b39a8e019f",
  },
  {
    id: "step-0-4",
    code: "B0.4",
    seq: 4,
    stageIndex: 0,
    title: "Phê Duyệt Kế Hoạch Đảm Bảo Chất Lượng (PQP) & Kế Hoạch ITP",
    desc: "Ban hành Kế hoạch Quản lý Chất lượng Dự án (PQP) và Kế hoạch Kiểm tra Thử nghiệm (ITP) xác định rõ điểm dừng Hold-Points.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: false,
    standards: ["ISO 9001:2015", "Nghị định 06/2021/NĐ-CP"],
    deliverables: [
      "Sổ tay PQP Dự án",
      "Bảng Ma trận ITP Toàn bộ 5 Hệ MEPF",
      "Biểu mẫu Biên bản Nghiệm thu Chuẩn",
    ],
    roles: { responsible: "Trưởng Ban QA/QC Nhà thầu", approver: "Giám Đốc Dự Án TVGS" },
    criteria: [
      "Quy định rõ trách nhiệm 3 bên trong từng đợt nghiệm thu",
      "Danh mục 12 điểm dừng Hold-Points bắt buộc không có ngoại lệ",
    ],
    gateStatus: "approved",
    approvedBy: "Trần Đình Trọng (Chỉ Huy Trưởng TVGS)",
    approvedAt: "2026-03-25 10:15",
    hashSignature: "SHA256:7b3a9e102f4d8c55e99a441",
  },
  {
    id: "step-0-5",
    code: "B0.5",
    seq: 5,
    stageIndex: 0,
    title: "Kiểm Định Máy Móc Nghiêm Ngặt (Thông Tư 36/2019/TT-BLĐTBXH)",
    desc: "Kiểm tra tem kiểm định an toàn, hồ sơ chứng chỉ thợ vận hành Nhóm 3 đối với máy nén khí, cẩu tháp, vận thăng, xe nâng thi công.",
    discipline: ["M", "E"],
    isHoldPoint: true,
    standards: ["Thông tư 36/2019/TT-BLĐTBXH", "QCVN 18:2021/BXD"],
    deliverables: [
      "Giấy Chứng nhận Kiểm định Thiết bị",
      "Thẻ An toàn Lao động Nhóm 3",
      "Nhật ký Kiểm tra Máy Hàng ngày",
    ],
    roles: { responsible: "Kỹ sư HSE / Quản lý Thiết bị", approver: "Kỹ sư An toàn TVGS" },
    criteria: [
      "100% thiết bị nặng có giấy chứng nhận kiểm định còn hạn >= 6 tháng",
      "Thợ vận hành có đầy đủ chứng chỉ chuyên môn và thẻ an toàn",
    ],
    gateStatus: "approved",
    approvedBy: "Phạm Quốc Hùng (Chuyên viên HSE)",
    approvedAt: "2026-03-28 11:30",
    hashSignature: "SHA256:99a8b7c6d5e4f3a2b1c0e98",
  },
  {
    id: "step-0-6",
    code: "B0.6",
    seq: 6,
    stageIndex: 0,
    title: "Khóa Baseline Master Schedule Đường Găng CPM",
    desc: "Lập tiến độ thi công tổng thể đường găng CPM, phân bổ tài nguyên, khóa đường cơ sở Baseline và phân rã WBS 4 cấp độ.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: false,
    standards: ["FIDIC Red Book 1999", "Phương pháp CPM Gantt"],
    deliverables: [
      "Kế hoạch Tiến độ Master Schedule",
      "Đường cơ sở Baseline 0",
      "Lưới WBS 6 Phân hệ",
    ],
    roles: { responsible: "Kỹ sư Tiến độ Nhà thầu", approver: "Chủ Đầu Tư / TVGS" },
    criteria: [
      "Mốc hoàn thành các tầng ăn khớp với tiến độ phần thân kết cấu",
      "Xác định rõ các công việc nằm trên đường găng Critical Path",
    ],
    gateStatus: "approved",
    approvedBy: "Lê Văn Tuấn (Kỹ sư Trưởng TVGS)",
    approvedAt: "2026-04-01 15:00",
    hashSignature: "SHA256:3d4e5f6a7b8c9d0e1f2a3b4",
  },

  // ── GIAI ĐOẠN 1: KỸ THUẬT KHÔNG GIAN & SHOP DRAWING (6 BƯỚC) ──
  {
    id: "step-1-1",
    code: "B1.1",
    seq: 7,
    stageIndex: 1,
    title: "Thẩm Tra Thiết Kế Kỹ Thuật & Giới Hạn Vận Tốc Thủy Lực/Khí Động",
    desc: "Quét dị tật font chữ CAD UTF-8, kiểm tra dung sai, rà soát vận tốc thủy lực ống nước (v ≤ 1.5 - 2.5 m/s) và khí động ống gió (v ≤ 6.0 - 10.0 m/s).",
    discipline: ["M", "E", "P", "F"],
    isHoldPoint: false,
    standards: ["TCVN 5687:2024", "ASHRAE Fundamentals"],
    deliverables: [
      "Báo cáo Thẩm tra Kỹ thuật MEPF",
      "Bảng Chẩn đoán Lỗi CAD Ingestion",
      "Thuyết minh Tính Thủy lực",
    ],
    roles: { responsible: "Kỹ sư Thiết kế MEPF", approver: "Chủ Trì Thiết Kế TVGS" },
    criteria: [
      "Không còn lỗi font SHX hoặc tỷ lệ kích thước scale sai",
      "Vận tốc dòng chảy và tổn thất áp lực trong dải cho phép",
    ],
    gateStatus: "approved",
    approvedBy: "Hoàng Minh Tâm (Lead MEP Engineer)",
    approvedAt: "2026-04-08 09:30",
    hashSignature: "SHA256:aa11bb22cc33dd44ee55ff6",
  },
  {
    id: "step-1-2",
    code: "B1.2",
    seq: 8,
    stageIndex: 1,
    title: "Mô Hình Hóa 3D BIM LOD 350 - 400 & Giải Quyết Xung Đột (Clash Solver)",
    desc: "Dựng mô hình phối hợp liên ngành M-E-P-F, chạy kiểm tra va chạm Navisworks, bảo toàn tuyệt đối độ dốc 1-2% cho hệ thoát nước trọng lực.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: true,
    standards: ["BIM LOD Specification 2023", "TCVN 12/2021/TT-BXD"],
    deliverables: [
      "Mô hình BIM Phối Hợp (.rvt/.nwd)",
      "Báo cáo BCF Clash Matrix",
      "Bản vẽ Mặt bằng CSD 3D",
    ],
    roles: { responsible: "BIM Manager Nhà thầu", approver: "BIM Coordinator TVGS" },
    criteria: [
      "100% va chạm cứng (Hard Clashes) được giải quyết triệt để",
      "Hệ áp lực uốn né 45 độ quanh hệ thoát nước dốc trọng lực",
    ],
    gateStatus: "approved",
    approvedBy: "Đỗ Mạnh Hùng (BIM Lead TVGS)",
    approvedAt: "2026-04-18 17:00",
    hashSignature: "SHA256:ff99ee88dd77cc66bb55aa4",
  },
  {
    id: "step-1-3",
    code: "B1.3",
    seq: 9,
    stageIndex: 1,
    title: "Quy Hoạch Hành Lang Đa Tầng (Multi-Tier) & Tính Toán Kết Cấu Trapeze",
    desc: "Phân tầng cao độ hành lang: Tier 1 (Ống gió), Tier 2 (Máng cáp), Tier 3 (Ống nước/PCCC). Tính toán tải trọng ty ren M10/M12 và thanh Unistrut.",
    discipline: ["M", "E", "P", "F"],
    isHoldPoint: false,
    standards: ["SMACNA Seismic Restraint", "BS 5950", "QCVN 06:2022/BXD"],
    deliverables: [
      "Bản vẽ Chi tiết Giá treo Đa năng Trapeze",
      "Thuyết minh Tính tải trọng Ty ren",
      "Mặt cắt Không gian Hành lang",
    ],
    roles: { responsible: "Kỹ sư Kết cấu Phụ trợ", approver: "Kỹ sư Giám sát Cơ điện" },
    criteria: [
      "Ứng suất uốn thanh Unistrut σ ≤ 160 MPa, độ võng f ≤ L/360",
      "Khoảng cách ly cách nhiệt máng cáp và ống Chiller ≥ 150mm",
    ],
    gateStatus: "approved",
    approvedBy: "Hoàng Minh Tâm (Lead MEP Engineer)",
    approvedAt: "2026-04-24 14:15",
    hashSignature: "SHA256:11223344556677889900aabb",
  },
  {
    id: "step-1-4",
    code: "B1.4",
    seq: 10,
    stageIndex: 1,
    title: "Lập & Phê Duyệt Bản Vẽ Thi Công Shop Drawings Chi Tiết (AFC)",
    desc: "Xuất bản vẽ Shop Drawing chi tiết từng tầng tỷ lệ 1:50, chi tiết trạm máy 1:25, đóng dấu phê duyệt thi công Approved For Construction.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: true,
    standards: ["Nghị định 06/2021/NĐ-CP (Điều 13)", "TCVN Thiết kế MEPF"],
    deliverables: [
      "Bộ Bản vẽ Shop Drawing Đóng dấu AFC",
      "Bản vẽ Chi tiết Đặt sẵn SEM",
      "Bảng Danh mục Bản vẽ Duyệt",
    ],
    roles: { responsible: "Trưởng Nhóm Shop Drawing Nhà thầu", approver: "Giám Sát Trưởng TVGS" },
    criteria: [
      "Bản vẽ có đủ 3 chữ ký số: Chủ trì Thiết kế, TVGS, Chủ Đầu Tư",
      "Thể hiện đầy đủ cao độ đỉnh/đáy ống, tim đèn, vị trí van",
    ],
    gateStatus: "approved",
    approvedBy: "Lê Văn Tuấn (Kỹ sư Trưởng TVGS)",
    approvedAt: "2026-04-30 11:00",
    hashSignature: "SHA256:5566778899aabbccddeeff0",
  },
  {
    id: "step-1-5",
    code: "B1.5",
    seq: 11,
    stageIndex: 1,
    title: "Chia Đốt Chế Tạo DfMA Spool LOD 400 & Bóc Tách Micro-BOM 5 Cấp",
    desc: "Cắt phân đoạn Spool theo chiều dài xe tải (≤6m) hoặc thang hàng (≤3m), trừ fitting deduction, bù dung sai hiện trường +50..+100mm, bóc Micro-BOM.",
    discipline: ["M", "F", "P"],
    isHoldPoint: false,
    standards: ["DfMA Standard LOD 400", "ISO 14040/14044 LCA"],
    deliverables: [
      "Bản vẽ Gia công Spool Chế tạo",
      "Bảng Micro-BOM 5 Cấp độ",
      "Sơ đồ Cắt phôi 1D Nesting",
    ],
    roles: { responsible: "Kỹ sư DfMA / Tiền chế", approver: "Quản lý Dự án Nhà thầu" },
    criteria: [
      "Tỷ lệ phế liệu hao hụt cắt phôi dự toán < 1.2%",
      "Gắn mã QR Spool ID trên từng đốt ống gia công tại xưởng",
    ],
    gateStatus: "approved",
    approvedBy: "Vũ Hải Đăng (Giám Đốc Sản Xuất DfMA)",
    approvedAt: "2026-05-05 16:30",
    hashSignature: "SHA256:99887766554433221100fedc",
  },
  {
    id: "step-1-6",
    code: "B1.6",
    seq: 12,
    stageIndex: 1,
    title: "Phê Duyệt Biện Pháp Thi Công Chi Tiết (MOS) & Phân Tích Rủi Ro JSA",
    desc: "Trình duyệt Biện pháp thi công chi tiết từng công tác (cẩu lắp Chiller, kéo cáp ngầm, hàn ống PCCC, làm việc trên cao) kèm bảng phân tích an toàn.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: true,
    standards: ["QCVN 18:2021/BXD", "Thông tư 10/2021/TT-BXD"],
    deliverables: [
      "Tài liệu MOS Đầy đủ 5 Hệ",
      "Bảng Ma trận Rủi ro JSA/HIRA",
      "Sơ đồ Tổ chức Mặt bằng Thi công",
    ],
    roles: { responsible: "Chỉ Huy Trưởng Nhà thầu", approver: "Giám Sát Trưởng TVGS" },
    criteria: [
      "Đầy đủ phương án cẩu lắp, biện pháp an toàn điện, PCCC tạm",
      "Kế hoạch ứng phó sự cố khẩn cấp và sơ cấp cứu hiện trường",
    ],
    gateStatus: "approved",
    approvedBy: "Lê Văn Tuấn (Kỹ sư Trưởng TVGS)",
    approvedAt: "2026-05-10 10:00",
    hashSignature: "SHA256:aabbccddeeff001122334455",
  },

  // ── GIAI ĐOẠN 2: CUNG ỨNG, MUA SẮM & NGHIỆM THU VẬT TƯ (5 BƯỚC) ──
  {
    id: "step-2-1",
    code: "B2.1",
    seq: 13,
    stageIndex: 2,
    title: "Đệ Trình & Phê Duyệt Hồ Sơ Vật Liệu Thiết Bị Chính (MAR)",
    desc: "Đệ trình Catalog, chứng chỉ xuất xứ CO, chứng chỉ xuất xưởng CQ, phiếu thử nghiệm FAT, danh mục thiết bị chính (Chiller, Biến áp, Bơm PCCC).",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: true,
    standards: ["Spec Kỹ thuật Hợp đồng", "TCVN / IEC / UL-FM"],
    deliverables: [
      "Hồ sơ Đệ trình Vật liệu (MAR)",
      "Chứng chỉ CO/CQ Hợp lệ",
      "Bảng So sánh Đặc tính Kỹ thuật",
    ],
    roles: { responsible: "Trưởng Phòng Cung Ứng", approver: "Chủ Đầu Tư & TVGS" },
    criteria: [
      "Nhà sản xuất thuộc Approved Vendor List của dự án",
      "Thông số công suất, hiệu suất năng lượng COP khớp Spec",
    ],
    gateStatus: "approved",
    approvedBy: "Nguyễn Văn Hùng (Đại diện CĐT)",
    approvedAt: "2026-05-18 14:00",
    hashSignature: "SHA256:7766554433221100aabbccdd",
  },
  {
    id: "step-2-2",
    code: "B2.2",
    seq: 14,
    stageIndex: 2,
    title: "Lập Đơn Đặt Hàng Mua Sắm (PO) & Kiểm Soát Đối Soát 3 Chiều",
    desc: "Phát hành đơn đặt hàng PO từ Micro-BOM, thiết lập cơ chế khớp đại số 3 chiều: Q_Invoice ≤ Q_GRN ≤ Q_PO và P_Invoice = P_PO.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: false,
    standards: ["Quy chế Mua sắm Doanh nghiệp", "ISO 9001 Procurement"],
    deliverables: [
      "Đơn đặt hàng PO Chính thức",
      "Hợp đồng Mua bán Vật tư",
      "Cam kết Tiến độ Giao hàng",
    ],
    roles: { responsible: "Kỹ sư Mua hàng (Procurement)", approver: "Giám Đốc Tài Chính / PM" },
    criteria: [
      "Khối lượng đặt hàng không vượt quá bóc tách BOQ được duyệt",
      "Điều khoản thanh toán gắn liền với biên bản nghiệm thu MIR",
    ],
    gateStatus: "approved",
    approvedBy: "Lê Minh Quân (Trưởng Ban Cung Ứng)",
    approvedAt: "2026-05-25 09:30",
    hashSignature: "SHA256:4433221100ffeeddccbbaa99",
  },
  {
    id: "step-2-3",
    code: "B2.3",
    seq: 15,
    stageIndex: 2,
    title: "Nghiệm Thu Tiếp Nhận Vật Tư Tại Hiện Trường (MIR) & Lấy Mẫu LAS-XD",
    desc: "Quét mã QR, đối soát số Heat No./Batch No. dập nổi trên thân ống, cáp điện với chứng chỉ xuất xưởng, lấy mẫu thí nghiệm độc lập phòng LAS.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: true,
    standards: ["TCVN 5801", "ASTM A53", "IEC 60502-1", "DIN 8077/8078"],
    deliverables: [
      "Biên bản Nghiệm thu Vật tư Đầu vào (MIR)",
      "Phiếu Kết quả Thí nghiệm LAS-XD",
      "Ảnh chụp Niêm phong Lô hàng",
    ],
    roles: { responsible: "Kỹ sư Vật liệu Nhà thầu", approver: "Kỹ sư Giám sát TVGS" },
    criteria: [
      "100% Heat No. trên vật liệu trùng khớp chứng chỉ Mill Test",
      "Kết quả kéo nén thép, thử đốt chậm cáp đạt chuẩn",
    ],
    gateStatus: "approved",
    approvedBy: "Lê Văn Tuấn (Kỹ sư Trưởng TVGS)",
    approvedAt: "2026-06-02 16:00",
    hashSignature: "SHA256:00112233445566778899aabb",
  },
  {
    id: "step-2-4",
    code: "B2.4",
    seq: 16,
    stageIndex: 2,
    title: "Quản Lý Kho Bãi, Lưu Giữ Chống Suy Giảm Chất Lượng & Cấp Phát",
    desc: "Bảo quản vật tư kê trên pallet gỗ, bịt kín hai đầu ống, quấn màng co chống ẩm cáp điện, phân vùng kho khô và gắn mã định danh QR vị trí.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: false,
    standards: ["Tiêu chuẩn Quản lý Kho bãi 5S", "QCVN 18:2021/BXD"],
    deliverables: [
      "Thẻ Kho Điện tử",
      "Phiếu Cấp phát Vật tư Thi công",
      "Báo cáo Kiểm kê Tồn kho Định kỳ",
    ],
    roles: { responsible: "Thủ Kho / Quản lý Vật tư", approver: "Chỉ Huy Phó Thi Công" },
    criteria: [
      "Không để vật tư tiếp xúc trực tiếp nền đất ẩm ướt",
      "Cấp phát đúng chủng loại và đúng mã Spool ID được duyệt",
    ],
    gateStatus: "approved",
    approvedBy: "Nguyễn Văn Đạt (Quản lý Kho)",
    approvedAt: "2026-06-08 11:30",
    hashSignature: "SHA256:bbccddeeff00112233445566",
  },
  {
    id: "step-2-5",
    code: "B2.5",
    seq: 17,
    stageIndex: 2,
    title: "Kiểm Soát Nhập Khẩu Thiết Bị Dài Hạn (Long-Lead Critical Items)",
    desc: "Theo dõi tiến độ sản xuất tại nhà máy nước ngoài, vận chuyển đường biển và thủ tục hải quan cho Chiller, Máy biến áp, Máy phát điện dự phòng.",
    discipline: ["M", "E", "F"],
    isHoldPoint: false,
    standards: ["Incoterms 2020", "Lịch trình Reverse Scheduling"],
    deliverables: [
      "Vận đơn Đường biển B/L",
      "Tờ khai Hải quan Thông quan",
      "Báo cáo FAT Xuất xưởng",
    ],
    roles: { responsible: "Quản lý Cung ứng Quốc tế", approver: "Ban Quản Lý Dự Án" },
    criteria: [
      "Thời gian cập cảng và giao về công trường khớp mốc hoàn thiện phòng máy",
      "Chứng từ thông quan và CO phòng thương mại đầy đủ",
    ],
    gateStatus: "approved",
    approvedBy: "Nguyễn Văn Hùng (Đại diện CĐT)",
    approvedAt: "2026-06-15 15:30",
    hashSignature: "SHA256:eeddccbbaa99887766554433",
  },

  // ── GIAI ĐOẠN 3: THI CÔNG GIAI ĐOẠN 1 - ÂM SÀN, SLEEVES & NGẦM (8 BƯỚC) ──
  {
    id: "step-3-1",
    code: "B3.1",
    seq: 18,
    stageIndex: 3,
    title: "Đặt Ống Chờ (Sleeves) & Bản Thép Chôn Sẵn (Embeds) Xuyên Dầm/Sàn",
    desc: "Định vị sleeve theo đúng CSD, dầm bê tông đặt tại L/3 đến 2L/3, sleeve vách hầm có cánh chống thấm Puddle Flange, nhét xốp kín miệng ống.",
    discipline: ["M", "E", "P", "F"],
    isHoldPoint: true,
    standards: ["TCVN 5574:2018", "Quy tắc Khoét dầm Structural Invariant"],
    deliverables: [
      "Biên bản Nghiệm thu Công tác Đặt Sleeves",
      "Bản vẽ Hoàn công Vị trí Lỗ mở",
      "Ảnh Chụp GPS Hiện trường",
    ],
    roles: { responsible: "Kỹ sư Thi công Phân tầng", approver: "Kỹ sư Giám sát TVGS" },
    criteria: [
      "Đường kính sleeve D ≤ H_dầm/3, cách mép trên/dưới dầm ≥ 50mm",
      "Cánh chống thấm hàn kín 100% không rỗ xỉ",
    ],
    gateStatus: "approved",
    approvedBy: "Lê Văn Tuấn (Kỹ sư Trưởng TVGS)",
    approvedAt: "2026-06-22 17:00",
    hashSignature: "SHA256:33445566778899aabbccddee",
  },
  {
    id: "step-3-2",
    code: "B3.2",
    seq: 19,
    stageIndex: 3,
    title: "Đặt Tuyến Ống Luồn Dây Điện (Conduits PVC/G.I) Âm Sàn Bê Tông",
    desc: "Cố định ống luồn PVC Heavy Duty cách mỗi 1m, uốn ống bằng lò xo R ≥ 6D, bọc kín nắp box nối, luồn sẵn dây mồi nilon/thép.",
    discipline: ["E", "ELV"],
    isHoldPoint: true,
    standards: ["QCVN 12:2014/BXD", "TCVN 9207:2012"],
    deliverables: [
      "Biên bản Nghiệm thu Tuyến Conduits Âm sàn",
      "Biên bản Thử thông Tuyến Ống",
      "Ảnh chụp Nghiệm thu",
    ],
    roles: { responsible: "Kỹ sư Điện Hiện trường", approver: "Kỹ sư Giám sát Điện TVGS" },
    criteria: [
      "Khoảng cách giữa hai ống song song ≥ 25mm chống nứt bê tông",
      "Tổng góc uốn cong không vượt quá 360 độ trên một đoạn kéo dây",
    ],
    gateStatus: "approved",
    approvedBy: "Trần Văn Nam (Kỹ sư Điện TVGS)",
    approvedAt: "2026-06-25 11:00",
    hashSignature: "SHA256:778899aabbccddeeff001122",
  },
  {
    id: "step-3-3",
    code: "B3.3",
    seq: 20,
    stageIndex: 3,
    title: "Đóng Cọc Tiếp Địa, Hàn Hóa Nhiệt Cadweld & Lưới Đẳng Thế Móng",
    desc: "Đóng cọc đồng phi 16 L=2.4m, hàn hóa nhiệt cáp đồng trần 70-120mm2 vào đài móng, đo điện trở tiếp địa R ≤ 10Ω (chống sét) và R ≤ 1Ω (server).",
    discipline: ["E", "ELV"],
    isHoldPoint: true,
    standards: ["TCVN 9385:2012", "IEEE Std 80"],
    deliverables: [
      "Biên bản Nghiệm thu Hàn Hóa Nhiệt",
      "Phiếu Kết quả Đo Điện trở Tiếp địa",
      "Sơ đồ Hoàn công Bãi Tiếp địa",
    ],
    roles: { responsible: "Kỹ sư Điện Thi công", approver: "Kỹ sư Giám sát TVGS" },
    criteria: [
      "Điện trở tiếp địa chống sét R ≤ 10 Ohm; tiếp địa trạm biến áp R ≤ 4 Ohm",
      "Mối hàn hóa nhiệt ngấu chắc không rỗ bọt khí",
    ],
    gateStatus: "approved",
    approvedBy: "Trần Văn Nam (Kỹ sư Điện TVGS)",
    approvedAt: "2026-06-28 16:30",
    hashSignature: "SHA256:110022998877665544332211",
  },
  {
    id: "step-3-4",
    code: "B3.4",
    seq: 21,
    stageIndex: 3,
    title: "Thi Công Tuyến Thoát Nước & Tuyến Cấp Nước Ngầm Ngoài Nhà",
    desc: "Đào rãnh, đầm cát đáy dày 100mm, đặt ống thoát uPVC dốc 1-2% có gối đỡ bê tông, hàn nhiệt đối đầu ống cấp nước HDPE, thử kín trước lấp.",
    discipline: ["P"],
    isHoldPoint: true,
    standards: ["TCVN 4474:1987", "TCVN 4513:1988"],
    deliverables: [
      "Biên bản Nghiệm thu Đặt Ống Ngầm",
      "Biên bản Thử Thủy tĩnh Tuyến Ngầm",
      "Biên bản Hoàn trả Mặt bằng",
    ],
    roles: { responsible: "Kỹ sư Cấp Thoát Nước", approver: "Kỹ sư Giám sát TVGS" },
    criteria: [
      "Độ dốc thoát nước kiểm tra bằng máy thủy bình đạt 1% - 2%",
      "Thử áp suất thủy tĩnh giữ áp 1.0 MPa trong 2 giờ không rò rỉ",
    ],
    gateStatus: "approved",
    approvedBy: "Lê Văn Tuấn (Kỹ sư Trưởng TVGS)",
    approvedAt: "2026-07-05 14:00",
    hashSignature: "SHA256:66554433221100ffeeddccbb",
  },
  {
    id: "step-3-5",
    code: "B3.5",
    seq: 22,
    stageIndex: 3,
    title: "CẤP PHÉP ĐỔ BÊ TÔNG SÀN / DẦM (POUR-PERMIT CIRCUIT BREAKER)",
    desc: "Cổng ngắt mạch an toàn công tác ngầm: Tổng rà soát 100% sleeve, conduit, tiếp địa của tầng thi công trước khi cấp phép đổ bê tông.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: true,
    standards: ["Nghị định 06/2021/NĐ-CP", "Tiêu chuẩn Ngắt mạch Pour-Permit XBoss"],
    deliverables: [
      "Giấy Phép Đổ Bê Tông (Pour-Permit) Ký 3 Bên",
      "Bộ Ảnh Chụp Kiểm Tra Toàn Diện",
      "Merkle Proof Niêm Phong",
    ],
    roles: { responsible: "Chỉ Huy Trưởng MEPF & Kết cấu", approver: "Giám Sát Trưởng TVGS" },
    criteria: [
      "100% các Gate B3.1, B3.2, B3.3 đã có trạng thái APPROVED",
      "Không còn bất kỳ vướng mắc kỹ thuật hoặc xung đột nào",
    ],
    gateStatus: "approved",
    approvedBy: "Lê Văn Tuấn (Kỹ sư Trưởng TVGS)",
    approvedAt: "2026-07-10 18:00",
    hashSignature: "SHA256:9900aabbccddeeff11223344",
  },
  {
    id: "step-3-6",
    code: "B3.6",
    seq: 23,
    stageIndex: 3,
    title: "Lắp Đặt Hệ Thống Trục Đứng Cấp Nước, Thoát Nước & PCCC (Risers)",
    desc: "Lắp đặt bệ đỡ chân trục chịu lực, ống thoát nước uPVC/gang đúc, ống cấp nước PPR/Inox, ống PCCC nối cùm Grooved và khớp co giãn nhiệt.",
    discipline: ["P", "F"],
    isHoldPoint: true,
    standards: ["TCVN 7336:2021", "NFPA 13/14", "QCVN 06:2022/BXD"],
    deliverables: [
      "Biên bản Nghiệm thu Trục đứng Riser",
      "Biên bản Thử Áp lực Trục đứng",
      "Bản vẽ Hoàn công Riser",
    ],
    roles: { responsible: "Kỹ sư Cơ điện Hiện trường", approver: "Kỹ sư Giám sát TVGS" },
    criteria: [
      "Bệ đỡ chân trục đứng đủ khả năng chịu toàn bộ trọng lượng cột nước",
      "Độ thẳng đứng của trục sai lệch không vượt quá 2mm trên mỗi tầng",
    ],
    gateStatus: "pending",
  },
  {
    id: "step-3-7",
    code: "B3.7",
    seq: 24,
    stageIndex: 3,
    title: "Lắp Đặt Trục Dẫn Điện Busduct & Thang Cáp Thẳng Đứng Trong Hộp Kỹ Thuật",
    desc: "Lắp giá đỡ lò xo chống rung tại mỗi tầng, siết bu lông mô-men lực 2 đầu gãy chốt, đo điện trở cách điện Megger 1000V (R ≥ 100 MΩ) từng phân đoạn.",
    discipline: ["E"],
    isHoldPoint: true,
    standards: ["IEC 61439-6", "QCVN 12:2014/BXD", "TCVN 9206:2012"],
    deliverables: [
      "Biên bản Nghiệm thu Lắp đặt Busway",
      "Báo cáo Đo Megger Cáp/Busduct",
      "Biên bản Siết Bu-lông Lực",
    ],
    roles: { responsible: "Kỹ sư Điện Chuyên trách", approver: "Kỹ sư Giám sát Điện TVGS" },
    criteria: [
      "Điện trở cách điện giữa các pha và pha với vỏ R ≥ 100 MΩ",
      "Đai treo lò xo hấp thu dao động co giãn nhiệt đạt chuẩn",
    ],
    gateStatus: "pending",
  },
  {
    id: "step-3-8",
    code: "B3.8",
    seq: 25,
    stageIndex: 3,
    title: "Lắp Đặt Tuyến Ống Gió Trục Đứng (Hút Khói & Tăng Áp Thang Bộ)",
    desc: "Ghép nối ống gió bích TDC/V kín khít, bọc tấm chống cháy đạt giới hạn chịu lửa EI 60 / EI 120, chèn vật liệu chống cháy lan Firestop xuyên sàn.",
    discipline: ["M"],
    isHoldPoint: true,
    standards: ["QCVN 06:2022/BXD", "TCVN 5687:2024", "DW143 Standard"],
    deliverables: [
      "Biên bản Nghiệm thu Tuyến Ống Gió Trục",
      "Chứng chỉ Thử Chống Cháy EI",
      "Biên bản Nghiệm thu Firestop",
    ],
    roles: { responsible: "Kỹ sư HVAC Hiện trường", approver: "Kỹ sư Giám sát TVGS" },
    criteria: [
      "Tuyến ống gió trục đạt cấp độ chịu lửa EI 60 hoặc EI 120 theo thiết kế",
      "Chèn vữa/keo chống cháy Firestop kín 100% chu vi xuyên sàn",
    ],
    gateStatus: "locked",
  },

  // ── GIAI ĐOẠN 4: NGHIỆM THU T&C, CÂN CHỈNH & IPC (6 BƯỚC) ──
  {
    id: "step-4-1",
    code: "B4.1",
    seq: 26,
    stageIndex: 4,
    title: "Thử Nghiệm Áp Lực Thủy Tĩnh Tuyến Ống Nước 2 Giờ (Hydrostatic Test)",
    desc: "Bơm áp lực P_test = 1.5 x P_làm việc (tối thiểu 10 bar) duy trì trong 02 giờ liên tục bằng đồng hồ có kiểm định, độ sụt áp ΔP ≤ 0.02 MPa (0.2 bar).",
    discipline: ["M", "P", "F"],
    isHoldPoint: true,
    standards: ["TCVN 4513:1988", "TCVN 7336:2021", "NFPA 13/24", "ASME B31.9"],
    deliverables: [
      "Biên bản Thử Áp lực Thủy tĩnh Ký 3 Bên",
      "Biểu đồ Ghi Áp suất Điện tử IoT",
      "Ảnh chụp Đồng hồ Áp kế Kiểm định",
    ],
    roles: { responsible: "Chỉ Huy Trưởng Thi Công", approver: "Kỹ sư Trưởng TVGS" },
    criteria: [
      "Áp suất thử duy trì ổn định không rò rỉ trong 120 phút liên tục",
      "Độ sụt áp tối đa ΔP ≤ 0.2 bar do cân bằng nhiệt độ",
    ],
    gateStatus: "approved",
    approvedBy: "Lê Văn Tuấn (Kỹ sư Trưởng TVGS)",
    approvedAt: "2026-07-20 16:00",
    hashSignature: "SHA256:44556677889900aabbccddee",
  },
  {
    id: "step-4-2",
    code: "B4.2",
    seq: 27,
    stageIndex: 4,
    title: "Xúc Rửa Đường Ống (Flushing) & Thụ Động Hóa Hóa Chất Tuyến Chiller",
    desc: "Xúc xả nước tuần hoàn loại bỏ xỉ hàn và cặn bẩn, súc rửa hóa chất thụ động hóa bề mặt ống Chiller, nạp nước xử lý chống ăn mòn.",
    discipline: ["M"],
    isHoldPoint: false,
    standards: ["BSRIA BG 29/2020", "ASHRAE Guideline 12"],
    deliverables: [
      "Biên bản Xúc xả Đường ống",
      "Phiếu Phân tích Chất lượng Nước Nạp",
      "Chứng nhận Hóa chất Xử lý",
    ],
    roles: { responsible: "Kỹ sư Xử lý Nước / HVAC", approver: "Kỹ sư Giám sát Cơ điện TVGS" },
    criteria: [
      "Độ đục nước xả ra tương đương nước cấp vào; chỉ số TDS trong ngưỡng cho phép",
      "Không còn cát, xỉ hàn hoặc dị vật trong lưới lọc Y",
    ],
    gateStatus: "approved",
    approvedBy: "Hoàng Minh Tâm (Lead MEP Engineer)",
    approvedAt: "2026-07-25 15:30",
    hashSignature: "SHA256:8899aabbccddeeff00112233",
  },
  {
    id: "step-4-3",
    code: "B4.3",
    seq: 28,
    stageIndex: 4,
    title: "Thử Độ Kín Tuyến Ống Gió Chuẩn DW143 & Thử Áp Lực Khí Nitơ Tuyến Ga",
    desc: "Đo rò rỉ khí ống gió bằng máy tạo áp chuyên dụng Class B/C theo DW143; thử kín tuyến ống ga VRV bằng khí Nitơ áp suất 4.15 MPa trong 24 giờ.",
    discipline: ["M"],
    isHoldPoint: true,
    standards: ["DW143 Air Duct Leakage", "SMACNA HVAC Duct", "TCVN 5687:2024"],
    deliverables: [
      "Biên bản Thử Kín Tuyến Ống Gió",
      "Biên bản Giữ Áp Nitơ Tuyến Ga",
      "Báo cáo Hút Chân Không 500 Microns",
    ],
    roles: { responsible: "Kỹ sư Kiểm định T&C", approver: "Kỹ sư Giám sát TVGS" },
    criteria: [
      "Mức độ rò rỉ khí Q_leak ≤ C x P^0.65 theo tiêu chuẩn DW143",
      "Đường ống ga không sụt áp trong 24 giờ thử nghiệm",
    ],
    gateStatus: "approved",
    approvedBy: "Hoàng Minh Tâm (Lead MEP Engineer)",
    approvedAt: "2026-08-02 11:00",
    hashSignature: "SHA256:ccddeeff0011223344556677",
  },
  {
    id: "step-4-4",
    code: "B4.4",
    seq: 29,
    stageIndex: 4,
    title: "Cân Bằng Khí Động Học & Thủy Lực HVAC TAB (NEBB/ASHRAE 202)",
    desc: "Đo lưu lượng gió miệng gió bằng phễu Balometer, cân chỉnh van VCD dung sai ±10%; cân bằng lưu lượng nước lạnh Chiller bằng van cân bằng số.",
    discipline: ["M"],
    isHoldPoint: true,
    standards: ["NEBB Procedural Standards", "ASHRAE 202", "TCVN 5687:2024"],
    deliverables: [
      "Báo cáo Kết quả Cân chỉnh HVAC TAB",
      "Bảng Đo Lưu lượng Miệng Gió",
      "Bảng Lưu lượng Nước Chiller",
    ],
    roles: { responsible: "Đơn vị Độc lập TAB", approver: "Chuyên Gia Cơ Điện TVGS" },
    criteria: [
      "Sai lệch lưu lượng gió tại từng miệng gió nằm trong dải -10% đến +10%",
      "Cân bằng thủy lực các nhánh AHU/FCU đạt thiết kế",
    ],
    gateStatus: "pending",
  },
  {
    id: "step-4-5",
    code: "B4.5",
    seq: 30,
    stageIndex: 4,
    title: "Chạy Thử Ma Trận An Toàn Sinh Mạng PCCC Liên Động 10 Phân Hệ",
    desc: "Báo cháy giả lập → Cắt AHU/FCU ≤3s → Đóng MFD ≤5s → Bật quạt khói/tăng áp thang ≤15s (ΔP=20-50Pa) → Hạ thang máy ≤30s → Nhả khóa từ Maglock ≤1s.",
    discipline: ["M", "E", "F", "ELV"],
    isHoldPoint: true,
    standards: ["QCVN 06:2022/BXD", "TCVN 5738:2021", "TCVN 7336:2021", "NFPA 72"],
    deliverables: [
      "Biên bản Nghiệm thu Ma trận Liên động PCCC",
      "Video Ghi hình Thử nghiệm Thực tế",
      "Bảng Log Tín hiệu FAS & BMS",
    ],
    roles: { responsible: "Tổng Thầu MEPF / Trưởng Nhóm T&C", approver: "Kỹ sư Trưởng TVGS & CĐT" },
    criteria: [
      "100% kịch bản liên động an toàn phản ứng đúng thời gian thực",
      "Đo áp suất chênh lệch buồng thang bộ đạt chuẩn 20 - 50 Pa",
    ],
    gateStatus: "locked",
  },
  {
    id: "step-4-6",
    code: "B4.6",
    seq: 31,
    stageIndex: 4,
    title: "Thanh Toán Giai Đoạn IPC & Ký Số Hồ Sơ Khối Lượng Hoàn Thành",
    desc: "Lập chứng chỉ thanh toán IPC kỳ 6 theo Thông tư 96/2021/TT-BTC & FIDIC, đối soát 4 chiều: Q_report ≤ min(Q_BIM, Q_BOQ, Q_GRN) và ký số 3 bên.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: false,
    standards: ["Thông tư 96/2021/TT-BTC", "Nghị định 99/2021/NĐ-CP", "FIDIC Cl 14.3"],
    deliverables: [
      "Chứng chỉ Thanh toán IPC Số",
      "Bảng Tính Giá trị Hoàn thành",
      "Báo cáo Khấu trừ Tạm ứng & Giữ lại",
    ],
    roles: { responsible: "Kỹ sư QS Tổng Thầu", approver: "Ban Giám Đốc CĐT" },
    criteria: [
      "100% khối lượng đề nghị thanh toán đã có BBNT ký duyệt tương ứng",
      "Không có tranh chấp phát sinh chưa giải quyết",
    ],
    gateStatus: "locked",
  },

  // ── GIAI ĐOẠN 5: HOÀN CÔNG, PHÁP LÝ NHÀ NƯỚC & BÀN GIAO SỐ COBie (5 BƯỚC) ──
  {
    id: "step-5-1",
    code: "B5.1",
    seq: 32,
    stageIndex: 5,
    title: "Nghiệm Thu Chấp Thuận Của Cảnh Sát PCCC & CNCH (Bộ Công An)",
    desc: "Tổ chức nghiệm thu thực tế với Đoàn Kiểm tra Cảnh sát PCCC & CNCH, đo kiểm áp suất lưu lượng trụ nước, buồng thang và cấp văn bản chấp thuận.",
    discipline: ["F", "M", "E"],
    isHoldPoint: true,
    standards: ["Nghị định 136/2020/NĐ-CP", "Nghị định 50/2024/NĐ-CP", "Luật PCCC"],
    deliverables: [
      "Văn bản Chấp thuận Nghiệm thu PCCC Chính thức",
      "Biên bản Kiểm tra Hiện trường Đoàn PCCC",
    ],
    roles: { responsible: "Chủ Đầu Tư / Tổng Thầu MEPF", approver: "Cục Cảnh Sát PCCC & CNCH" },
    criteria: [
      "Đạt 100% các nội dung kiểm tra thử nghiệm thực tế của cơ quan Công an",
      "Văn bản chấp thuận nghiệm thu PCCC được ký ban hành chính thức",
    ],
    gateStatus: "locked",
  },
  {
    id: "step-5-2",
    code: "B5.2",
    seq: 33,
    stageIndex: 5,
    title: "Nghiệm Thu Đóng Điện Trạm Biến Áp (EVN) & Đấu Nối Cấp Thoát Nước",
    desc: "Đóng điện trạm biến áp trung/hạ thế chính thức với Công ty Điện lực EVN, hoàn tất thỏa thuận đấu nối đồng hồ cấp nước và xả thải môi trường.",
    discipline: ["E", "P"],
    isHoldPoint: true,
    standards: ["Quy định Kỹ thuật Lưới điện Phân phối EVN", "QCVN 14:2008/BTNMT"],
    deliverables: [
      "Biên bản Đóng điện Hòa lưới EVN",
      "Hợp đồng Mua bán Điện",
      "Thỏa thuận Đấu nối Cấp thoát nước",
    ],
    roles: { responsible: "Nhà thầu Điện / CĐT", approver: "Tổng Công ty Điện lực (EVN)" },
    criteria: [
      "Rơ-le bảo vệ kỹ thuật số và hệ số cos phi đạt chuẩn yêu cầu lưới điện",
      "Hệ thống đo đếm TU/TI niêm phong chì kiểm định",
    ],
    gateStatus: "locked",
  },
  {
    id: "step-5-3",
    code: "B5.3",
    seq: 34,
    stageIndex: 5,
    title: "Kiểm Tra Nghiệm Thu Hoàn Thành Công Trình (Điều 24 Nghị Định 06/2021/NĐ-CP)",
    desc: "Cơ quan Chuyên môn về Xây dựng (Sở Xây dựng / Cục Giám định) kiểm tra hiện trường, thẩm tra hồ sơ hoàn thành và ban hành Văn bản chấp thuận.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: true,
    standards: ["Nghị định 06/2021/NĐ-CP (Điều 24)", "Luật Xây dựng 2020"],
    deliverables: [
      "Văn bản Chấp thuận Kết quả Nghiệm thu Hoàn thành Công trình (Điều 24)",
      "Thông báo Kết quả Kiểm tra",
    ],
    roles: { responsible: "Chủ Đầu Tư & TVGS", approver: "Sở Xây Dựng / Cục Giám Định Nhà Nước" },
    criteria: [
      "Công trình hoàn thành đúng thiết kế được duyệt và giấy phép xây dựng",
      "Đã có đầy đủ văn bản chấp thuận PCCC, Môi trường, Điện lực",
    ],
    gateStatus: "locked",
  },
  {
    id: "step-5-4",
    code: "B5.4",
    seq: 35,
    stageIndex: 5,
    title: "Đóng Gói Bộ Hồ Sơ Hoàn Thành 8 Tập (Phụ Lục VI) & Bản Vẽ As-Built",
    desc: "Đóng gói 8 tập hồ sơ hoàn thành chuẩn Phụ lục VI NĐ 06/2021/NĐ-CP, cập nhật 100% bản vẽ hoàn công As-built có đóng khung dấu 3 bên.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: false,
    standards: ["Phụ lục VI & Phụ lục II Nghị định 06/2021/NĐ-CP"],
    deliverables: [
      "Bộ Hồ Sơ Hoàn Thành 8 Tập Đóng Gáy",
      "Bộ Bản Vẽ Hoàn Công As-Built",
      "Tài liệu O&M Hướng Dẫn Vận Hành",
    ],
    roles: { responsible: "Bộ phận Hồ sơ Hoàn Công", approver: "TVGS & Ban QLDA CĐT" },
    criteria: [
      "Khung dấu hoàn công đúng kích thước 120x60mm đủ 3 chữ ký",
      "Hồ sơ pháp lý, chứng chỉ vật tư sắp xếp khoa học tra cứu thuận tiện",
    ],
    gateStatus: "locked",
  },
  {
    id: "step-5-5",
    code: "B5.5",
    seq: 36,
    stageIndex: 5,
    title: "Bàn Giao Hộ Chiếu Số COBie LOD 500, Đào Tạo FM & Quyết Toán A-B",
    desc: "Chuyển giao dữ liệu tài sản số COBie LOD 500 gắn mã QR trên từng thiết bị, đào tạo đội ngũ vận hành FM, quyết toán hợp đồng và bảo hành DLP.",
    discipline: ["M", "E", "P", "F", "ELV"],
    isHoldPoint: true,
    standards: ["ISO 19650-3 (BIM FM)", "COBie Standard", "FIDIC Cl 14.11"],
    deliverables: [
      "Hộ Chiếu Tài Sản Số COBie LOD 500",
      "Biên bản Bàn giao & Đào tạo FM",
      "Bản Quyết toán Hợp đồng A-B",
      "Chứng chỉ Bảo hành DLP",
    ],
    roles: { responsible: "Tổng Thầu MEPF", approver: "Chủ Đầu Tư & Đơn Vị Quản Lý FM" },
    criteria: [
      "100% thiết bị vật lý dán mã QR liên kết đúng hồ sơ O&M trên hệ thống",
      "Quyết toán A-B khớp đúng công thức đại số không sai lệch",
    ],
    gateStatus: "locked",
  },
];

// ── 7 ĐẠI TRUNG TÂM ĐIỀU HÀNH THU GỌN ──

const UNIFIED_COCKPITS = [
  {
    num: "1",
    title: "MEPF CAD/BIM Studio",
    sub: "MEPF Core",
    desc: "3D/4D BIM WebGPU, Scan-to-BIM, BCF 3.0, CNC G-Code",
    href: "/engineering/god-tier-studio",
    icon: Sparkles,
  },
  {
    num: "2",
    title: "Chỉ Huy Hiện Trường & An Toàn",
    sub: "5 Trạm",
    desc: "Việc của tôi, Nhật ký TT06, Nghiệm thu, Mặt bằng & AI HSE",
    href: "/site",
    icon: HardHat,
  },
  {
    num: "3",
    title: "Kế Hoạch & Tiến Độ WBS",
    sub: "4 Trụ Cột",
    desc: "Lưới 6 hệ, CPM Gantt, Lookahead, EVM SPI/CPI",
    href: "/schedule",
    icon: CalendarCheck,
  },
  {
    num: "4",
    title: "Chuỗi Cung Ứng & Vật Tư",
    sub: "4 Khâu",
    desc: "Định mức BOQ, Đấu thầu Vendor, Đơn hàng PO & QR GRN",
    href: "/procurement",
    icon: Package,
  },
  {
    num: "5",
    title: "Hợp Đồng, Chi Phí & FIDIC",
    sub: "4 Khối",
    desc: "Hợp đồng A-B, Chứng chỉ IPC, Phát sinh VO, Claims",
    href: "/commercial",
    icon: Coins,
  },
  {
    num: "6",
    title: "Trí Tuệ AI & Digital Twin",
    sub: "AI Apex",
    desc: "Zalo Copilot, Gate 0, AI Swarm Debates & IoT Telemetry",
    href: "/engineering-intelligence",
    icon: Brain,
  },
  {
    num: "7",
    title: "Quản Trị Dự Án & Hệ Thống",
    sub: "Governance",
    desc: "Khởi công Đ107, Bàn giao Đ24, CDE Hồ sơ & Audit Log",
    href: "/governance",
    icon: Landmark,
  },
];

export default function CleanMepfProcessPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState<number>(3); // GĐ 3 default
  const [selectedDiscipline, setSelectedDiscipline] = useState<TradeDiscipline>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [steps, setSteps] = useState<StepItem[]>(MASTER_STEPS);
  const [activeStepId, setActiveStepId] = useState<string>("step-3-6");
  const [activeView, setActiveView] = useState<"workspace" | "matrix" | "cockpits" | "audit">(
    "workspace",
  );

  // Checklist Item interactive state
  const [checkedCriteria, setCheckedCriteria] = useState<Record<string, boolean>>({});
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCockpitsDrawer, setShowCockpitsDrawer] = useState(false);

  useEffect(() => {
    fetchMe().then((u) => {
      setMe(u);
      setLoading(false);
    });
  }, []);

  // Filtered steps in current stage
  const currentStageSteps = useMemo(() => {
    return steps.filter((s) => s.stageIndex === selectedStage);
  }, [steps, selectedStage]);

  const filteredSteps = useMemo(() => {
    return currentStageSteps.filter((s) => {
      const matchDisc =
        selectedDiscipline === "all" ||
        s.discipline.includes(selectedDiscipline as "M" | "E" | "P" | "F" | "ELV");
      const matchQuery =
        !searchQuery ||
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.standards.some((std) => std.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchDisc && matchQuery;
    });
  }, [currentStageSteps, selectedDiscipline, searchQuery]);

  // Selected Active Step
  const activeStep = useMemo(() => {
    return steps.find((s) => s.id === activeStepId) ?? filteredSteps[0] ?? currentStageSteps[0];
  }, [steps, activeStepId, filteredSteps, currentStageSteps]);

  // Summary Metrics
  const summary = useMemo(() => {
    const total = steps.length;
    const approved = steps.filter((s) => s.gateStatus === "approved").length;
    const pending = steps.filter((s) => s.gateStatus === "pending").length;
    const rejected = steps.filter((s) => s.gateStatus === "rejected").length;
    const locked = steps.filter((s) => s.gateStatus === "locked").length;
    const pct = Math.round((approved / total) * 100);
    return { total, approved, pending, rejected, locked, pct };
  }, [steps]);

  // Sign-off Gate Handler
  async function handleApprove(stepId: string) {
    setIsSubmitting(true);
    const approver = me?.name ? `${me.name} (Kỹ sư TVGS)` : "Kỹ sư Giám Sát TVGS";
    const approvedAt = new Date().toISOString().replace("T", " ").slice(0, 16);

    let hashSignature = `SHA256:AUTHENTICATED`;
    if (typeof window !== "undefined" && window.crypto?.subtle) {
      try {
        const payload = `GATE:${stepId}:${approver}:${approvedAt}:${me?.id ?? 0}`;
        const msgBuffer = new TextEncoder().encode(payload);
        const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        hashSignature = `SHA256:${hex.slice(0, 16).toUpperCase()}`;
      } catch {
        // Fallback standard marker
      }
    }

    setSteps((prev) => {
      const next = [...prev];
      const idx = next.findIndex((s) => s.id === stepId);
      if (idx !== -1) {
        next[idx] = {
          ...next[idx],
          gateStatus: "approved",
          approvedBy: approver,
          approvedAt,
          hashSignature,
        };

        // Unlock next step
        if (idx + 1 < next.length && next[idx + 1].gateStatus === "locked") {
          next[idx + 1] = {
            ...next[idx + 1],
            gateStatus: "pending",
          };
        }
      }
      return next;
    });
    setIsSubmitting(false);
  }

  // Reject / NCR Handler
  function handleReject(stepId: string) {
    if (!rejectReason.trim()) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setSteps((prev) => {
        const next = [...prev];
        const idx = next.findIndex((s) => s.id === stepId);
        if (idx !== -1) {
          next[idx] = {
            ...next[idx],
            gateStatus: "rejected",
            rejectionReason: rejectReason.trim(),
          };
        }
        return next;
      });
      setIsSubmitting(false);
      setShowRejectModal(false);
      setRejectReason("");
    }, 300);
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans">
      <AppHeader
        title="Quy Trình Triển Khai Thi Công MEPF"
        subtitle="Hệ thống điều hành tuần tự 6 giai đoạn & Cổng kiểm soát kỹ sư từng bước"
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5 pb-24">
        {/* Navigation Breadcrumb */}
        <EngineeringNav />

        {/* ── TOP HEADER BAR: KHOA HỌC & GỌN GÀNG ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-zinc-100 uppercase tracking-tight">
                  QUY TRÌNH THI CÔNG MEPF & CỔNG DUYỆT KỸ SƯ
                </h1>
                <span className="text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                  TT AVIO — Tháp A
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Tiến độ: <b className="text-zinc-200">{summary.pct}%</b> ({summary.approved}/
                {summary.total} bước) • Đang chờ duyệt:{" "}
                <b className="text-amber-400">{summary.pending}</b>
              </p>
            </div>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              onClick={() => setActiveView("workspace")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeView === "workspace"
                  ? "bg-amber-500 text-on-accent-dark shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <Workflow className="w-3.5 h-3.5" />
              Bàn Làm Việc Tác Nghiệp
            </button>
            <button
              onClick={() => setActiveView("matrix")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeView === "matrix"
                  ? "bg-amber-500 text-on-accent-dark shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Ma Trận 5 Hệ
            </button>
            <button
              onClick={() => setActiveView("cockpits")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeView === "cockpits"
                  ? "bg-amber-500 text-on-accent-dark shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />7 Đại Trung Tâm
            </button>
            <button
              onClick={() => setActiveView("audit")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeView === "audit"
                  ? "bg-amber-500 text-on-accent-dark shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Sổ Cái Ký Số
            </button>
          </div>
        </div>

        {/* ── 6 GIAI ĐOẠN PROGRESS STEPPER RIBBON (GỌN GÀNG, DỄ BẤM) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {STAGES.map((stg) => {
            const isSelected = selectedStage === stg.index;
            const stageSteps = steps.filter((s) => s.stageIndex === stg.index);
            const approvedCount = stageSteps.filter((s) => s.gateStatus === "approved").length;
            const totalCount = stageSteps.length;
            const stagePct = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0;

            return (
              <button
                key={stg.index}
                onClick={() => {
                  setSelectedStage(stg.index);
                  const firstInStage = steps.find((s) => s.stageIndex === stg.index);
                  if (firstInStage) setActiveStepId(firstInStage.id);
                }}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between group ${
                  isSelected
                    ? "bg-zinc-900 border-amber-500/80 ring-1 ring-amber-500/40 shadow-sm"
                    : "bg-zinc-900/50 border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase ${
                        isSelected ? "text-amber-400" : "text-zinc-400"
                      }`}
                    >
                      {stg.stageCode}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                        stagePct === 100
                          ? "bg-emerald-500/10 text-emerald-400"
                          : stagePct > 0
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {stagePct}%
                    </span>
                  </div>
                  <h4
                    className={`text-xs font-semibold truncate leading-tight ${
                      isSelected
                        ? "text-white font-bold"
                        : "text-zinc-300 group-hover:text-amber-300"
                    }`}
                  >
                    {stg.name}
                  </h4>
                  <p className="text-[10px] text-zinc-500 font-mono truncate">{stg.shortDesc}</p>
                </div>

                <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden mt-2.5">
                  <div
                    className={`h-full transition-all duration-300 ${
                      stagePct >= 100
                        ? "bg-emerald-500"
                        : stagePct >= 50
                          ? "bg-amber-500"
                          : "bg-sky-500"
                    }`}
                    style={{ width: `${stagePct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* ── WORKSPACE VIEW: MASTER-DETAIL 2-COLUMN ERGONOMIC LAYOUT ── */}
        {activeView === "workspace" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
            {/* ── CỘT TRÁI (4/12): DANH SÁCH BƯỚC TUẦN TỰ (PIPELINE) ── */}
            <div className="lg:col-span-4 p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3 shadow-sm">
              {/* Filter by Discipline & Search */}
              <div className="space-y-2 pb-3 border-b border-zinc-800">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                    Lọc Phân Hệ:
                  </span>
                  <span className="font-mono text-zinc-500 text-[11px]">
                    {filteredSteps.length} bước
                  </span>
                </div>

                {/* 5-Trade Filter Pills */}
                <div className="grid grid-cols-6 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-[10px] font-mono font-bold text-center">
                  {(["all", "M", "E", "P", "F", "ELV"] as TradeDiscipline[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setSelectedDiscipline(d)}
                      className={`py-1 rounded-lg transition ${
                        selectedDiscipline === d
                          ? "bg-zinc-800 text-amber-300 shadow-xs border border-zinc-700"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {d === "all" ? "Tất Cả" : d}
                    </button>
                  ))}
                </div>

                {/* Quick Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm theo mã hoặc tên bước..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              {/* Vertical Stepper List */}
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
                {filteredSteps.map((step) => {
                  const isActive = step.id === activeStep.id;
                  const isApproved = step.gateStatus === "approved";
                  const isPending = step.gateStatus === "pending";
                  const isRejected = step.gateStatus === "rejected";
                  const isLocked = step.gateStatus === "locked";

                  return (
                    <button
                      key={step.id}
                      onClick={() => setActiveStepId(step.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-2.5 group ${
                        isActive
                          ? "bg-zinc-800/90 border-amber-500/60 ring-1 ring-amber-500/30 shadow-xs"
                          : "bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-800/50 hover:border-zinc-700"
                      }`}
                    >
                      {/* Gate Status Icon */}
                      <div
                        className={`p-1.5 rounded-lg border shrink-0 mt-0.5 ${
                          isApproved
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : isPending
                              ? "bg-amber-500/10 border-amber-500/40 text-amber-400 animate-pulse"
                              : isRejected
                                ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                                : "bg-zinc-900 border-zinc-800 text-zinc-600"
                        }`}
                      >
                        {isApproved ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : isPending ? (
                          <Clock className="w-3.5 h-3.5" />
                        ) : isRejected ? (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        ) : (
                          <Lock className="w-3.5 h-3.5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`font-mono text-[10px] font-bold ${
                              isActive ? "text-amber-400" : "text-zinc-400"
                            }`}
                          >
                            {step.code}
                          </span>
                          {step.isHoldPoint && (
                            <span className="text-[9px] font-mono font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.2 rounded">
                              HOLD
                            </span>
                          )}
                        </div>
                        <h4
                          className={`text-xs font-semibold truncate mt-0.5 ${
                            isActive
                              ? "text-white font-bold"
                              : "text-zinc-300 group-hover:text-zinc-100"
                          }`}
                        >
                          {step.title}
                        </h4>
                        <div className="flex items-center gap-1 mt-1">
                          {step.discipline.map((d) => (
                            <span
                              key={d}
                              className="text-[9px] font-mono text-zinc-400 bg-zinc-900 px-1 py-0.2 rounded border border-zinc-800"
                            >
                              {d}
                            </span>
                          ))}
                          <span className="text-[10px] text-zinc-500 ml-auto font-mono">
                            {isApproved
                              ? "✓ Đã duyệt"
                              : isPending
                                ? "⏳ Chờ duyệt"
                                : isRejected
                                  ? "✕ NCR"
                                  : "🔒 Khóa"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── CỘT PHẢI (8/12): TRỌNG TÂM TÁC NGHIỆP BƯỚC ĐANG CHỌN (ACTIVE STEP FOCUS HUB) ── */}
            <div className="lg:col-span-8 p-5 sm:p-6 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-5 shadow-sm">
              {/* Header của Bước */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-zinc-800 pb-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                      {activeStep.code} • {STAGES[activeStep.stageIndex].stageCode}
                    </span>
                    {activeStep.isHoldPoint && (
                      <span className="text-[11px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5" /> ĐIỂM DỪNG KỸ THUẬT (HOLD-POINT)
                      </span>
                    )}
                    <span
                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg border ${
                        activeStep.gateStatus === "approved"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : activeStep.gateStatus === "pending"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse"
                            : activeStep.gateStatus === "rejected"
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                              : "bg-zinc-800 text-zinc-400 border-zinc-700"
                      }`}
                    >
                      {activeStep.gateStatus === "approved"
                        ? "ĐÃ PHÊ DUYỆT (PASSED)"
                        : activeStep.gateStatus === "pending"
                          ? "CHỜ KỸ SƯ DUYỆT CỔNG"
                          : activeStep.gateStatus === "rejected"
                            ? "TỪ CHỐI (CÓ PHIẾU NCR)"
                            : "ĐANG BỊ KHÓA TUẦN TỰ"}
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-zinc-100">
                    {activeStep.title}
                  </h2>
                  <p className="text-xs text-zinc-400 leading-relaxed">{activeStep.desc}</p>
                </div>
              </div>

              {/* 4 Khối Tác Nghiệp Rõ Ràng & Khoa Học */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Khối 1: Checklist Kiểm Tra Thực Tế */}
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                      Checklist Tiêu Chí Nghiệm Thu:
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">Tương tác kiểm tra</span>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {activeStep.criteria.map((cr, idx) => {
                      const key = `${activeStep.id}-${idx}`;
                      const isChecked =
                        checkedCriteria[key] ?? activeStep.gateStatus === "approved";

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setCheckedCriteria((p) => ({ ...p, [key]: !isChecked }))}
                          className="w-full text-left p-2 rounded-lg bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 flex items-start gap-2 text-xs transition"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
                          )}
                          <span
                            className={isChecked ? "text-zinc-200 font-medium" : "text-zinc-400"}
                          >
                            {cr}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Khối 2: Quy Chuẩn & Tiêu Chuẩn Kỹ Thuật */}
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-sky-400" />
                      Quy Chuẩn & Hồ Sơ Bàn Giao:
                    </span>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-[10px] text-zinc-500 font-semibold uppercase block mb-1">
                          Tiêu chuẩn viện dẫn:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {activeStep.standards.map((std, sidx) => (
                            <span
                              key={sidx}
                              className="text-[11px] font-mono text-zinc-300 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded"
                            >
                              {std}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-zinc-500 font-semibold uppercase block mb-1">
                          Hồ sơ / BBNT yêu cầu:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {activeStep.deliverables.map((del, didx) => (
                            <span
                              key={didx}
                              className="text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 rounded font-medium"
                            >
                              {del}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-800/60 text-[11px] text-zinc-400 flex items-center justify-between">
                    <span>
                      Thực hiện: <b>{activeStep.roles.responsible}</b>
                    </span>
                    <span>
                      Duyệt: <b>{activeStep.roles.approver}</b>
                    </span>
                  </div>
                </div>
              </div>

              {/* ── CỔNG DUYỆT KỸ SƯ 3 BÊN (ENGINEER SIGN-OFF GATE ACTION HUB) ── */}
              <div className="p-4 sm:p-5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-zinc-100 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-amber-400" />
                      CỔNG PHÊ DUYỆT KỸ SƯ CHUYỂN BƯỚC (ENGINEER SIGN-OFF GATE)
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {activeStep.gateStatus === "approved"
                        ? `Đã được phê duyệt bởi: ${activeStep.approvedBy} lúc ${activeStep.approvedAt}`
                        : activeStep.gateStatus === "pending"
                          ? "Kỹ sư TVGS kiểm tra thực tế đạt các tiêu chuẩn trên để mở khóa bước tiếp theo."
                          : activeStep.gateStatus === "rejected"
                            ? `Bị từ chối: “${activeStep.rejectionReason}”`
                            : "Bị khóa — Hoàn thành các bước trước đó để mở khóa cổng này."}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {activeStep.gateStatus === "pending" && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowRejectModal(true)}
                          disabled={isSubmitting}
                          className="px-3.5 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-semibold border border-rose-800/80 transition"
                        >
                          ✕ Từ Chối / Lập NCR
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprove(activeStep.id)}
                          disabled={isSubmitting}
                          className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-on-accent text-xs font-bold shadow-md flex items-center gap-1.5 transition disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" /> Kỹ Sư Ký Duyệt Chuyển Bước
                        </button>
                      </>
                    )}

                    {activeStep.gateStatus === "approved" && activeStep.hashSignature && (
                      <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-800/60 px-3 py-1.5 rounded-xl text-xs font-mono text-emerald-300">
                        <BadgeCheck className="w-4 h-4 text-emerald-400" />
                        <span>Chữ Ký Số: {activeStep.hashSignature.substring(0, 16)}...</span>
                      </div>
                    )}

                    {activeStep.gateStatus === "locked" && (
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
                        <Lock className="w-3.5 h-3.5" /> Bị Khóa Tuần Tự
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: MA TRẬN 5 HỆ MEPF ── */}
        {activeView === "matrix" && (
          <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  MA TRẬN PHÂN KHAI 5 PHÂN HỆ MEPF & ĐIỂM DỪNG KỸ THUẬT
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Bóc tách chi tiết từng cấu kiện, giai đoạn thi công và tiêu chí kiểm soát chất
                  lượng
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-zinc-950 text-zinc-400 font-semibold border-b border-zinc-800">
                  <tr>
                    <th className="p-3">Hệ</th>
                    <th className="p-3">Hạng Mục Cấu Kiện</th>
                    <th className="p-3">Giai Đoạn Thi Công</th>
                    <th className="p-3">Quy Chuẩn & Tiêu Chuẩn</th>
                    <th className="p-3">Điểm Dừng Hold-Point</th>
                    <th className="p-3 text-right">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70 font-sans">
                  {[
                    {
                      trade: "M (HVAC)",
                      item: "Đường ống Nước lạnh Chilled Water",
                      phase: "Trục Đứng & Hành Lang",
                      spec: "Thử áp 1.5 x Plv (2h), sụt áp ≤ 0.2 bar; bọc bảo ôn không cầu nhiệt",
                      hold: "Bắt buộc thử áp tĩnh",
                      status: "Đã duyệt",
                      color: "text-emerald-400",
                    },
                    {
                      trade: "M (HVAC)",
                      item: "Tuyến Ống Gió Hút Khói & Tăng Áp",
                      phase: "Trục Đứng & Tầng",
                      spec: "Độ kín chuẩn DW143 Class B/C; bọc chống cháy EI 60 / EI 120",
                      hold: "Thử rò rỉ DW143",
                      status: "Đang thi công",
                      color: "text-amber-400",
                    },
                    {
                      trade: "E (Điện)",
                      item: "Trục Busduct & Máng Cáp Động Lực",
                      phase: "Trục Đứng Riser",
                      spec: "Megger 1000V R ≥ 100 MΩ; siết cờ lê lực gãy chốt; tiếp địa đẳng thế",
                      hold: "Đo điện trở cách điện",
                      status: "Chờ kiểm tra",
                      color: "text-amber-400",
                    },
                    {
                      trade: "E (Điện)",
                      item: "Bãi Tiếp Địa & Lưới Chống Sét",
                      phase: "Ngầm Móng",
                      spec: "R ≤ 10 Ω (Chống sét), R ≤ 4 Ω (Biến áp), R ≤ 1 Ω (Data Center)",
                      hold: "Nghiệm thu trước đổ bê tông",
                      status: "Đã duyệt",
                      color: "text-emerald-400",
                    },
                    {
                      trade: "P (Cấp Thoát)",
                      item: "Tuyến Ống Thoát Nước Trọng Lực",
                      phase: "Âm Sàn & Trục Đứng",
                      spec: "Bảo toàn độ dốc 1.0% - 2.0%; bẫy nước ngăn mùi H ≥ 50mm",
                      hold: "Thử kín thông thủy",
                      status: "Đã duyệt",
                      color: "text-emerald-400",
                    },
                    {
                      trade: "F (PCCC)",
                      item: "Mạng Lưới Đầu Phun Chữa Cháy Sprinkler",
                      phase: "Phân Phối Tầng",
                      spec: "Ống Sch40 cùm Grooved; thử áp 15 bar trong 2h; hạ ty đúng tâm trần",
                      hold: "Thử áp lực thủy tĩnh",
                      status: "Đang thi công",
                      color: "text-amber-400",
                    },
                    {
                      trade: "ELV (Điện Nhẹ)",
                      item: "Hạ Tầng Cáp Mạng & BMS DDC Control",
                      phase: "Hành Lang & Phòng Server",
                      spec: "Fluke Test Cat6 Pass 100%; cách ly cáp động lực ≥ 150mm chống nhiễu EMI",
                      hold: "Fluke Channel Test",
                      status: "Chuẩn bị",
                      color: "text-zinc-500",
                    },
                  ].map((row, ridx) => (
                    <tr key={ridx} className="hover:bg-zinc-950/60 transition">
                      <td className="p-3 font-mono font-bold text-amber-400">{row.trade}</td>
                      <td className="p-3 font-semibold text-zinc-200">{row.item}</td>
                      <td className="p-3 text-zinc-400">{row.phase}</td>
                      <td className="p-3 text-zinc-300 font-mono text-[11px]">{row.spec}</td>
                      <td className="p-3">
                        <span className="text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded">
                          {row.hold}
                        </span>
                      </td>
                      <td className={`p-3 text-right font-semibold font-mono ${row.color}`}>
                        {row.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: 7 ĐẠI TRUNG TÂM ĐIỀU HÀNH ── */}
        {activeView === "cockpits" && (
          <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />7 ĐẠI TRUNG TÂM ĐIỀU HÀNH HỢP NHẤT
                  XBOSS (UNIFIED COCKPITS)
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Các cổng chỉ huy phân hệ kỹ thuật, hiện trường, tiến độ, chi phí và AI
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {UNIFIED_COCKPITS.map((hub, idx) => {
                const HubIcon = hub.icon;
                return (
                  <Link
                    key={idx}
                    href={hub.href}
                    className="p-4 rounded-xl bg-zinc-950 hover:bg-zinc-950/80 border border-zinc-800 hover:border-amber-500/50 transition-all space-y-2 flex flex-col justify-between group shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-amber-400">
                          <HubIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-zinc-100 group-hover:text-amber-300 transition-colors">
                            {hub.num}. {hub.title}
                          </h4>
                          <span className="text-[10px] font-mono text-zinc-500">{hub.sub}</span>
                        </div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 transition-colors" />
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                      {hub.desc}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB 4: SỔ CÁI KÝ SỐ MẬT MÃ ── */}
        {activeView === "audit" && (
          <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  SỔ CÁI MẬT MÃ BẤT BIẾN MERKLE TREE (M73 AUDIT TRAIL)
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Niêm phong băm SHA-256 các biên bản nghiệm thu và quyết định duyệt cổng của Kỹ sư
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                Block Height #142
              </span>
            </div>

            <div className="space-y-2">
              {steps
                .filter((s) => s.gateStatus === "approved" && s.hashSignature)
                .map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 font-bold">{s.code}</span>
                        <span className="text-zinc-200">{s.title}</span>
                      </div>
                      <span className="text-[11px] text-zinc-500">
                        Ký duyệt bởi: <b>{s.approvedBy}</b> • {s.approvedAt}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-emerald-400 font-bold text-[11px]">
                        {s.hashSignature}
                      </div>
                      <div className="text-[10px] text-zinc-600">GPS Verified (r ≤ 25m)</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </main>

      {/* ── MODAL: TỪ CHỐI / LẬP PHIẾU NCR ── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold text-rose-400 uppercase bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                  {activeStep.code} • TỪ CHỐI / LẬP PHIẾU NCR
                </span>
                <h3 className="text-sm font-bold text-zinc-100 mt-1">{activeStep.title}</h3>
              </div>
              <button
                onClick={() => setShowRejectModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <label className="block text-zinc-300 font-semibold">
                Lý do từ chối & Hướng dẫn khắc phục (Bắt buộc theo Invariant):
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Nhập sai sót kỹ thuật thực tế hiện trường, vị trí trục/tầng và biện pháp CAPA yêu cầu nhà thầu sửa chữa..."
                rows={4}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-rose-500/60 focus:outline-none"
              />
              <p className="text-[11px] text-zinc-500">
                Thao tác này sẽ khóa cứng cổng chuyển bước và gửi thông báo khẩn cấp tới Chỉ huy
                trưởng.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                disabled={isSubmitting}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => handleReject(activeStep.id)}
                disabled={isSubmitting || !rejectReason.trim()}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {isSubmitting ? "Đang xử lý..." : "Phát Hành NCR & Khóa Bước"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
