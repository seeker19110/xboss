using System.Globalization;

namespace XBoss.Cad.Core.Draw;

/// <summary>Kích thước lỗ chờ đã cộng khe hở (M100 §6.8) — nhãn giữ đúng kiểu viết của size ống.</summary>
public sealed record KichThuocSleeve(string Nhan, double RongMm, double? CaoMm);

/// <summary>Một mốc trục kết cấu đọc được từ bản vẽ (nhãn trục + vị trí).</summary>
public sealed record MocTruc(string Ten, Diem2 Diem);

/// <summary>Loại kết cấu mà tuyến xuyên qua: từ khóa dòng lệnh (không dấu) + tên hiển thị.</summary>
public sealed record LoaiKetCau(string TuKhoa, string Ten);

/// <summary>Một dòng của bảng lỗ chờ (builder's work) — M100 §6.8/FR9d.</summary>
public sealed record DongLoCho
{
    public int Stt { get; init; }
    /// <summary>Hệ của tuyến xuyên kết cấu (HVAC/PIPING/…).</summary>
    public string HeId { get; init; } = "";
    /// <summary>Vị trí theo trục gần nhất (vd <c>A/3</c>); rỗng = bản vẽ chưa có nhãn trục.</summary>
    public string ViTriTruc { get; init; } = "";
    /// <summary>Cao độ NHẬP TAY (mm); null = chưa nhập (bản vẽ 2D không chứa cao độ thật).</summary>
    public double? CaoDoMm { get; init; }
    public string SizeOng { get; init; } = "";
    public string SizeLoCho { get; init; } = "";
    /// <summary>Loại kết cấu xuyên qua (tường/sàn/dầm) — xem <see cref="SleeveSchedule.DanhMucKetCau"/>.</summary>
    public string KetCau { get; init; } = "";
    /// <summary>Handle khối sleeve trong bản vẽ — để dò ngược khi bên kết cấu hỏi lại.</summary>
    public string Handle { get; init; } = "";
}

/// <summary>
/// Phần tính được của <c>XBOSS_VE_LOCHO</c> (M100 §6.8, FR9d, AC13) — THUẦN, không tham chiếu
/// AutoCAD (FR11), test trên CI Linux: kích thước lỗ chờ theo khe hở rule pack, vị trí theo trục
/// gần nhất, và bảng lỗ chờ (tiêu đề + ô) dùng CHUNG cho Table trong bản vẽ lẫn tệp Excel — một
/// nguồn duy nhất để hai bảng không bao giờ lệch nhau.
/// </summary>
public static class SleeveSchedule
{
    /// <summary>
    /// Danh mục loại kết cấu xuyên qua (rule pack chưa khai khóa nào cho việc này — danh mục cố
    /// định). Kèm sẵn từ khóa KHÔNG DẤU vì keyword dòng lệnh AutoCAD chỉ nhận chữ/số ASCII.
    /// </summary>
    public static readonly IReadOnlyList<LoaiKetCau> DanhMucKetCau =
    [
        new("TUONG", "Tường"),
        new("SAN", "Sàn"),
        new("DAM", "Dầm"),
    ];

    /// <summary>Tiêu đề cột bảng lỗ chờ — dùng cho CẢ Table trong bản vẽ lẫn Excel.</summary>
    public static readonly IReadOnlyList<string> TieuDe =
    [
        "STT",
        "Hệ",
        "Vị trí (trục gần nhất)",
        "Cao độ (mm)",
        "Size ống",
        "Size lỗ chờ",
        "Kết cấu",
        "Handle",
    ];

    /// <summary>Một dòng đã đổ thành chuỗi theo đúng thứ tự <see cref="TieuDe"/>.</summary>
    public static IReadOnlyList<string> O(DongLoCho dong) =>
    [
        dong.Stt.ToString(CultureInfo.InvariantCulture),
        dong.HeId,
        dong.ViTriTruc,
        dong.CaoDoMm?.ToString("0.##", CultureInfo.InvariantCulture) ?? "",
        dong.SizeOng,
        dong.SizeLoCho,
        dong.KetCau,
        dong.Handle,
    ];

