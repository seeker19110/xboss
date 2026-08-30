using System.Globalization;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.EditorInput;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using AcadApp = Autodesk.AutoCAD.ApplicationServices.Application;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Trạng thái phiên vẽ (M100 §6.11) + cửa duy nhất đọc khối <c>drawTools</c>/<c>sheetSetup</c>
/// của rule pack v4 cho toàn bộ nhóm lệnh <c>XBOSS_VE_*</c>.
///
/// Trạng thái sống theo PHIÊN AutoCAD (hệ/loại tuyến/size/độ dốc chọn lần trước làm mặc định
/// cho lần sau — O3: vẽ không được chậm hơn PLINE). Không có trạng thái ngầm bắt buộc: lệnh nào
/// cần hệ mà chưa chọn thì tự hỏi.
/// </summary>
internal static class VeContext
{
    // ===== Trạng thái phiên =====

    internal static DrawSystem? He { get; set; }
    internal static DrawLine? Tuyen { get; set; }
    internal static string? Size { get; set; }
    internal static bool SizeTuNhap { get; set; }
    internal static string? DoDoc { get; set; }

    /// <summary>
    /// Tỉ lệ in dự kiến (1:x). Dùng CHUNG cho chiều cao chữ nhãn (XBOSS_VE_NHAN), tỉ lệ viewport
    /// (XBOSS_VE_TRANGIN) và chữ hình cắt (XBOSS_VE_MATCAT) — một giá trị duy nhất để nhãn trên
    /// mặt bằng và trang in không bao giờ lệch nhau.
    /// </summary>
    internal static double? TiLeIn { get; set; }

    /// <summary>Khổ giấy chọn lần trước trong phiên (XBOSS_VE_TRANGIN).</summary>
    internal static string? KhoGiay { get; set; }
    // ===== Hành lang (M114 FR2) — mồi sẵn cho đoạn hành lang tiếp theo trong cùng phiên =====
    // Một tầng thường có nhiều đoạn hành lang cùng bề rộng/cao độ; hỏi lại từ đầu mỗi đoạn là
    // đúng thứ làm kỹ sư bỏ lệnh. Vẫn là giá trị HỎI (M100 §6.3), chỉ mồi sẵn chứ không suy.

    internal static double? HanhLangBeRongMm { get; set; }
    internal static double? HanhLangCotDayDamMm { get; set; }
    internal static double? HanhLangCotTranMm { get; set; }

    /// <summary>Hệ được phép đi qua chọn lần trước; rỗng = mọi hệ.</summary>
    internal static IReadOnlyList<string> HanhLangHeChoPhep { get; set; } = [];

    // ===== Đi tuyến tự động (M114 FR8) — cao độ chế độ tự chảy, mồi sẵn cho lần chạy sau =====
    // Cũng là giá trị HỎI (M100 §6.3): bản vẽ 2D không chứa cao độ thật, chỉ nhớ để đỡ gõ lại.

    internal static double? TuChayCaoDoThietBiMm { get; set; }
    internal static double? TuChayCaoDoXaMm { get; set; }

    // ===== Gán thuộc tính tuyến tim (M115 §6 bước 2) — mồi sẵn cho lần gán sau trong phiên =====
    // Hệ/loại tuyến/cỡ dùng chung ba trường ở trên (He/Tuyen/Size): một cơ chế nhớ duy nhất cho
    // mọi lệnh vẽ. Bốn trường dưới là thứ chỉ XBOSS_TUYEN_GAN hỏi.

    internal static double? TuyenGanCaoDoMm { get; set; }
    internal static string? TuyenGanVatLieu { get; set; }
    internal static string? TuyenGanCachNhiet { get; set; }
    internal static string? TuyenGanKieuNoi { get; set; }

    /// <summary>Id block phụ kiện/thiết bị chọn lần trước (mặc định cho lần sau — M100 PR4).</summary>
    internal static string? PhuKienId { get; set; }
    internal static string? ThietBiId { get; set; }

    /// <summary>
    /// Nhật ký phiên vẽ (tiếng Việt): các tình huống cần ghi vào BÁO CÁO PHIÊN VẼ của M100 §14 —
    /// hiện dùng cho lựa chọn khi block trùng tên khác định nghĩa (§6.10/AC7). PR5 (XBOSS_VE_DOI +
    /// báo cáo) đọc danh sách này khi xuất JSON cạnh DWG.
    /// </summary>
    internal static List<string> NhatKyPhien { get; } = [];

    // ===== Hạ tầng chung của nhóm lệnh vẽ =====

