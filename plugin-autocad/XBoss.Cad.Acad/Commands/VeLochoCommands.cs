using System.Globalization;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Excel;
using XBoss.Cad.Core.Geometry;

using ChoChen = XBoss.Cad.Acad.Services.BlockLibraryService.KhoiChoChen;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeLochoCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_LOCHO</c> (M100 §6.8, FR9d, AC13): chèn sleeve/lỗ chờ tại chỗ tuyến xuyên kết cấu
/// và xuất **bảng lỗ chờ** (builder's work) — Table trong bản vẽ + tệp Excel gửi bên kết cấu.
///
/// Hai chế độ trong một lệnh: <c>CHEN</c> (đặt sleeve) và <c>XUATBANG</c> (dựng bảng từ các sleeve
/// đã đặt). Size lỗ chờ = size ống + <c>sleeveClearanceMm</c> của rule pack (Core
/// <see cref="SleeveSchedule"/> — có test); cao độ luôn NHẬP TAY (bản vẽ 2D không chứa cao độ
/// thật — cùng ranh giới với <c>XBOSS_VE_MATCAT</c>).
/// </summary>
public sealed class VeLochoCommands
{
    /// <summary>Cao độ (mm) và loại kết cấu nhập lần gần nhất trong phiên — mặc định cho lần sau.</summary>
    private static double? _caoDoLanTruoc;
    private static LoaiKetCau _ketCauLanTruoc = SleeveSchedule.DanhMucKetCau[0];

    [CommandMethod("XBOSS_VE_LOCHO")]
    public void LoCho()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;

        var hoi = new PromptKeywordOptions("\n[XBoss] Lỗ chờ/sleeve — làm gì?") { AllowNone = false };
        hoi.Keywords.Add("CHEN", "CHEN", "Chèn sleeve tại chỗ xuyên kết cấu");
        hoi.Keywords.Add("XUATBANG", "XUATBANG", "Xuất bảng lỗ chờ (Table + Excel)");
        hoi.Keywords.Default = "CHEN";
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return;

