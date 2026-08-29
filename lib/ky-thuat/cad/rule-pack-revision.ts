// lib/ky-thuat/cad/rule-pack-revision.ts — Validator khóa `drawTools.revisionPolicy` (M110 §5)
/**
 * Tầng TS của "validator 2 tầng": cùng bộ luật với `RevisionPolicyConfig.Validate()` bên plugin
 * (`plugin-autocad/XBoss.Cad.Core/Draw/DrawToolsConfig.cs`). Rule pack sai ở đây thì phải chặn từ
 * lúc phát hành, đừng để kỹ sư phát hiện khi đứng trước AutoCAD (ADR-0006 nguyên tắc 1).
 *
 * Hàm thuần, không chạm DB/HTTP — dùng được cả ở test lẫn ở đường phát hành rule pack.
 */

/** Khối `drawTools.revisionPolicy` của rule pack (v11 trở đi). */
export type RevisionPolicy = {
  enabled: boolean;
  cloudArcMm: number;
  layer: string;
  triangleBlockId: string;
  numberFormat: string;
  titleblockAttrPattern: { so: string; ngay: string; noiDung: string; nguoi: string };
  maxRows: number;
  boundingPaddingMm: number;
};

/** Chỗ giữ số revision trong mọi mẫu chuỗi của khối này. */
export const O_TRONG_SO_REVISION = "{n}";

/**
 * Kiểm khối `revisionPolicy`; trả danh sách lỗi tiếng Việt (rỗng = hợp lệ).
 * `undefined` = rule pack cũ (≤ v9) không khai khối này — hợp lệ, 3 lệnh revision tự từ chối chạy.
 */
export function kiemTraRevisionPolicy(policy: RevisionPolicy | undefined): string[] {
  if (!policy) return [];
  const loi: string[] = [];

  if (!(policy.cloudArcMm > 0)) {
    loi.push(`drawTools.revisionPolicy.cloudArcMm = ${policy.cloudArcMm} phải dương.`);
  }
  if (!policy.numberFormat.includes(O_TRONG_SO_REVISION)) {
    loi.push(
      `drawTools.revisionPolicy.numberFormat "${policy.numberFormat}" thiếu ${O_TRONG_SO_REVISION} — ` +
        "mọi revision sẽ mang cùng một số.",
    );
  }
  if (policy.enabled && policy.triangleBlockId.trim() === "") {
    loi.push(
      "drawTools.revisionPolicy.triangleBlockId trống trong khi khối đang bật — " +
        "không biết chèn block tam giác nào.",
    );
  }
  if (!Number.isInteger(policy.maxRows) || policy.maxRows < 1) {
    loi.push(`drawTools.revisionPolicy.maxRows = ${policy.maxRows} phải là số nguyên ≥ 1.`);
  }
  if (policy.layer.trim() === "") {
    loi.push("drawTools.revisionPolicy.layer trống — không biết đặt cloud lên layer nào.");
  }
  if (policy.boundingPaddingMm < 0) {
    loi.push(
      `drawTools.revisionPolicy.boundingPaddingMm = ${policy.boundingPaddingMm} không được âm.`,
    );
  }
  const mau = policy.titleblockAttrPattern;
  for (const [khoa, giaTri] of Object.entries(mau) as [keyof typeof mau, string][]) {
    if (giaTri.trim() === "") {
      loi.push(`drawTools.revisionPolicy.titleblockAttrPattern.${khoa} trống.`);
      continue;
    }
    if (!giaTri.includes(O_TRONG_SO_REVISION)) {
      loi.push(
        `drawTools.revisionPolicy.titleblockAttrPattern.${khoa} "${giaTri}" thiếu ` +
          `${O_TRONG_SO_REVISION} — mọi dòng revision sẽ ghi đè lên cùng một attribute.`,
      );
    }
  }
  return loi;
}

/** Số revision theo `numberFormat` (vd `R{n}` + 2 → `R2`). */
export function soRevisionTheoMau(numberFormat: string, n: number): string {
  return numberFormat.split(O_TRONG_SO_REVISION).join(String(n));
}
