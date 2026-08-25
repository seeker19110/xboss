using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using XBoss.Cad.Core.Fonts;
using XBoss.Cad.Core.Inspection;
using XBoss.Cad.Core.Layers;
using XBoss.Cad.Core.Reporting;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Pipeline chuẩn hóa thứ tự cố định (M99 §6.6):
/// 1 AUDIT → 2 layer mapping → 3 font → 4 flatten → 5 overkill → 6 purge → 7 lineweight/CTB + dim override.
/// Bước 1 là LỆNH AutoCAD nên chạy riêng trước (<see cref="Buoc1Audit"/>); bước 2–7 chạy TRONG
/// MỘT transaction của một lệnh duy nhất nên toàn bộ hoàn tác bằng 1 lần UNDO (FR7).
/// Mỗi bước ghi StepDiff vào báo cáo (FR8).
/// </summary>
internal sealed class StandardizePipeline(CadRulePack pack)
{
    private readonly LayerMapper _mapper = new(pack);
    private readonly VietnameseTextConverter _fonts = new(pack.FontMap);
    private readonly List<StepDiff> _steps = [];
    private readonly List<string> _canhBao = [];
    /// <summary>Kiểu chữ mà bước 3 nhận ra đang dùng mã TCVN3/VNI — cần đổi font sang Unicode.</summary>
    private readonly HashSet<ObjectId> _styleMaCu = [];

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
            if (!lt.Has(moi))
            {
                ltrCu.Name = moi; // target chưa có → đổi tên là đủ, thực thể ByLayer đi theo
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
}
