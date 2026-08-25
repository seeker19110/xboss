using System.Globalization;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeMatcatCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_MATCAT</c> (M100 §6.4, FR9b, AC11): mặt cắt BÁN tự động — kỹ sư kẻ tuyến cắt,
/// plugin tìm giao với các tuyến tim đã vẽ bằng <c>XBOSS_VE</c>, đọc size từ XData rồi dựng
/// ký hiệu đúng loại/kích thước, đúng khoảng cách ngang thật, kèm nhãn và tên mặt cắt tự đánh.
///
/// RANH GIỚI CỨNG (M100 §5 non-goals + §18): bản vẽ 2D KHÔNG chứa cao độ lắp đặt thật, nên
/// <b>cao độ luôn do kỹ sư nhập tay từng tuyến</b> — không có giá trị ngầm, plugin không suy đoán
/// từ bất kỳ nguồn nào. Hình cắt in kèm dòng "cao độ nhập tay, kiểm tra tại hiện trường".
///
/// Hình cắt là SNAPSHOT: tuyến nguồn đổi về sau KHÔNG tự cập nhật, nên mọi đối tượng sinh ra mang
/// XData <c>[tuyến-cắt-handle, ngày]</c> để <c>XBOSS_KIEMTRA</c> cảnh báo "mặt cắt cũ hơn tuyến".
/// Cả hình cắt nằm trong một transaction = một nhóm UNDO (FR10).
/// </summary>
public sealed class VeMatcatCommands
{
    /// <summary>Cao độ (mm) nhập lần gần nhất trong phiên — làm mặc định cho tuyến kế tiếp.</summary>
    private static double? _caoDoLanTruoc;

