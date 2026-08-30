"""export_dxf_r2000 — dựng bản vẽ DXF R2000 (AC1015) từ hợp đồng DrawingPayloadV1.

Nhận payload JSON do app XBoss gửi sang (xem `lib/cad/drawing-payload.ts`), dựng
lại bản vẽ 2D bằng ezdxf, tự kiểm bằng `ezdxf.audit` rồi trả nội dung DXF ASCII.
Không thao tác file: kết quả trả về dạng chuỗi để worker đẩy ngược lên app.
"""
from __future__ import annotations

import io
import logging
from typing import Any

import ezdxf

logger = logging.getLogger(__name__)

# Chiều cao chữ mặc định cho TEXT (mm) — bản vẽ MEPF tỉ lệ 1:100
DEFAULT_TEXT_HEIGHT = 250

# Các loại thực thể ngoài phạm vi PR2 — bỏ qua có cảnh báo, không làm hỏng job
UNSUPPORTED_TYPES = {
    "SPLINE",
    "ELLIPSE",
    "SOLID",
    "3DFACE",
    "HATCH",
    "LEADER",
    "MULTILEADER",
}


def _xy(point: Any, default: tuple[float, float] = (0.0, 0.0)) -> tuple[float, float]:
    """Lấy toạ độ 2D (Z luôn = 0 — bản vẽ 2D thuần theo AC4)."""
    if not isinstance(point, (list, tuple)) or len(point) < 2:
        raise ValueError("Toạ độ không hợp lệ, cần ít nhất [x, y].")
    return (float(point[0]), float(point[1]))


def _add_layers(doc: Any, layers: Any) -> None:
    """Tạo các layer khai báo trong payload; layer lỗi/trùng thì bỏ qua có log."""
    if not isinstance(layers, list):
        return
    for layer in layers:
        if not isinstance(layer, dict):
            continue
        name = layer.get("name")
        if not isinstance(name, str) or not name.strip():
            logger.warning("Bỏ qua layer không có tên hợp lệ.")
            continue
        if name in doc.layers:
            continue
        try:
            doc.layers.add(name=name, color=layer.get("colorNumber", 7))
        except Exception as exc:  # tên layer sai chuẩn DXF, màu ngoài dải...
            logger.warning("Bỏ qua layer '%s': %s", name, exc)


def _add_entity(doc: Any, msp: Any, entity: dict) -> None:
    """Dựng 1 thực thể lên modelspace. Ném lỗi để hàm gọi bắt và bỏ qua thực thể."""
    etype = entity.get("type")
    coords = entity.get("coordinates") or {}
    dxfattribs = {"layer": entity.get("layer", "0")}

    if etype == "LINE":
        msp.add_line(_xy(coords.get("start")), _xy(coords.get("end")), dxfattribs=dxfattribs)

    elif etype in ("LWPOLYLINE", "POLYLINE"):
        points = [_xy(p) for p in (coords.get("points") or [])]
        if len(points) < 2:
            logger.warning("Bỏ qua %s: cần ít nhất 2 điểm.", etype)
            return
        msp.add_lwpolyline(points, dxfattribs=dxfattribs)

    elif etype == "CIRCLE":
        msp.add_circle(_xy(coords.get("center")), coords.get("radius", 0), dxfattribs=dxfattribs)

    elif etype == "ARC":
        msp.add_arc(
            center=_xy(coords.get("center")),
            radius=coords.get("radius", 0),
            start_angle=coords.get("startAngle", 0),
            end_angle=coords.get("endAngle", 360),
            dxfattribs=dxfattribs,
        )

    elif etype == "TEXT":
        text = entity.get("decodedText") or entity.get("textValue") or ""
        msp.add_text(
            text,
            dxfattribs={
                **dxfattribs,
                "insert": _xy(coords.get("start", [0, 0, 0])),
                "height": DEFAULT_TEXT_HEIGHT,
            },
        )

    elif etype == "MTEXT":
        # Giữ nguyên xuống dòng của chuỗi gốc — không strip, không đổi định dạng
        text = entity.get("decodedText") or entity.get("textValue") or ""
        msp.add_mtext(text, dxfattribs=dxfattribs).set_location(_xy(coords.get("start", [0, 0, 0])))

    elif etype == "DIMENSION":
        start, end = coords.get("start"), coords.get("end")
        if start is None or end is None:
            logger.warning("Bỏ qua DIMENSION: thiếu toạ độ start/end.")
            return
        msp.add_linear_dim(
            base=_xy(end),
            p1=_xy(start),
            p2=_xy(end),
            dxfattribs=dxfattribs,
        ).render()

    elif etype == "INSERT":
        block_name = entity.get("blockName")
        if not block_name or block_name not in doc.blocks:
            logger.warning("Bỏ qua INSERT: block '%s' không tồn tại trong bản vẽ.", block_name)
            return
        msp.add_blockref(block_name, _xy(coords.get("start", [0, 0, 0])), dxfattribs=dxfattribs)

    elif etype in UNSUPPORTED_TYPES:
        logger.warning("Bỏ qua thực thể %s: ngoài phạm vi xuất R2000 hiện tại.", etype)

    else:
        logger.warning("Bỏ qua thực thể không nhận diện được: %s", etype)


def export_dxf_r2000(payload: dict) -> dict:
    """Nhận DrawingPayloadV1 (JSON), dựng bản vẽ bằng ezdxf ở định dạng R2000 (AC1015),
    audit bằng ezdxf.audit, trả dict:
    {
      "status": "ok" | "error",
      "dxf_content": str | None,   # nội dung DXF ASCII nếu status=ok
      "audit_errors": int,
      "audit_fixes": int,
      "error": str | None,         # thông báo lỗi tiếng Việt nếu status=error
    }
    """
    try:
        doc = ezdxf.new("R2000")
        msp = doc.modelspace()

        _add_layers(doc, payload.get("layers"))

        for entity in payload.get("entities") or []:
            if not isinstance(entity, dict):
                logger.warning("Bỏ qua thực thể không phải đối tượng JSON.")
                continue
            try:
                _add_entity(doc, msp, entity)
            except Exception as exc:
                logger.warning("Bỏ qua thực thể %s: %s", entity.get("type"), exc)

        auditor = doc.audit()
        if len(auditor.errors) > 0:
            return {
                "status": "error",
                "error": "Bản vẽ xuất ra không hợp lệ theo ezdxf.Auditor: "
                + "; ".join(str(e) for e in auditor.errors[:5]),
                "dxf_content": None,
                "audit_errors": len(auditor.errors),
                "audit_fixes": len(auditor.fixes),
            }

        stream = io.StringIO()
        doc.write(stream)
        return {
            "status": "ok",
            "dxf_content": stream.getvalue(),
            "audit_errors": 0,
            "audit_fixes": len(auditor.fixes),
            "error": None,
        }
    except Exception as exc:
        logger.exception("Lỗi dựng bản vẽ R2000")
        return {
            "status": "error",
            "error": "Lỗi dựng bản vẽ R2000: " + str(exc),
            "dxf_content": None,
            "audit_errors": -1,
            "audit_fixes": 0,
        }