        if (kq.StringResult == "XUATBANG") XuatBang(doc, ed, pack);
        else Chen(doc, ed, pack);
    }

    // ===== Chế độ CHÈN =====

    private static void Chen(
        Autodesk.AutoCAD.ApplicationServices.Document doc, Editor ed, DrawToolsPack pack)
    {
        if (BlockLibraryService.CanThuVien(ed) is not { } thuVien) return;
        var db = doc.Database;

        // (1) Tuyến xuyên kết cấu — hệ/size/khe hở đều đọc từ XData của chính tuyến.
        var chon = ChonTim(ed, "Chọn TUYẾN TIM xuyên kết cấu: ");
        if (chon is null) return;

        List<DinhPolyline> dinh;
        bool kin;
        string layerTim;
        VeXDataInfo? xd;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            if (tr.GetObject(chon.ObjectId, OpenMode.ForRead) is not Polyline pl)
            {
                tr.Commit();
                ed.WriteMessage("\n[XBoss] Đối tượng chọn không phải polyline tuyến.\n");
                return;
            }
            dinh = VeThucThe.DinhCua(pl);
            kin = pl.Closed;
            layerTim = pl.Layer;
            xd = VeXDataStore.Doc(pl);
            tr.Commit();
        }
        if (xd is null || xd.VaiTro != VaiTroVe.Tim)
        {
            ed.WriteMessage(
                "\n[XBoss] Đối tượng này không phải TUYẾN TIM do XBOSS_VE vẽ — lỗ chờ cần size ống trong XData " +
                "để tính size sleeve. Vẽ tuyến bằng XBOSS_VE trước.\n");
            return;
        }

        var he = pack.DrawTools.Systems.FirstOrDefault(s => string.Equals(s.Id, xd.HeId, StringComparison.Ordinal));
        var tuyen = he?.Lines.FirstOrDefault(l => string.Equals(l.ItemId, xd.ItemId, StringComparison.Ordinal));
        if (he is null || tuyen is null)
        {
            ed.WriteMessage(
                $"\n[XBoss] Tuyến {xd.HeId}/{xd.ItemId} không còn trong rule pack {pack.RulePack.Version} — " +
                "không tra được khe hở sleeve.\n");
            return;
        }
        if (tuyen.SleeveClearanceMm is not { } kheHo)
        {
            ed.WriteMessage(
                $"\n[XBoss] Rule pack chưa khai sleeveClearanceMm cho {tuyen.ItemId} — plugin KHÔNG tự bịa khe hở. " +
                "Bổ sung ở rule pack version sau rồi chạy lại.\n");
            return;
        }
        if (SleeveSchedule.KichThuoc(xd.Size, kheHo) is not { } sizeSleeve)
        {
            ed.WriteMessage(
                $"\n[XBoss] Không đọc được kích thước từ size \"{xd.Size}\" — không tính được size lỗ chờ.\n");
            return;
        }

        // (2) Block sleeve của hệ.
        var danhSach = new List<BlockDef>();
        foreach (var id in he.Fittings)
        {
            var def = thuVien.TimTheoId(id);
            if (def is not null && def.KindEnum == BlockKind.Sleeve) danhSach.Add(def);
        }
        if (danhSach.Count == 0)
        {
            ed.WriteMessage(
                $"\n[XBoss] Thư viện {thuVien.Version} chưa có block sleeve (kind=sleeve) cho hệ {he.Id}.\n");
            return;
        }
        var def0 = BlockLibraryService.HoiBlock(ed, $"Sleeve của hệ {he.Id}", danhSach, null);
        if (def0 is null) return;

        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — kích thước sleeve " +
                "đã quy đổi theo đơn vị này, chuẩn dự án là mm.\n");
        }
        ed.WriteMessage(
            $"\n[XBoss] Ống {xd.Size} + khe hở {kheHo:0.#}mm ⇒ lỗ chờ {sizeSleeve.Nhan}.\n");

        // (3) Điểm xuyên: bấm tay hoặc dò giao với layer kết cấu.
        var diem = HoiDiemXuyen(ed, db, pack, dinh, kin, chon.ObjectId);
        if (diem is null || diem.Count == 0)
        {
            ed.WriteMessage("\n[XBoss] Chưa chọn điểm xuyên nào — bản vẽ không thay đổi.\n");
            return;
        }

        // (4) Trục gần nhất (đọc nhãn trục trong bản vẽ) + cao độ/kết cấu nhập tay từng điểm.
        List<MocTruc> truc;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            truc = MocTrucTrongBanVe(db, tr, pack);
            tr.Commit();
        }
        if (truc.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] ⚠ Không thấy nhãn trục trên layer kết cấu — cột \"Vị trí\" của bảng lỗ chờ sẽ để trống " +
                "(plugin không bịa vị trí).\n");
        }

        var tyLe = def0.ScaleBySize ? sizeSleeve.RongMm / toMm / FittingPlacement.KichThuocDanhNghia : 1.0;
        var muc = new List<ChoChen>();
        foreach (var d in diem)
        {
            var viTriTruc = SleeveSchedule.ViTriTheoTruc(d.Diem, truc);
            ed.WriteMessage(
                $"\n[XBoss] Lỗ chờ {muc.Count + 1}{(viTriTruc.Length > 0 ? $" tại trục {viTriTruc}" : "")}:\n");

            var caoDo = HoiCaoDo(ed);
            if (caoDo is null)
            {
                ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
                return;
            }
            var ketCau = HoiKetCau(ed);
            if (ketCau is null)
            {
                ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
                return;
            }

            muc.Add(new ChoChen(
                new Point3d(d.Diem.X, d.Diem.Y, 0),
                def0.RotateToPath ? d.Goc : 0,
                tyLe,
                layerTim,
                new VeXDataInfo
                {
                    VaiTro = VaiTroVe.LoCho,
                    HeId = xd.HeId,
                    ItemId = xd.ItemId,
                    Size = xd.Size,
                    RulePackVersion = pack.RulePack.Version,
                    BlockId = def0.Id,
                    ThuVienVersion = thuVien.Version,
                    HandleTim = chon.ObjectId.Handle.ToString(),
                    SizeLoCho = sizeSleeve.Nhan,
                    KetCau = ketCau,
                    ViTriTruc = viTriTruc,
                    CaoDoMm = caoDo,
                },
                []));
        }

        if (!BlockLibraryService.ChenHangLoat(doc, ed, db, def0, thuVien, muc)) return;

        ed.WriteMessage(
            $"\n[XBoss] Đã chèn {muc.Count} lỗ chờ {sizeSleeve.Nhan} ({def0.BlockName}) trên tuyến {xd.Size}.\n");
        BlockLibraryService.BaoItemDem(ed, pack.RulePack, def0, "lỗ chờ");
        ed.WriteMessage(
            "[XBoss] Xuất bảng builder's work: XBOSS_VE_LOCHO → XUATBANG · Hoàn tác: UNDO 1 lần.\n");
    }

    // ===== Chế độ XUẤT BẢNG =====

    private static void XuatBang(
        Autodesk.AutoCAD.ApplicationServices.Document doc, Editor ed, DrawToolsPack pack)
    {
        var db = doc.Database;

        List<DongLoCho> dong;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            dong = DocLoCho(db, tr);
            tr.Commit();
        }
        if (dong.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Chưa có lỗ chờ nào trong bản vẽ — chạy XBOSS_VE_LOCHO → CHEN trước.\n");
            return;
        }

        ed.WriteMessage($"\n[XBoss] ===== BẢNG LỖ CHỜ — {dong.Count} vị trí =====\n");
        foreach (var d in dong)
        {
            ed.WriteMessage(
                $"[XBoss]   {d.Stt,3}. {d.HeId,-14} {d.ViTriTruc,-10} " +
                $"{(d.CaoDoMm is { } c ? c.ToString("#,##0", CultureInfo.InvariantCulture) : "—"),8}  " +
                $"{d.SizeOng,-10} → {d.SizeLoCho,-10} {d.KetCau}\n");
        }
        ed.WriteMessage("[XBoss] Cao độ là giá trị NHẬP TAY — kiểm tra lại tại hiện trường.\n");

        // (1) Table trong bản vẽ (chạy lại thì cập nhật bảng cũ tại chỗ).
        VeBang(doc, ed, pack, dong);

        // (2) Tệp Excel gửi bên kết cấu.
        XuatExcel(ed, db, pack, dong);
    }

    private static void VeBang(
        Autodesk.AutoCAD.ApplicationServices.Document doc, Editor ed, DrawToolsPack pack,
        IReadOnlyList<DongLoCho> dong)
    {
        var db = doc.Database;
        if (VeContext.HoiTiLeIn(ed, pack) is not { } tiLe) return;
        var (toMm, _, _) = DrawingUnits.TuInsUnits((int)db.Insunits);
        var caoChu = pack.SheetSetup.TableStyle.TextHeightMm * tiLe / toMm;

        ObjectId? bangCu;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            bangCu = VeBangService.TimBangCu(db, tr, VeBangService.MaBangLoCho);
            tr.Commit();
        }

        Point3d viTri = default;
        if (bangCu is null)
        {
            var kq = ed.GetPoint(new PromptPointOptions("\n[XBoss] Điểm đặt bảng lỗ chờ (góc trên-trái): "));
            if (kq.Status != PromptStatus.OK)
            {
                ed.WriteMessage("\n[XBoss] Bỏ qua bảng trong bản vẽ (vẫn xuất được Excel).\n");
                return;
            }
            viTri = kq.Value.TransformBy(ed.CurrentUserCoordinateSystem);
        }

        var tieuDe = $"BẢNG LỖ CHỜ / SLEEVE ({dong.Count})";
        var o = dong.Select(SleeveSchedule.O).ToList();

        using var khoa = doc.LockDocument();
        using var tr2 = db.TransactionManager.StartTransaction();
        try
        {
            VeXDataStore.DangKyApp(db, tr2);
            var layerNhan = pack.DrawTools.LabelStyle.Layer;
            VeLayerService.DamBaoLayer(db, tr2, layerNhan, VeLayerStyle.AciNhan, pack.RulePack.LineweightMap, out _);

            if (bangCu is { } id && tr2.GetObject(id, OpenMode.ForWrite) is Table cu)
            {
                VeBangService.DoNoiDung(cu, tieuDe, SleeveSchedule.TieuDe, o, caoChu);
                ed.WriteMessage("[XBoss] Đã CẬP NHẬT bảng lỗ chờ cũ tại chỗ (không sinh bảng đôi).\n");
            }
            else
            {
                var ms = (BlockTableRecord)tr2.GetObject(
                    SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);
                VeBangService.Tao(
                    db, tr2, ms, viTri, layerNhan, tieuDe, SleeveSchedule.TieuDe, o, caoChu,
                    new VeXDataInfo
                    {
                        VaiTro = VaiTroVe.BangThongKe,
                        LoaiBang = VeBangService.MaBangLoCho,
                        RulePackVersion = pack.RulePack.Version,
                    });
                ed.WriteMessage("[XBoss] Đã tạo bảng lỗ chờ trong bản vẽ.\n");
            }
            tr2.Commit();
        }
        catch (Autodesk.AutoCAD.Runtime.Exception e)
        {
            tr2.Abort();
            ed.WriteMessage(
                $"\n[XBoss] LỖI khi dựng bảng — đã rollback, bản vẽ nguyên trạng: {e.Message}\n");
        }
    }

    private static void XuatExcel(Editor ed, Database db, DrawToolsPack pack, IReadOnlyList<DongLoCho> dong)
    {
        var hoi = new PromptKeywordOptions("\n[XBoss] Xuất tệp Excel bảng lỗ chờ?") { AllowNone = false };
        hoi.Keywords.Add("Co", "Co", "Có");
        hoi.Keywords.Add("Khong", "Khong", "Không");
        hoi.Keywords.Default = "Co";
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK || kq.StringResult != "Co") return;

        // Tên dự án dùng CHUNG với XBOSS_BOCKL_XUAT (nhớ giữa các lần xuất) — hỏi khi chưa có.
        var luu = ExcelMetaStore.Doc();
        var tenDuAn = luu.TenDuAn;
        if (string.IsNullOrWhiteSpace(tenDuAn))
        {
            var kqTen = ed.GetString(new PromptStringOptions("\n[XBoss] Tên dự án: ") { AllowSpaces = true });
            if (kqTen.Status != PromptStatus.OK) return;
            tenDuAn = kqTen.StringResult.Trim();
            if (tenDuAn.Length > 0) ExcelMetaStore.Ghi(luu with { TenDuAn = tenDuAn });
        }

        var tenBanVe = Path.GetFileName(db.Filename);
        var goiY = Path.ChangeExtension(tenBanVe, null) + "-bang-lo-cho.xlsx";
        var dlg = new Autodesk.AutoCAD.Windows.SaveFileDialog(
            "Lưu bảng lỗ chờ (builder's work)", goiY, "xlsx", "XBossLoCho",
            default(Autodesk.AutoCAD.Windows.SaveFileDialog.SaveFileDialogFlags));
        if (dlg.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;

        var meta = new LoChoExcelMeta
        {
            TenDuAn = tenDuAn,
            TenBanVe = tenBanVe,
            RulePackVersion = pack.RulePack.Version,
            NguoiLap = Environment.UserName,
            NgayIso = DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        };
        try
        {
            using var f = File.Create(dlg.Filename);
            LoChoExcelWriter.Write(dong, meta, f);
        }
        catch (IOException e)
        {
            ed.WriteMessage($"\n[XBoss] Không ghi được tệp Excel: {e.Message}\n");
            return;
        }
        ed.WriteMessage($"\n[XBoss] Đã xuất bảng lỗ chờ: {dlg.Filename}\n");
    }

    // ===== Hỏi đáp =====

    private static PromptEntityResult? ChonTim(Editor ed, string nhac)
    {
        var hoi = new PromptEntityOptions($"\n[XBoss] {nhac}");
        hoi.SetRejectMessage("\n[XBoss] Chỉ chọn được tuyến tim do XBOSS_VE vẽ (polyline).\n");
        hoi.AddAllowedClass(typeof(Polyline), false);
        var chon = ed.GetEntity(hoi);
        return chon.Status == PromptStatus.OK ? chon : null;
    }

    /// <summary>Cao độ tim (mm) — luôn hỏi, mặc định là giá trị lần trước (không có giá trị ngầm).</summary>
    private static double? HoiCaoDo(Editor ed)
    {
        while (true)
        {
            var mac = _caoDoLanTruoc?.ToString("0.##", CultureInfo.InvariantCulture) ?? "";
            var kq = ed.GetString(new PromptStringOptions(
                $"\n[XBoss] Cao độ tim ống (mm){(mac.Length > 0 ? $" <{mac}>" : "")}: ")
            {
                AllowSpaces = false,
            });
            if (kq.Status != PromptStatus.OK) return null;
            var nhap = kq.StringResult.Trim();
            if (nhap.Length == 0) nhap = mac;
            if (double.TryParse(nhap, NumberStyles.Float, CultureInfo.InvariantCulture, out var mm))
            {
                _caoDoLanTruoc = mm;
                return mm;
            }
            ed.WriteMessage("\n[XBoss] Cao độ phải là số (mm) — vd 2700 hoặc -150.\n");
        }
    }

    private static string? HoiKetCau(Editor ed)
    {
        var hoi = new PromptKeywordOptions("\n[XBoss] Xuyên kết cấu gì?") { AllowNone = false };
        foreach (var loai in SleeveSchedule.DanhMucKetCau) hoi.Keywords.Add(loai.TuKhoa, loai.TuKhoa, loai.Ten);
        hoi.Keywords.Default = _ketCauLanTruoc.TuKhoa;
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return null;

        var chon = SleeveSchedule.DanhMucKetCau.FirstOrDefault(
            l => string.Equals(l.TuKhoa, kq.StringResult, StringComparison.OrdinalIgnoreCase));
        if (chon is null) return null;
        _ketCauLanTruoc = chon;
        return chon.Ten;
    }

    /// <summary>
    /// Điểm xuyên kết cấu: bấm tay từng điểm, hoặc DÒ giao tim × đối tượng trên layer kết cấu rồi
    /// xác nhận từng điểm (M100 §6.8). Trả điểm ĐÃ HÍT vào tim + hướng tuyến tại đó.
    /// </summary>
    private static List<(Diem2 Diem, double Goc)>? HoiDiemXuyen(
        Editor ed, Database db, DrawToolsPack pack, IReadOnlyList<DinhPolyline> dinh, bool kin, ObjectId idTim)
    {
        var hoi = new PromptKeywordOptions("\n[XBoss] Xác định điểm xuyên kết cấu bằng cách nào?")
        {
            AllowNone = false,
        };
        hoi.Keywords.Add("DIEM", "DIEM", "Bấm từng điểm trên tuyến");
        hoi.Keywords.Add("DO", "DO", "Dò giao tuyến × layer kết cấu");
        hoi.Keywords.Default = "DIEM";
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return null;

        return kq.StringResult == "DO"
            ? DoGiaoKetCau(ed, db, pack, dinh, kin, idTim)
            : BamTungDiem(ed, dinh, kin);
    }

    private static List<(Diem2 Diem, double Goc)>? BamTungDiem(
        Editor ed, IReadOnlyList<DinhPolyline> dinh, bool kin)
    {
        var ra = new List<(Diem2, double)>();
        while (true)
        {
            var opt = new PromptPointOptions(
                "\n[XBoss] Điểm xuyên trên tuyến (Enter = kết thúc, ESC = hủy cả lệnh): ")
            {
                AllowNone = true,
            };
            var kq = ed.GetPoint(opt);
            if (kq.Status == PromptStatus.None) break;
            if (kq.Status != PromptStatus.OK) return null;

            var p = kq.Value.TransformBy(ed.CurrentUserCoordinateSystem);
            var vt = FittingPlacement.TrenTuyen(dinh, new Diem2(p.X, p.Y), kin);
            if (vt is null)
            {
                ed.WriteMessage("\n[XBoss] Tuyến không đủ 2 đỉnh phân biệt — không hít được điểm vào tim.\n");
                return null;
            }
            ra.Add((vt.Diem, vt.Goc));
            ed.WriteMessage($"[XBoss]   đã ghi nhận điểm {ra.Count}\n");
        }
        return ra;
    }

    /// <summary>
    /// Dò giao tuyến tim × mọi đối tượng trên layer kết cấu (target của nhóm layerMap
    /// <c>STRUCTURAL</c> — KHÔNG hard-code tên layer), xác nhận từng điểm.
    /// </summary>
    private static List<(Diem2 Diem, double Goc)>? DoGiaoKetCau(
        Editor ed, Database db, DrawToolsPack pack, IReadOnlyList<DinhPolyline> dinh, bool kin, ObjectId idTim)
    {
        var layerKetCau = LayerKetCau(pack);
        if (layerKetCau.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Rule pack không khai nhóm layer kết cấu (STRUCTURAL) — không dò giao được, bấm điểm tay.\n");
            return null;
        }

        var giao = new List<Point3d>();
        using (var tr = db.TransactionManager.StartTransaction())
        {
            if (tr.GetObject(idTim, OpenMode.ForRead) is not Curve tim)
            {
                tr.Commit();
                return null;
            }
            var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
            foreach (ObjectId id in ms)
            {
                if (id == idTim) continue;
                if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
                if (!layerKetCau.Contains(ent.Layer)) continue;

                using var diem = new Point3dCollection();
                try
                {
                    tim.IntersectWith(ent, Intersect.OnBothOperands, diem, IntPtr.Zero, IntPtr.Zero);
                }
                catch (Autodesk.AutoCAD.Runtime.Exception)
                {
                    continue; // đối tượng không giao được (text, block phức tạp…) — bỏ qua
                }
                foreach (Point3d p in diem) giao.Add(p);
            }
            tr.Commit();
        }

        if (giao.Count == 0)
        {
            ed.WriteMessage(
                $"\n[XBoss] Không thấy giao điểm giữa tuyến và layer kết cấu ({string.Join(", ", layerKetCau)}) — " +
                "bấm điểm tay nếu kết cấu nằm ở xref hoặc layer khác.\n");
            return null;
        }

        ed.WriteMessage($"\n[XBoss] Tìm thấy {giao.Count} giao điểm với kết cấu — xác nhận từng điểm:\n");
        var ra = new List<(Diem2, double)>();
        var stt = 0;
        foreach (var p in giao)
        {
            stt++;
            var vt = FittingPlacement.TrenTuyen(dinh, new Diem2(p.X, p.Y), kin);
            if (vt is null) continue;

            var hoi = new PromptKeywordOptions(
                $"\n[XBoss] Giao điểm {stt}/{giao.Count} tại ({p.X:0.#}, {p.Y:0.#}) — chèn lỗ chờ?")
            {
                AllowNone = false,
            };
            hoi.Keywords.Add("Co", "Co", "Có");
            hoi.Keywords.Add("Bo", "Bo", "Bỏ qua điểm này");
            hoi.Keywords.Add("KetThuc", "KetThuc", "Kết thúc chọn");
            hoi.Keywords.Default = "Co";
            var kq = ed.GetKeywords(hoi);
            if (kq.Status != PromptStatus.OK) return null;
            if (kq.StringResult == "KetThuc") break;
            if (kq.StringResult == "Bo") continue;
            ra.Add((vt.Diem, vt.Goc));
        }
        return ra;
    }

    // ===== Đọc bản vẽ =====

    private static HashSet<string> LayerKetCau(DrawToolsPack pack)
    {
        var ra = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var g in pack.RulePack.LayerMap.Groups)
        {
            if (!string.Equals(g.Id, "STRUCTURAL", StringComparison.OrdinalIgnoreCase)) continue;
            foreach (var b in g.Branches)
            {
                if (!string.IsNullOrWhiteSpace(b.Target)) ra.Add(b.Target);
            }
        }
        return ra;
    }

    /// <summary>
    /// Nhãn trục kết cấu trong bản vẽ: text ngắn (≤3 ký tự chữ/số) nằm trên layer kết cấu —
    /// đúng dạng bong bóng trục A/B/1/2 của bản vẽ kiến trúc-kết cấu.
    /// </summary>
    private static List<MocTruc> MocTrucTrongBanVe(Database db, Transaction tr, DrawToolsPack pack)
    {
        var layer = LayerKetCau(pack);
        var ra = new List<MocTruc>();
        if (layer.Count == 0) return ra;

        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            if (!layer.Contains(ent.Layer)) continue;

            string? ten = null;
            Point3d viTri = default;
            switch (ent)
            {
                case DBText t:
                    ten = t.TextString;
                    viTri = t.Position;
                    break;
                case MText m:
                    ten = m.Text; // Text = nội dung đã bỏ mã định dạng (\W0.8; …) của MTEXT

                    viTri = m.Location;
                    break;
            }
            if (ten is null) continue;
            var sach = ten.Trim();
            if (sach.Length is 0 or > 3 || !sach.All(char.IsLetterOrDigit)) continue;
            ra.Add(new MocTruc(sach.ToUpperInvariant(), new Diem2(viTri.X, viTri.Y)));
        }
        return ra;
    }

    /// <summary>Mọi lỗ chờ do plugin chèn, đã đánh STT theo thứ tự hệ → trục → handle.</summary>
    private static List<DongLoCho> DocLoCho(Database db, Transaction tr)
    {
        var tho = new List<DongLoCho>();
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not BlockReference br) continue;
            var xd = VeXDataStore.Doc(br);
            if (xd is null || xd.VaiTro != VaiTroVe.LoCho) continue;

            tho.Add(new DongLoCho
            {
                HeId = xd.HeId,
                ViTriTruc = xd.ViTriTruc ?? "",
                CaoDoMm = xd.CaoDoMm,
                SizeOng = xd.Size,
                SizeLoCho = xd.SizeLoCho ?? "",
                KetCau = xd.KetCau ?? "",
                Handle = br.Handle.ToString(),
            });
        }

        return SleeveSchedule.DanhSo(tho
            .OrderBy(d => d.HeId, StringComparer.Ordinal)
            .ThenBy(d => d.ViTriTruc, StringComparer.OrdinalIgnoreCase)
            .ThenBy(d => d.Handle, StringComparer.Ordinal)).ToList();
    }
}
