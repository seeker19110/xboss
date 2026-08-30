using XBoss.Cad.Core.Graph;

namespace XBoss.Cad.Core.Draw;

/// <summary>
/// Một trong 8 giai đoạn của <c>XBOSS_HOANTHIEN</c> (M115 §6 bước 5) dưới góc nhìn UI: khóa trong
/// <c>completionPolicy.stageDefaults</c>, nhãn tiếng Việt và lệnh <c>XBOSS_VE_*</c> làm việc thật.
/// </summary>
/// <param name="Ten">Khóa giai đoạn — phải nằm trong <see cref="CompletionPolicySection.TenGiaiDoan"/>.</param>
/// <param name="SoThuTu">Số thứ tự 1..8 — THỨ TỰ CHẠY CỐ ĐỊNH, không phụ thuộc thứ tự bật/tắt trên UI.</param>
public sealed record GiaiDoanHoanThien(string Ten, int SoThuTu, string Nhan, string Lenh, string MoTa);

/// <summary>
/// Một việc trong kế hoạch chạy: giai đoạn nào, trên những tuyến nào, bao nhiêu nút liên quan.
/// </summary>
/// <param name="TuyenGoc">Handle các tuyến tim trong phạm vi — khóa của dấu idempotency (FR4).</param>
/// <param name="Nut">Chỉ số các nút giai đoạn này sẽ đụng tới (chỉ giai đoạn phụ kiện dùng tới).</param>
/// <param name="SoNutBoQua">Số nút kỹ sư đã bấm "bỏ qua" ở bước duyệt (<c>pk.BoQua=1</c>).</param>
/// <param name="SoNutChuaQuyet">Số nút chưa quyết được phụ kiện — plugin không đoán bừa.</param>
public sealed record ViecGiaiDoan(
    GiaiDoanHoanThien GiaiDoan,
    IReadOnlyList<string> TuyenGoc,
    IReadOnlyList<int> Nut,
    int SoNutBoQua,
    int SoNutChuaQuyet);

/// <summary>Một thực thể do <c>XBOSS_HOANTHIEN</c> đã sinh ra, đọc lại từ XData của bản vẽ.</summary>
/// <param name="SuaTay">
/// Kỹ sư đã sửa tay thực thể này (dấu <c>suatay</c> của khuôn M114 PR4, hoặc băm hình học lệch) —
/// chạy lại TUYỆT ĐỐI không xóa, không đè.
/// </param>
public sealed record ThucTheDaSinh(string Handle, string GiaiDoan, string TuyenGoc, bool SuaTay);

/// <summary>
/// Kế hoạch thay thế của một lần chạy lại (M115 §7 FR4 / AC3): xóa đúng phần của chính mình rồi
/// sinh lại; mọi thứ khác giữ nguyên.
/// </summary>
/// <param name="CanXoa">Handle sẽ bị xóa rồi sinh lại — đúng dấu M115 của giai đoạn + tuyến trong phạm vi.</param>
/// <param name="GiuViSuaTay">Handle mang dấu M115 đúng phạm vi nhưng kỹ sư ĐÃ SỬA TAY — giữ nguyên.</param>
/// <param name="GiuViNgoaiPhamVi">Handle mang dấu M115 nhưng thuộc tuyến/giai đoạn ngoài lần chạy này.</param>
public sealed record KeHoachThayThe(
    IReadOnlyList<string> CanXoa,
    IReadOnlyList<string> GiuViSuaTay,
    IReadOnlyList<string> GiuViNgoaiPhamVi);

/// <summary>
/// Lập kế hoạch chạy <c>XBOSS_HOANTHIEN</c> từ đồ thị đã chốt (M115 §6 bước 5, FR3/FR4) — THUẦN,
/// không biết gì về AutoCAD nên test được trên CI Linux.
///
/// Hai câu hỏi tách bạch:
/// <list type="number">
/// <item><see cref="Lap"/>: giai đoạn nào chạy, theo THỨ TỰ CỐ ĐỊNH, trên tuyến/nút nào.</item>
/// <item><see cref="TinhThayThe"/>: chạy lại thì xóa đúng thực thể nào của lần trước — cái này
/// quyết định AC3 (số thực thể không đổi qua nhiều lần chạy) và guardrail "không đụng công của
/// kỹ sư".</item>
/// </list>
/// </summary>
public static class HoanThienKeHoach
{
    /// <summary>Giá trị khóa <c>nguon</c> trên XData của mọi thực thể do lệnh này sinh ra (FR4).</summary>
    public const string NguonM115 = "M115";

