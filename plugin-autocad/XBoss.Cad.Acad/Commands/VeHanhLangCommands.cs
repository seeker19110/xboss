using System.Globalization;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Ui.ViewModels;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeHanhLangCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_HANHLANG</c> — khai HÀNH LANG đi ống, dữ liệu nền cho <c>XBOSS_VE_TUYENTUDONG</c>
/// (M114 FR1–FR4). Bốn chế độ trong một lệnh:
///
/// <list type="bullet">
/// <item><b>Vẽ mới</b> — bấm điểm tim hành lang như PLINE (chỉ đoạn thẳng).</item>
/// <item><b>Nhận</b> — chọn polyline CÓ SẴN (trục hành lang kiến trúc) rồi chỉ gán XData + đổi
/// layer: <b>không đụng một tọa độ đỉnh nào</b> (FR1/AC13, đúng khuôn M107).</item>
/// <item><b>Sửa</b> — ghi đè bề rộng/cao độ/hệ được phép tại chỗ; sổ chiếm làn
/// (<see cref="VeXDataInfo.LanDaCap"/>) GIỮ NGUYÊN, lệnh này không bao giờ cấp/gỡ làn (FR4).</item>
/// <item><b>Xóa</b> — hành lang còn hệ đang đi qua thì CẢNH BÁO nêu đúng hệ nào rồi hỏi lại; xóa
/// xong các tuyến đó thành tuyến thường, lệnh không tự xóa tuyến theo (FR4).</item>
/// </list>
///
/// Ranh giới cứng:
/// <list type="bullet">
/// <item><c>routingPolicy.enabled = false</c> (mặc định) → dừng kèm hướng dẫn cách bật, bản vẽ
/// không đổi một nét nào (AC14).</item>
/// <item>Chỉ nhận polyline/line ĐOẠN THẲNG ngoài xref — arc/spline/polyline có đoạn cung bị bỏ
/// qua kèm lý do đếm được (FR1), vì đồ thị hành lang của Core chỉ làm việc trên đoạn thẳng.</item>
/// <item>Cao độ đáy dầm/trần LUÔN hỏi, không suy từ bản vẽ (M100 §6.3).</item>
/// <item>Mọi hỏi đáp NGOÀI transaction; toàn bộ thay đổi trong MỘT transaction = MỘT nhóm UNDO
/// (M100 §6.11 / M114 guardrail 7).</item>
/// </list>
/// </summary>
public sealed class VeHanhLangCommands
{
    /// <summary>Một đối tượng đã đọc xong ở transaction chỉ-đọc (chưa đụng bản vẽ).</summary>
    private sealed record UngVienHanhLang(
        ObjectId Id,
        string Handle,
        bool LaLine,
        string LayerCu,
        VeXDataInfo? XDataCu,
        List<DinhPolyline> Dinh,
        bool Kin);

    [CommandMethod("XBOSS_VE_HANHLANG")]
    public void HanhLang()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        if (ChinhSachDiTuyen(ed, pack) is not { } chinhSach) return;

        var cheDo = HoiCheDo(ed);
        if (cheDo is null) return;

