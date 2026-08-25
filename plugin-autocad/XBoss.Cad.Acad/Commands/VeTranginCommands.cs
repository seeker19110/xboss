using System.Collections;
using System.Globalization;
using System.Text.Json;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeTranginCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_TRANGIN</c> (M100 §6.3, FR9a, AC10): dựng trang in chuẩn công ty — layout mới +
/// page setup (máy in/khổ giấy/CTB) + viewport ĐÚNG TỈ LỆ và KHÓA + VP-freeze layer ngoài hệ +
/// khung tên từ thư viện block đã điền attribute.
///
/// Nguyên tắc:
/// <list type="bullet">
/// <item>Tỉ lệ đi qua đúng một cửa <see cref="VeContext.HoiTiLeIn"/> — cùng giá trị với chiều cao
/// chữ nhãn của <c>XBOSS_VE_NHAN</c>, không bao giờ lệch giữa mặt bằng và trang in.</item>
/// <item>Viewport LUÔN khóa sau khi đặt tỉ lệ: kéo/zoom trong viewport không làm sai tỉ lệ in nữa
/// (kéo lại khung viewport cho vừa khung tên là an toàn).</item>
/// <item>Toàn bộ thao tác nằm trong một lệnh ⇒ một nhóm UNDO: U một lần xóa trọn layout vừa tạo
/// (FR9a/FR10). Lỗi giữa chừng thì rollback transaction VÀ xóa layout dở dang.</item>
/// </list>
/// </summary>
public sealed class VeTranginCommands
{
    /// <summary>Thẻ khung tên plugin tự điền (không hỏi kỹ sư) — phần còn lại nhập tay, nhớ lần trước.</summary>
    private const string TheTiLe = "TI_LE";
    private const string TheNgay = "NGAY";

    [CommandMethod("XBOSS_VE_TRANGIN")]
    public void TrangIn()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;
        var sheet = pack.SheetSetup;