    /// <summary>
    /// Danh mục 8 giai đoạn theo ĐÚNG thứ tự chạy của M115 §6 bước 5 — dựng thẳng từ
    /// <see cref="CompletionPolicySection.TenGiaiDoan"/> để hai nơi không thể trôi khỏi nhau.
    /// </summary>
    public static readonly IReadOnlyList<GiaiDoanHoanThien> DanhMuc =
    [
        new("netDoi", 1, "① Nét đôi", "XBOSS_VE_NEN",
            "Chuẩn bị nền + layer đích của hệ để vẽ nét đôi ống/gió."),
        new("phuKienTaiNut", 2, "② Phụ kiện tại nút", "XBOSS_VE_PHUKIEN",
            "Chèn co/cút/tê/côn đã duyệt ở bước 4 vào đúng tọa độ nút."),
        new("chiaDot", 3, "③ Chia đốt", "XBOSS_VE_CHIADOT",
            "Chia tuyến thành đốt chế tạo theo kiểu nối của rule pack."),
        new("giaDo", 4, "④ Giá đỡ", "XBOSS_VE_GIADO",
            "Rải giá đỡ dọc tuyến theo khoảng cách chuẩn của rule pack."),
        new("loCho", 5, "⑤ Lỗ chờ tại giao tường", "XBOSS_VE_LOCHO",
            "Đặt sleeve tại chỗ tuyến xuyên kết cấu (dò giao với layer kết cấu)."),
        new("ngatNet", 6, "⑥ Ngắt nét giao chéo", "XBOSS_VE_NGATNET",
            "Ngắt nét tuyến đi dưới tại chỗ giao theo hạng ưu tiên hệ."),
        new("tag", 7, "⑦ Tag", "XBOSS_VE_TAG",
            "Đánh tag tuần tự cho thiết bị theo mẫu của rule pack."),
        new("thongKe", 8, "⑧ Bảng thống kê", "XBOSS_VE_THONGKE",
            "Dựng bảng thống kê khối lượng ngay trong bản vẽ."),
    ];

    /// <summary>Giai đoạn theo khóa; null = khóa lạ (không có trong danh mục 8 giai đoạn).</summary>
    public static GiaiDoanHoanThien? Tim(string ten) =>
        DanhMuc.FirstOrDefault(g => string.Equals(g.Ten, ten, StringComparison.Ordinal));

    /// <summary>
    /// Kế hoạch chạy: mỗi giai đoạn ĐƯỢC BẬT thành một việc, theo thứ tự 1..8 của
    /// <see cref="DanhMuc"/> — KHÔNG theo thứ tự kỹ sư tick trên hộp thoại.
    /// </summary>
    /// <param name="chot">Đồ thị đã duyệt ở bước 4 (<c>XBOSS_TUYEN_DOTHI</c>).</param>
    /// <param name="giaiDoanBat">Khóa các giai đoạn kỹ sư bật; khóa lạ bị bỏ qua.</param>
    public static IReadOnlyList<ViecGiaiDoan> Lap(DoThiChot chot, IEnumerable<string> giaiDoanBat)
    {
        var bat = new HashSet<string>(giaiDoanBat, StringComparer.Ordinal);
        var tuyen = chot.Tuyen.Select(t => t.TuyenId).ToList();

        // Nút CHÈN được phụ kiện = đã chốt block, kỹ sư không bấm bỏ qua. Nút "chưa quyết" và nút
        // bị bỏ qua vẫn được ĐẾM để báo cáo phiên nói rõ mình đã không làm gì ở đó (FR3).
        var canChen = chot.PhuKien
            .Where(p => !p.BoQua && p.TrangThai == TrangThaiPhuKien.DaChon && !string.IsNullOrWhiteSpace(p.BlockId))
            .Select(p => p.Nut)
            .OrderBy(n => n)
            .ToList();
        var soBoQua = chot.PhuKien.Count(p => p.BoQua);
        var soChuaQuyet = chot.PhuKien.Count(p => !p.BoQua && p.TrangThai == TrangThaiPhuKien.ChuaQuyet);

        var ra = new List<ViecGiaiDoan>();
        foreach (var gd in DanhMuc.OrderBy(g => g.SoThuTu))
        {
            if (!bat.Contains(gd.Ten)) continue;
            var laPhuKien = gd.Ten == "phuKienTaiNut";
            ra.Add(new ViecGiaiDoan(
                gd,
                tuyen,
                laPhuKien ? canChen : [],
                laPhuKien ? soBoQua : 0,
                laPhuKien ? soChuaQuyet : 0));
        }
        return ra;
    }

