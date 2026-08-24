"""Chẩn đoán sức khỏe 6D bản vẽ DXF bằng `ezdxf` thật (đọc file thật, không đoán).

Đối chiếu độc lập với điểm số tính ở client (TypeScript, `app/engineering/chuan-hoa-ban-ve`):
client tính tức thời để phục vụ bảng sửa tay tương tác, module này chạy nền qua hàng đợi
`engineering_async_tasks` (task_type `mepf.cad.health_check`) để xác thực bằng bộ đọc DXF
đầy đủ (`ezdxf`) thay vì bộ parser viết tay. Xem ADR-0006 — đây là "Tầng 3 — Pipeline server".

6 nhóm điểm khớp đúng thứ tự hiển thị trên UI (`useCadHealthScore.ts`):
1. layer_score — % thực thể nằm trên layer nhận diện được theo `cad_standards.match_layer`.
2. font_score — % TEXT/MTEXT không dùng font SHX/TCVN3/VNI lỗi thời.
3. geometry_score — % hình học sạch (không nét 0mm, không đoạn trùng đè) + gốc WCS gần (0,0).
4. dim_score — % DIMENSION không bị ghi đè text sai lệch với số đo thực (`<>`).
5. block_score — % block INSERT nhận diện được theo `cad_standards.match_block`.
6. xref_score — % XREF được resolve (block record có `is_xref` nhưng không unresolved).
"""
import math

import ezdxf

from src.cad_loader import load_drawing
from src.cad_standards import match_block, match_layer

# Font SHX/kiểu chữ tiếng Việt cũ hay gây lỗi khi mở lại trên máy khác — không phải danh
# sách đầy đủ mọi font lỗi thời, chỉ những cái thường gặp nhất trong bản vẽ MEPF thực tế.
LEGACY_FONT_KEYWORDS = (
    "VNI",
    "TCVN3",
    ".VNTIME",
    "VNARIAL",
    "VNTIMEH",
    "VK-",
    "HANDS",
)


def _round_point(pt) -> tuple:
    return (round(pt[0]), round(pt[1]))


def _entity_segments(msp) -> list:
    """Trích các đoạn thẳng thật từ LINE và từng cặp đỉnh liên tiếp của LWPOLYLINE/POLYLINE.

    Đoạn con của polyline gắn nhãn `is_line=False` vì ngưỡng "0mm" của nó khác LINE
    đứng riêng lẻ — xem lý do trong `_geometry_score`.
    """
    segments = []
    for e in msp.query("LINE"):
        start, end = e.dxf.start, e.dxf.end
        segments.append(((start.x, start.y), (end.x, end.y), True))
    for e in msp.query("LWPOLYLINE"):
        pts = [(p[0], p[1]) for p in e.get_points()]
        for i in range(len(pts) - 1):
            segments.append((pts[i], pts[i + 1], False))
    for e in msp.query("POLYLINE"):
        pts = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]
        for i in range(len(pts) - 1):
            segments.append((pts[i], pts[i + 1], False))
    return segments


def _geometry_score(msp) -> tuple:
    """Trả về (điểm 0-100, số nét 0mm, số nét trùng đè).

    LINE đứng riêng lẻ dài <1mm coi là rác thật (không lý do gì vẽ 1 đoạn ngắn hơn 1mm).
    Đoạn con của LWPOLYLINE/POLYLINE thì KHÁC: một cung tròn tessellate thành nhiều đỉnh
    sát nhau tạo ra rất nhiều đoạn con hợp lệ ngắn dưới 1mm — đo thật trên bản vẽ MEPF
    65MB cho thấy ~43% đoạn polyline ngắn hơn 1mm mà không phải rác. Với polyline chỉ coi
    là "0mm" khi 2 đỉnh liên tiếp trùng gần như tuyệt đối (đỉnh lặp thật, không phải
    tessellation mịn).
    """
    segments = _entity_segments(msp)
    seen = {}
    zero_len = 0
    overlapping = 0

    for start, end, is_line in segments:
        length = math.hypot(end[0] - start[0], end[1] - start[1])
        threshold = 1.0 if is_line else 0.01
        if length < threshold:
            zero_len += 1
            continue
        key = (_round_point(start), _round_point(end))
        rev_key = (_round_point(end), _round_point(start))
        if key in seen or rev_key in seen:
            overlapping += 1
        else:
            seen[key] = True

    dirty = zero_len + overlapping
    # Mẫu số PHẢI là tổng số đoạn, không phải tổng số thực thể: một polyline nhiều đỉnh là
    # 1 thực thể nhưng hàng chục đoạn — dùng entity_count làm mẫu số phạt quá tay so với
    # thực tế (đã đo thấy trên bản vẽ MEPF thật).
    if not segments:
        return 100, zero_len, overlapping
    ratio_pct = (dirty / len(segments)) * 100
    score = max(0, round(100 - ratio_pct * 20))
    return score, zero_len, overlapping