    [CommandMethod("XBOSS_VE_MATCAT")]
    public void MatCat()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;
        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — kích thước ký hiệu và " +
                "cao độ đã quy đổi theo đơn vị này, chuẩn dự án là mm.\n");
        }

        // (1) Tuyến cắt: 2 điểm kỹ sư kẻ ngang qua các tuyến (ngoài transaction).
        var tuyenCat = HoiTuyenCat(ed);
        if (tuyenCat is not { } cat) return;

        // (2) Giao tuyến cắt × tim — toàn bộ hình học ở Core (SectionBuilder).
        var danhSachTim = DocTuyenTim(db, pack);
        if (danhSachTim.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Không thấy tuyến tim nào do XBOSS_VE vẽ trong bản vẽ — mặt cắt chỉ dựng được từ " +
                "tuyến có XData của bộ lệnh vẽ (vẽ tuyến bằng XBOSS_VE trước).\n");
            return;
        }

        var ketQua = SectionBuilder.Dung(cat.Dau, cat.Cuoi, danhSachTim, toMm);
        foreach (var c in ketQua.CanhBao) ed.WriteMessage($"\n[XBoss] ⚠ {c}\n");
        if (ketQua.KyHieu.Count == 0)
        {
            ed.WriteMessage("\n[XBoss] Tuyến cắt không cắt qua tuyến nào — chưa dựng mặt cắt.\n");
            return;
        }
        ed.WriteMessage($"\n[XBoss] Tuyến cắt qua {ketQua.KyHieu.Count} tuyến.\n");

        // (3) Tỉ lệ (chung một cửa với XBOSS_VE_NHAN / XBOSS_VE_TRANGIN) + điểm đặt hình cắt.
        if (VeContext.HoiTiLeIn(ed, pack) is not { } tiLe) return;
        var caoChu = pack.DrawTools.LabelStyle.TextHeightMm * tiLe / toMm;

        var kqDat = ed.GetPoint(new PromptPointOptions(
            "\n[XBoss] Điểm đặt hình cắt (điểm này = cao độ ±0.000): "));
        if (kqDat.Status != PromptStatus.OK) return;
        var diemDatWcs = kqDat.Value.TransformBy(ed.CurrentUserCoordinateSystem);
        var diemDat = new Diem2(diemDatWcs.X, diemDatWcs.Y);

        // (4) Cao độ TỪNG tuyến — nhập tay, không bịa (M100 §6.4 bước 3).
        var caoDoMm = HoiCaoDo(ed, pack, ketQua.KyHieu);
        if (caoDoMm is null) return;

        // (5) Tên mặt cắt tự đánh theo pattern, bỏ qua tên đã dùng trong bản vẽ.
        var tenMatCat = SheetSetup.TenMatCatKeTiep(pack.SheetSetup.SectionNamePattern, TenMatCatDaDung(db));
        var ngay = DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        // (6) Dựng toàn bộ trong MỘT transaction = MỘT nhóm UNDO.
        int soDoiTuong;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                soDoiTuong = Dung(
                    db, tr, pack, cat, ketQua.KyHieu, caoDoMm, diemDat, caoChu, toMm, tiLe, tenMatCat, ngay);
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi dựng mặt cắt — đã rollback, bản vẽ nguyên trạng: {e.Message}\n" +
                    "[XBoss] Nếu layer đích đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi thử lại.\n");
                return;
            }
        }

        ed.WriteMessage(
            $"\n[XBoss] ===== MẶT CẮT {tenMatCat} — {ketQua.KyHieu.Count} tuyến, tỉ lệ 1:{tiLe:0.##} =====\n" +
            $"[XBoss] Đã tạo {soDoiTuong} đối tượng. Cao độ là giá trị NHẬP TAY — kiểm tra lại tại hiện trường.\n" +
            "[XBoss] Hình cắt là snapshot: sửa tuyến nguồn sau này KHÔNG tự cập nhật hình cắt (XBOSS_KIEMTRA cảnh báo).\n" +
            "[XBoss] Hoàn tác trọn hình cắt: UNDO 1 lần.\n");
    }

    // ===== Hỏi đáp =====

    private static (Diem2 Dau, Diem2 Cuoi)? HoiTuyenCat(Editor ed)
    {
        var ucs = ed.CurrentUserCoordinateSystem;
        var kq1 = ed.GetPoint(new PromptPointOptions("\n[XBoss] Điểm đầu tuyến cắt (ESC để hủy): "));
        if (kq1.Status != PromptStatus.OK) return null;
        var p1 = kq1.Value.TransformBy(ucs);

        var opt = new PromptPointOptions("\n[XBoss] Điểm cuối tuyến cắt: ")
        {
            UseBasePoint = true,
            BasePoint = p1,
            UseDashedLine = true,
        };
        var kq2 = ed.GetPoint(opt);
        if (kq2.Status != PromptStatus.OK) return null;
        var p2 = kq2.Value.TransformBy(ucs);
        return (new Diem2(p1.X, p1.Y), new Diem2(p2.X, p2.Y));
    }

    /// <summary>
    /// Cao độ tim từng tuyến (mm), hỏi lần lượt theo đúng thứ tự trái → phải của hình cắt.
    /// Mặc định: giá trị nhập lần trước trong phiên, nếu chưa có thì danh mục
    /// <c>sheetSetup.defaultElevations</c>. Null = kỹ sư hủy.
    /// </summary>
    private static IReadOnlyList<double>? HoiCaoDo(
        Editor ed, DrawToolsPack pack, IReadOnlyList<KyHieuMatCat> kyHieu)
    {
        var danhMuc = pack.SheetSetup.DefaultElevations
            .Select(v => v.ToString("0.##", CultureInfo.InvariantCulture))
            .ToList();

        ed.WriteMessage(
            "\n[XBoss] Nhập cao độ TIM từng tuyến (mm so với điểm đặt hình cắt). " +
            "Bản vẽ 2D không chứa cao độ thật — plugin không suy đoán.\n");

        var ra = new List<double>(kyHieu.Count);
        foreach (var kh in kyHieu)
        {
            var nhan = $"Cao độ tim {kh.Tim.ItemId} {kh.Tim.Size} (handle {kh.Tim.Handle})";
            while (true)
            {
                var macDinh = (_caoDoLanTruoc ?? pack.SheetSetup.DefaultElevations.FirstOrDefault())
                    .ToString("0.##", CultureInfo.InvariantCulture);
                var chon = VeContext.HoiDanhMuc(ed, nhan, danhMuc, macDinh, choTuNhap: true);
                if (chon is not { } c) return null;
                if (double.TryParse(c.GiaTri, NumberStyles.Float, CultureInfo.InvariantCulture, out var mm))
                {
                    _caoDoLanTruoc = mm;
                    ra.Add(mm);
                    break;
                }
                ed.WriteMessage("\n[XBoss] Cao độ phải là số (mm) — vd 2700 hoặc -150.\n");
            }
        }
        return ra;
    }

    // ===== Đọc dữ liệu bản vẽ =====

    /// <summary>Mọi polyline tim do <c>XBOSS_VE</c> vẽ trong model space, kèm sizeKind từ rule pack.</summary>
    private static IReadOnlyList<TimMatCat> DocTuyenTim(Database db, DrawToolsPack pack)
    {
        var sizeKind = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var sys in pack.DrawTools.Systems)
        {
            foreach (var line in sys.Lines) sizeKind.TryAdd(line.ItemId, line.SizeKind);
        }

        var ra = new List<TimMatCat>();
        using var tr = db.TransactionManager.StartTransaction();
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Polyline pl) continue;
            var xdata = VeXDataStore.Doc(pl);
            if (xdata is null || xdata.VaiTro != VaiTroVe.Tim) continue;
            if (pl.NumberOfVertices < 2) continue;

            ra.Add(new TimMatCat
            {
                Handle = pl.Handle.ToString(),
                HeId = xdata.HeId,
                ItemId = xdata.ItemId,
                Size = xdata.Size,
                SizeKind = sizeKind.GetValueOrDefault(xdata.ItemId, ""),
                Layer = pl.Layer,
                DoDoc = xdata.DoDoc,
                Dinh = VeThucThe.DinhCua(pl),
                Kin = pl.Closed,
            });
        }
        tr.Commit();
        return ra;
    }

    /// <summary>Tên mặt cắt đã dùng trong bản vẽ (đọc từ XData của các tuyến cắt/hình cắt cũ).</summary>
    private static IReadOnlyList<string> TenMatCatDaDung(Database db)
    {
        var ten = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using var tr = db.TransactionManager.StartTransaction();
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            var xdata = VeXDataStore.Doc(ent);
            if (xdata?.TenMatCat is { Length: > 0 } t) ten.Add(t);
        }
        tr.Commit();
        return ten.ToList();
    }

    // ===== Dựng hình =====

    private static int Dung(
        Database db, Transaction tr, DrawToolsPack pack, (Diem2 Dau, Diem2 Cuoi) cat,
        IReadOnlyList<KyHieuMatCat> kyHieu, IReadOnlyList<double> caoDoMm, Diem2 diemDat,
        double caoChu, double toMm, double tiLe, string tenMatCat, string ngay)
    {
        VeXDataStore.DangKyApp(db, tr);
        var layerNhan = pack.DrawTools.LabelStyle.Layer;
        VeLayerService.DamBaoLayer(db, tr, layerNhan, VeLayerStyle.AciNhan, pack.RulePack.LineweightMap, out _);
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);

        var so = 0;

        // (a) Tuyến cắt trong mặt bằng + ký hiệu tên ở hai đầu.
        var netCat = TaoPolyline([cat.Dau, cat.Cuoi]);
        so += ThemThucThe(tr, ms, netCat, layerNhan);
        var handleCat = netCat.Handle.ToString();
        VeXDataStore.Ghi(netCat, new VeXDataInfo
        {
            VaiTro = VaiTroVe.TuyenCat,
            RulePackVersion = pack.RulePack.Version,
            TenMatCat = tenMatCat,
            NgayTao = ngay,
        });

        var chuDau = TachChuDau(tenMatCat);
        foreach (var dau in new[] { cat.Dau, cat.Cuoi })
        {
            var nhan = TaoNhan(chuDau, new Diem2(dau.X, dau.Y + caoChu * 0.5), caoChu * 1.5);
            so += ThemThucThe(tr, ms, nhan, layerNhan);
            GhiXDataMatCat(nhan, pack, handleCat, tenMatCat, ngay, null, null);
        }

        // (b) Ký hiệu từng tuyến tại đúng khoảng cách ngang thật + cao độ nhập tay.
        var traiNhat = double.MaxValue;
        var phaiNhat = double.MinValue;
        var thapNhat = double.MaxValue;
        for (var i = 0; i < kyHieu.Count; i++)
        {
            var kh = kyHieu[i];
            var caoDoDv = caoDoMm[i] / toMm;
            var tam = SectionBuilder.ToaDoKyHieu(kh, diemDat, caoDoDv);
            var layerHe = string.IsNullOrWhiteSpace(kh.Tim.Layer) ? layerNhan : kh.Tim.Layer;
            VeLayerService.DamBaoLayer(
                db, tr, layerHe, VeLayerStyle.AciChoTim(null), pack.RulePack.LineweightMap, out _);

            switch (kh.Loai)
            {
                case LoaiKyHieuMatCat.Tron:
                {
                    var vong = new Circle(new Point3d(tam.X, tam.Y, 0), Vector3d.ZAxis, kh.RongDv / 2);
                    so += ThemThucThe(tr, ms, vong, layerHe);
                    GhiXDataMatCat(vong, pack, handleCat, tenMatCat, ngay, kh, caoDoDv);
                    break;
                }
                default:
                {
                    var khung = TaoPolyline(SectionBuilder.KhungChuNhat(tam, kh.RongDv, kh.CaoDv), kin: true);
                    so += ThemThucThe(tr, ms, khung, layerHe);
                    GhiXDataMatCat(khung, pack, handleCat, tenMatCat, ngay, kh, caoDoDv);
                    if (kh.Loai == LoaiKyHieuMatCat.MangCap)
                    {
                        var (trai, phai) = SectionBuilder.NetDayMang(tam, kh.RongDv, kh.CaoDv);
                        var day = new Line(new Point3d(trai.X, trai.Y, 0), new Point3d(phai.X, phai.Y, 0));
                        so += ThemThucThe(tr, ms, day, layerHe);
                        GhiXDataMatCat(day, pack, handleCat, tenMatCat, ngay, kh, caoDoDv);
                    }
                    break;
                }
            }

            // Dấu cao độ: dương "+2700", âm "-150", 0 → "±0" (đừng ra "+-150").
            var noiDung =
                $"{DrawSize.NhanTuyen(kh.Nhan, kh.Tim.DoDoc)}\\P" +
                caoDoMm[i].ToString("+0.##;-0.##;±0", CultureInfo.InvariantCulture);
            var nhanSize = TaoNhan(noiDung, new Diem2(tam.X, tam.Y + kh.CaoDv / 2 + caoChu * 0.5), caoChu);
            so += ThemThucThe(tr, ms, nhanSize, layerNhan);
            GhiXDataMatCat(nhanSize, pack, handleCat, tenMatCat, ngay, kh, caoDoDv);

            traiNhat = Math.Min(traiNhat, tam.X - kh.RongDv / 2);
            phaiNhat = Math.Max(phaiNhat, tam.X + kh.RongDv / 2);
            thapNhat = Math.Min(thapNhat, tam.Y - kh.CaoDv / 2);
        }

        // (c) Mốc cao độ ±0.000 = điểm đặt (nếu không có mốc thì các cao độ trên hình vô nghĩa).
        var mocTrai = Math.Min(traiNhat, diemDat.X) - caoChu * 2;
        var mocPhai = Math.Max(phaiNhat, diemDat.X) + caoChu * 2;
        var moc = new Line(new Point3d(mocTrai, diemDat.Y, 0), new Point3d(mocPhai, diemDat.Y, 0));
        so += ThemThucThe(tr, ms, moc, layerNhan);
        GhiXDataMatCat(moc, pack, handleCat, tenMatCat, ngay, null, null);
        var nhanMoc = TaoNhan("±0.000", new Diem2(mocPhai + caoChu, diemDat.Y), caoChu, AttachmentPoint.MiddleLeft);
        so += ThemThucThe(tr, ms, nhanMoc, layerNhan);
        GhiXDataMatCat(nhanMoc, pack, handleCat, tenMatCat, ngay, null, null);

        // (d) Tiêu đề hình cắt + cảnh báo cao độ (M100 §18: không để hiểu nhầm là cao độ thật).
        var yTieuDe = Math.Min(thapNhat, diemDat.Y) - caoChu * 3;
        var tieuDe = TaoNhan(
            $"MẶT CẮT {tenMatCat}   TL 1:{tiLe.ToString("0.##", CultureInfo.InvariantCulture)}\\P" +
            "Cao độ nhập tay — kiểm tra tại hiện trường",
            new Diem2((mocTrai + mocPhai) / 2, yTieuDe),
            caoChu * 1.5,
            AttachmentPoint.TopCenter);
        so += ThemThucThe(tr, ms, tieuDe, layerNhan);
        GhiXDataMatCat(tieuDe, pack, handleCat, tenMatCat, ngay, null, null);

        return so;
    }

    private static void GhiXDataMatCat(
        Entity ent, DrawToolsPack pack, string handleTuyenCat, string tenMatCat, string ngay,
        KyHieuMatCat? kyHieu, double? caoDoDv) =>
        VeXDataStore.Ghi(ent, new VeXDataInfo
        {
            VaiTro = VaiTroVe.MatCat,
            HeId = kyHieu?.Tim.HeId ?? "",
            ItemId = kyHieu?.Tim.ItemId ?? "",
            Size = kyHieu?.Tim.Size ?? "",
            RulePackVersion = pack.RulePack.Version,
            DoDoc = kyHieu?.Tim.DoDoc,
            HandleTim = kyHieu?.Tim.Handle,
            HandleTuyenCat = handleTuyenCat,
            TenMatCat = tenMatCat,
            NgayTao = ngay,
            CaoDo = caoDoDv,
        });

    /// <summary>Thêm thực thể vào model space rồi mới đặt layer (layer chỉ tra được khi đã thuộc database).</summary>
    private static int ThemThucThe(Transaction tr, BlockTableRecord ms, Entity ent, string layer)
    {
        ms.AppendEntity(ent);
        tr.AddNewlyCreatedDBObject(ent, true);
        ent.Layer = layer;
        return 1;
    }

    private static Polyline TaoPolyline(IReadOnlyList<Diem2> diem, bool kin = false)
    {
        var pl = new Polyline();
        for (var i = 0; i < diem.Count; i++) pl.AddVertexAt(i, new Point2d(diem[i].X, diem[i].Y), 0, 0, 0);
        pl.Closed = kin;
        pl.Elevation = 0;
        pl.Normal = Vector3d.ZAxis;
        return pl;
    }

    private static MText TaoNhan(
        string noiDung, Diem2 viTri, double cao, AttachmentPoint neo = AttachmentPoint.BottomCenter) =>
        new()
        {
            Contents = noiDung,
            Location = new Point3d(viTri.X, viTri.Y, 0),
            TextHeight = cao,
            Attachment = neo,
        };

    /// <summary>"A-A" → "A" (ký hiệu đặt ở hai đầu tuyến cắt chỉ mang một chữ).</summary>
    private static string TachChuDau(string tenMatCat)
    {
        var chu = new string(tenMatCat.TakeWhile(char.IsLetterOrDigit).ToArray());
        return chu.Length > 0 ? chu : tenMatCat;
    }
}