    /// <summary>
    /// Chạy lại: thực thể nào phải xóa để sinh lại, thực thể nào giữ nguyên (FR4/AC3).
    ///
    /// Chỉ xóa khi ĐỦ BA điều: mang dấu <see cref="NguonM115"/> (người gọi đã lọc trước khi đưa
    /// vào đây), <c>giaiDoan</c> nằm trong kế hoạch lần này, và <c>tuyenGoc</c> nằm trong phạm vi
    /// của đúng giai đoạn đó. Thực thể có cờ <see cref="ThucTheDaSinh.SuaTay"/> luôn được giữ —
    /// đè lên công kỹ sư vừa sửa tay là mất niềm tin, không phải mất một đối tượng.
    /// </summary>
    public static KeHoachThayThe TinhThayThe(
        IEnumerable<ThucTheDaSinh> daSinh, IReadOnlyList<ViecGiaiDoan> keHoach)
    {
        var phamVi = keHoach.ToDictionary(
            v => v.GiaiDoan.Ten,
            v => new HashSet<string>(v.TuyenGoc, StringComparer.OrdinalIgnoreCase),
            StringComparer.Ordinal);

        var canXoa = new List<string>();
        var giuSuaTay = new List<string>();
        var giuNgoai = new List<string>();
        foreach (var t in daSinh)
        {
            if (!phamVi.TryGetValue(t.GiaiDoan, out var tuyen) || !tuyen.Contains(t.TuyenGoc))
            {
                giuNgoai.Add(t.Handle);
                continue;
            }
            if (t.SuaTay) giuSuaTay.Add(t.Handle);
            else canXoa.Add(t.Handle);
        }
        return new KeHoachThayThe(canXoa, giuSuaTay, giuNgoai);
    }

    /// <summary>
    /// Chạy tuần tự từng việc, CÁCH LY LỖI (M118 FR1/AC1): việc nào ném exception thì bắt lại, gọi
    /// <paramref name="khiLoi"/> để dựng kết quả lỗi, rồi ĐI TIẾP việc kế — không exception nào
    /// thoát khỏi hàm này và không việc nào bị bỏ sót khỏi kết quả trả về. THUẦN (không biết
    /// AutoCAD) nên test được trực tiếp bằng delegate mock, không cần AcadShim.
    ///
    /// <c>HoanThienPipeline.Chay</c> (Adapter <c>XBoss.Cad.Acad</c>, không build được trên Linux)
    /// gọi hàm này để chạy 8 giai đoạn của <c>XBOSS_HOANTHIEN</c> — thân từng giai đoạn nằm trong
    /// tham số <paramref name="chay"/> nên một giai đoạn hỏng (thiếu tham số rule pack, exception
    /// .NET thường…) không được phép chặn các giai đoạn còn lại.
    /// </summary>
    public static IReadOnlyList<TKetQua> ChayCachLyLoi<TViec, TKetQua>(
        IEnumerable<TViec> danhSach, Func<TViec, TKetQua> chay, Func<TViec, Exception, TKetQua> khiLoi)
    {
        var ra = new List<TKetQua>();
        foreach (var viec in danhSach)
        {
            TKetQua kq;
            try
            {
                kq = chay(viec);
            }
            catch (Exception ex)
            {
                kq = khiLoi(viec, ex);
            }
            ra.Add(kq);
        }
        return ra;
    }
}