    /// <summary>Bản sao có chủ đích của <c>XBossCommands.SanSang</c> (M99) — không đụng tệp lệnh cũ.</summary>
    internal static (Document Doc, Editor Ed)? SanSang()
    {
        var doc = AcadApp.DocumentManager.MdiActiveDocument;
        if (doc is null) return null;
        if (!PluginExtension.DungDoiAutoCad)
        {
            doc.Editor.WriteMessage("\n[XBoss] Plugin chỉ hỗ trợ AutoCAD 2026 — lệnh bị từ chối.\n");
            return null;
        }
        return (doc, doc.Editor);
    }

    private static DrawToolsPack? _cache;
    private static string? _duongDanCache;
    private static DateTime _thoiDiemCache;

    /// <summary>
    /// Rule pack v4 (kèm drawTools) đang nạp; null + thông báo tiếng Việt khi chưa có hoặc mới v2/v3.
    /// Đọc lại khi tệp cache đổi (kỹ sư vừa chạy XBOSS_RULEPACK/XBOSS_LOGIN) — nhưng KHÔNG đổi
    /// version giữa chừng một lệnh vẽ (M100 §6.10).
    /// </summary>
    internal static DrawToolsPack? CanDrawTools(Editor ed)
    {
        var (pack, loi) = DrawToolsHienHanh();
        if (loi is not null) ed.WriteMessage($"\n[XBoss] {loi}\n");
        return pack;
    }

    /// <summary>
    /// Như <see cref="CanDrawTools"/> nhưng IM LẶNG: trả kèm lý do thay vì in ra dòng lệnh. Dành
    /// cho màn hình chỉ-đọc (trình dẫn quy trình M106 — làm mới mỗi lần đổi bản vẽ, không được
    /// rải thông báo lên dòng lệnh kỹ sư đang làm việc).
    /// </summary>
    internal static (DrawToolsPack? Pack, string? LoiTiengViet) DrawToolsHienHanh()
    {
        try
        {
            // Tệp rule pack ĐANG có hiệu lực (M101 PR4: có thể là bản của dự án đang làm, không
            // còn cố định là rule-pack.json) — đọc một lần vào biến để cả 3 lần chạm tệp dưới đây
            // cùng nói về một đường dẫn.
            var duongDan = RulePackStore.DuongDanHienHanh;
            if (!File.Exists(duongDan))
            {
                return (null,
                    "Chưa nạp rule pack. Tải tệp JSON từ trang XBoss /engineering/chuan-hoa-ban-ve " +
                    "rồi chạy XBOSS_RULEPACK (hoặc XBOSS_LOGIN để tải tự động).");
            }
            var thoiDiem = File.GetLastWriteTimeUtc(duongDan);
            if (_cache is not null && duongDan == _duongDanCache && thoiDiem == _thoiDiemCache) return (_cache, null);

            _cache = DrawToolsConfig.Load(File.ReadAllText(duongDan));
            _duongDanCache = duongDan;
            _thoiDiemCache = thoiDiem;
            return (_cache, null);
        }
        catch (RulePackException e)
        {
            return (null, $"Rule pack không dùng được cho bộ lệnh vẽ: {e.Message}");
        }
        catch (IOException e)
        {
            return (null, $"Không đọc được rule pack cache: {e.Message}");
        }
    }

    /// <summary>
    /// Khối <c>drawTools.routingPolicy</c> đang có hiệu lực (M114 §6) — cửa DUY NHẤT cho cả
    /// <c>XBOSS_VE_HANHLANG</c> lẫn <c>XBOSS_VE_TUYENTUDONG</c>, để hai lệnh không bao giờ nói khác
    /// nhau về việc "đi tuyến tự động đã bật chưa".
    /// Trả null + hướng dẫn cách bật khi rule pack chưa khai, còn <c>enabled: false</c>, hoặc khai
    /// layer hành lang rỗng (AC14 — bản vẽ không đổi một nét nào).
    /// </summary>
    internal static RoutingPolicySection? CanRoutingPolicy(Editor ed, DrawToolsPack pack)
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

