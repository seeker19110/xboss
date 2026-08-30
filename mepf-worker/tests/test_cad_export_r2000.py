"""Golden test cho export_dxf_r2000 — xuất DXF R2000 từ hợp đồng DrawingPayloadV1."""
import io

import ezdxf
import pytest

from src.cad_export_r2000 import export_dxf_r2000

TEXT_VN = "Ống gió 800x500"


@pytest.fixture
def payload_day_du():
    """Payload có đủ LINE/LWPOLYLINE/CIRCLE/ARC/TEXT/MTEXT/DIMENSION."""
    return {
        "version": 1,
        "title": "Bản vẽ mẫu M98",
        "units": "mm",
        "layers": [
            {"name": "M-SAD", "colorNumber": 4},
            {"name": "G-ANNO-TEXT", "colorNumber": 7},
        ],
        "entities": [
            {
                "id": "e1",
                "type": "LINE",
                "layer": "M-SAD",
                "coordinates": {"start": [0, 0, 0], "end": [5000, 0, 0]},
            },
            {
                "id": "e2",
                "type": "LWPOLYLINE",
                "layer": "M-SAD",
                "coordinates": {"points": [[0, 0, 0], [1000, 500, 0], [2000, 0, 0]]},
            },
            {
                "id": "e3",
                "type": "CIRCLE",
                "layer": "M-SAD",
                "coordinates": {"center": [3000, 3000, 0], "radius": 400},
            },
            {
                "id": "e4",
                "type": "ARC",
                "layer": "M-SAD",
                "coordinates": {
                    "center": [4000, 1000, 0],
                    "radius": 600,
                    "startAngle": 0,
                    "endAngle": 90,
                },
            },
            {
                "id": "e5",
                "type": "TEXT",
                "layer": "G-ANNO-TEXT",
                "coordinates": {"start": [100, 900, 0]},
                "decodedText": TEXT_VN,
            },
            {
                "id": "e6",
                "type": "MTEXT",
                "layer": "G-ANNO-TEXT",
                "coordinates": {"start": [100, 1500, 0]},
                "decodedText": "Dòng 1\nDòng 2",
            },
            {
                "id": "e7",
                "type": "DIMENSION",
                "layer": "G-ANNO-TEXT",
                "coordinates": {"start": [0, 0, 0], "end": [5000, 0, 0]},
            },
        ],
    }


def _doc_tu_ket_qua(result):
    return ezdxf.read(io.StringIO(result["dxf_content"]))


def test_xuat_day_du_thuc_the_audit_sach(payload_day_du):
    result = export_dxf_r2000(payload_day_du)

    assert result["status"] == "ok", result.get("error")
    assert result["audit_errors"] == 0
    assert result["dxf_content"]

    doc = _doc_tu_ket_qua(result)
    assert doc.dxfversion == "AC1015"

    types = [e.dxftype() for e in doc.modelspace()]
    for expected in ("LINE", "LWPOLYLINE", "CIRCLE", "ARC", "TEXT", "MTEXT", "DIMENSION"):
        assert expected in types, f"Thiếu thực thể {expected}: {types}"


def test_dimension_khong_bi_ha_cap(payload_day_du):
    doc = _doc_tu_ket_qua(export_dxf_r2000(payload_day_du))
    dims = [e for e in doc.modelspace() if e.dxftype() == "DIMENSION"]
    assert len(dims) == 1
    assert dims[0].dxf.dimstyle


def test_chu_tieng_viet_khop_chinh_xac(payload_day_du):
    doc = _doc_tu_ket_qua(export_dxf_r2000(payload_day_du))
    texts = [e.dxf.text for e in doc.modelspace() if e.dxftype() == "TEXT"]
    assert TEXT_VN in texts


def test_mtext_giu_nguyen_xuong_dong(payload_day_du):
    doc = _doc_tu_ket_qua(export_dxf_r2000(payload_day_du))
    mtexts = [e for e in doc.modelspace() if e.dxftype() == "MTEXT"]
    assert len(mtexts) == 1
    assert "Dòng 1" in mtexts[0].text and "Dòng 2" in mtexts[0].text


def test_moi_toa_do_z_bang_0(payload_day_du):
    doc = _doc_tu_ket_qua(export_dxf_r2000(payload_day_du))
    for e in doc.modelspace():
        for attr in ("start", "end", "center", "insert"):
            if e.dxf.hasattr(attr):
                assert e.dxf.get(attr).z == 0, f"{e.dxftype()}.{attr} có Z != 0"


def test_payload_rong_van_ok():
    result = export_dxf_r2000({"version": 1, "title": "Rỗng", "units": "mm", "layers": [], "entities": []})
    assert result["status"] == "ok"
    assert result["audit_errors"] == 0


def test_entity_thieu_field_khong_lam_sap_job():
    result = export_dxf_r2000(
        {
            "version": 1,
            "title": "Thiếu field",
            "units": "mm",
            "layers": [],
            "entities": [
                {"id": "x1", "type": "LINE", "layer": "0", "coordinates": {"start": [0, 0, 0]}},
                {"id": "x2", "type": "DIMENSION", "layer": "0", "coordinates": {}},
                {"id": "x3", "type": "INSERT", "layer": "0", "coordinates": {"start": [0, 0, 0]},
                 "blockName": "KHONG_TON_TAI"},
                {"id": "x4", "type": "HATCH", "layer": "0", "coordinates": {}},
            ],
        }
    )
    assert isinstance(result, dict)
    assert result["status"] in ("ok", "error")
    if result["status"] == "ok":
        doc = _doc_tu_ket_qua(result)
        assert len(list(doc.modelspace())) == 0
