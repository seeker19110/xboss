using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using XBoss.Cad.Core.Fonts;
using XBoss.Cad.Core.Inspection;
using XBoss.Cad.Core.Layers;
using XBoss.Cad.Core.Reporting;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Standardize;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Pipeline chuẩn hóa thứ tự cố định (M99 §6.6 + M101 §6.2):
/// 1 AUDIT → 2 layer mapping → 3 font → 4 flatten → 5 overkill → 6 purge → 7 lineweight/CTB + dim
/// override → 8 style map → 9 xref → 10 hatch → 11 layout → 12 đóng polyline gần kín → 13 block map.
/// Sáu bước cuối là của rule pack v7 (8–11) và v8 (12–13, M102 §6.1/§6.2), đều MẶC ĐỊNH TẮT —
/// rule pack ≤ v6 (hoặc v7/v8 chưa bật) cho kết quả y hệt trước đây.
///
/// <para>Bước 1 là LỆNH AutoCAD nên chạy riêng trước (<see cref="Buoc1Audit"/>); bước 2–13 lập kế
/// hoạch/áp thay đổi TRONG MỘT transaction của một lệnh duy nhất. Riêng phần BIND xref (bước 9) và
/// xóa/đổi tên layout (bước 11) dùng API cấp TÀI LIỆU (<c>Database.BindXrefs</c>/<c>LayoutManager</c>)
/// nên phải chạy sau khi transaction commit — <see cref="ApDungCapTaiLieu"/>, vẫn trong cùng một
/// lệnh nên UNDO một lần vẫn trả bản vẽ về nguyên trạng (đúng cơ chế đã dùng cho bước 1 AUDIT, FR7).</para>
///
/// Mỗi bước ghi StepDiff vào báo cáo (FR8) — khung báo cáo JSON giữ nguyên như M99.
/// </summary>
internal sealed class StandardizePipeline(CadRulePack pack)
{
    private readonly LayerMapper _mapper = new(pack);
    private readonly VietnameseTextConverter _fonts = new(pack.FontMap);
    private readonly List<StepDiff> _steps = [];
    private readonly List<string> _canhBao = [];
    /// <summary>Kiểu chữ mà bước 3 nhận ra đang dùng mã TCVN3/VNI — cần đổi font sang Unicode.</summary>
    private readonly HashSet<ObjectId> _styleMaCu = [];
    /// <summary>Xref bước 9 quyết định bind — bind chỉ chạy được ngoài transaction.</summary>
    private readonly List<ObjectId> _xrefCanBind = [];
    /// <summary>Kế hoạch bước 11 lập trong transaction, áp sau khi commit.</summary>
    private KeHoachLayout _keHoachLayout = new();

    internal IReadOnlyList<StepDiff> Steps => _steps;
    internal IReadOnlyList<string> CanhBao => _canhBao;

    /// <summary>
    /// Bước 1 — AUDIT. Tách khỏi <see cref="Run"/> vì AUDIT là LỆNH của AutoCAD, không phải API
    /// của <see cref="Database"/> (managed API không mở <c>Database.Audit</c>): phải chạy trên
    /// dòng lệnh của bản vẽ đang mở, TRƯỚC khi mở transaction. Gọi ngay trước <see cref="Run"/>.
    /// </summary>
    internal void Buoc1Audit(Editor? ed)
    {
        if (!pack.PurgePolicy.Audit) return;
        if (ed is null)
        {
            // Chế độ hàng loạt dùng side database — không có dòng lệnh để chạy AUDIT.
            _canhBao.Add(
                "Bỏ qua bước AUDIT: xử lý hàng loạt đọc bản vẽ qua side database, không có dòng lệnh " +
                "AutoCAD. Mở tệp kết quả rồi chạy AUDIT (hoặc RECOVER) nếu nghi lỗi cấu trúc.");
            return;
        }
        // "_Y" = trả lời "Fix any errors detected?" → sửa lỗi cấu trúc trước khi đụng nội dung.
        ed.Command("_.AUDIT", "_Y");
        _steps.Add(new StepDiff { Buoc = "1. Audit", HangMuc = "Cấu trúc bản vẽ", Truoc = "-", Sau = "đã audit", SoLuong = 1 });
    }

    internal void Run(Database db, Transaction tr)
    {
        Buoc2LayerMapping(db, tr);
        Buoc3Font(db, tr);
        var snapshot = DrawingSnapshotBuilder.Build(db, tr); // sau layer/font để số liệu Z/rác phản ánh hiện trạng
        Buoc4Flatten(db, tr, snapshot);
        Buoc5Overkill(db, tr, snapshot);
        Buoc6Purge(db, tr);
        Buoc7LineweightVaDimOverride(db, tr);
        // v7 (M101 §6.2) — 4 bước mới, thứ tự cố định SAU lineweight/CTB, đều mặc định tắt.
        Buoc8StyleMap(db, tr);
        Buoc9Xref(db, tr);
        Buoc10Hatch(db, tr);
        Buoc11LapKeHoachLayout(db, tr);
        // v8 (M102 §6.1/§6.2) — 2 bước mới, thứ tự cố định SAU layout, đều mặc định tắt.
        Buoc12DongPolyline(db, tr);
        Buoc13BlockMap(db, tr);
    }

    private void Buoc2LayerMapping(Database db, Transaction tr)
    {
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        var tenHienCo = new List<string>();
        foreach (ObjectId id in lt)
            tenHienCo.Add(((LayerTableRecord)tr.GetObject(id, OpenMode.ForRead)).Name);
        var plan = _mapper.MapAll(tenHienCo);
        if (plan.Count == 0) return;

        foreach (var (cu, moi) in plan)
        {
            var ltrCu = (LayerTableRecord)tr.GetObject(lt[cu], OpenMode.ForWrite);
            // Đổi tên hay gộp là QUYẾT ĐỊNH của Core: LayerTable.Has không phân biệt hoa/thường nên
            // layer chỉ lệch hoa/thường với tên đích (m-duct-supp vs M-DUCT-SUPP) sẽ rơi vào nhánh
            // gộp rồi xóa mất chính nó nếu tin thẳng vào Has (xem LayerMapper.QuyetDinh).
            if (LayerMapper.QuyetDinh(cu, moi, lt.Has(moi)) == HanhDongLayer.DoiTen)
            {
                ltrCu.Name = moi; // target chưa có (hoặc chỉ lệch hoa/thường) → đổi tên, thực thể ByLayer đi theo
                _steps.Add(new StepDiff { Buoc = "2. Layer", HangMuc = "Đổi tên layer", Truoc = cu, Sau = moi, SoLuong = 1 });
                continue;
            }
            // Target đã có → GỘP: chuyển mọi thực thể (mọi block table record) sang layer đích rồi xoá layer nguồn.
            var soThucThe = 0;
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            foreach (ObjectId btrId in bt)
            {
                var btr = (BlockTableRecord)tr.GetObject(btrId, OpenMode.ForRead);
                if (btr.IsFromExternalReference) continue; // không sửa nội dung xref
                foreach (ObjectId entId in btr)
                {
                    if (tr.GetObject(entId, OpenMode.ForRead) is not Entity ent) continue;
                    if (!string.Equals(ent.Layer, cu, StringComparison.OrdinalIgnoreCase)) continue;
                    ent.UpgradeOpen();
                    ent.Layer = moi;
                    soThucThe++;
                }
            }
            if (db.Clayer == ltrCu.ObjectId)
            {
                _canhBao.Add($"Layer \"{cu}\" đang là layer hiện hành — đã chuyển thực thể sang \"{moi}\" nhưng giữ lại layer (đổi CLAYER rồi purge sau).");
            }
            else
            {
                ltrCu.Erase();
            }
            _steps.Add(new StepDiff { Buoc = "2. Layer", HangMuc = "Gộp layer", Truoc = cu, Sau = moi, SoLuong = soThucThe });
        }
    }