        if (sheet.PaperSizes.Count == 0 || sheet.Scales.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Rule pack chưa khai sheetSetup.paperSizes/scales — không dựng được trang in. " +
                "Phát hành rule pack mới rồi chạy XBOSS_LOGIN/XBOSS_RULEPACK.\n");
            return;
        }

        // ===== (1) Hỏi đáp — TOÀN BỘ nằm ngoài transaction, ESC là bản vẽ nguyên trạng =====

        // Hỏi lại hệ mỗi lần: tên layout mang mã hệ và phạm vi VP-freeze phụ thuộc hệ — in nhầm hệ
        // là in ra cả tập bản vẽ sai, đắt hơn nhiều so với một lần bấm Enter.
        var he = VeContext.HoiHe(ed, pack, batBuocHoiLai: true);
        if (he is null) return;

        var chonKho = VeContext.HoiDanhMuc(ed, "Khổ giấy", sheet.PaperSizes, VeContext.KhoGiay, choTuNhap: false);
        if (chonKho is not { } kho) return;
        VeContext.KhoGiay = kho.GiaTri;

        if (VeContext.HoiTiLeIn(ed, pack, batBuocHoiLai: true) is not { } tiLe) return;

        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — tỉ lệ viewport đã quy đổi " +
                "theo đơn vị này, chuẩn dự án là mm.\n");
        }
        var tiLeViewport = SheetSetup.TiLeViewport(tiLe, toMm);

        var vung = HoiVungIn(ed, db);
        if (vung is not { } khungMoHinh) return;

        var cheDoAn = HoiCheDoAnLayer(ed);
        if (cheDoAn is null) return;

        var ghiNho = GhiNhoTrangIn.Doc();
        var ctb = HoiCtb(ed, ghiNho.Ctb);

        // Khung tên: tra manifest thư viện block (kind=titleblock theo khổ giấy) — dùng CHUNG một
        // cửa thư viện với XBOSS_VE_PHUKIEN/_THIETBI (BlockLibraryService: cache + kiểm sha256).
        var (thuVien, loiThuVien) = BlockLibraryService.HienHanh();
        BlockDef? khungTen = null;
        var giaTriThe = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (thuVien is null)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ {loiThuVien}\n" +
                "[XBoss]   Vẫn tạo layout + viewport, khung tên chèn sau bằng XBOSS_VE_THUVIEN/INSERT.\n");
        }
        else
        {
            var (tim, loiKhung) = SheetSetup.TimKhungTen(thuVien, sheet, kho.GiaTri);
            if (tim is null)
            {
                ed.WriteMessage($"\n[XBoss] ⚠ {loiKhung} — vẫn tạo layout + viewport, khung tên chèn sau.\n");
            }
            else
            {
                khungTen = tim;
                giaTriThe = HoiThuocTinhKhungTen(ed, tim, tiLe, ghiNho);
            }
        }

        // ===== (2) Nhập định nghĩa khung tên + tạo layout — ngoài transaction =====

        var canhBao = new List<string>();
        using var khoaTaiLieu = doc.LockDocument();

        // Nhập ĐỊNH NGHĨA block trước khi mở transaction: nhân bản block là thao tác sâu ở tầng
        // dưới, gọi giữa một transaction đang mở là nguồn lỗi khó lần.
        if (khungTen is not null && !CoDinhNghiaBlock(db, khungTen.BlockName))
        {
            if (!NhapKhungTen(db, khungTen, canhBao) || !CoDinhNghiaBlock(db, khungTen.BlockName))
            {
                canhBao.Add($"Chưa nhập được block khung tên \"{khungTen.BlockName}\" — chèn khung tên sau bằng INSERT.");
                khungTen = null;
            }
        }

        var lm = LayoutManager.Current;
        var tenLayout = SheetSetup.TenLayoutKeTiep(sheet.LayoutNamePattern, he.Id, TenLayoutHienCo(db));

        ObjectId layoutId;
        try
        {
            layoutId = lm.CreateLayout(tenLayout);
            lm.CurrentLayout = tenLayout; // phải là layout hiện hành thì viewport mới bật được
        }
        catch (Autodesk.AutoCAD.Runtime.Exception e)
        {
            ed.WriteMessage($"\n[XBoss] Không tạo được layout \"{tenLayout}\": {e.Message}\n");
            return;
        }

        // ===== (3) Cấu hình layout trong MỘT transaction =====

        var soLayerAn = 0;
        var daChenKhungTen = false;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                var layout = (Layout)tr.GetObject(layoutId, OpenMode.ForWrite);
                DatPageSetup(layout, sheet.Plotter, kho.GiaTri, ctb, canhBao);

                var psBtr = (BlockTableRecord)tr.GetObject(layout.BlockTableRecordId, OpenMode.ForWrite);
                var (rongGiay, caoGiay) = KhoGiayMm(layout);

                var vp = TaoViewport(tr, psBtr, khungMoHinh, tiLeViewport, rongGiay, caoGiay, canhBao);
                soLayerAn = AnLayerTrongViewport(db, tr, vp, pack, he.Id, cheDoAn.Value, canhBao);
                vp.Locked = true; // ĐẶT CUỐI: khóa rồi thì mọi thay đổi tỉ lệ đều bị chặn

                if (khungTen is not null) daChenKhungTen = ChenKhungTen(db, tr, psBtr, khungTen, giaTriThe);

                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                XoaLayoutDoDang(lm, tenLayout);
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi dựng trang in — đã rollback, layout dở dang đã xóa: {e.Message}\n");
                return;
            }
        }

        if (daChenKhungTen) ghiNho.Luu(giaTriThe, ctb);

        ed.WriteMessage(
            $"\n[XBoss] ===== TRANG IN \"{tenLayout}\" — hệ {he.Id}, khổ {kho.GiaTri}, tỉ lệ 1:{tiLe:0.##} =====\n" +
            $"[XBoss] Viewport đã KHÓA tỉ lệ ({tiLeViewport.ToString("0.######", CultureInfo.InvariantCulture)} mm giấy / 1 đơn vị bản vẽ) — " +
            "kéo lại khung viewport cho vừa khung tên vẫn giữ đúng tỉ lệ.\n" +
            $"[XBoss] Ẩn theo viewport (VP freeze): {soLayerAn} layer.\n" +
            (daChenKhungTen
                ? "[XBoss] Đã chèn khung tên và điền attribute.\n"
                : "[XBoss] Chưa chèn khung tên (xem cảnh báo bên trên).\n"));
        foreach (var c in canhBao) ed.WriteMessage($"[XBoss] ⚠ {c}\n");
        ed.WriteMessage("[XBoss] Hoàn tác trọn trang in: UNDO 1 lần.\n");
    }

    // ===== Hỏi đáp =====

    /// <summary>
    /// Vùng mặt bằng cần in (M100 §6.3 bước 1): 2 điểm đối đỉnh HOẶC một polyline ranh giới kín
    /// (lấy hình bao của nó). Toạ độ trả về luôn ở WCS — điểm bấm quy từ UCS, hình bao polyline
    /// vốn đã là WCS.
    /// </summary>
    private static (Point2d Tam, double Rong, double Cao)? HoiVungIn(Editor ed, Database db)
    {
        var ucs = ed.CurrentUserCoordinateSystem;
        var opt1 = new PromptPointOptions(
            "\n[XBoss] Góc thứ nhất của vùng cần in [RanhGioi] (ESC để hủy): ");
        opt1.Keywords.Add("RanhGioi", "RanhGioi", "RanhGioi");
        var kq1 = ed.GetPoint(opt1);
        if (kq1.Status == PromptStatus.Keyword) return VungTheoRanhGioi(ed, db);
        if (kq1.Status != PromptStatus.OK) return null;
        var p1 = kq1.Value.TransformBy(ucs);

        var opt = new PromptPointOptions("\n[XBoss] Góc đối diện: ")
        {
            UseBasePoint = true,
            BasePoint = p1,
            UseDashedLine = true,
        };
        var kq2 = ed.GetPoint(opt);
        if (kq2.Status != PromptStatus.OK) return null;
        var p2 = kq2.Value.TransformBy(ucs);

        var rong = Math.Abs(p2.X - p1.X);
        var cao = Math.Abs(p2.Y - p1.Y);
        if (rong <= 0 || cao <= 0)
        {
            ed.WriteMessage("\n[XBoss] Vùng in rỗng (hai điểm thẳng hàng) — chưa tạo trang in.\n");
            return null;
        }
        return (new Point2d((p1.X + p2.X) / 2, (p1.Y + p2.Y) / 2), rong, cao);
    }

    /// <summary>
    /// Vùng in lấy theo HÌNH BAO của một polyline ranh giới KÍN (§6.3 bước 1) — cách dùng thật của
    /// kỹ sư: ranh giới phân khu/tầng đã có sẵn trên bản vẽ, khỏi bấm lại 2 góc cho từng trang in
    /// và mọi trang in cùng một khu ra đúng một khung.
    /// Ranh giới HỞ bị từ chối: hình bao của polyline hở vẫn tính được nhưng "vùng in" khi đó không
    /// phải thứ kỹ sư thấy trên màn hình — thà báo rõ còn hơn in ra thiếu một góc mặt bằng.
    /// </summary>
    private static (Point2d Tam, double Rong, double Cao)? VungTheoRanhGioi(Editor ed, Database db)
    {
        var hoi = new PromptEntityOptions("\n[XBoss] Chọn polyline ranh giới KÍN của vùng cần in: ");
        hoi.SetRejectMessage("\n[XBoss] Chỉ nhận polyline làm ranh giới vùng in.\n");
        hoi.AddAllowedClass(typeof(Polyline), false); // false = nhận cả lớp dẫn xuất
        var chon = ed.GetEntity(hoi);
        if (chon.Status != PromptStatus.OK) return null;

        double rong, cao, tamX, tamY;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            if (tr.GetObject(chon.ObjectId, OpenMode.ForRead) is not Polyline pl)
            {
                tr.Commit();
                ed.WriteMessage("\n[XBoss] Đối tượng chọn không phải polyline.\n");
                return null;
            }
            if (!pl.Closed)
            {
                tr.Commit();
                ed.WriteMessage(
                    "\n[XBoss] Polyline ranh giới chưa KÍN — đóng nó lại (PEDIT → Close) rồi chạy lại, " +
                    "hoặc bấm 2 góc vùng in.\n");
                return null;
            }
            try
            {
                var bao = pl.GeometricExtents;
                rong = bao.MaxPoint.X - bao.MinPoint.X;
                cao = bao.MaxPoint.Y - bao.MinPoint.Y;
                tamX = (bao.MaxPoint.X + bao.MinPoint.X) / 2;
                tamY = (bao.MaxPoint.Y + bao.MinPoint.Y) / 2;
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage($"\n[XBoss] Không đọc được hình bao của ranh giới: {e.Message}\n");
                return null;
            }
            tr.Commit();
        }

        if (rong <= 0 || cao <= 0)
        {
            ed.WriteMessage("\n[XBoss] Ranh giới suy biến (hình bao rỗng) — chưa tạo trang in.\n");
            return null;
        }
        ed.WriteMessage(
            $"[XBoss] Vùng in lấy theo hình bao ranh giới: {rong:#,##0} × {cao:#,##0} đơn vị bản vẽ.\n");
        return (new Point2d(tamX, tamY), rong, cao);
    }

    /// <summary>Phạm vi VP-freeze — mặc định chỉ ẩn hệ MEP khác, giữ nền kiến trúc/trục.</summary>
    private enum CheDoAnLayer
    {
        /// <summary>Chỉ ẩn layer tuyến của các hệ KHÁC trong rule pack (nền kiến trúc vẫn thấy).</summary>
        HeKhac,
        /// <summary>Ẩn mọi layer không thuộc hệ đang in (chỉ còn hệ này + chú thích).</summary>
        NgoaiHe,
        /// <summary>Không ẩn gì.</summary>
        Khong,
    }

    private static CheDoAnLayer? HoiCheDoAnLayer(Editor ed)
    {
        ed.WriteMessage(
            "\n[XBoss] Ẩn layer theo viewport (VP freeze — KHÔNG đổi trạng thái layer toàn cục):\n" +
            "[XBoss]   HEKHAC = chỉ ẩn tuyến của các hệ MEP khác (giữ nền kiến trúc/trục)\n" +
            "[XBoss]   NGOAIHE = ẩn mọi layer không thuộc hệ đang in\n" +
            "[XBoss]   KHONG = không ẩn gì\n");
        var hoi = new PromptKeywordOptions("\n[XBoss] Chọn phạm vi ẩn") { AllowNone = false };
        hoi.Keywords.Add("HEKHAC", "HEKHAC", "HEKHAC");
        hoi.Keywords.Add("NGOAIHE", "NGOAIHE", "NGOAIHE");
        hoi.Keywords.Add("KHONG", "KHONG", "KHONG");
        hoi.Keywords.Default = "HEKHAC";
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return null;
        return kq.StringResult switch
        {
            "NGOAIHE" => CheDoAnLayer.NgoaiHe,
            "KHONG" => CheDoAnLayer.Khong,
            _ => CheDoAnLayer.HeKhac,
        };
    }

    /// <summary>
    /// Bảng nét in (CTB). Rule pack v4 khai lineweight THEO MÀU ACI chứ không khai tên tệp CTB,
    /// nên plugin không bịa tên: liệt kê CTB có trên máy, nhớ lựa chọn lần trước.
    /// Null = giữ CTB mặc định của layout.
    /// </summary>
    private static string? HoiCtb(Editor ed, string? macDinh)
    {
        List<string> danhSach;
        try
        {
            danhSach = PlotSettingsValidator.Current.GetPlotStyleSheetList()
                .Cast<string>()
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .ToList();
        }
        catch (Autodesk.AutoCAD.Runtime.Exception)
        {
            return null; // không đọc được danh sách CTB — giữ mặc định, không chặn lệnh
        }
        if (danhSach.Count == 0) return null;

        const string giuMacDinh = "(giữ mặc định)";
        var menu = new List<string> { giuMacDinh };
        menu.AddRange(danhSach);
        var goi = macDinh is not null && danhSach.Contains(macDinh, StringComparer.OrdinalIgnoreCase)
            ? macDinh
            : danhSach.FirstOrDefault(s => s.Contains("xboss", StringComparison.OrdinalIgnoreCase)) ?? giuMacDinh;

        var chon = VeContext.HoiDanhMuc(ed, "Bảng nét in CTB", menu, goi, choTuNhap: false);
        if (chon is not { } c || c.GiaTri == giuMacDinh) return null;
        return c.GiaTri;
    }

    /// <summary>Giá trị attribute khung tên: TI_LE/NGAY plugin tự điền, còn lại hỏi (nhớ lần trước).</summary>
    private static Dictionary<string, string> HoiThuocTinhKhungTen(
        Editor ed, BlockDef khung, double tiLe, GhiNhoTrangIn ghiNho)
    {
        var ra = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [TheTiLe] = $"1:{tiLe.ToString("0.##", CultureInfo.InvariantCulture)}",
            [TheNgay] = DateTime.Now.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture),
        };

        foreach (var the in khung.Attributes)
        {
            if (ra.ContainsKey(the)) continue;
            ghiNho.ThuocTinh.TryGetValue(the, out var cu);
            var opt = new PromptStringOptions(
                $"\n[XBoss] Khung tên · {the}{(string.IsNullOrEmpty(cu) ? "" : $" <{cu}>")}: ")
            {
                AllowSpaces = true,
            };
            var kq = ed.GetString(opt);
            var giaTri = kq.Status == PromptStatus.OK && kq.StringResult.Trim().Length > 0
                ? kq.StringResult.Trim()
                : cu ?? "";
            ra[the] = giaTri;
        }
        return ra;
    }

    // ===== Dựng layout =====

    private static bool CoDinhNghiaBlock(Database db, string tenBlock)
    {
        using var tr = db.TransactionManager.StartTransaction();
        var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
        var co = bt.Has(tenBlock);
        tr.Commit();
        return co;
    }

    private static IReadOnlyList<string> TenLayoutHienCo(Database db)
    {
        var ten = new List<string>();
        using var tr = db.TransactionManager.StartTransaction();
        var dict = (DBDictionary)tr.GetObject(db.LayoutDictionaryId, OpenMode.ForRead);
        foreach (DBDictionaryEntry muc in dict) ten.Add(muc.Key);
        tr.Commit();
        return ten;
    }

    private static void DatPageSetup(
        Layout layout, string mayIn, string kho, string? ctb, List<string> canhBao)
    {
        var psv = PlotSettingsValidator.Current;

        // Từng bước một try riêng: máy in/CTB chưa cài trên máy này là chuyện thường ở công trường,
        // hỏng một bước KHÔNG được kéo theo các bước sau (trước đây một throw là mất cả tỉ lệ in).
        // Không bước nào là "phải có": layout vẫn dùng được, kỹ sư chỉnh nốt trong PAGESETUP.
        void Thu(string moTa, Action buoc)
        {
            try
            {
                buoc();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                canhBao.Add($"Page setup — {moTa} chưa áp được ({e.Message}); chỉnh tay trong PAGESETUP.");
            }
        }

        if (!string.IsNullOrWhiteSpace(mayIn))
            Thu($"máy in \"{mayIn}\"", () => psv.SetPlotConfigurationName(layout, mayIn, null));
        Thu("nạp lại danh mục khổ giấy", () => psv.RefreshLists(layout));

        Thu($"khổ giấy {kho}", () =>
        {
            var media = SheetSetup.ChonTenKhoGiay(psv.GetCanonicalMediaNameList(layout).Cast<string>(), kho);
            if (media is not null) psv.SetCanonicalMediaName(layout, media);
            else canhBao.Add($"Máy in \"{mayIn}\" không có khổ {kho} — layout giữ khổ mặc định, chọn tay trong PAGESETUP.");
        });

        Thu("đơn vị giấy mm", () => psv.SetPlotPaperUnits(layout, PlotPaperUnit.Millimeters));
        Thu("vùng in = Layout", () => psv.SetPlotType(layout, Autodesk.AutoCAD.DatabaseServices.PlotType.Layout));
        Thu("hướng giấy", () => psv.SetPlotRotation(layout, PlotRotation.Degrees000));
        // Layout in 1:1; TỈ LỆ BẢN VẼ nằm ở viewport (in layout theo tỉ lệ khác sẽ phá tỉ lệ đã khóa).
        Thu("tỉ lệ in layout 1:1", () =>
        {
            psv.SetUseStandardScale(layout, true);
            psv.SetStdScaleType(layout, StdScaleType.StdScale1To1);
        });

        if (ctb is not null) Thu($"bảng nét in \"{ctb}\"", () => psv.SetCurrentStyleSheet(layout, ctb));
    }

    /// <summary>Khổ giấy (mm) của layout; máy in chưa cài thì trả khổ A1 nằm ngang làm mốc.</summary>
    private static (double Rong, double Cao) KhoGiayMm(Layout layout)
    {
        try
        {
            var kt = layout.PlotPaperSize;
            if (kt.X > 1 && kt.Y > 1) return (kt.X, kt.Y);
        }
        catch (Autodesk.AutoCAD.Runtime.Exception)
        {
            // rơi xuống mốc mặc định
        }
        return (841.0, 594.0);
    }

    private static Viewport TaoViewport(
        Transaction tr, BlockTableRecord paperSpace, (Point2d Tam, double Rong, double Cao) vung,
        double tiLeViewport, double rongGiay, double caoGiay, List<string> canhBao)
    {
        // Khung viewport trên giấy = kích thước vùng mô hình × tỉ lệ, cắt bớt cho vừa khổ giấy.
        const double le = 10.0;
        var rongToiDa = Math.Max(rongGiay - 2 * le, 10.0);
        var caoToiDa = Math.Max(caoGiay - 2 * le, 10.0);
        var rong = vung.Rong * tiLeViewport;
        var cao = vung.Cao * tiLeViewport;
        if (rong > rongToiDa || cao > caoToiDa)
        {
            canhBao.Add(
                $"Vùng chọn rộng hơn khổ giấy ở tỉ lệ này — khung viewport đã thu về {rongToiDa:0}×{caoToiDa:0}mm " +
                "(TỈ LỆ giữ nguyên, chỉ thấy ít hơn). Chọn tỉ lệ nhỏ hơn hoặc khổ lớn hơn nếu cần in trọn vùng.");
            rong = Math.Min(rong, rongToiDa);
            cao = Math.Min(cao, caoToiDa);
        }

        var vp = new Viewport();
        paperSpace.AppendEntity(vp);
        tr.AddNewlyCreatedDBObject(vp, true);

        vp.CenterPoint = new Point3d(rongGiay / 2, caoGiay / 2, 0);
        vp.Width = rong;
        vp.Height = cao;
        vp.On = true;
        vp.ViewCenter = vung.Tam;
        vp.CustomScale = tiLeViewport; // AC10: 1000mm mô hình = 20mm giấy ở 1:50
        return vp;
    }

    /// <summary>VP-freeze các layer ngoài phạm vi in; trả số layer đã ẩn.</summary>
    private static int AnLayerTrongViewport(
        Database db, Transaction tr, Viewport vp, DrawToolsPack pack, string heId,
        CheDoAnLayer cheDo, List<string> canhBao)
    {
        if (cheDo == CheDoAnLayer.Khong) return 0;

        var giu = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "0",
            "Defpoints",
            pack.DrawTools.LabelStyle.Layer,
        };
        var heKhac = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var sys in pack.DrawTools.Systems)
        {
            var cuaHeNay = string.Equals(sys.Id, heId, StringComparison.Ordinal);
            foreach (var line in sys.Lines)
            {
                var bien = VeLayerStyle.LayerNetBien(line.Layer, pack.DrawTools.EdgeLayerSuffix);
                if (cuaHeNay)
                {
                    giu.Add(line.Layer);
                    giu.Add(bien);
                }
                else
                {
                    heKhac.Add(line.Layer);
                    heKhac.Add(bien);
                }
            }
        }
        // Layer dùng chung giữa 2 hệ (nếu rule pack khai trùng) thì ưu tiên GIỮ.
        heKhac.ExceptWith(giu);

        var an = new List<ObjectId>();
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        foreach (ObjectId id in lt)
        {
            var ltr = (LayerTableRecord)tr.GetObject(id, OpenMode.ForRead);
            if (giu.Contains(ltr.Name)) continue;
            var can = cheDo == CheDoAnLayer.NgoaiHe || heKhac.Contains(ltr.Name);
            if (can) an.Add(ltr.ObjectId);
        }
        if (an.Count == 0) return 0;

        try
        {
            vp.FreezeLayersInViewport(((IEnumerable)an).GetEnumerator());
        }
        catch (Autodesk.AutoCAD.Runtime.Exception e)
        {
            canhBao.Add($"Không ẩn được layer theo viewport ({e.Message}) — dùng lệnh VPLAYER nếu cần.");
            return 0;
        }
        return an.Count;
    }

    /// <summary>
    /// Chèn khung tên vào paper space tại gốc giấy (0,0) và điền attribute.
    /// Định nghĩa block phải có sẵn trong bản vẽ (đã nhập trước khi mở transaction).
    /// </summary>
    private static bool ChenKhungTen(
        Database db, Transaction tr, BlockTableRecord paperSpace, BlockDef khung,
        IReadOnlyDictionary<string, string> giaTriThe)
    {
        var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
        if (!bt.Has(khung.BlockName)) return false;

        var dinhNghiaId = bt[khung.BlockName];
        var khungRef = new BlockReference(Point3d.Origin, dinhNghiaId);
        paperSpace.AppendEntity(khungRef);
        tr.AddNewlyCreatedDBObject(khungRef, true);

        var dinhNghia = (BlockTableRecord)tr.GetObject(dinhNghiaId, OpenMode.ForRead);
        if (dinhNghia.HasAttributeDefinitions)
        {
            foreach (ObjectId id in dinhNghia)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not AttributeDefinition ad || ad.Constant) continue;
                var att = new AttributeReference();
                att.SetAttributeFromBlock(ad, khungRef.BlockTransform);
                if (giaTriThe.TryGetValue(ad.Tag, out var giaTri) && giaTri.Length > 0) att.TextString = giaTri;
                khungRef.AttributeCollection.AppendAttribute(att);
                tr.AddNewlyCreatedDBObject(att, true);
            }
        }
        return true;
    }

    /// <summary>
    /// Nhập ĐỊNH NGHĨA block khung tên từ thư viện đã cache vào bản vẽ (một lần — M100 §4 "nhập
    /// định nghĩa vào BlockTable của DWG"). Việc nhập do <see cref="BlockLibraryService"/> làm —
    /// ở đây chỉ chuyển lỗi thành cảnh báo, vì thiếu khung tên KHÔNG được chặn cả trang in
    /// (layout + viewport vẫn có giá trị, khung tên chèn sau).
    /// </summary>
    private static bool NhapKhungTen(Database db, BlockDef khungTen, List<string> canhBao)
    {
        var tenBlock = khungTen.BlockName;
        try
        {
            // Truyền cả BlockDef (không chỉ tên): khung tên thêm từ web nằm ở tệp .dwg riêng nên
            // dịch vụ cần "fileKey" mới biết lấy định nghĩa ở đâu (M104 §1).
            BlockLibraryService.NhapDinhNghia(db, [khungTen], ghiDe: false);
            return true;
        }
        catch (BlockManifestException e)
        {
            canhBao.Add(e.Message);
            return false;
        }
        catch (Autodesk.AutoCAD.Runtime.Exception e)
        {
            canhBao.Add($"Không nhập được block \"{tenBlock}\" từ thư viện ({e.Message}).");
            return false;
        }
        catch (IOException e)
        {
            canhBao.Add($"Không đọc được tệp thư viện block ({e.Message}).");
            return false;
        }
    }

    private static void XoaLayoutDoDang(LayoutManager lm, string ten)
    {
        try
        {
            lm.DeleteLayout(ten);
        }
        catch (Autodesk.AutoCAD.Runtime.Exception)
        {
            // Layout không xóa được thì UNDO của AutoCAD vẫn dọn nốt — không che lỗi gốc.
        }
    }
}

