"""Kiểm định DXF sidecar do plugin AutoCAD nộp lên (M99 PR5 — task `mepf.cad.plugin_validate`).

ADR-0006 nguyên tắc 2 — server KHÔNG TIN CLIENT: plugin nộp DWG (bản giao nộp) kèm DXF
sidecar; module này mở sidecar bằng `ezdxf` thật (recover + audit) và đối chiếu với chuẩn
dự án trước khi bản vẽ được đi tiếp vòng duyệt. Kết quả ghi vào `engineering_async_tasks.result`;
phía web (`lib/ky-thuat/cad/plugin-upload.ts::layPluginUploadJob`) đọc `valid` để giữ hoặc
chuyển `drawing_revisions` sang `rejected`.

Bài học PR #384 (đã ghi PROGRESS.md): `ezdxf.audit()` có thể "vá âm thầm" — `errors: 0`
nhưng `fixes` hàng trăm (xoá tham chiếu STYLE/LTYPE hỏng). Vì vậy VALID ở đây nghĩa là:
mở được + audit KHÔNG lỗi + KHÔNG có fix âm thầm vượt ngưỡng + tỷ lệ layer nhận diện được
theo chuẩn đủ cao. "Hợp lệ theo ezdxf" đơn thuần chưa đủ để vào sổ.
"""
from __future__ import annotations

import ezdxf
from ezdxf import recover

from src.cad_standards import match_layer

# Quá ngưỡng này coi như tệp có vấn đề cấu trúc thật (dù audit "tự vá được") — con số 20
# đủ rộng cho vài override lặt vặt, chặn được ca 455 fix của PR #384.
MAX_SILENT_FIXES = 20

# Dưới ngưỡng này nghĩa là bản vẽ CHƯA chuẩn hóa layer (plugin phải chạy XBOSS_CHUANHOA
# trước khi XBOSS_UPLOAD) — đối chiếu cùng chuẩn với cad_health_check._layer_score.
MIN_LAYER_MATCH_PERCENT = 60


def validate_plugin_upload(file_path: str, rule_pack_version: str = "") -> dict:
    """Đọc DXF sidecar thật và trả {valid, errors[], ...} — không đoán, không giả lập.

    Trả `status: error` (kèm valid=False) khi không đọc nổi tệp; mọi nhánh đều trả dict
    JSON-hoá được để ghi thẳng vào engineering_async_tasks.result.
    """
    try:
        doc, auditor = recover.readfile(file_path)
    except IOError as exc:
        return {"status": "error", "valid": False, "errors": [f"Không đọc được tệp: {exc}"]}
    except ezdxf.DXFStructureError as exc:
        return {
            "status": "error",
            "valid": False,
            "errors": [f"DXF hỏng cấu trúc (ezdxf recover bó tay): {exc}"],
        }

    errors: list[str] = []

    audit_errors = len(auditor.errors)
    audit_fixes = len(auditor.fixes)
    if audit_errors > 0:
        errors.append(
            f"ezdxf audit báo {audit_errors} lỗi cấu trúc: "
            + "; ".join(str(e) for e in auditor.errors[:5])
        )
    if audit_fixes > MAX_SILENT_FIXES:
        errors.append(
            f"ezdxf phải tự vá {audit_fixes} chỗ (> ngưỡng {MAX_SILENT_FIXES}) — "
            "tham chiếu STYLE/LTYPE/DIMSTYLE hỏng hàng loạt (bài học PR #384), "
            "chuẩn hóa lại bằng XBOSS_CHUANHOA rồi nộp lại"
        )

    msp = doc.modelspace()
    entity_count = len(msp)
    if entity_count == 0:
        errors.append("Model space rỗng — không có gì để vào sổ bản vẽ")

    # Đối chiếu chuẩn layer (cùng nguồn cad_standards với cad_health_check — một chuẩn duy nhất).
    layer_names = {e.dxf.layer for e in msp if hasattr(e.dxf, "layer")}
    matched = sum(1 for name in layer_names if match_layer(name or "") is not None)
    layer_match_percent = round((matched / len(layer_names)) * 100) if layer_names else 0
    if layer_names and layer_match_percent < MIN_LAYER_MATCH_PERCENT:
        errors.append(
            f"Chỉ {layer_match_percent}% layer khớp chuẩn dự án (< {MIN_LAYER_MATCH_PERCENT}%) — "
            "bản vẽ chưa qua XBOSS_CHUANHOA?"
        )

    return {
        "status": "ok",
        "valid": len(errors) == 0,
        "errors": errors,
        "entityCount": entity_count,
        "layerCount": len(layer_names),
        "layerMatchPercent": layer_match_percent,
        "auditErrors": audit_errors,
        "auditFixes": audit_fixes,
        "rulePackVersion": rule_pack_version,
    }
