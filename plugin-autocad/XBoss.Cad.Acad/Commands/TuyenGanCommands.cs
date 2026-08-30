using System.Globalization;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui.ViewModels;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.TuyenGanCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_TUYEN_GAN</c> — gán thuộc tính cho TUYẾN TIM kỹ sư vẽ bằng AutoCAD thuần
/// (M115 §6 bước 2, FR1): hệ, loại tuyến, cỡ, cao độ (mm), vật liệu/cách nhiệt, kiểu nối.
/// Ghi vào XData appname <c>XBOSS_VE</c>, vai trò <see cref="VaiTroVe.Tim"/> — ĐÚNG schema M107,
/// không tạo appname mới, không đổi khóa cũ (chỉ thêm <c>vatlieu</c>/<c>cachnhiet</c>).
///
/// Ranh giới cứng (guardrail M115 §2a — nghiêm hơn cả M107):
/// <list type="bullet">
/// <item><b>Không đụng hình học, không đụng kiểu thực thể, không đụng layer.</b> Line vẫn là Line
/// (KHÁC <c>XBOSS_VE_NHANTUYEN</c> vốn chuyển Line → Polyline), polyline giữ nguyên từng tọa độ
/// đỉnh. Lệnh này chỉ ghi XData lên chính đối tượng gốc.</item>
/// <item>Không sinh nét biên, không sinh nhãn — <c>XBOSS_HOANTHIEN</c> mới sinh hình; ở đây chỉ
/// chuẩn bị DỮ LIỆU cho bước dựng đồ thị.</item>
/// <item>Chỉ nhận <c>Polyline</c>/<c>Line</c> ngoài xref; mọi thứ khác bị BỎ QUA kèm lý do.</item>
/// <item>Chạy lại trên tuyến đã gán = ghi đè thuộc tính, GIỮ NGUYÊN liên kết cũ (nét biên/nhãn) —
/// idempotent, không nhân đôi gì.</item>
/// <item>Mọi hỏi đáp NGOÀI transaction; toàn bộ thay đổi trong MỘT transaction = MỘT nhóm UNDO.</item>
/// </list>
/// </summary>
public sealed class TuyenGanCommands
{
    /// <summary>Một tuyến nhận được, đọc xong ở transaction chỉ-đọc (chưa đụng bản vẽ).</summary>
    private sealed record UngVien(
        ObjectId Id, TuyenTrongVungChon MoTa, VeXDataInfo? XDataCu, BaoHinh? Bao, bool LaLine);

    [CommandMethod("XBOSS_TUYEN_GAN")]
    public void GanThuocTinh()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;

        // ===== (1) Vùng chọn (ngoài transaction — ESC là bản vẽ nguyên trạng) =====

        ed.WriteMessage(
            "\n[XBoss] Chọn các TUYẾN TIM cần gán thuộc tính (quét cả vùng cũng được — text/block/arc " +
            "và đối tượng thuộc xref tự bỏ qua).\n");
        var chon = ed.GetSelection();
        if (chon.Status != PromptStatus.OK)
        {
            ed.WriteMessage("\n[XBoss] Chưa chọn gì — bản vẽ không thay đổi.\n");
            return;
        }