        switch (cheDo.Value)
        {
            case CheDoHanhLang.VeMoi:
                VeMoi(doc, ed, pack, chinhSach);
                break;
            case CheDoHanhLang.Nhan:
                NhanCoSan(doc, ed, pack, chinhSach);
                break;
            case CheDoHanhLang.Sua:
                Sua(doc, ed, pack, chinhSach);
                break;
            default:
                Xoa(doc, ed);
                break;
        }
    }

    // ===================================================================================
    // Cổng vào chung
    // ===================================================================================

    /// <summary>
    /// Khối <c>drawTools.routingPolicy</c> đang có hiệu lực; null + hướng dẫn cách bật khi rule
    /// pack chưa khai hoặc còn <c>enabled: false</c> (AC14 — bản vẽ không đổi một nét nào).
    /// </summary>
    private static RoutingPolicySection? ChinhSachDiTuyen(Editor ed, DrawToolsPack pack)
    {
        if (pack.DrawTools.RoutingPolicy is not { } cs)
        {
            ed.WriteMessage(
                $"\n[XBoss] Rule pack {pack.RulePack.Version} chưa khai drawTools.routingPolicy — " +
                "đi tuyến tự động chưa dùng được. Nạp rule pack mới (v15 trở lên) rồi chạy lại.\n");
            return null;
        }
        if (!cs.Enabled)
        {
            ed.WriteMessage(
                $"\n[XBoss] Đi tuyến tự động đang TẮT trong rule pack {pack.RulePack.Version} " +
                "(drawTools.routingPolicy.enabled = false) — lệnh dừng, bản vẽ không đổi.\n" +
                "[XBoss] Cách bật: Admin/PM sửa enabled = true trong rule pack trên trang " +
                "/engineering/chuan-hoa-ban-ve, phát hành version mới rồi chạy XBOSS_LOGIN (hoặc " +
                "XBOSS_RULEPACK) để nạp lại.\n");
            return null;
        }
        if (string.IsNullOrWhiteSpace(cs.CorridorLayer))
        {
            ed.WriteMessage(
                "\n[XBoss] Rule pack khai routingPolicy.corridorLayer rỗng — không biết đặt hành lang lên " +
                "layer nào. Bổ sung layer hành lang vào rule pack rồi chạy lại.\n");
            return null;
        }
        return cs;
    }

    /// <summary>Chế độ chạy — keyword dòng lệnh (một câu hỏi, ngoài transaction). Null = kỹ sư hủy.</summary>
    private static CheDoHanhLang? HoiCheDo(Editor ed)
    {
        ed.WriteMessage(
            "\n[XBoss] Hành lang đi ống — chế độ:\n" +
            "[XBoss]   VEMOI = vẽ tim hành lang mới\n" +
            "[XBoss]   NHAN  = nhận polyline có sẵn thành hành lang (giữ nguyên từng đỉnh)\n" +
            "[XBoss]   SUA   = sửa bề rộng/cao độ/hệ được phép của hành lang đã có\n" +
            "[XBoss]   XOA   = xóa hành lang\n");
        var hoi = new PromptKeywordOptions("\n[XBoss] Chọn chế độ") { AllowNone = false };
        hoi.Keywords.Add("VEMOI", "VEMOI", "VEMOI");
        hoi.Keywords.Add("NHAN", "NHAN", "NHAN");
        hoi.Keywords.Add("SUA", "SUA", "SUA");
        hoi.Keywords.Add("XOA", "XOA", "XOA");
        hoi.Keywords.Default = "VEMOI";
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return null;
        return kq.StringResult switch
        {
            "NHAN" => CheDoHanhLang.Nhan,
            "SUA" => CheDoHanhLang.Sua,
            "XOA" => CheDoHanhLang.Xoa,
            _ => CheDoHanhLang.VeMoi,
        };
    }

    // ===================================================================================
    // FR1 — Vẽ mới
    // ===================================================================================

    private static void VeMoi(Document doc, Editor ed, DrawToolsPack pack, RoutingPolicySection chinhSach)
    {
        // Thuộc tính hỏi TRƯỚC khi bấm điểm: ESC lúc bấm điểm là không có gì được tạo (§6.11).
        if (HoiThuocTinh(ed, CheDoHanhLang.VeMoi, new TomTatChonHanhLang(), pack, chinhSach) is not { } tt) return;

        var duong = BatDiemThang(ed);
        if (duong is not { } net) return;

        var db = doc.Database;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeXDataStore.DangKyApp(db, tr);
                VeLayerService.DamBaoLayer(
                    db, tr, chinhSach.CorridorLayer, VeLayerStyle.AciHanhLang, pack.RulePack.LineweightMap, out _);
                VeLayerService.MoKhoaNeuCo(db, tr, chinhSach.CorridorLayer);

                var ms = (BlockTableRecord)tr.GetObject(
                    SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);
                var tim = VeThucThe.TaoPolyline(net.Dinh, net.Kin);
                VeThucThe.Them(tr, ms, tim, chinhSach.CorridorLayer);
                VeXDataStore.Ghi(tim, XDataHanhLang(pack, tt, []));
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                BaoLoi(ed, e);
                return;
            }
        }

        GhiNhoPhien(tt);
        ed.WriteMessage(
            $"\n[XBoss] Đã vẽ 1 hành lang trên layer {chinhSach.CorridorLayer} " +
            $"({net.Dinh.Count} đỉnh{(net.Kin ? ", kín" : "")}) — {MoTaThuocTinh(tt)}.\n");
        ed.WriteMessage(
            "[XBoss] Đi tuyến trên hành lang này: XBOSS_VE_TUYENTUDONG · Hoàn tác: UNDO 1 lần.\n");
    }

    // ===================================================================================
    // FR1 — Nhận polyline có sẵn (KHÔNG đụng tọa độ đỉnh — AC13)
    // ===================================================================================

    private static void NhanCoSan(Document doc, Editor ed, DrawToolsPack pack, RoutingPolicySection chinhSach)
    {
        ed.WriteMessage(
            "\n[XBoss] Chọn các polyline làm hành lang (quét cả vùng cũng được — arc/spline/text/block " +
            "và đối tượng thuộc xref tự bỏ qua).\n");
        if (ChonUngVien(ed, doc.Database, chiHanhLang: false) is not (var ungVien, var tomTat)) return;

        foreach (var d in tomTat.DongBoQua) ed.WriteMessage($"[XBoss] Bỏ qua {d}\n");
        if (tomTat.TongXuLy == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Không có polyline nào nhận được trong vùng chọn — bản vẽ không thay đổi.\n" +
                "[XBoss] Lệnh chỉ nhận polyline/line ĐOẠN THẲNG không thuộc xref.\n");
            return;
        }
        ed.WriteMessage($"[XBoss] Sẽ nhận {tomTat.MoTaSeXuLy}\n");

        // Nhận lại hành lang đã có: mồi sẵn thuộc tính của cái đầu tiên để kỹ sư chỉ sửa phần cần.
        var mau = ungVien.FirstOrDefault(u => u.XDataCu?.VaiTro == VaiTroVe.HanhLang)?.XDataCu;
        if (HoiThuocTinh(ed, CheDoHanhLang.Nhan, tomTat, pack, chinhSach, mau) is not { } tt) return;

        var (soNhan, soChuyenKieu) = GhiHanhLang(doc, ed, pack, chinhSach, ungVien, tt, doiLayer: true);
        if (soNhan < 0) return;

        GhiNhoPhien(tt);
        ed.WriteMessage(
            $"\n[XBoss] Đã nhận {soNhan} hành lang trên layer {chinhSach.CorridorLayer} — {MoTaThuocTinh(tt)} " +
            "(hình học giữ nguyên từng tọa độ đỉnh).\n");
        if (soChuyenKieu > 0)
        {
            ed.WriteMessage(
                $"[XBoss] {soChuyenKieu} đối tượng LINE đã chuyển thành polyline 2 đỉnh cùng tọa độ " +
                "(đồ thị hành lang làm việc trên polyline).\n");
        }
        if (tomTat.TongBoQua > 0)
            ed.WriteMessage($"[XBoss] Bỏ qua {tomTat.TongBoQua} đối tượng (lý do in ở trên).\n");
        ed.WriteMessage("[XBoss] Đi tuyến: XBOSS_VE_TUYENTUDONG · Hoàn tác: UNDO 1 lần.\n");
    }

    // ===================================================================================
    // FR4 — Sửa
    // ===================================================================================

    private static void Sua(Document doc, Editor ed, DrawToolsPack pack, RoutingPolicySection chinhSach)
    {
        ed.WriteMessage("\n[XBoss] Chọn các hành lang cần sửa thuộc tính.\n");
        if (ChonUngVien(ed, doc.Database, chiHanhLang: true) is not (var ungVien, var tomTat)) return;

        foreach (var d in tomTat.DongBoQua) ed.WriteMessage($"[XBoss] Bỏ qua {d}\n");
        if (tomTat.TongXuLy == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Không có hành lang XBoss nào trong vùng chọn — bản vẽ không thay đổi.\n");
            return;
        }

        var mau = ungVien[0].XDataCu;
        if (ungVien.Count > 1 && ungVien.Any(u => !CungThuocTinh(u.XDataCu, mau)))
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {ungVien.Count} hành lang đang chọn KHÔNG cùng thuộc tính — giá trị khai ở bước " +
                "sau sẽ áp cho TẤT CẢ. Chọn từng nhóm riêng nếu muốn giữ khác nhau.\n");
        }
        if (HoiThuocTinh(ed, CheDoHanhLang.Sua, tomTat, pack, chinhSach, mau) is not { } tt) return;

        var (soSua, _) = GhiHanhLang(doc, ed, pack, chinhSach, ungVien, tt, doiLayer: true);
        if (soSua < 0) return;

        GhiNhoPhien(tt);
        ed.WriteMessage(
            $"\n[XBoss] Đã sửa {soSua} hành lang — {MoTaThuocTinh(tt)} (hình học và sổ chiếm làn giữ nguyên).\n");
        var soLan = ungVien.Sum(u => u.XDataCu?.LanDaCap.Count ?? 0);
        if (soLan > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {soLan} làn đã cấp vẫn giữ nguyên vị trí cũ — lệnh này KHÔNG cấp lại làn. " +
                "Đổi bề rộng thì chạy lại XBOSS_VE_TUYENTUDONG cho các hệ liên quan.\n");
        }
        ed.WriteMessage("[XBoss] Hoàn tác: UNDO 1 lần.\n");
    }

    // ===================================================================================
    // FR4 — Xóa
    // ===================================================================================

    private static void Xoa(Document doc, Editor ed)
    {
        ed.WriteMessage("\n[XBoss] Chọn các hành lang cần xóa.\n");
        if (ChonUngVien(ed, doc.Database, chiHanhLang: true) is not (var ungVien, var tomTat)) return;

        foreach (var d in tomTat.DongBoQua) ed.WriteMessage($"[XBoss] Bỏ qua {d}\n");
        if (tomTat.TongXuLy == 0)
        {
            ed.WriteMessage("\n[XBoss] Không có hành lang XBoss nào trong vùng chọn — bản vẽ không thay đổi.\n");
            return;
        }

        // Hành lang còn hệ đang đi qua: nêu ĐÚNG hành lang nào, hệ nào rồi hỏi lại (FR4).
        var conHe = ungVien.Where(u => u.XDataCu is { LanDaCap.Count: > 0 }).ToList();
        if (conHe.Count > 0)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ {conHe.Count}/{ungVien.Count} hành lang đang có hệ đi qua:\n");
            foreach (var u in conHe)
            {
                var he = string.Join(
                    ", ", u.XDataCu!.LanDaCap.Select(l => l.HeId).Distinct(StringComparer.Ordinal));
                ed.WriteMessage($"[XBoss]   handle {u.Handle}: {u.XDataCu.LanDaCap.Count} làn của {he}\n");
            }
            ed.WriteMessage(
                "[XBoss] Xóa hành lang KHÔNG xóa các tuyến đó — chúng thành tuyến thường, " +
                "chạy lại XBOSS_VE_TUYENTUDONG sẽ không dựng lại được theo hành lang này nữa.\n");

            var hoi = new PromptKeywordOptions("\n[XBoss] Vẫn xóa?") { AllowNone = false };
            hoi.Keywords.Add("Khong", "Khong", "Khong");
            hoi.Keywords.Add("Co", "Co", "Co");
            hoi.Keywords.Default = "Khong";
            var traLoi = ed.GetKeywords(hoi);
            if (traLoi.Status != PromptStatus.OK || traLoi.StringResult != "Co")
            {
                ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
                return;
            }
        }

        var db = doc.Database;
        var soXoa = 0;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                foreach (var ten in ungVien
                    .Select(u => u.LayerCu)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList())
                {
                    VeLayerService.MoKhoaNeuCo(db, tr, ten);
                }
                foreach (var u in ungVien)
                {
                    if (tr.GetObject(u.Id, OpenMode.ForWrite) is not Entity ent) continue;
                    ent.Erase();
                    soXoa++;
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                BaoLoi(ed, e);
                return;
            }
        }

        ed.WriteMessage($"\n[XBoss] Đã xóa {soXoa} hành lang.\n");
        if (conHe.Count > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {conHe.Count} hành lang bị xóa còn hệ đi qua — các tuyến đó vẫn nằm nguyên " +
                "trong bản vẽ dưới dạng tuyến thường, soát lại trước khi phát hành.\n");
        }
        ed.WriteMessage("[XBoss] Hoàn tác: UNDO 1 lần.\n");
    }

    // ===================================================================================
    // Đọc vùng chọn
    // ===================================================================================

    /// <summary>
    /// Lọc vùng chọn thành danh sách ứng viên + bộ đếm bỏ qua theo lý do (FR1).
    /// <paramref name="chiHanhLang"/> = true (Sửa/Xóa) thì chỉ nhận đối tượng ĐÃ là hành lang XBoss.
    /// Null = kỹ sư không chọn gì (đã báo, bản vẽ nguyên trạng).
    /// </summary>
    private static (List<UngVienHanhLang> UngVien, TomTatChonHanhLang TomTat)? ChonUngVien(
        Editor ed, Database db, bool chiHanhLang)
    {
        var chon = ed.GetSelection();
        if (chon.Status != PromptStatus.OK)
        {
            ed.WriteMessage("\n[XBoss] Chưa chọn gì — bản vẽ không thay đổi.\n");
            return null;
        }

        var ungVien = new List<UngVienHanhLang>();
        var soKhongPhaiPolyline = 0;
        var soCoDoanCung = 0;
        var soThuocXref = 0;
        var soDoiTuongXBoss = 0;
        var soKhongPhaiHanhLang = 0;
        var soNhanMoi = 0;
        var soDaLa = 0;

        using (var tr = db.TransactionManager.StartTransaction())
        {
            foreach (var id in chon.Value.GetObjectIds())
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent)
                {
                    soKhongPhaiPolyline++;
                    continue;
                }
                if (ThuocXref.KhoiChen(tr, ent) || LayerCuaXref(tr, ent))
                {
                    soThuocXref++;
                    continue;
                }

                var xd = VeXDataStore.Doc(ent);
                var laHanhLang = xd?.VaiTro == VaiTroVe.HanhLang;
                if (chiHanhLang && !laHanhLang)
                {
                    soKhongPhaiHanhLang++;
                    continue;
                }
                if (!chiHanhLang && xd is not null && !laHanhLang)
                {
                    // Tuyến/nét biên/nhãn của XBoss: không biến thành hành lang.
                    soDoiTuongXBoss++;
                    continue;
                }

                switch (ent)
                {
                    case Polyline pl:
                        var dinh = VeThucThe.DinhCua(pl);
                        if (CoDoanCung(dinh, pl.Closed))
                        {
                            soCoDoanCung++;
                            continue;
                        }
                        ungVien.Add(new UngVienHanhLang(
                            id, pl.Handle.ToString(), false, pl.Layer, xd, dinh, pl.Closed));
                        break;
                    case Line line:
                        // Đồ thị hành lang của Core làm việc trên chuỗi đỉnh polyline — chuyển kiểu ở
                        // bước ghi với 2 đỉnh CÙNG TỌA ĐỘ line gốc (hình học không đổi), như M107 FR4.
                        ungVien.Add(new UngVienHanhLang(
                            id, line.Handle.ToString(), true, line.Layer, xd,
                            [
                                new DinhPolyline(line.StartPoint.X, line.StartPoint.Y, 0),
                                new DinhPolyline(line.EndPoint.X, line.EndPoint.Y, 0),
                            ],
                            false));
                        break;
                    default:
                        soKhongPhaiPolyline++;
                        continue;
                }

                if (laHanhLang) soDaLa++;
                else soNhanMoi++;
            }
            tr.Commit();
        }

        return (ungVien, new TomTatChonHanhLang(
            SoNhanMoi: soNhanMoi,
            SoDaLaHanhLang: soDaLa,
            SoKhongPhaiPolyline: soKhongPhaiPolyline,
            SoCoDoanCung: soCoDoanCung,
            SoThuocXref: soThuocXref,
            SoDoiTuongXBoss: soDoiTuongXBoss,
            SoKhongPhaiHanhLang: soKhongPhaiHanhLang));
    }

    /// <summary>Polyline có đoạn CUNG không (bulge của đoạn cuối chỉ tính khi polyline kín)?</summary>
    private static bool CoDoanCung(IReadOnlyList<DinhPolyline> dinh, bool kin)
    {
        var soDoan = kin ? dinh.Count : dinh.Count - 1;
        for (var i = 0; i < soDoan && i < dinh.Count; i++)
        {
            if (Math.Abs(dinh[i].Bulge) > 1e-9) return true;
        }
        return false;
    }

    /// <summary>
    /// Thực thể nằm trên layer PHỤ THUỘC XREF (<c>tên-xref|LAYER</c>)? Mở ForWrite là
    /// <c>eInvalidKey</c> kéo rollback cả lệnh — chặn ở cửa, cùng lý do với <see cref="ThuocXref"/>.
    /// </summary>
    private static bool LayerCuaXref(Transaction tr, Entity ent) =>
        tr.GetObject(ent.LayerId, OpenMode.ForRead) is LayerTableRecord ltr && ltr.IsDependent;

    // ===================================================================================
    // Ghi bản vẽ (dùng chung cho Nhận và Sửa)
    // ===================================================================================

    /// <summary>
    /// Ghi thuộc tính hành lang cho toàn bộ ứng viên trong MỘT transaction = MỘT nhóm UNDO.
    /// Trả (số hành lang đã ghi, số line đã chuyển kiểu); <c>(-1, 0)</c> khi phải rollback.
    /// Sổ chiếm làn cũ (<see cref="VeXDataInfo.LanDaCap"/>) luôn được BÊ NGUYÊN sang XData mới —
    /// lệnh này không bao giờ cấp hay gỡ làn (FR4/NFR3).
    /// </summary>
    private static (int SoGhi, int SoChuyenKieu) GhiHanhLang(
        Document doc,
        Editor ed,
        DrawToolsPack pack,
        RoutingPolicySection chinhSach,
        IReadOnlyList<UngVienHanhLang> ungVien,
        KetQuaHanhLang tt,
        bool doiLayer)
    {
        var db = doc.Database;
        var soGhi = 0;
        var soChuyenKieu = 0;

        using var khoa = doc.LockDocument();
        using var tr = db.TransactionManager.StartTransaction();
        try
        {
            VeXDataStore.DangKyApp(db, tr);
            VeLayerService.DamBaoLayer(
                db, tr, chinhSach.CorridorLayer, VeLayerStyle.AciHanhLang, pack.RulePack.LineweightMap, out _);
            foreach (var ten in ungVien
                .Select(u => u.LayerCu)
                .Append(chinhSach.CorridorLayer)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList())
            {
                VeLayerService.MoKhoaNeuCo(db, tr, ten);
            }

            var ms = (BlockTableRecord)tr.GetObject(
                SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);

            foreach (var u in ungVien)
            {
                Entity tim;
                if (u.LaLine)
                {
                    var moi = VeThucThe.TaoPolyline(u.Dinh, false);
                    VeThucThe.Them(tr, ms, moi, chinhSach.CorridorLayer);
                    if (tr.GetObject(u.Id, OpenMode.ForWrite) is Entity cu) cu.Erase();
                    tim = moi;
                    soChuyenKieu++;
                }
                else
                {
                    // Polyline: CHỈ đổi layer — không đụng một tọa độ đỉnh nào (FR1/AC13).
                    if (tr.GetObject(u.Id, OpenMode.ForWrite) is not Polyline pl) continue;
                    if (doiLayer) pl.Layer = chinhSach.CorridorLayer;
                    tim = pl;
                }

                VeXDataStore.Ghi(tim, XDataHanhLang(pack, tt, u.XDataCu?.LanDaCap ?? []));
                soGhi++;
            }
            tr.Commit();
        }
        catch (Autodesk.AutoCAD.Runtime.Exception e)
        {
            tr.Abort();
            BaoLoi(ed, e);
            return (-1, 0);
        }
        return (soGhi, soChuyenKieu);
    }

    /// <summary>XData vai trò <see cref="VaiTroVe.HanhLang"/> theo thuộc tính vừa khai (FR3).</summary>
    private static VeXDataInfo XDataHanhLang(
        DrawToolsPack pack, KetQuaHanhLang tt, IReadOnlyList<LanChiem> lanDaCap) =>
        new()
        {
            VaiTro = VaiTroVe.HanhLang,
            RulePackVersion = pack.RulePack.Version,
            BeRongMm = tt.BeRongMm,
            CotDayDamMm = tt.CotDayDamMm,
            CotTranMm = tt.CotTranMm,
            HeChoPhep = tt.HeChoPhep,
            LanDaCap = lanDaCap,
        };

    /// <summary>Hai hành lang có cùng bộ thuộc tính khai tay không (cảnh báo khi sửa theo lô)?</summary>
    private static bool CungThuocTinh(VeXDataInfo? a, VeXDataInfo? b) =>
        a?.BeRongMm == b?.BeRongMm &&
        a?.CotDayDamMm == b?.CotDayDamMm &&
        a?.CotTranMm == b?.CotTranMm &&
        (a?.HeChoPhep ?? []).SequenceEqual(b?.HeChoPhep ?? [], StringComparer.Ordinal);

    private static void BaoLoi(Editor ed, Autodesk.AutoCAD.Runtime.Exception e) =>
        ed.WriteMessage(
            $"\n[XBoss] LỖI khi ghi hành lang — đã rollback, bản vẽ nguyên trạng: {e.Message}\n" +
            "[XBoss] Nếu layer đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi thử lại.\n");

    // ===================================================================================
    // Thu tham số: hộp thoại (mặc định) hoặc dòng lệnh (M106 FR9 / M114 FR15)
    // ===================================================================================

    /// <summary>
    /// Thuộc tính hành lang cho lần chạy này. Thử hộp thoại trước; UI không dựng được hoặc bị tắt
    /// bằng <c>XBOSS_UI_DIALOG=0</c> thì rơi về chuỗi hỏi đáp dòng lệnh cho ĐÚNG cùng bộ tham số.
    /// Hủy ở hộp thoại = dừng lệnh, KHÔNG hỏi lại bằng dòng lệnh.
    /// </summary>
    private static KetQuaHanhLang? HoiThuocTinh(
        Editor ed,
        CheDoHanhLang cheDo,
        TomTatChonHanhLang tomTat,
        DrawToolsPack pack,
        RoutingPolicySection chinhSach,
        VeXDataInfo? mau = null)
    {
        var beRong = mau?.BeRongMm ?? VeContext.HanhLangBeRongMm;
        var cotDayDam = mau?.CotDayDamMm ?? VeContext.HanhLangCotDayDamMm;
        var cotTran = mau?.CotTranMm ?? VeContext.HanhLangCotTranMm;
        var heChoPhep = mau?.HeChoPhep ?? VeContext.HanhLangHeChoPhep;

        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new HanhLangDialogViewModel(
                cheDo, tomTat, chinhSach, pack.DrawTools.Systems,
                beRong, cotDayDam, cotTran, heChoPhep, mau?.LanDaCap);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi)
        {
            if (kq is null) ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return kq;
        }
        return HoiThuocTinhDongLenh(ed, pack, beRong, cotDayDam, cotTran, heChoPhep);
    }

    /// <summary>Chuỗi hỏi đáp dòng lệnh — cùng bộ tham số với hộp thoại (FR15).</summary>
    private static KetQuaHanhLang? HoiThuocTinhDongLenh(
        Editor ed,
        DrawToolsPack pack,
        double? beRong,
        double? cotDayDam,
        double? cotTran,
        IReadOnlyList<string> heChoPhep)
    {
        if (HoiSo(ed, "Bề rộng khả dụng của hành lang (mm)", beRong, batBuocDuong: true) is not { } br) return null;
        if (HoiSo(ed, "Cao độ ĐÁY DẦM của đoạn hành lang (mm)", cotDayDam, batBuocDuong: false) is not { } cdd)
            return null;
        if (HoiSo(ed, "Cao độ TRẦN của đoạn hành lang (mm)", cotTran, batBuocDuong: false) is not { } ct)
            return null;
        if (cdd <= ct)
        {
            ed.WriteMessage(
                "\n[XBoss] ⚠ Cao độ đáy dầm không cao hơn cao độ trần — kiểm lại, tầng ống được cấp theo " +
                "khoảng cách tính từ đáy dầm xuống.\n");
        }

        var he = HoiHeChoPhep(ed, pack, heChoPhep);
        if (he is null) return null;
        return new KetQuaHanhLang(br, cdd, ct, he);
    }

    /// <summary>
    /// Một số mm nhập tay (Enter = giữ giá trị mồi sẵn); null = kỹ sư hủy. Dùng
    /// <see cref="PromptStringOptions"/> như mọi lệnh vẽ khác của bộ — cùng một kiểu hỏi số.
    /// </summary>
    private static double? HoiSo(Editor ed, string nhan, double? macDinh, bool batBuocDuong)
    {
        var mac = macDinh is { } m ? So(m) : "";
        while (true)
        {
            var opt = new PromptStringOptions(
                $"\n[XBoss] {nhan}{(mac.Length > 0 ? $" <{mac}>" : "")}: ")
            {
                AllowSpaces = false,
            };
            var kq = ed.GetString(opt);
            if (kq.Status != PromptStatus.OK) return null;

            var nhap = kq.StringResult.Trim();
            if (nhap.Length == 0) nhap = mac;
            if (!double.TryParse(nhap, NumberStyles.Float, CultureInfo.InvariantCulture, out var so))
            {
                ed.WriteMessage("\n[XBoss] Giá trị phải là số (mm) — vd 600 hoặc 3200.\n");
                continue;
            }
            if (batBuocDuong && so <= 0)
            {
                ed.WriteMessage("\n[XBoss] Giá trị phải là số dương (mm) — nhập lại.\n");
                continue;
            }
            return so;
        }
    }

    /// <summary>
    /// Hệ được phép đi qua: Enter = mọi hệ (mặc định FR2), hoặc gõ danh sách id cách nhau bằng dấu
    /// phẩy. Id lạ bị từ chối kèm danh mục — không ghi id không có thật vào bản vẽ.
    /// </summary>
    private static IReadOnlyList<string>? HoiHeChoPhep(
        Editor ed, DrawToolsPack pack, IReadOnlyList<string> macDinh)
    {
        var danhMuc = pack.DrawTools.Systems.Select(s => s.Id).ToList();
        if (danhMuc.Count == 0) return [];

        ed.WriteMessage($"\n[XBoss] Hệ được phép đi qua hành lang — danh mục: {string.Join(", ", danhMuc)}\n");
        var mac = macDinh.Count == 0 ? "*" : string.Join(",", macDinh);
        while (true)
        {
            var opt = new PromptStringOptions(
                $"\n[XBoss] Hệ được phép (danh sách cách nhau bằng dấu phẩy, * = mọi hệ) <{mac}>: ")
            {
                AllowSpaces = false,
            };
            var kq = ed.GetString(opt);
            if (kq.Status != PromptStatus.OK) return null;

            var nhap = kq.StringResult.Trim();
            if (nhap.Length == 0) nhap = mac;
            if (nhap == "*") return [];

            var chon = nhap
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();
            var la = chon.Where(c => !danhMuc.Contains(c, StringComparer.Ordinal)).ToList();
            if (la.Count > 0)
            {
                ed.WriteMessage(
                    $"\n[XBoss] Id hệ không có trong rule pack: {string.Join(", ", la)} — chọn lại " +
                    $"trong {string.Join(", ", danhMuc)}.\n");
                continue;
            }
            // Chọn hết = mọi hệ: giữ đúng một cách biểu diễn trong XData (rỗng = mọi hệ, FR3).
            return chon.Count == danhMuc.Count ? [] : chon;
        }
    }

    /// <summary>Nhớ thuộc tính cho đoạn hành lang sau trong phiên (M100 §6.11 / M106 FR4).</summary>
    private static void GhiNhoPhien(KetQuaHanhLang tt)
    {
        VeContext.HanhLangBeRongMm = tt.BeRongMm;
        VeContext.HanhLangCotDayDamMm = tt.CotDayDamMm;
        VeContext.HanhLangCotTranMm = tt.CotTranMm;
        VeContext.HanhLangHeChoPhep = tt.HeChoPhep;
    }

    /// <summary>Một dòng mô tả thuộc tính vừa ghi (dùng chung cho mọi tóm tắt cuối lệnh).</summary>
    private static string MoTaThuocTinh(KetQuaHanhLang tt) =>
        $"bề rộng {So(tt.BeRongMm)}mm, đáy dầm {So(tt.CotDayDamMm)}mm, trần {So(tt.CotTranMm)}mm, " +
        (tt.HeChoPhep.Count == 0 ? "mọi hệ được đi qua" : $"chỉ {string.Join(", ", tt.HeChoPhep)} được đi qua");

    private static string So(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);

    // ===================================================================================
    // Bấm điểm
    // ===================================================================================

    /// <summary>
    /// Bấm điểm tim hành lang như PLINE nhưng CHỈ đoạn thẳng (không có chế độ Cung): đồ thị hành
    /// lang của Core cắt cạnh theo đoạn thẳng, cho vẽ cung ở đây là sinh dữ liệu mà bước đi tuyến
    /// không dùng được. Trả null khi kỹ sư ESC hoặc chưa đủ 2 điểm — khi đó bản vẽ không có gì mới.
    /// </summary>
    private static (List<DinhPolyline> Dinh, bool Kin)? BatDiemThang(Editor ed)
    {
        var ucs = ed.CurrentUserCoordinateSystem;

        var kqDau = ed.GetPoint(new PromptPointOptions("\n[XBoss] Điểm đầu hành lang (ESC để hủy): "));
        if (kqDau.Status != PromptStatus.OK) return null;
        var diemDau = kqDau.Value.TransformBy(ucs);
        var dinh = new List<DinhPolyline> { new(diemDau.X, diemDau.Y, 0) };
        var kin = false;

        while (true)
        {
            var opt = new PromptPointOptions(
                "\n[XBoss] Điểm tiếp theo [HoanTac/Dong/KetThuc] (Enter = kết thúc): ")
            {
                AllowNone = true,
                UseBasePoint = true,
                BasePoint = new Point3d(dinh[^1].X, dinh[^1].Y, 0),
                UseDashedLine = true,
            };
            opt.Keywords.Add("HoanTac", "HoanTac", "HoanTac");
            opt.Keywords.Add("Dong", "Dong", "Dong");
            opt.Keywords.Add("KetThuc", "KetThuc", "KetThuc");

            var kq = ed.GetPoint(opt);
            if (kq.Status == PromptStatus.None) break;
            if (kq.Status == PromptStatus.Keyword)
            {
                switch (kq.StringResult)
                {
                    case "HoanTac":
                        if (dinh.Count < 2)
                        {
                            ed.WriteMessage("\n[XBoss] Chưa có đoạn nào để hoàn tác.\n");
                            break;
                        }
                        dinh.RemoveAt(dinh.Count - 1);
                        break;
                    case "Dong":
                        if (dinh.Count < 3)
                        {
                            ed.WriteMessage("\n[XBoss] Cần ít nhất 3 điểm mới đóng được hành lang.\n");
                            break;
                        }
                        kin = true;
                        break;
                    default: // KetThuc
                        break;
                }
                if (kin) break;
                continue;
            }
            if (kq.Status != PromptStatus.OK) return null; // ESC → hủy sạch

            var diem = kq.Value.TransformBy(ucs);
            dinh.Add(new DinhPolyline(diem.X, diem.Y, 0));
        }

        if (dinh.Count < 2)
        {
            ed.WriteMessage("\n[XBoss] Hành lang cần ít nhất 2 điểm — chưa vẽ gì.\n");
            return null;
        }
        return (dinh, kin);
    }
}