    /// <summary>
    /// Kích thước lỗ chờ = size ống + <c>sleeveClearanceMm</c> (M100 §6.8/AC13 — cộng THẲNG vào
    /// kích thước danh nghĩa, KHÔNG nhân đôi; công ty muốn khe hở mỗi bên thì khai gấp đôi trong
    /// rule pack). Ống chữ nhật cộng cả hai chiều; ống tròn/DN cộng vào đường kính.
    /// Nhãn giữ nguyên kiểu viết của size ống (<c>DN50</c> → <c>DN75</c>, <c>300x200</c> →
    /// <c>325x225</c>). Null khi không đọc được size (lệnh vẽ hỏi tay, không bịa).
    /// </summary>
    public static KichThuocSleeve? KichThuoc(string? sizeOng, double kheHoMm)
    {
        if (DrawSize.PhanTich(sizeOng) is not { } kt) return null;
        if (kheHoMm < 0) return null;

        var rong = kt.RongMm + kheHoMm;
        var cao = kt.CaoMm is { } h ? h + kheHoMm : (double?)null;
        var tienTo = TienTo(sizeOng!);
        var nhan = cao is { } c
            ? $"{So(rong)}x{So(c)}"
            : $"{tienTo}{So(rong)}";
        return new KichThuocSleeve(nhan, rong, cao);
    }

    /// <summary>
    /// Vị trí theo trục gần nhất: lấy nhãn trục gần nhất, và ghép thêm nhãn gần nhất theo phương
    /// (gần) vuông góc nếu có (ra dạng <c>A/3</c> quen thuộc của bảng builder's work).
    /// Bản vẽ không có nhãn trục nào → trả rỗng (KHÔNG bịa vị trí — bên kết cấu điền tay).
    /// </summary>
    public static string ViTriTheoTruc(Diem2 diem, IReadOnlyList<MocTruc> truc)
    {
        var gan = truc
            .Where(t => !string.IsNullOrWhiteSpace(t.Ten))
            .OrderBy(t => t.Diem.KhoangCach(diem))
            .ToList();
        if (gan.Count == 0) return "";

        var dau = gan[0];
        var huongDau = HuongDonVi(diem, dau.Diem);
        foreach (var t in gan.Skip(1))
        {
            var huong = HuongDonVi(diem, t.Diem);
            // |cos| < cos(45°) ⇒ hai trục (gần) vuông góc nhau ⇒ ghép thành "A/3".
            var cos = Math.Abs(huongDau.X * huong.X + huongDau.Y * huong.Y);
            if (cos < Math.Cos(Math.PI / 4)) return $"{dau.Ten}/{t.Ten}";
        }
        return dau.Ten;
    }

    /// <summary>Đánh lại STT 1..n theo đúng thứ tự đưa vào (bảng luôn liền số).</summary>
    public static IReadOnlyList<DongLoCho> DanhSo(IEnumerable<DongLoCho> dong) =>
        dong.Select((d, i) => d with { Stt = i + 1 }).ToList();

    // ===== Nội bộ =====

    private static Diem2 HuongDonVi(Diem2 tu, Diem2 den)
    {
        var v = den - tu;
        var dai = v.DoDai;
        return dai <= 1e-9 ? new Diem2(1, 0) : v * (1 / dai);
    }

    /// <summary>Tiền tố chữ của size (<c>DN</c>, <c>Ø</c>, <c>D</c>) — giữ nguyên cho nhãn lỗ chờ.</summary>
    private static string TienTo(string size)
    {
        var s = size.Trim();
        var i = 0;
        while (i < s.Length && !char.IsDigit(s[i])) i++;
        return s[..i].ToUpperInvariant();
    }

    private static string So(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);
}