        var ungVien = new List<UngVien>();
        var soKhongPhaiTuyen = 0;
        var soThuocXref = 0;
        var soPhuTro = 0;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            foreach (var id in chon.Value.GetObjectIds())
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent)
                {
                    soKhongPhaiTuyen++;
                    continue;
                }
                if (ThuocXref.KhoiChen(tr, ent) || LayerCuaXref(tr, ent))
                {
                    soThuocXref++;
                    continue;
                }
                if (ent is not Polyline and not Line)
                {
                    soKhongPhaiTuyen++;
                    continue;
                }

                var xd = VeXDataStore.Doc(ent);
                if (xd is not null && xd.VaiTro != VaiTroVe.Tim)
                {
                    // Nét biên/nhãn/vạch chia của chính XBoss: đi theo tim, không gán riêng.
                    soPhuTro++;
                    continue;
                }

                ungVien.Add(new UngVien(
                    id,
                    new TuyenTrongVungChon(
                        ent.Handle.ToString(), ent.Layer,
                        string.IsNullOrWhiteSpace(xd?.HeId) ? null : xd!.HeId,
                        string.IsNullOrWhiteSpace(xd?.Size) ? null : xd!.Size,
                        xd?.CaoDoMm,
                        xd?.KieuNoi),
                    xd,
                    RevisionStore.BaoHinhCua(ent),
                    ent is Line));
            }
            tr.Commit();
        }

        foreach (var (so, lyDo) in new[]
                 {
                     (soKhongPhaiTuyen, LyDoBoQuaNhanTuyen.KhongPhaiTuyen),
                     (soThuocXref, LyDoBoQuaNhanTuyen.ThuocXref),
                     (soPhuTro, LyDoBoQuaNhanTuyen.PhuTroXBoss),
                 })
        {
            if (so > 0)
                ed.WriteMessage($"[XBoss] Bỏ qua {so} đối tượng: {TomTatChonNhanTuyen.Nhan(lyDo)}\n");
        }
        if (ungVien.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Không có tuyến nào trong vùng chọn — bản vẽ không thay đổi.\n" +
                "[XBoss] Lệnh chỉ nhận polyline/line KHÔNG thuộc xref.\n");
            return;
        }

        var moTa = ungVien.Select(u => u.MoTa).ToList();
        ed.WriteMessage(
            $"[XBoss] Sẽ gán thuộc tính cho {moTa.Count} tuyến " +
            $"({moTa.Count(t => t.ConThieu)} tuyến đang thiếu thuộc tính bắt buộc).\n");

        // ===== (2) Thuộc tính: hộp thoại, rơi về dòng lệnh khi UI hỏng (M106 FR9) =====

        if (HoiThamSo(ed, pack, ungVien) is not { } ts) return;
        if (ts.SizeTuNhap)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Cỡ \"{ts.Size}\" ngoài danh mục rule pack — vẫn gán, XData đánh dấu \"custom\".\n");
        }

        // ===== (3) Thi hành: MỘT transaction = MỘT nhóm UNDO =====

        var soGan = 0;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeXDataStore.DangKyApp(db, tr);

                // Mở khóa layer NGUỒN của các tuyến đang gán (bản vẽ người khác thường khóa sẵn, và
                // sau XBOSS_VE_NEN thì mọi layer đang khóa) — cùng cách XBOSS_VE_NHANTUYEN làm.
                // Chỉ mở khóa, KHÔNG đổi layer của bất kỳ tuyến nào.
                foreach (var ten in ungVien
                             .Select(u => u.MoTa.Layer)
                             .Distinct(StringComparer.OrdinalIgnoreCase)
                             .ToList())
                {
                    VeLayerService.MoKhoaNeuCo(db, tr, ten);
                }

                foreach (var u in ungVien)
                {
                    if (tr.GetObject(u.Id, OpenMode.ForWrite) is not Entity ent) continue;
                    var cu = u.XDataCu;
                    VeXDataStore.Ghi(ent, new VeXDataInfo
                    {
                        VaiTro = VaiTroVe.Tim,
                        HeId = ts.He.Id,
                        ItemId = ts.Tuyen.ItemId,
                        Size = ts.Size,
                        RulePackVersion = pack.RulePack.Version,
                        SizeTuNhap = ts.SizeTuNhap,
                        CaoDoMm = ts.CaoDoMm,
                        VatLieu = ts.VatLieu,
                        CachNhiet = ts.CachNhiet,
                        KieuNoi = ts.KieuNoi,
                        // Giữ nguyên mọi liên kết/dấu vết cũ của tuyến (nét biên, nhãn, độ dốc):
                        // lệnh này chỉ khai thuộc tính, không dọn dẹp hộ thứ do lệnh khác sinh ra.
                        DoDoc = cu?.DoDoc,
                        HandleBien = cu?.HandleBien ?? [],
                        HandleNhan = cu?.HandleNhan ?? [],
                    });
                    soGan++;
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi gán thuộc tính — đã rollback, bản vẽ nguyên trạng: {e.Message}\n" +
                    "[XBoss] Nếu layer đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi thử lại.\n");
                return;
            }
        }

        // ===== (4) Tóm tắt =====

        ed.WriteMessage(
            $"\n[XBoss] Đã gán thuộc tính cho {soGan} tuyến: {ts.He.Id}/{ts.Tuyen.ItemId} {ts.Size}, " +
            $"cao độ {So(ts.CaoDoMm)} mm" +
            $"{(ts.KieuNoi is { } kn ? $", kiểu nối {kn}" : "")}" +
            $"{(ts.VatLieu is { } vl ? $", vật liệu {vl}" : "")}" +
            $"{(ts.CachNhiet is { } cn ? $", cách nhiệt {cn}" : "")}.\n");
        ed.WriteMessage(
            "[XBoss] Hình học, kiểu thực thể và layer của các tuyến GIỮ NGUYÊN — lệnh chỉ ghi dữ liệu " +
            "XBoss lên chính đối tượng bạn đã vẽ.\n");
        var soLine = ungVien.Count(u => u.LaLine);
        if (soLine > 0)
        {
            // Nói thẳng giới hạn thay vì âm thầm chuyển kiểu: đổi LINE thành polyline là đụng vào
            // bản vẽ của kỹ sư, thứ mà bước này tuyệt đối không làm (guardrail M115 §2a).
            ed.WriteMessage(
                $"[XBoss] ⚠ {soLine} đối tượng là LINE (không phải polyline). XBOSS_TUYEN_DOTHI và " +
                "XBOSS_HOANTHIEN đọc được bình thường, nhưng các lệnh cũ chỉ nhận polyline tim " +
                "(XBOSS_VE_NHAN, XBOSS_VE_CHIADOT, XBOSS_VE_DOI) thì không — cần dùng chúng thì chạy " +
                "XBOSS_VE_NHANTUYEN cho các tuyến đó (lệnh đó có chuyển kiểu, tọa độ vẫn giữ nguyên).\n");
        }
        ed.WriteMessage(
            "[XBoss] Bước tiếp theo: XBOSS_TUYEN_DOTHI để dựng đồ thị và duyệt phụ kiện tại nút · " +
            "Hoàn tác cả lệnh: UNDO 1 lần.\n");
    }

    // ===== Thu tham số: hộp thoại (mặc định) hoặc dòng lệnh (M106 FR9) =====

    /// <summary>
    /// Thuộc tính cho lần gán này. Thử hộp thoại trước; UI không dựng được hoặc bị tắt bằng
    /// <c>XBOSS_UI_DIALOG=0</c> thì rơi về chuỗi hỏi đáp dòng lệnh cho ĐÚNG cùng bộ tham số.
    /// Hủy ở hộp thoại = dừng lệnh, KHÔNG hỏi lại bằng dòng lệnh.
    /// </summary>
    private static KetQuaTuyenGan? HoiThamSo(Editor ed, DrawToolsPack pack, IReadOnlyList<UngVien> ungVien)
    {
        var moTa = ungVien.Select(u => u.MoTa).ToList();
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new TuyenGanDialogViewModel(
                pack, moTa, VeContext.He?.Id, VeContext.Tuyen?.ItemId, VeContext.Size,
                VeContext.TuyenGanCaoDoMm, VeContext.TuyenGanKieuNoi)
            {
                ZoomToi = muc => ZoomToiTuyen(ed, ungVien, muc.Tuyen.Handle),
            };
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi)
        {
            if (kq is null) ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            else GhiNhoPhien(kq);
            return kq;
        }
        return HoiThamSoDongLenh(ed, pack, moTa);
    }

    /// <summary>Chuỗi hỏi đáp keyword — giữ đúng thứ tự và cách hỏi của các lệnh vẽ khác.</summary>
    private static KetQuaTuyenGan? HoiThamSoDongLenh(
        Editor ed, DrawToolsPack pack, IReadOnlyList<TuyenTrongVungChon> moTa)
    {
        // Hệ suy từ layer (FR1) chỉ là GỢI Ý — vẫn hỏi để kỹ sư xác nhận/đổi.
        if (TuyenGanDialogViewModel.SuyHeTuLayer(pack, moTa) is { } heSuy)
            ed.WriteMessage($"\n[XBoss] Layer vùng chọn khớp layerMap nhóm \"{heSuy}\" — gợi ý hệ này.\n");

        var he = VeContext.HoiHe(ed, pack, batBuocHoiLai: true);
        if (he is null) return null;
        DrawLine? tuyen = null;
        while (tuyen is null)
        {
            var (chonTuyen, doiHe) = VeContext.HoiLoaiTuyen(ed, he);
            if (doiHe)
            {
                var heMoi = VeContext.HoiHe(ed, pack, batBuocHoiLai: true);
                if (heMoi is null) return null;
                he = heMoi;
                continue;
            }
            if (chonTuyen is null) return null;
            tuyen = chonTuyen;
        }

        var chonSize = VeContext.HoiDanhMuc(
            ed, $"Cỡ {tuyen.Name} ({tuyen.SizeKind})", tuyen.Sizes, VeContext.Size, choTuNhap: true);
        if (chonSize is not { } size) return null;

        if (HoiSo(ed, "Cao độ tim tuyến (mm)", VeContext.TuyenGanCaoDoMm) is not { } caoDo) return null;

        var kieuNoiDanhMuc = tuyen.JointRules?.Hardware.Keys
            .OrderBy(k => k, StringComparer.Ordinal).ToList() ?? [];
        string? kieuNoi = null;
        if (kieuNoiDanhMuc.Count > 0)
        {
            var chonKieuNoi = VeContext.HoiDanhMuc(
                ed, $"Kiểu nối tuyến {tuyen.Name}", kieuNoiDanhMuc, VeContext.TuyenGanKieuNoi,
                choTuNhap: false);
            if (chonKieuNoi is not { } kn) return null;
            kieuNoi = kn.GiaTri;
        }
        else
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Loại tuyến {tuyen.Name} chưa khai jointRules trong rule pack — bỏ trống kiểu nối.\n");
        }

        var vatLieu = HoiChuoi(ed, "Vật liệu (Enter = bỏ trống)", VeContext.TuyenGanVatLieu);
        if (vatLieu is null) return null;
        var cachNhiet = HoiChuoi(ed, "Cách nhiệt (Enter = bỏ trống)", VeContext.TuyenGanCachNhiet);
        if (cachNhiet is null) return null;

        var kq = new KetQuaTuyenGan(
            he, tuyen, size.GiaTri, size.TuNhap, caoDo,
            vatLieu.Length > 0 ? vatLieu : null,
            cachNhiet.Length > 0 ? cachNhiet : null,
            kieuNoi);
        GhiNhoPhien(kq);
        return kq;
    }

    /// <summary>Nhớ lựa chọn cho lần gán sau trong phiên (M100 §6.11 / M106 FR4).</summary>
    private static void GhiNhoPhien(KetQuaTuyenGan kq)
    {
        VeContext.He = kq.He;
        VeContext.Tuyen = kq.Tuyen;
        VeContext.Size = kq.Size;
        VeContext.SizeTuNhap = kq.SizeTuNhap;
        VeContext.TuyenGanCaoDoMm = kq.CaoDoMm;
        VeContext.TuyenGanVatLieu = kq.VatLieu;
        VeContext.TuyenGanCachNhiet = kq.CachNhiet;
        VeContext.TuyenGanKieuNoi = kq.KieuNoi;
    }

    // ===== Trợ giúp =====

    /// <summary>Hỏi một số thực (ESC = hủy lệnh); Enter giữ giá trị lần trước nếu có.</summary>
    private static double? HoiSo(Editor ed, string nhan, double? macDinh)
    {
        while (true)
        {
            var goiY = macDinh is { } m ? $" <{So(m)}>" : "";
            var kq = ed.GetString(new PromptStringOptions($"\n[XBoss] {nhan}{goiY}: ") { AllowSpaces = false });
            if (kq.Status != PromptStatus.OK) return null;
            var nhap = kq.StringResult.Trim();
            if (nhap.Length == 0)
            {
                if (macDinh is { } giu) return giu;
                ed.WriteMessage("\n[XBoss] Bắt buộc nhập — bước dựng đồ thị cần cao độ để phân biệt đoạn lên/xuống.\n");
                continue;
            }
            if (double.TryParse(nhap, NumberStyles.Float, CultureInfo.InvariantCulture, out var v)) return v;
            ed.WriteMessage("\n[XBoss] Không phải số — nhập số, dùng dấu chấm thập phân.\n");
        }
    }

    /// <summary>Hỏi một chuỗi được phép để trống; null = kỹ sư ESC (hủy lệnh).</summary>
    private static string? HoiChuoi(Editor ed, string nhan, string? macDinh)
    {
        var goiY = macDinh is { Length: > 0 } m ? $" <{m}>" : "";
        var kq = ed.GetString(new PromptStringOptions($"\n[XBoss] {nhan}{goiY}: ") { AllowSpaces = true });
        if (kq.Status == PromptStatus.None) return macDinh ?? "";
        if (kq.Status != PromptStatus.OK) return null;
        var nhap = kq.StringResult.Trim();
        return nhap.Length > 0 ? nhap : (macDinh ?? "");
    }

    /// <summary>Nút "Zoom tới" của danh sách tuyến thiếu thuộc tính (M115 §6 bước 2).</summary>
    private static void ZoomToiTuyen(Editor ed, IReadOnlyList<UngVien> ungVien, string handle)
    {
        var u = ungVien.FirstOrDefault(x => string.Equals(x.MoTa.Handle, handle, StringComparison.Ordinal));
        if (u?.Bao is not { } bao) return;
        ZoomView.ToiBao(ed, bao, Math.Max(bao.Rong, bao.Cao) * 0.2);
    }

    /// <summary>
    /// Thực thể nằm trên layer PHỤ THUỘC XREF (<c>tên-xref|LAYER</c>)? Chọn lọt thì mở ForWrite là
    /// <c>eInvalidKey</c> kéo rollback cả lệnh — chặn ở cửa, cùng lý do với <see cref="ThuocXref"/>.
    /// </summary>
    private static bool LayerCuaXref(Transaction tr, Entity ent) =>
        tr.GetObject(ent.LayerId, OpenMode.ForRead) is LayerTableRecord ltr && ltr.IsDependent;

    private static string So(double v) => v.ToString("0.###", CultureInfo.InvariantCulture);
}