    private void Buoc3Font(Database db, Transaction tr)
    {
        var soDoi = 0;
        var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
        foreach (ObjectId btrId in bt)
        {
            var btr = (BlockTableRecord)tr.GetObject(btrId, OpenMode.ForRead);
            if (btr.IsFromExternalReference) continue;
            foreach (ObjectId entId in btr)
            {
                switch (tr.GetObject(entId, OpenMode.ForRead))
                {
                    case DBText t:
                        soDoi += DoiText(t, t.TextString, s => { t.UpgradeOpen(); t.TextString = s; }, t.TextStyleId, tr);
                        break;
                    case MText m:
                        soDoi += DoiText(m, m.Contents, s => { m.UpgradeOpen(); m.Contents = s; }, m.TextStyleId, tr);
                        break;
                    case Dimension dim when !string.IsNullOrEmpty(dim.DimensionText) && dim.DimensionText != "<>":
                        soDoi += DoiText(dim, dim.DimensionText, s => { dim.UpgradeOpen(); dim.DimensionText = s; }, ObjectId.Null, tr);
                        break;
                    case BlockReference br:
                        foreach (ObjectId attId in br.AttributeCollection)
                        {
                            if (tr.GetObject(attId, OpenMode.ForRead) is not AttributeReference ar) continue;
                            soDoi += DoiText(ar, ar.TextString, s => { ar.UpgradeOpen(); ar.TextString = s; }, ar.TextStyleId, tr);
                        }
                        break;
                }
            }
        }
        if (soDoi > 0)
            _steps.Add(new StepDiff { Buoc = "3. Font", HangMuc = "Text TCVN3/VNI → Unicode", Truoc = "font cũ", Sau = "Unicode NFC", SoLuong = soDoi });

        DoiFontKieuChu(tr);
    }

    private int DoiText(DBObject chuNhan, string hienTai, Action<string> ghi, ObjectId styleId, Transaction tr)
    {
        _ = chuNhan;
        string? font = null;
        if (!styleId.IsNull && tr.GetObject(styleId, OpenMode.ForRead) is TextStyleTableRecord ts)
            font = string.IsNullOrEmpty(ts.Font.TypeFace) ? ts.FileName : ts.Font.TypeFace;
        var kind = VietnameseTextConverter.DetectFontKind(font);
        // Kiểu chữ nào ĐANG mang mã cũ thì phải đổi font sang Unicode ở cuối bước 3 — nếu không,
        // nội dung đã đúng mà AutoCAD vẫn hiển thị sai (AC2 không đạt dù dữ liệu đúng).
        if (kind != LegacyFontKind.None && !styleId.IsNull) _styleMaCu.Add(styleId);
        var moi = _fonts.Convert(hienTai, kind);
        if (string.Equals(moi, hienTai, StringComparison.Ordinal)) return 0;
        ghi(moi);
        return 1;
    }