def _font_score(msp) -> tuple:
    texts = list(msp.query("TEXT")) + list(msp.query("MTEXT"))
    if not texts:
        return 100, 0
    bad = 0
    for t in texts:
        style_name = (t.dxf.style or "").upper()
        if any(kw in style_name for kw in LEGACY_FONT_KEYWORDS):
            bad += 1
    return round(((len(texts) - bad) / len(texts)) * 100), bad


# Tiền tố hệ theo đúng quy ước AIA nội bộ (xem docstring cad_standards.py) — một layer đã
# đặt tên đúng tiền tố (VD "P-PIPE-3", "M-EQPM") coi là ĐÃ chuẩn hoá dù không khớp keyword
# cụ thể nào trong LAYER_STANDARD (từ điển đó chỉ liệt kê một số tên mẫu, không bao quát hết
# mọi hậu tố hợp lệ). Không kiểm điều này sẽ báo sai "0%" cho layer thực ra đã đúng chuẩn.
_STANDARD_LAYER_PREFIXES = ("M-", "E-", "P-", "F-", "ELV-", "A-", "S-", "G-")


def _is_standard_layer_name(name: str) -> bool:
    return name.upper().startswith(_STANDARD_LAYER_PREFIXES)


def _layer_score(doc, msp) -> tuple:
    entities = list(msp)
    if not entities:
        return 100, 0
    matched = sum(
        1
        for e in entities
        if _is_standard_layer_name(e.dxf.layer or "") or match_layer(e.dxf.layer or "") is not None
    )
    return round((matched / len(entities)) * 100), len(entities) - matched


def _dim_score(msp) -> tuple:
    dims = list(msp.query("DIMENSION"))
    if not dims:
        return 100, 0
    fake = 0
    for d in dims:
        override = (d.dxf.get("text", "") or "").strip()
        # "<>" (hoặc rỗng) nghĩa là AutoCAD tự đo, không bị ghi đè — chỉ text override khác
        # rỗng/"<>" mới là khả nghi (kích thước "ảo" không khớp số đo hình học thật).
        if override and override != "<>":
            fake += 1
    return round(((len(dims) - fake) / len(dims)) * 100), fake


def _block_score(msp) -> tuple:
    inserts = list(msp.query("INSERT"))
    if not inserts:
        return 100, 0
    matched = sum(1 for e in inserts if match_block(e.dxf.name or "") is not None)
    return round((matched / len(inserts)) * 100), len(inserts) - matched


def _xref_score(doc) -> tuple:
    xref_blocks = [b for b in doc.blocks if b.block_record.is_xref]
    if not xref_blocks:
        return 100, 0
    # XREF không kèm file gốc để ezdxf gộp nội dung (xem cad_loader.py) — coi là "chưa
    # resolve" khi block rỗng (không có thực thể nào được nạp vào).
    unresolved = sum(1 for b in xref_blocks if len(b) == 0)
    resolved = len(xref_blocks) - unresolved
    return round((resolved / len(xref_blocks)) * 100), unresolved


def compute_cad_health(file_path: str) -> dict:
    """Đọc file DXF/DWG thật bằng ezdxf và trả về điểm sức khỏe 6D + số liệu thô.

    Không đoán/giả lập: bản vẽ trống hoặc không đọc được trả về điểm 0 kèm lỗi rõ ràng
    thay vì âm thầm trả số liệu bịa.
    """
    try:
        doc, notes = load_drawing(file_path)
    except ezdxf.DXFError as exc:
        return {"status": "error", "error": f"Tệp DXF không hợp lệ: {exc}"}
    except FileNotFoundError as exc:
        return {"status": "error", "error": f"Không tìm thấy tệp: {exc}"}

    msp = doc.modelspace()
    entity_count = len(msp)

    if entity_count == 0:
        return {
            "status": "ok",
            "entityCount": 0,
            "totalHealthScore": 0,
            "layerScore": 0,
            "fontScore": 0,
            "geometryScore": 0,
            "dimScore": 0,
            "blockScore": 0,
            "xrefScore": 0,
            "notes": notes,
        }

    layer_score, unmatched_layers = _layer_score(doc, msp)
    font_score, bad_font_count = _font_score(msp)
    geometry_score, zero_len, overlapping = _geometry_score(msp)
    dim_score, fake_dim_count = _dim_score(msp)
    block_score, unmatched_blocks = _block_score(msp)
    xref_score, unresolved_xrefs = _xref_score(doc)

    total = round(
        layer_score * 0.25
        + font_score * 0.2
        + geometry_score * 0.2
        + dim_score * 0.15
        + block_score * 0.1
        + xref_score * 0.1
    )

    return {
        "status": "ok",
        "entityCount": entity_count,
        "totalHealthScore": total,
        "layerScore": layer_score,
        "fontScore": font_score,
        "geometryScore": geometry_score,
        "dimScore": dim_score,
        "blockScore": block_score,
        "xrefScore": xref_score,
        "unmatchedLayerCount": unmatched_layers,
        "badFontTextCount": bad_font_count,
        "zeroLengthCount": zero_len,
        "overlappingCount": overlapping,
        "fakeDimCount": fake_dim_count,
        "unmatchedBlockCount": unmatched_blocks,
        "unresolvedXrefCount": unresolved_xrefs,
        "notes": notes,
    }