    /// <summary>
    /// Khối <c>drawTools.completionPolicy</c> đang có hiệu lực (M115 §7 FR5) — cửa DUY NHẤT cho
    /// <c>XBOSS_TUYEN_DOTHI</c> và <c>XBOSS_HOANTHIEN</c>, để hai lệnh không bao giờ nói khác nhau
    /// về việc "hoàn thiện bản vẽ đã bật chưa".
    ///
    /// Trả null + hướng dẫn cách bật khi rule pack chưa khai hoặc còn <c>enabled: false</c> (AC5 —
    /// nạp rule pack v16 mà chưa bật thì mọi lệnh cũ cho kết quả y hệt v15).
    ///
    /// <c>XBOSS_TUYEN_GAN</c> CỐ Ý không đi qua cửa này: nó chỉ ghi thuộc tính lên tuyến kỹ sư đã
    /// vẽ (đúng schema XData M107), không sinh một nét nào — chặn nó chẳng bảo vệ gì mà lại khoá
    /// mất bước chuẩn bị dữ liệu.
    /// </summary>
    internal static CompletionPolicySection? CanCompletionPolicy(Editor ed, DrawToolsPack pack)
    {
        if (pack.DrawTools.CompletionPolicy is not { } cs)
        {
            ed.WriteMessage(
                $"\n[XBoss] Rule pack {pack.RulePack.Version} chưa khai drawTools.completionPolicy — " +
                "hoàn thiện bản vẽ từ tuyến tim chưa dùng được. Nạp rule pack mới (v16 trở lên) rồi " +
                "chạy lại.\n");
            return null;
        }
        if (!cs.Enabled)
        {
            ed.WriteMessage(
                $"\n[XBoss] Hoàn thiện bản vẽ từ tuyến tim đang TẮT trong rule pack {pack.RulePack.Version} " +
                "(drawTools.completionPolicy.enabled = false) — lệnh dừng, bản vẽ không đổi.\n" +
                "[XBoss] Cách bật: Admin/PM sửa enabled = true trong rule pack trên trang " +
                "/engineering/chuan-hoa-ban-ve, phát hành version mới rồi chạy XBOSS_LOGIN (hoặc " +
                "XBOSS_RULEPACK) để nạp lại.\n");
            return null;
        }
        return cs;
    }

    /// <summary>Hệ đang chọn; chưa chọn (hoặc kỹ sư muốn đổi) thì hỏi bằng keyword dòng lệnh.</summary>
    internal static DrawSystem? HoiHe(Editor ed, DrawToolsPack pack, bool batBuocHoiLai = false)
    {
        var hienCo = He is null ? null : pack.DrawTools.Systems.FirstOrDefault(s => s.Id == He.Id);
        if (!batBuocHoiLai && hienCo is not null) return hienCo;

        ed.WriteMessage("\n[XBoss] Hệ vẽ:\n");
        foreach (var s in pack.DrawTools.Systems) ed.WriteMessage($"[XBoss]   {s.Id} = {s.Name}\n");

        var hoi = new PromptKeywordOptions("\n[XBoss] Chọn hệ") { AllowNone = false };
        foreach (var s in pack.DrawTools.Systems) hoi.Keywords.Add(s.Id, s.Id, s.Id);
        hoi.Keywords.Default = hienCo?.Id ?? pack.DrawTools.Systems[0].Id;
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return null;

        var chon = pack.DrawTools.Systems.FirstOrDefault(s => s.Id == kq.StringResult);
        if (chon is null) return null;
        if (He?.Id != chon.Id)
        {
            // Đổi hệ ⇒ loại tuyến/size/độ dốc cũ không còn ý nghĩa.
            Tuyen = null;
            Size = null;
            SizeTuNhap = false;
            DoDoc = null;
        }
        He = chon;
        return chon;
    }

    /// <summary>
    /// Loại tuyến trong hệ (keyword không dấu, viết liền — id item bỏ dấu gạch), kèm lối
    /// "DOIHE" để đổi hệ ngay tại chỗ mà không phải chạy lại lệnh.
    /// Trả (null, false) khi kỹ sư hủy; (null, true) khi chọn đổi hệ.
    /// </summary>
    internal static (DrawLine? Tuyen, bool DoiHe) HoiLoaiTuyen(Editor ed, DrawSystem he)
    {
        // Dùng vòng lặp (không ToDictionary) để 2 itemId cho ra cùng keyword thì lấy cái đầu,
        // không ném lỗi giữa lệnh vẽ.
        var tuKhoa = new Dictionary<string, DrawLine>(StringComparer.OrdinalIgnoreCase);
        foreach (var l in he.Lines) tuKhoa.TryAdd(TuKhoaCua(l.ItemId), l);

        ed.WriteMessage($"\n[XBoss] Loại tuyến của hệ {he.Id}:\n");
        foreach (var l in he.Lines)
            ed.WriteMessage($"[XBoss]   {TuKhoaCua(l.ItemId)} = {l.Name} (layer {l.Layer}, {l.Sizes.Count} size)\n");

        ed.WriteMessage("[XBoss]   DOIHE = chọn hệ khác\n");

        var hienCo = Tuyen is null ? null : he.Lines.FirstOrDefault(l => l.ItemId == Tuyen.ItemId);
        var hoi = new PromptKeywordOptions("\n[XBoss] Chọn loại tuyến") { AllowNone = false };
        foreach (var l in he.Lines) hoi.Keywords.Add(TuKhoaCua(l.ItemId), TuKhoaCua(l.ItemId), TuKhoaCua(l.ItemId));
        hoi.Keywords.Add("DOIHE", "DOIHE", "DOIHE");
        hoi.Keywords.Default = TuKhoaCua((hienCo ?? he.Lines[0]).ItemId);
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return (null, false);
        if (kq.StringResult == "DOIHE") return (null, true);
        if (!tuKhoa.TryGetValue(kq.StringResult, out var chon)) return (null, false);

        if (Tuyen?.ItemId != chon.ItemId)
        {
            Size = null;
            SizeTuNhap = false;
            DoDoc = null;
        }
        Tuyen = chon;
        return (chon, false);
    }