    /// <summary>
    /// Đổi font của các kiểu chữ vừa giải mã sang font Unicode khai trong rule pack
    /// (`fontMap.targetFont`, v3). CHỈ đụng kiểu chữ mà bước 3 thực sự nhận ra là mã cũ —
    /// kiểu chữ vốn đã Unicode giữ nguyên. Rule pack v2 (không có targetFont) → bỏ qua kèm
    /// cảnh báo, không tự chế font.
    /// </summary>
    private void DoiFontKieuChu(Transaction tr)
    {
        if (_styleMaCu.Count == 0) return;

        var fontDich = pack.FontMap.TargetFont.TypeFace;
        if (string.IsNullOrWhiteSpace(fontDich))
        {
            _canhBao.Add(
                $"Đã giải mã chữ của {_styleMaCu.Count} kiểu chữ nhưng rule pack {pack.Version} không khai " +
                "fontMap.targetFont — kiểu chữ vẫn trỏ font mã cũ nên AutoCAD hiển thị vẫn sai. " +
                "Cập nhật rule pack (v3 trở lên) rồi chuẩn hóa lại, hoặc tự đổi font kiểu chữ.");
            return;
        }

        var soDoi = 0;
        foreach (var id in _styleMaCu)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not TextStyleTableRecord ts) continue;
            ts.UpgradeOpen();
            // TrueType: đặt qua FontDescriptor (TypeFace), không phải FileName của SHX.
            // Ghi đủ tên: `using Autodesk.AutoCAD.GraphicsInterface` sẽ làm `Polyline` (và vài
            // kiểu khác) nhập nhằng với `DatabaseServices` mà tệp này đang dùng.
            ts.Font = new Autodesk.AutoCAD.GraphicsInterface.FontDescriptor(fontDich, false, false, 0, 0);
            soDoi++;
        }
        if (soDoi > 0)
        {
            _steps.Add(new StepDiff
            {
                Buoc = "3. Font",
                HangMuc = "Font kiểu chữ mã cũ → Unicode",
                Truoc = "TCVN3/VNI",
                Sau = fontDich,
                SoLuong = soDoi,
            });
        }
    }

    private void Buoc4Flatten(Database db, Transaction tr, DrawingSnapshot snapshot)
    {
        var toMm = XBoss.Cad.Core.Geometry.DrawingUnits.TuInsUnits(snapshot.InsUnits).ToMm;
        var zTol = pack.InspectionPolicy.ZToleranceMm / toMm;
        var soEp = 0;
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            if (!EpPhang(ent, zTol)) continue;
            soEp++;
        }
        if (soEp > 0)
            _steps.Add(new StepDiff { Buoc = "4. Flatten", HangMuc = "Ép Z về 0 (WCS)", Truoc = "Z≠0", Sau = "Z=0", SoLuong = soEp });
    }

    /// <summary>Ép phẳng 1 thực thể về Z=0 giữ nguyên hình chiếu XY (FR4/AC3).
    /// Trả false nếu thực thể vốn đã phẳng.</summary>
    private static bool EpPhang(Entity ent, double zTol)
    {
        switch (ent)
        {
            case Polyline pl when Math.Abs(pl.Elevation) > zTol:
                pl.UpgradeOpen();
                pl.Elevation = 0;
                return true;
            case Line l when Math.Abs(l.StartPoint.Z) > zTol || Math.Abs(l.EndPoint.Z) > zTol:
                l.UpgradeOpen();
                l.StartPoint = new Point3d(l.StartPoint.X, l.StartPoint.Y, 0);
                l.EndPoint = new Point3d(l.EndPoint.X, l.EndPoint.Y, 0);
                return true;
            case Circle c when Math.Abs(c.Center.Z) > zTol:
                c.UpgradeOpen();
                c.Center = new Point3d(c.Center.X, c.Center.Y, 0);
                return true;
            case Arc a when Math.Abs(a.Center.Z) > zTol:
                a.UpgradeOpen();
                a.Center = new Point3d(a.Center.X, a.Center.Y, 0);
                return true;
            case DBText t when Math.Abs(t.Position.Z) > zTol:
                t.UpgradeOpen();
                t.Position = new Point3d(t.Position.X, t.Position.Y, 0);
                return true;
            case MText m when Math.Abs(m.Location.Z) > zTol:
                m.UpgradeOpen();
                m.Location = new Point3d(m.Location.X, m.Location.Y, 0);
                return true;
            case BlockReference br when Math.Abs(br.Position.Z) > zTol:
                br.UpgradeOpen();
                br.Position = new Point3d(br.Position.X, br.Position.Y, 0);
                return true;
            case Polyline3d p3 :
            {
                var daEp = false;
                foreach (ObjectId vId in p3)
                {
                    // Transaction cha đã mở — dùng ObjectId.GetObject cho gọn trong vòng đỉnh.
                    if (vId.GetObject(OpenMode.ForRead) is not PolylineVertex3d v) continue;
                    if (Math.Abs(v.Position.Z) <= zTol) continue;
                    v.UpgradeOpen();
                    v.Position = new Point3d(v.Position.X, v.Position.Y, 0);
                    daEp = true;
                }
                return daEp;
            }
            default:
                return false;
        }
    }

    private void Buoc5Overkill(Database db, Transaction tr, DrawingSnapshot snapshot)
    {
        var dp = pack.PurgePolicy.DeepPurge;
        var toMm = XBoss.Cad.Core.Geometry.DrawingUnits.TuInsUnits(snapshot.InsUnits).ToMm;
        var canXoa = new List<string>();
        if (dp.RemoveZeroLengthLines)
        {
            canXoa.AddRange(snapshot.Entities
                .Where(e => e.Kind == EntityKind.Curve && !e.IsClosed && e.RawLength <= dp.ZeroLengthToleranceMm / toMm)
                .Select(e => e.Handle));
        }
        if (dp.RemoveDuplicateOverlappingLines)
        {
            // MỘT thuật toán duy nhất cho kiểm lẫn xoá (Inspector.TimTrungChong) — không trôi.
            canXoa.AddRange(Inspector.TimTrungChong(snapshot.Entities, toMm));
        }
        var soXoa = 0;
        foreach (var handle in canXoa.Distinct())
        {
            if (!db.TryGetObjectId(new Handle(Convert.ToInt64(handle, 16)), out var id)) continue;
            if (tr.GetObject(id, OpenMode.ForWrite) is not Entity ent) continue;
            ent.Erase();
            soXoa++;
        }
        if (soXoa > 0)
            _steps.Add(new StepDiff { Buoc = "5. Overkill", HangMuc = "Zero-length + trùng chồng", Truoc = $"{soXoa} đối tượng rác", Sau = "đã xoá", SoLuong = soXoa });
    }

    private void Buoc6Purge(Database db, Transaction tr)
    {
        if (!pack.PurgePolicy.PurgeUnusedLayers && !pack.PurgePolicy.PurgeUnusedBlocks) return;
        var tongLayer = 0;
        var tongBlock = 0;
        // Purge lặp tới khi không còn gì (block lồng nhau cần nhiều lượt) — db.Purge tự giữ
        // đối tượng còn tham chiếu (keepReferenced=true).
        while (true)
        {
            var ungVien = new ObjectIdCollection();
            if (pack.PurgePolicy.PurgeUnusedLayers)
            {
                var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
                foreach (ObjectId id in lt)
                {
                    var ltr = (LayerTableRecord)tr.GetObject(id, OpenMode.ForRead);
                    if (ltr.Name is "0" or "Defpoints" || id == db.Clayer) continue;
                    ungVien.Add(id);
                }
            }
            if (pack.PurgePolicy.PurgeUnusedBlocks)
            {
                var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                foreach (ObjectId id in bt)
                {
                    var btr = (BlockTableRecord)tr.GetObject(id, OpenMode.ForRead);
                    if (btr.IsLayout || btr.IsFromExternalReference || btr.IsFromOverlayReference) continue;
                    ungVien.Add(id);
                }
            }
            if (ungVien.Count == 0) break;
            db.Purge(ungVien); // giữ lại trong collection = purge ĐƯỢC (không còn tham chiếu)
            if (ungVien.Count == 0) break;
            foreach (ObjectId id in ungVien)
            {
                var obj = tr.GetObject(id, OpenMode.ForWrite);
                if (obj is LayerTableRecord) tongLayer++;
                else tongBlock++;
                obj.Erase();
            }
        }
        if (tongLayer + tongBlock > 0)
            _steps.Add(new StepDiff { Buoc = "6. Purge", HangMuc = "Layer/block không dùng", Truoc = $"{tongLayer} layer + {tongBlock} block", Sau = "đã purge", SoLuong = tongLayer + tongBlock });
    }

    private void Buoc7LineweightVaDimOverride(Database db, Transaction tr)
    {
        var soLayer = 0;
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        foreach (ObjectId id in lt)
        {
            var ltr = (LayerTableRecord)tr.GetObject(id, OpenMode.ForRead);
            var quyDinh = pack.LineweightMap.ByAci.FirstOrDefault(c => c.Aci == ltr.Color.ColorIndex);
            if (quyDinh is null) continue; // ACI không có quy định — không bịa (rule pack note)
            var lwMoi = (LineWeight)(int)Math.Round(quyDinh.LineweightMm * 100);
            if (ltr.LineWeight == lwMoi) continue;
            ltr.UpgradeOpen();
            ltr.LineWeight = lwMoi;
            soLayer++;
        }
        if (soLayer > 0)
            _steps.Add(new StepDiff { Buoc = "7. CTB", HangMuc = "Lineweight layer theo ACI", Truoc = "lệch bảng", Sau = "theo rule pack", SoLuong = soLayer });

        var soDim = 0;
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Dimension dim) continue;
            if (string.IsNullOrEmpty(dim.DimensionText) || dim.DimensionText == "<>") continue;
            dim.UpgradeOpen();
            dim.DimensionText = ""; // gỡ override — trả về số đo thật của dimension liên kết
            soDim++;
        }
        if (soDim > 0)
            _steps.Add(new StepDiff { Buoc = "7. CTB", HangMuc = "Gỡ dimension override", Truoc = $"{soDim} dim override", Sau = "số đo thật", SoLuong = soDim });
    }

    // ===== v7 (M101 §6.2) — bước 8..11. Adapter chỉ ĐO hiện trạng và ÁP kế hoạch;
    // mọi quyết định "đổi cái gì" nằm ở XBoss.Cad.Core.Standardize.ChuanHoaMoRong (có test). =====

    /// <summary>
    /// Bước 8 — đưa text/dimension về bộ style chuẩn <c>styleMap</c> (khối dùng chung với phép kiểm 14).
    /// CHỈ gán lại style của dimension, KHÔNG dựng lại dimension nên liên kết đo (associativity) giữ
    /// nguyên — bất biến M99 O3.
    /// </summary>
    private void Buoc8StyleMap(Database db, Transaction tr)
    {
        // Công tắc dùng chung với phép kiểm 14 (styleMap là dữ liệu, không có cờ riêng) — mặc định tắt.
        if (!pack.InspectionPolicy.StyleDeviation.Enabled) return;
        var tenChuanChu = pack.StyleMap.TextStyle.Name.Trim();
        var tenChuanDim = pack.StyleMap.DimStyle.Name.Trim();
        if (tenChuanChu.Length == 0 && tenChuanDim.Length == 0) return; // chưa chốt bộ chuẩn

        // --- Hiện trạng bảng style ---
        var idKieuChu = new Dictionary<string, ObjectId>(StringComparer.OrdinalIgnoreCase);
        var kieuChu = new List<KieuChuHienCo>();
        var tst = (TextStyleTable)tr.GetObject(db.TextStyleTableId, OpenMode.ForRead);
        foreach (ObjectId id in tst)
        {
            var ts = (TextStyleTableRecord)tr.GetObject(id, OpenMode.ForRead);
            idKieuChu[ts.Name] = id;
            kieuChu.Add(new KieuChuHienCo
            {
                Ten = ts.Name,
                Font = string.IsNullOrEmpty(ts.Font.TypeFace) ? ts.FileName : ts.Font.TypeFace,
                ChieuCaoCoDinh = ts.TextSize,
                HeSoRong = ts.XScale,
            });
        }

        var idKieuDim = new Dictionary<string, ObjectId>(StringComparer.OrdinalIgnoreCase);
        var kieuDim = new List<KieuKichThuocHienCo>();
        var dst = (DimStyleTable)tr.GetObject(db.DimStyleTableId, OpenMode.ForRead);
        foreach (ObjectId id in dst)
        {
            var ds = (DimStyleTableRecord)tr.GetObject(id, OpenMode.ForRead);
            idKieuDim[ds.Name] = id;
            kieuDim.Add(new KieuKichThuocHienCo
            {
                Ten = ds.Name,
                TenKieuChu = ds.Dimtxsty.IsNull ? "" : TenBanGhi(tr, ds.Dimtxsty),
            });
        }

        // --- Hiện trạng thực thể (mọi block table record, trừ nội dung xref) ---
        var thucThe = new List<ThucTheDungStyle>();
        var idThucThe = new Dictionary<string, ObjectId>(StringComparer.Ordinal);
        var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
        foreach (ObjectId btrId in bt)
        {
            var btr = (BlockTableRecord)tr.GetObject(btrId, OpenMode.ForRead);
            if (btr.IsFromExternalReference) continue;
            foreach (ObjectId entId in btr)
            {
                var obj = tr.GetObject(entId, OpenMode.ForRead);
                switch (obj)
                {
                    case DBText t:
                        Ghi(t.Handle.ToString(), entId, LoaiStyle.KieuChu, TenBanGhi(tr, t.TextStyleId));
                        break;
                    case MText m:
                        Ghi(m.Handle.ToString(), entId, LoaiStyle.KieuChu, TenBanGhi(tr, m.TextStyleId));
                        break;
                    case Dimension dim:
                        Ghi(dim.Handle.ToString(), entId, LoaiStyle.KieuKichThuoc, TenBanGhi(tr, dim.DimensionStyle));
                        break;
                    case BlockReference br:
                        foreach (ObjectId attId in br.AttributeCollection)
                        {
                            if (tr.GetObject(attId, OpenMode.ForRead) is not AttributeReference ar) continue;
                            Ghi(ar.Handle.ToString(), attId, LoaiStyle.KieuChu, TenBanGhi(tr, ar.TextStyleId));
                        }
                        break;
                }
            }
        }

        void Ghi(string handle, ObjectId id, LoaiStyle loai, string tenStyle)
        {
            if (tenStyle.Length == 0) return;
            thucThe.Add(new ThucTheDungStyle { Handle = handle, Loai = loai, TenStyle = tenStyle });
            idThucThe[handle] = id;
        }

        var toMm = XBoss.Cad.Core.Geometry.DrawingUnits.TuInsUnits((int)db.Insunits).ToMm;
        var keHoach = ChuanHoaMoRong.LapKeHoachStyle(
            pack.InspectionPolicy.StyleDeviation, pack.StyleMap, kieuChu, kieuDim, thucThe, toMm);
        _canhBao.AddRange(keHoach.CanhBao);
        if (keHoach.Rong) return;

        // --- Áp: bảng style trước (thực thể phải có style để trỏ tới) ---
        var heSoRong = pack.StyleMap.TextStyle.WidthFactor;
        if (keHoach.TaoKieuChuChuan)
        {
            var moi = new TextStyleTableRecord
            {
                Name = tenChuanChu,
                FileName = pack.StyleMap.TextStyle.FontFile,
                TextSize = keHoach.ChieuCaoChuanDonViBanVe,
            };
            if (heSoRong > 0) moi.XScale = heSoRong;
            tst.UpgradeOpen();
            idKieuChu[tenChuanChu] = tst.Add(moi);
            tr.AddNewlyCreatedDBObject(moi, true);
            _steps.Add(new StepDiff
            {
                Buoc = ChuanHoaMoRong.Buoc8, HangMuc = "Tạo kiểu chữ chuẩn",
                Truoc = "chưa có", Sau = tenChuanChu, SoLuong = 1,
            });
        }
        else if (keHoach.SuaKieuChuChuan && idKieuChu.TryGetValue(tenChuanChu, out var idChuan))
        {
            var ts = (TextStyleTableRecord)tr.GetObject(idChuan, OpenMode.ForWrite);
            if (pack.StyleMap.TextStyle.FontFile.Length > 0) ts.FileName = pack.StyleMap.TextStyle.FontFile;
            ts.TextSize = keHoach.ChieuCaoChuanDonViBanVe;
            if (heSoRong > 0) ts.XScale = heSoRong;
            _steps.Add(new StepDiff
            {
                Buoc = ChuanHoaMoRong.Buoc8, HangMuc = "Sửa kiểu chữ chuẩn theo rule pack",
                Truoc = "lệch styleMap", Sau = tenChuanChu, SoLuong = 1,
            });
        }

        if (keHoach.TaoKieuKichThuocChuan)
        {
            var moi = new DimStyleTableRecord { Name = tenChuanDim };
            if (idKieuChu.TryGetValue(pack.StyleMap.DimStyle.TextStyleName, out var idChu)) moi.Dimtxsty = idChu;
            dst.UpgradeOpen();
            idKieuDim[tenChuanDim] = dst.Add(moi);
            tr.AddNewlyCreatedDBObject(moi, true);
            _steps.Add(new StepDiff
            {
                Buoc = ChuanHoaMoRong.Buoc8, HangMuc = "Tạo kiểu kích thước chuẩn",
                Truoc = "chưa có", Sau = tenChuanDim, SoLuong = 1,
            });
        }

        // --- Áp: gán style cho từng thực thể ---
        var soChu = 0;
        var soDim = 0;
        foreach (var td in keHoach.DoiStyle)
        {
            if (!idThucThe.TryGetValue(td.Handle, out var entId)) continue;
            if (td.Loai == LoaiStyle.KieuChu)
            {
                if (!idKieuChu.TryGetValue(td.StyleMoi, out var idStyle)) continue;
                // AttributeReference KẾ THỪA DBText trong ObjectARX, nên phải xét TRƯỚC — đặt sau
                // thì nhánh của nó là mã chết (CS8120 chặn build thật, chứ không im lặng bỏ qua).
                // Cả ba nhánh làm cùng một việc nên hành vi không đổi; giữ tường minh để lần sau
                // muốn xử lý attribute khác text thường thì có sẵn chỗ.
                switch (tr.GetObject(entId, OpenMode.ForRead))
                {
                    case AttributeReference ar: ar.UpgradeOpen(); ar.TextStyleId = idStyle; soChu++; break;
                    case DBText t: t.UpgradeOpen(); t.TextStyleId = idStyle; soChu++; break;
                    case MText m: m.UpgradeOpen(); m.TextStyleId = idStyle; soChu++; break;
                }
            }
            else
            {
                if (!idKieuDim.TryGetValue(td.StyleMoi, out var idStyle)) continue;
                if (tr.GetObject(entId, OpenMode.ForRead) is not Dimension dim) continue;
                dim.UpgradeOpen();
                dim.DimensionStyle = idStyle; // chỉ đổi KIỂU, dimension vẫn là dimension liên kết (O3)
                soDim++;
            }
        }
        if (soChu > 0)
        {
            _steps.Add(new StepDiff
            {
                Buoc = ChuanHoaMoRong.Buoc8, HangMuc = "Text về kiểu chữ chuẩn",
                Truoc = "style lạ", Sau = tenChuanChu, SoLuong = soChu,
            });
        }
        if (soDim > 0)
        {
            _steps.Add(new StepDiff
            {
                Buoc = ChuanHoaMoRong.Buoc8, HangMuc = "Dimension về kiểu kích thước chuẩn (giữ liên kết đo)",
                Truoc = "style lạ", Sau = tenChuanDim, SoLuong = soDim,
            });
        }
    }

    /// <summary>Tên bản ghi bảng ký hiệu của một ObjectId; rỗng khi không đọc được (không đoán).</summary>
    private static string TenBanGhi(Transaction tr, ObjectId id)
    {
        if (id.IsNull) return "";
        return tr.GetObject(id, OpenMode.ForRead) is SymbolTableRecord r ? r.Name : "";
    }

    /// <summary>
    /// Bước 9 — xref: tương đối hóa đường dẫn tuyệt đối, BÁO xref đứt đường dẫn. Phần bind (chỉ với
    /// xref khớp <c>bindMatchAny</c>, mặc định rỗng) để lại cho <see cref="ApDungCapTaiLieu"/>.
    /// </summary>
    private void Buoc9Xref(Database db, Transaction tr)
    {
        if (!pack.XrefPolicy.Enabled) return;

        var xrefs = new List<XrefHienCo>();
        var idTheoTen = new Dictionary<string, ObjectId>(StringComparer.OrdinalIgnoreCase);
        var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
        foreach (ObjectId id in bt)
        {
            var btr = (BlockTableRecord)tr.GetObject(id, OpenMode.ForRead);
            if (!btr.IsFromExternalReference) continue;
            idTheoTen[btr.Name] = id;
            xrefs.Add(new XrefHienCo
            {
                Ten = btr.Name,
                DuongDanLuu = btr.PathName ?? "",
                DutDuongDan = btr.XrefStatus != XrefStatus.Resolved,
                LaOverlay = btr.IsFromOverlayReference,
            });
        }
        if (xrefs.Count == 0) return;

        var thuMuc = string.IsNullOrEmpty(db.Filename) ? "" : Path.GetDirectoryName(db.Filename) ?? "";
        var keHoach = ChuanHoaMoRong.LapKeHoachXref(pack.XrefPolicy, xrefs, thuMuc);
        _canhBao.AddRange(keHoach.CanhBao);

        var soDoiDuongDan = 0;
        foreach (var td in keHoach.ThayDoi)
        {
            if (!idTheoTen.TryGetValue(td.Ten, out var id)) continue;
            if (td.DuongDanMoi is { } duongDanMoi)
            {
                var btr = (BlockTableRecord)tr.GetObject(id, OpenMode.ForWrite);
                btr.PathName = duongDanMoi;
                soDoiDuongDan++;
            }
            if (td.Bind) _xrefCanBind.Add(id);
        }
        if (soDoiDuongDan > 0)
        {
            _steps.Add(new StepDiff
            {
                Buoc = ChuanHoaMoRong.Buoc9, HangMuc = "Tương đối hóa đường dẫn xref",
                Truoc = "đường dẫn tuyệt đối", Sau = "tương đối theo thư mục bản vẽ", SoLuong = soDoiDuongDan,
            });
        }
    }

    /// <summary>Bước 10 — mẫu hatch + tỉ lệ về chuẩn theo layer; hatch tô đặc/gradient giữ nguyên.</summary>
    private void Buoc10Hatch(Database db, Transaction tr)
    {
        if (!pack.HatchMap.Enabled) return;

        var hatches = new List<HatchHienCo>();
        var idTheoHandle = new Dictionary<string, ObjectId>(StringComparer.Ordinal);
        var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
        foreach (ObjectId btrId in bt)
        {
            var btr = (BlockTableRecord)tr.GetObject(btrId, OpenMode.ForRead);
            if (btr.IsFromExternalReference) continue;
            foreach (ObjectId entId in btr)
            {
                if (tr.GetObject(entId, OpenMode.ForRead) is not Hatch h) continue;
                var handle = h.Handle.ToString();
                idTheoHandle[handle] = entId;
                hatches.Add(new HatchHienCo
                {
                    Handle = handle,
                    Layer = h.Layer,
                    TenMau = h.PatternName,
                    TiLe = h.PatternScale,
                    // Không dùng thuộc tính "solid fill": tên mẫu SOLID + cờ gradient đã phủ đủ và
                    // là hai thứ chắc chắn đọc được trên mọi phiên bản.
                    LaSolid = h.IsGradient || string.Equals(h.PatternName, "SOLID", StringComparison.OrdinalIgnoreCase),
                });
            }
        }
        if (hatches.Count == 0) return;

        var keHoach = ChuanHoaMoRong.LapKeHoachHatch(pack.HatchMap, hatches);
        _canhBao.AddRange(keHoach.CanhBao);

        var soDoi = 0;
        var mauHong = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var td in keHoach.ThayDoi)
        {
            if (!idTheoHandle.TryGetValue(td.Handle, out var entId)) continue;
            if (tr.GetObject(entId, OpenMode.ForRead) is not Hatch h) continue;
            try
            {
                h.UpgradeOpen();
                // Thứ tự bắt buộc: đặt tỉ lệ TRƯỚC rồi mới nạp mẫu, vì SetHatchPattern dựng lại
                // hình học hatch theo tỉ lệ đang có.
                h.PatternScale = td.TiLeMoi;
                h.SetHatchPattern(HatchPatternType.PreDefined, td.MauMoi);
                h.EvaluateHatch(true);
                soDoi++;
            }
            catch (Autodesk.AutoCAD.Runtime.Exception)
            {
                // Mẫu không có trong tệp .pat của máy, hoặc biên hatch hỏng — bỏ qua hatch đó.
                mauHong.Add(td.MauMoi);
            }
        }
        if (soDoi > 0)
        {
            _steps.Add(new StepDiff
            {
                Buoc = ChuanHoaMoRong.Buoc10, HangMuc = "Mẫu hatch + tỉ lệ theo layer",
                Truoc = "lệch hatchMap", Sau = "theo rule pack", SoLuong = soDoi,
            });
        }
        if (mauHong.Count > 0)
        {
            _canhBao.Add(
                $"Không nạp được mẫu hatch: {string.Join(", ", mauHong)} — máy thiếu tệp .pat tương ứng " +
                "hoặc biên hatch hỏng. Các hatch đó giữ nguyên.");
        }
    }

    /// <summary>
    /// Bước 11 — LẬP kế hoạch dọn layout (đọc trong transaction). Việc xóa/đổi tên layout dùng
    /// <c>LayoutManager</c> (API cấp tài liệu) nên chạy ở <see cref="ApDungCapTaiLieu"/> sau commit.
    /// </summary>
    private void Buoc11LapKeHoachLayout(Database db, Transaction tr)
    {
        if (!pack.LayoutPolicy.Enabled) return;

        var theoThuTu = new List<(int ThuTu, LayoutChuanHoa Layout)>();
        var dict = (DBDictionary)tr.GetObject(db.LayoutDictionaryId, OpenMode.ForRead);
        foreach (var muc in dict)
        {
            if (tr.GetObject(muc.Value, OpenMode.ForRead) is not Layout layout) continue;
            if (string.Equals(layout.LayoutName, "Model", StringComparison.OrdinalIgnoreCase)) continue;

            var soViewport = 0;
            var soDoiTuong = 0;
            if (tr.GetObject(layout.BlockTableRecordId, OpenMode.ForRead) is BlockTableRecord btr)
            {
                foreach (ObjectId entId in btr)
                {
                    if (tr.GetObject(entId, OpenMode.ForRead) is not Entity ent) continue;
                    // Viewport số 1 là khung giấy của chính paper space, luôn có → không tính.
                    if (ent is Viewport vp) { if (vp.Number >= 2) soViewport++; }
                    else soDoiTuong++;
                }
            }
            theoThuTu.Add((layout.TabOrder, new LayoutChuanHoa
            {
                Ten = layout.LayoutName,
                SoViewport = soViewport,
                SoDoiTuong = soDoiTuong,
            }));
        }

        var layouts = theoThuTu.OrderBy(x => x.ThuTu).Select(x => x.Layout).ToList();
        _keHoachLayout = ChuanHoaMoRong.LapKeHoachLayout(pack.LayoutPolicy, layouts);
        _canhBao.AddRange(_keHoachLayout.CanhBao);
    }

    // ===== v8 (M102 §6.1/§6.2) — bước 12..13. Vẫn đúng khuôn cũ: Adapter chỉ ĐO và ÁP,
    // quyết định "đóng cái nào / đổi block nào" nằm ở Core.Standardize.ChuanHoaMoRong. =====

    /// <summary>
    /// Bước 12 — đóng polyline gần kín (khe đầu–cuối ≤ <c>gapCloseToleranceMm</c>). Chỉ gom polyline
    /// HỞ (LWPOLYLINE/POLYLINE 2D chưa bật cờ Closed); mọi ngưỡng/lọc layer do Core quyết.
    /// </summary>
    private void Buoc12DongPolyline(Database db, Transaction tr)
    {
        if (!pack.PolylineClosePolicy.Enabled) return;

        var hienCo = new List<PolylineHienCo>();
        var idTheoHandle = new Dictionary<string, ObjectId>(StringComparer.Ordinal);
        var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
        foreach (ObjectId btrId in bt)
        {
            var btr = (BlockTableRecord)tr.GetObject(btrId, OpenMode.ForRead);
            if (btr.IsFromExternalReference) continue; // không sửa nội dung xref
            foreach (ObjectId entId in btr)
            {
                switch (tr.GetObject(entId, OpenMode.ForRead))
                {
                    case Polyline pl when !pl.Closed && pl.NumberOfVertices >= 2:
                    {
                        var dau = pl.GetPoint2dAt(0);
                        var cuoi = pl.GetPoint2dAt(pl.NumberOfVertices - 1);
                        Ghi(pl.Handle.ToString(), entId, pl.Layer, dau.GetDistanceTo(cuoi), pl.NumberOfVertices);
                        break;
                    }
                    case Polyline2d p2 when !p2.Closed:
                    {
                        var soDinh = 0;
                        foreach (ObjectId vId in p2)
                        {
                            if (tr.GetObject(vId, OpenMode.ForRead) is Vertex2d) soDinh++;
                        }
                        if (soDinh < 2) break;
                        Ghi(p2.Handle.ToString(), entId, p2.Layer,
                            p2.StartPoint.DistanceTo(p2.EndPoint), soDinh);
                        break;
                    }
                }
            }
        }
        if (hienCo.Count == 0) return;

        void Ghi(string handle, ObjectId id, string layer, double khe, int soDinh)
        {
            idTheoHandle[handle] = id;
            hienCo.Add(new PolylineHienCo
            {
                Handle = handle,
                Layer = layer,
                KhoangCachDauCuoi = khe, // theo ĐƠN VỊ BẢN VẼ — Core quy sang mm bằng toMm
                SoDinh = soDinh,
            });
        }

        var toMm = XBoss.Cad.Core.Geometry.DrawingUnits.TuInsUnits((int)db.Insunits).ToMm;
        var keHoach = ChuanHoaMoRong.LapKeHoachDongPolyline(pack.PolylineClosePolicy, hienCo, toMm);
        _canhBao.AddRange(keHoach.CanhBao);
        if (keHoach.Rong) return;

        if (keHoach.ChiBaoCao)
        {
            // reportOnly: TUYỆT ĐỐI không đụng entity nào, chỉ ghi vào báo cáo diff.
            _canhBao.Add(
                $"Chỉ BÁO {keHoach.ThayDoi.Count} polyline gần kín, không đóng " +
                "(polylineClosePolicy.reportOnly) — bỏ cờ đó rồi chạy lại nếu muốn sửa thật.");
            _steps.Add(new StepDiff
            {
                Buoc = ChuanHoaMoRong.Buoc12, HangMuc = "Polyline gần kín (chỉ báo cáo)",
                Truoc = "hở", Sau = "giữ nguyên (reportOnly)", SoLuong = keHoach.ThayDoi.Count,
            });
            return;
        }

        var soDong = 0;
        var soHong = 0;
        foreach (var td in keHoach.ThayDoi)
        {
            if (!idTheoHandle.TryGetValue(td.Handle, out var entId)) continue;
            try
            {
                // CachDong.BatCoClosed và NoiThemDoan đều thi hành bằng đúng một thao tác: bật cờ
                // Closed (AutoCAD tự nối đỉnh cuối về đỉnh đầu, không thêm đỉnh mới). Hai giá trị
                // enum chỉ khác nhau ở phần BÁO CÁO — phân biệt "hai đầu đã trùng khít" với
                // "còn khe thấy được đã được nối lại".
                switch (tr.GetObject(entId, OpenMode.ForRead))
                {
                    case Polyline pl: pl.UpgradeOpen(); pl.Closed = true; soDong++; break;
                    case Polyline2d p2: p2.UpgradeOpen(); p2.Closed = true; soDong++; break;
                }
            }
            catch (Autodesk.AutoCAD.Runtime.Exception)
            {
                soHong++; // polyline khóa/hỏng — giữ nguyên, không làm gãy cả bước
            }
        }
        if (soDong > 0)
        {
            _steps.Add(new StepDiff
            {
                Buoc = ChuanHoaMoRong.Buoc12,
                HangMuc = $"Đóng polyline gần kín (khe ≤ {pack.PolylineClosePolicy.GapCloseToleranceMm}mm)",
                Truoc = "hở", Sau = "kín", SoLuong = soDong,
            });
        }
        if (soHong > 0)
            _canhBao.Add($"Không đóng được {soHong} polyline (đối tượng bị khóa hoặc hình học hỏng) — giữ nguyên.");
    }

    /// <summary>
    /// Bước 13 — quy BlockReference lạc chuẩn về block thư viện (<c>blockMap</c>). Mặc định
    /// <c>reportOnly</c> nên chỉ ghi báo cáo; khi bật sửa thật thì đổi định nghĩa mà GIỮ NGUYÊN
    /// vị trí/xoay/tỉ lệ của từng khối chèn.
    /// </summary>
    private void Buoc13BlockMap(Database db, Transaction tr)
    {
        if (!pack.BlockMap.Enabled) return;

        var hienCo = new List<BlockRefHienCo>();
        var idTheoHandle = new Dictionary<string, ObjectId>(StringComparer.Ordinal);
        var idDinhNghia = new Dictionary<string, ObjectId>(StringComparer.OrdinalIgnoreCase);
        var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
        foreach (ObjectId btrId in bt)
        {
            var btr = (BlockTableRecord)tr.GetObject(btrId, OpenMode.ForRead);
            if (btr.IsFromExternalReference) continue;
            idDinhNghia[btr.Name] = btrId;
        }
        foreach (ObjectId btrId in bt)
        {
            var btr = (BlockTableRecord)tr.GetObject(btrId, OpenMode.ForRead);
            if (btr.IsFromExternalReference) continue;
            foreach (ObjectId entId in btr)
            {
                if (tr.GetObject(entId, OpenMode.ForRead) is not BlockReference br) continue;
                // Với block ĐỘNG, br.BlockTableRecord trỏ định nghĩa nặc danh sinh ra theo tham số;
                // định nghĩa GỐC nằm ở DynamicBlockTableRecord — đọc nhầm chỗ thì mọi block động
                // đều bị coi là nặc danh (đúng cách VeTagCommands.DocTag đang đọc).
                if (tr.GetObject(br.DynamicBlockTableRecord, OpenMode.ForRead) is not BlockTableRecord dn) continue;
                if (string.IsNullOrWhiteSpace(dn.Name)) continue;
                var handle = br.Handle.ToString();
                idTheoHandle[handle] = entId;
                hienCo.Add(new BlockRefHienCo
                {
                    Handle = handle,
                    TenBlock = dn.Name,
                    LaNacDanh = dn.IsAnonymous,
                });
            }
        }
        if (hienCo.Count == 0) return;

        var keHoach = ChuanHoaMoRong.LapKeHoachBlock(pack.BlockMap, hienCo);
        _canhBao.AddRange(keHoach.CanhBao);
        if (keHoach.Rong) return;

        if (keHoach.ChiBaoCao)
        {
            // reportOnly (mặc định bản đầu): KHÔNG thay block nào, chỉ đưa vào báo cáo diff.
            _steps.Add(new StepDiff
            {
                Buoc = ChuanHoaMoRong.Buoc13, HangMuc = "Block lạc chuẩn (chỉ báo cáo)",
                Truoc = string.Join(", ", keHoach.ThayDoi.Select(t => t.TenCu).Distinct()),
                Sau = "giữ nguyên (reportOnly)", SoLuong = keHoach.ThayDoi.Count,
            });
            return;
        }

        var soDoi = 0;
        var thieuBlock = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var soHong = 0;
        foreach (var td in keHoach.ThayDoi)
        {
            if (!idTheoHandle.TryGetValue(td.Handle, out var entId)) continue;
            if (!idDinhNghia.TryGetValue(td.TenMoi, out var idDich))
            {
                // Không tự tạo block rỗng: chèn định nghĩa từ thư viện là việc của bộ lệnh vẽ M100.
                thieuBlock.Add(td.TenMoi);
                continue;
            }
            if (tr.GetObject(entId, OpenMode.ForRead) is not BlockReference br) continue;
            try
            {
                br.UpgradeOpen();
                // Chỉ trỏ sang định nghĩa khác — Position/Rotation/ScaleFactors là thuộc tính của
                // chính khối chèn nên giữ nguyên, không đụng tới.
                br.BlockTableRecord = idDich;
                soDoi++;
            }
            catch (Autodesk.AutoCAD.Runtime.Exception)
            {
                soHong++;
            }
        }
        if (soDoi > 0)
        {
            _steps.Add(new StepDiff
            {
                Buoc = ChuanHoaMoRong.Buoc13, HangMuc = "Block lạc chuẩn → block thư viện",
                Truoc = "tên cũ", Sau = "theo blockMap", SoLuong = soDoi,
            });
            // Bước 13 nối đuôi sau bước 11 nên PURGE (bước 6) đã chạy xong trước khi block đổi định
            // nghĩa — các định nghĩa cũ vừa mất tham chiếu vẫn còn nằm trong bản vẽ. Pipeline
            // idempotent nên chạy lại lệnh là dọn nốt (M102 §6.2).
            _canhBao.Add(
                $"Đã trỏ {soDoi} khối chèn sang block chuẩn — định nghĩa block cũ nay không còn ai dùng " +
                "nhưng vẫn nằm trong bản vẽ. Chạy lại XBOSS_CHUANHOA (hoặc PURGE) để dọn.");
        }
        if (thieuBlock.Count > 0)
        {
            _canhBao.Add(
                $"Bản vẽ chưa có block đích: {string.Join(", ", thieuBlock)} — giữ nguyên các khối chèn liên quan. " +
                "Chèn block từ thư viện chuẩn vào bản vẽ rồi chạy lại XBOSS_CHUANHOA (chuẩn hóa không tự tạo block rỗng).");
        }
        if (soHong > 0)
            _canhBao.Add($"Không đổi được {soHong} khối chèn (đối tượng bị khóa hoặc định nghĩa không hợp lệ) — giữ nguyên.");
    }

    /// <summary>
    /// Phần bước 9/11 phải chạy NGOÀI transaction: bind xref (<c>Database.BindXrefs</c>) và dọn
    /// layout (<c>LayoutManager</c>). Gọi ngay sau khi transaction của <see cref="Run"/> commit,
    /// trong CÙNG một lệnh nên vẫn 1 lần UNDO.
    /// </summary>
    /// <param name="coTaiLieu">
    /// false = đang chạy trên side database (XBOSS_BATCH) — không có tài liệu mở nên bỏ qua hai
    /// việc này kèm cảnh báo, thay vì gọi API cấp tài liệu lên nhầm bản vẽ khác.
    /// </param>
    internal void ApDungCapTaiLieu(Database db, bool coTaiLieu)
    {
        if (_xrefCanBind.Count == 0 && _keHoachLayout.Rong) return;
        if (!coTaiLieu)
        {
            _canhBao.Add(
                "Xử lý hàng loạt đọc bản vẽ qua side database (không có tài liệu mở) — bỏ qua phần bind xref " +
                "(bước 9) và dọn layout (bước 11). Mở tệp kết quả rồi chạy XBOSS_CHUANHOA nếu cần hai việc này.");
            return;
        }

        if (_xrefCanBind.Count > 0)
        {
            var so = _xrefCanBind.Count;
            using var ids = new ObjectIdCollection();
            foreach (var id in _xrefCanBind) ids.Add(id);
            db.BindXrefs(ids, false);
            _steps.Add(new StepDiff
            {
                Buoc = ChuanHoaMoRong.Buoc9, HangMuc = "Bind xref khớp bindMatchAny",
                Truoc = $"{so} xref tham chiếu", Sau = "đã nhập vào bản vẽ", SoLuong = so,
            });
        }

        if (_keHoachLayout.Rong) return;
        var lm = LayoutManager.Current;
        foreach (var ten in _keHoachLayout.XoaLayout) lm.DeleteLayout(ten);
        if (_keHoachLayout.XoaLayout.Count > 0)
        {
            _steps.Add(new StepDiff
            {
                Buoc = ChuanHoaMoRong.Buoc11, HangMuc = "Xóa layout rỗng",
                Truoc = string.Join(", ", _keHoachLayout.XoaLayout), Sau = "đã xóa",
                SoLuong = _keHoachLayout.XoaLayout.Count,
            });
        }

        if (_keHoachLayout.DoiTen.Count == 0) return;
        // Đổi tên 2 lượt qua tên tạm: đổi thẳng có thể đụng tên của layout chưa tới lượt
        // (TRANG-02 hiện có ↔ TRANG-01 mới) và AutoCAD sẽ từ chối vì trùng tên.
        for (var i = 0; i < _keHoachLayout.DoiTen.Count; i++)
            lm.RenameLayout(_keHoachLayout.DoiTen[i].TenCu, ChuanHoaMoRong.TienToTenTam + i);
        for (var i = 0; i < _keHoachLayout.DoiTen.Count; i++)
            lm.RenameLayout(ChuanHoaMoRong.TienToTenTam + i, _keHoachLayout.DoiTen[i].TenMoi);
        _steps.Add(new StepDiff
        {
            Buoc = ChuanHoaMoRong.Buoc11, HangMuc = "Đặt lại tên layout theo namePattern",
            Truoc = string.Join(", ", _keHoachLayout.DoiTen.Select(d => d.TenCu)),
            Sau = string.Join(", ", _keHoachLayout.DoiTen.Select(d => d.TenMoi)),
            SoLuong = _keHoachLayout.DoiTen.Count,
        });
    }
}
