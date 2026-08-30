using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Takeoff;
using XBoss.Cad.Core.Ui.ViewModels;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeThongkeCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_THONGKE</c> (M100 §6.9, FR9f): sinh bảng thống kê TRONG bản vẽ từ dữ liệu thật —
/// bảng thiết bị (đọc attribute TAG/MODEL/SIZE) hoặc bảng khối lượng theo hệ (đọc trạng thái bóc
/// của <c>XBOSS_BOCKL</c>).
///
/// Ranh giới cứng: appname <c>XBOSS_BOCKL</c> chỉ được ĐỌC (M100 §11) — lệnh này không đánh dấu,
/// không gỡ đánh dấu, không đụng màu đối tượng đã bóc.
/// Chạy lại: tìm bảng cũ CÙNG LOẠI do plugin sinh (XData <c>XBOSS_VE</c>) rồi đổ lại nội dung tại
/// chỗ — không bao giờ sinh bảng đôi.
/// </summary>
public sealed class VeThongkeCommands
{
    [CommandMethod("XBOSS_VE_THONGKE")]
    public void ThongKe()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;

        // Loại bảng + tỉ lệ in trong MỘT hộp thoại (M106 §7.2); UI hỏng / XBOSS_UI_DIALOG=0 → câu
        // hỏi keyword cũ rồi VeContext.HoiTiLeIn như trước (FR9).
        if (HoiThamSo(ed, pack) is not { } ts) return;
        ChayThongKe(doc, ed, pack, ts.Loai, ts.TiLeIn);
    }

    /// <summary>
    /// Thân thật của <c>XBOSS_VE_THONGKE</c> — dựng nội dung bảng rồi vẽ/cập nhật bảng trong bản vẽ.
    /// Tách nguyên vẹn khỏi <see cref="ThongKe"/> để <c>XBOSS_HOANTHIEN</c> (M115 giai đoạn ⑧) gọi
    /// lại đúng logic này thay vì nhân đôi.
    /// </summary>
    internal static void ChayThongKe(
        Autodesk.AutoCAD.ApplicationServices.Document doc, Editor ed, DrawToolsPack pack,
        LoaiBangThongKeUi loai, double tiLeIn, string? giaiDoanM115 = null)
    {
        var db = doc.Database;

        BangThongKe? bang;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            bang = loai switch
            {
                LoaiBangThongKeUi.KhoiLuong => BangKhoiLuong(ed, db, tr, pack),
                LoaiBangThongKeUi.ChiaDot => BangChiaDot(ed, db, tr),
                _ => BangThietBi(ed, db, tr),
            };
            tr.Commit();
        }
        if (bang is null) return;

        ed.WriteMessage($"\n[XBoss] ===== {bang.TieuDe} =====\n");
        foreach (var d in bang.Dong) ed.WriteMessage($"[XBoss]   {string.Join("  |  ", d)}\n");

        VeBang(doc, ed, pack, bang, tiLeIn, giaiDoanM115);
    }

    // ===== Thu tham số: hộp thoại (mặc định) hoặc dòng lệnh (M106 FR9) =====

    /// <summary>
    /// Loại bảng + tỉ lệ in. Tỉ lệ vẫn nhớ ở đúng <see cref="VeContext.TiLeIn"/> (FR4) — hộp thoại
    /// chỉ là lối vào thứ hai của cùng một giá trị. Null = kỹ sư hủy.
    /// </summary>
    private static KetQuaThongKe? HoiThamSo(Editor ed, DrawToolsPack pack)
    {
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new ThongKeDialogViewModel(pack.SheetSetup.Scales, VeContext.TiLeIn);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi)
        {
            if (kq is not null) VeContext.TiLeIn = kq.TiLeIn;
            return kq;
        }

        var hoi = new PromptKeywordOptions("\n[XBoss] Bảng thống kê — lấy dữ liệu từ đâu?") { AllowNone = false };
        hoi.Keywords.Add("THIETBI", "THIETBI", "Bảng thiết bị (từ attribute)");
        hoi.Keywords.Add("KHOILUONG", "KHOILUONG", "Bảng khối lượng theo hệ (từ trạng thái bóc XBOSS_BOCKL)");
        hoi.Keywords.Add("CHIADOT", "CHIADOT", "Bảng đốt theo kiểu nối (từ dấu chia đốt của XBOSS_VE_CHIADOT)");
        hoi.Keywords.Default = "THIETBI";
        var traLoi = ed.GetKeywords(hoi);
        if (traLoi.Status != PromptStatus.OK) return null;
        var loai = traLoi.StringResult switch
        {
            "KHOILUONG" => LoaiBangThongKeUi.KhoiLuong,
            "CHIADOT" => LoaiBangThongKeUi.ChiaDot,
            _ => LoaiBangThongKeUi.ThietBi,
        };
        // Đường cũ hỏi tỉ lệ SAU khi in bảng ra dòng lệnh; ở đây hỏi trước để hai đường cho cùng
        // một bản ghi tham số — giá trị và kết quả vẽ không đổi.
        if (VeContext.HoiTiLeIn(ed, pack) is not { } tiLe) return null;
        return new KetQuaThongKe(loai, tiLe);
    }

    // ===== Dựng nội dung =====

    private static BangThongKe? BangThietBi(Editor ed, Database db, Transaction tr)
    {
        var danhSach = new List<ThietBiThongKe>();
        foreach (var id in TakeoffScanner.ModelSpaceIds(db, tr))
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not BlockReference br) continue;

            var thuocTinh = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (ObjectId idAtt in br.AttributeCollection)
            {
                if (tr.GetObject(idAtt, OpenMode.ForRead) is not AttributeReference att) continue;
                thuocTinh[att.Tag ?? ""] = att.TextString ?? "";
            }
            if (!thuocTinh.ContainsKey("TAG")) continue; // không phải khối thiết bị

            var xd = VeXDataStore.Doc(br);
            var btr = (BlockTableRecord)tr.GetObject(br.DynamicBlockTableRecord, OpenMode.ForRead);
            danhSach.Add(new ThietBiThongKe(
                thuocTinh.GetValueOrDefault("TAG", ""),
                thuocTinh.GetValueOrDefault("MODEL", ""),
                thuocTinh.GetValueOrDefault("SIZE", ""),
                xd?.HeId ?? "",
                btr.Name));
        }

        if (danhSach.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Không thấy khối thiết bị nào có thẻ TAG trong bản vẽ — chèn bằng XBOSS_VE_THIETBI trước.\n");
            return null;
        }
        return ThongKeTable.ThietBi(danhSach);
    }

    private static BangThongKe? BangKhoiLuong(Editor ed, Database db, Transaction tr, DrawToolsPack pack)
    {
        var takeoff = pack.RulePack.Takeoff;
        var daGan = TakeoffScanner.DocDaGan(db, tr, takeoff.XdataAppName);
        if (daGan.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Chưa có đối tượng nào được đánh dấu bóc — chạy XBOSS_BOCKL trước rồi lập bảng.\n");
            return null;
        }

        var ketQua = new TakeoffCalculator(takeoff, pack.RulePack.Version)
            .ComputeAssigned(daGan, (int)db.Insunits);
        foreach (var w in ketQua.Warnings) ed.WriteMessage($"\n[XBoss] ⚠ {w.ThongDiep}\n");
        return ThongKeTable.KhoiLuong(ketQua);
    }

    /// <summary>
    /// Bảng đốt (M105): đọc DẤU CHIA ĐỐT trên XData của tim — không tính lại, không hỏi gì thêm.
    /// Tim nào chưa chạy <c>XBOSS_VE_CHIADOT</c> thì không có dấu, tự nằm ngoài bảng.
    /// </summary>
    private static BangThongKe? BangChiaDot(Editor ed, Database db, Transaction tr)
    {
        var danhSach = new List<DotThongKe>();
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Polyline pl) continue;
            var xd = VeXDataStore.Doc(pl);
            if (xd is null || xd.VaiTro != VaiTroVe.Tim) continue;
            if (xd.KieuNoi is not { Length: > 0 } kieuNoi || xd.SoDot is not { } soDot) continue;
            danhSach.Add(new DotThongKe(
                xd.HeId, xd.ItemId, xd.Size, kieuNoi, soDot, xd.SoMoiNoi ?? 0, xd.TongDaiDotMm ?? 0));
        }

        if (danhSach.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Chưa có tuyến nào được chia đốt trong bản vẽ — chạy XBOSS_VE_CHIADOT trước rồi lập bảng.\n");
            return null;
        }
        return ThongKeTable.ChiaDot(danhSach);
    }

    // ===== Vẽ bảng =====

    private static void VeBang(
        Autodesk.AutoCAD.ApplicationServices.Document doc, Editor ed, DrawToolsPack pack, BangThongKe bang,
        double tiLe, string? giaiDoanM115)
    {
        var db = doc.Database;
        var (toMm, _, _) = DrawingUnits.TuInsUnits((int)db.Insunits);
        var caoChu = pack.SheetSetup.TableStyle.TextHeightMm * tiLe / toMm;
        var ma = ThongKeTable.Ma(bang.Loai);

        ObjectId? bangCu;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            bangCu = VeBangService.TimBangCu(db, tr, ma);
            tr.Commit();
        }

        Point3d viTri = default;
        if (bangCu is null)
        {
            var kqDiem = ed.GetPoint(new PromptPointOptions("\n[XBoss] Điểm đặt bảng (góc trên-trái): "));
            if (kqDiem.Status != PromptStatus.OK)
            {
                ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
                return;
            }
            viTri = kqDiem.Value.TransformBy(ed.CurrentUserCoordinateSystem);
        }

        using var khoa = doc.LockDocument();
        using var tr2 = db.TransactionManager.StartTransaction();
        try
        {
            VeXDataStore.DangKyApp(db, tr2);
            var layerNhan = pack.DrawTools.LabelStyle.Layer;
            VeLayerService.DamBaoLayer(db, tr2, layerNhan, VeLayerStyle.AciNhan, pack.RulePack.LineweightMap, out _);

            if (bangCu is { } id && tr2.GetObject(id, OpenMode.ForWrite) is Table cu)
            {
                VeBangService.DoNoiDung(cu, bang.TieuDe, bang.Cot, bang.Dong, caoChu);
                ed.WriteMessage(
                    $"\n[XBoss] Đã CẬP NHẬT bảng cũ tại chỗ ({bang.Dong.Count} dòng) — không sinh bảng đôi.\n");
            }
            else
            {
                var ms = (BlockTableRecord)tr2.GetObject(
                    SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);
                VeBangService.Tao(
                    db, tr2, ms, viTri, layerNhan, bang.TieuDe, bang.Cot, bang.Dong, caoChu,
                    new VeXDataInfo
                    {
                        NguonHoanThien = giaiDoanM115 is null ? null : HoanThienKeHoach.NguonM115,
                        GiaiDoanHoanThien = giaiDoanM115,
                        VaiTro = VaiTroVe.BangThongKe,
                        LoaiBang = ma,
                        RulePackVersion = pack.RulePack.Version,
                    });
                ed.WriteMessage($"\n[XBoss] Đã tạo bảng ({bang.Dong.Count} dòng) trong bản vẽ.\n");
            }
            tr2.Commit();
        }
        catch (Autodesk.AutoCAD.Runtime.Exception e)
        {
            tr2.Abort();
            ed.WriteMessage(
                $"\n[XBoss] LỖI khi dựng bảng — đã rollback, bản vẽ nguyên trạng: {e.Message}\n" +
                "[XBoss] Nếu layer chú thích đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi thử lại.\n");
            return;
        }

        ed.WriteMessage("[XBoss] Hoàn tác: UNDO 1 lần.\n");
    }
}