    /// <summary>
    /// Tỉ lệ in 1:x lấy từ danh mục <c>sheetSetup.scales</c>, nhớ lại cho các lệnh sau trong phiên
    /// (<see cref="TiLeIn"/>). Một cửa duy nhất cho MỌI lệnh cần tỉ lệ — chiều cao chữ nhãn trên
    /// mặt bằng và tỉ lệ viewport của trang in phải bằng nhau, không được hỏi hai nơi hai kiểu.
    /// Null = kỹ sư hủy hoặc nhập số không hợp lệ (đã báo lý do).
    /// </summary>
    internal static double? HoiTiLeIn(Editor ed, DrawToolsPack pack, bool batBuocHoiLai = false)
    {
        if (!batBuocHoiLai && TiLeIn is { } daChon) return daChon;

        var danhMuc = pack.SheetSetup.Scales
            .Select(s => s.ToString("0.##", CultureInfo.InvariantCulture))
            .ToList();
        var macDinh = TiLeIn?.ToString("0.##", CultureInfo.InvariantCulture);
        var chon = HoiDanhMuc(ed, "Tỉ lệ in 1:x", danhMuc, macDinh, choTuNhap: true);
        if (chon is not { } tl) return null;
        if (!double.TryParse(tl.GiaTri, NumberStyles.Float, CultureInfo.InvariantCulture, out var so) || so <= 0)
        {
            ed.WriteMessage("\n[XBoss] Tỉ lệ không hợp lệ — nhập số dương (vd 50 cho tỉ lệ 1:50).\n");
            return null;
        }
        TiLeIn = so;
        return so;
    }

    /// <summary>Keyword AutoCAD phải là chữ/số liền nhau: "duct-supp" → "DUCTSUPP".</summary>
    internal static string TuKhoaCua(string id) =>
        new(id.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());

    /// <summary>Kết quả chọn từ danh mục: giá trị + có phải kỹ sư tự nhập ngoài danh mục không.</summary>
    internal readonly record struct ChonTuDanhMuc(string GiaTri, bool TuNhap);

    /// <summary>
    /// Chọn một giá trị từ danh mục rule pack: gõ số thứ tự HOẶC gõ thẳng giá trị; Enter = giữ
    /// giá trị lần trước. Danh mục size/độ dốc chứa ký tự "x", "%" nên KHÔNG dùng keyword AutoCAD
    /// (keyword chỉ nhận chữ/số) — dùng danh sách đánh số cho nhanh tay.
    /// </summary>
    internal static ChonTuDanhMuc? HoiDanhMuc(
        Editor ed, string nhan, IReadOnlyList<string> danhMuc, string? macDinh, bool choTuNhap)
    {
        if (danhMuc.Count == 0 && !choTuNhap) return null;
        var mac = macDinh ?? (danhMuc.Count > 0 ? danhMuc[0] : "");

        ed.WriteMessage($"\n[XBoss] {nhan}:\n");
        for (var i = 0; i < danhMuc.Count; i++) ed.WriteMessage($"[XBoss]   {i + 1}. {danhMuc[i]}\n");
        if (choTuNhap) ed.WriteMessage("[XBoss]   (gõ giá trị khác để nhập tay — sẽ đánh dấu là size ngoài danh mục)\n");

        while (true)
        {
            var opt = new PromptStringOptions($"\n[XBoss] {nhan} (số thứ tự hoặc giá trị) <{mac}>: ")
            {
                AllowSpaces = false,
            };
            var kq = ed.GetString(opt);
            if (kq.Status != PromptStatus.OK) return null;

            var nhap = kq.StringResult.Trim();
            if (nhap.Length == 0) nhap = mac;
            if (nhap.Length == 0) continue;

            if (int.TryParse(nhap, out var stt) && stt >= 1 && stt <= danhMuc.Count)
                return new ChonTuDanhMuc(danhMuc[stt - 1], false);

            var khop = danhMuc.FirstOrDefault(v => string.Equals(v, nhap, StringComparison.OrdinalIgnoreCase));
            if (khop is not null) return new ChonTuDanhMuc(khop, false);

            if (choTuNhap) return new ChonTuDanhMuc(nhap, true);
            ed.WriteMessage("\n[XBoss] Giá trị không có trong danh mục rule pack — chọn lại.\n");
        }
    }
}