/// <summary>
/// Giá trị nhập tay lần trước của trang in (khung tên + CTB) — M100 §6.3 "nhớ giá trị lần trước".
/// Lưu ở %APPDATA%\XBoss\trang-in.json, KHÔNG chứa bí mật (chỉ tên dự án/hạng mục/người vẽ).
/// </summary>
internal sealed class GhiNhoTrangIn
{
    public Dictionary<string, string> ThuocTinh { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public string? Ctb { get; set; }

    private static string DuongDan => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "XBoss", "trang-in.json");

    internal static GhiNhoTrangIn Doc()
    {
        try
        {
            if (!File.Exists(DuongDan)) return new GhiNhoTrangIn();
            var doc = JsonSerializer.Deserialize<GhiNhoTrangIn>(File.ReadAllText(DuongDan));
            if (doc is null) return new GhiNhoTrangIn();
            doc.ThuocTinh = new Dictionary<string, string>(doc.ThuocTinh, StringComparer.OrdinalIgnoreCase);
            return doc;
        }
        catch (System.Exception e) when (e is IOException or JsonException)
        {
            return new GhiNhoTrangIn(); // hỏng thì coi như chưa nhớ gì — không chặn lệnh vẽ
        }
    }

    internal void Luu(IReadOnlyDictionary<string, string> giaTriThe, string? ctb)
    {
        foreach (var (the, giaTri) in giaTriThe)
        {
            // TI_LE/NGAY do plugin sinh theo từng trang in — nhớ lại là sai.
            if (the is "TI_LE" or "NGAY") continue;
            if (giaTri.Length > 0) ThuocTinh[the] = giaTri;
        }
        Ctb = ctb;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(DuongDan)!);
            File.WriteAllText(DuongDan, JsonSerializer.Serialize(this));
        }
        catch (IOException)
        {
            // Không ghi được thì lần sau hỏi lại — không đáng để hỏng lệnh.
        }
    }
}
