using System.Collections.Concurrent;
using System.Globalization;
using System.Text.RegularExpressions;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Takeoff;

/// <summary>Size của một dòng bóc lấy từ đâu — luôn hiện trong Excel/JSON để QS soát (M101 §18).</summary>
public enum NguonSize
{
    /// <summary>Dòng không tách theo size (hoặc không xác định được size).</summary>
    KhongCo,
    /// <summary>Đọc từ XData XBOSS_VE do bộ lệnh vẽ M100 ghi — chắc chắn.</summary>
    XData,
    /// <summary>Đọc từ nhãn text gần tuyến theo sizePatterns — BÁN TỰ ĐỘNG, cần soát lại.</summary>
    Nhan,
    /// <summary>Dòng gộp từ cả hai nguồn trên.</summary>
    HonHop,
}

/// <summary>Nhãn text gần đối tượng: nội dung + khoảng cách theo ĐƠN VỊ BẢN VẼ (Adapter đo).</summary>
public sealed record NhanGan(string NoiDung, double KhoangCach);

/// <summary>
/// Quy tắc lấy size cho bóc tách theo size (M101 §6.3) — THUẦN, test trên CI Linux.
/// Ưu tiên XData XBOSS_VE; không có thì đọc nhãn gần tuyến theo <c>sizePatterns</c>;
/// vẫn không có thì để TRỐNG — không đoán (M101 §18 rủi ro "đọc nhầm nhãn").
/// </summary>
public static class TakeoffSize
{
    /// <summary>Nhãn hiển thị cho dòng chưa xác định được size.</summary>
    public const string ChuaCoSize = "(chưa có size)";

    private const int GioiHanRegexMs = 100;

    private static readonly ConcurrentDictionary<string, Regex?> BoNhoRegex = new(StringComparer.Ordinal);

    /// <summary>
    /// Chuẩn hóa chuỗi size để gộp dòng: bỏ khoảng trắng, viết hoa, <c>300X200</c>/<c>300*200</c>
    /// → <c>300x200</c>. Không nhận dạng được thì GIỮ NGUYÊN chuỗi (viết hoa) — bản vẽ nói sao ghi vậy.
    /// </summary>
    public static string ChuanHoa(string? size)
    {
        if (string.IsNullOrWhiteSpace(size)) return "";
        var s = size.Trim().Replace(" ", "").ToUpperInvariant();
        var viTri = s.IndexOfAny(['X', '*']);
        if (viTri <= 0) return s;
        var rong = DocSo(s[..viTri]);
        var cao = DocSo(s[(viTri + 1)..]);
        return rong is > 0 && cao is > 0 ? $"{So(rong.Value)}x{So(cao.Value)}" : s;
    }

    /// <summary>Size + nguồn của một đối tượng theo quy tắc của item; item không bật groupBySize → trống.</summary>
    public static (string Size, NguonSize Nguon) XacDinh(TakeoffItem item, MeasuredObject obj, double toMm)
    {
        if (!item.GroupBySize) return ("", NguonSize.KhongCo);

        var tuXData = ChuanHoa(obj.SizeXData);
        if (tuXData.Length > 0) return (tuXData, NguonSize.XData);

        if (item.SizeFromNearbyText is { Enabled: true } chinhSach && obj.NhanGan.Count > 0)
        {
            var tuNhan = DocTuNhan(obj.NhanGan, chinhSach, toMm);
            if (tuNhan.Length > 0) return (tuNhan, NguonSize.Nhan);
        }
        return ("", NguonSize.KhongCo);
    }

    /// <summary>
    /// Size đọc từ nhãn GẦN NHẤT trong bán kính cho phép mà nội dung khớp một <c>sizePatterns</c>
    /// (có nhóm bắt thì lấy nhóm 1). Không nhãn nào khớp → chuỗi rỗng (KHÔNG lấy nhãn xa hơn ngưỡng,
    /// KHÔNG đoán từ nhãn không khớp mẫu).
    /// </summary>
    public static string DocTuNhan(IReadOnlyList<NhanGan> nhan, SizeFromTextPolicy chinhSach, double toMm)
    {
        foreach (var n in nhan.Where(n => n.KhoangCach * toMm <= chinhSach.MaxDistanceMm).OrderBy(n => n.KhoangCach))
        {
            foreach (var mau in chinhSach.SizePatterns)
            {
                var re = LayRegex(mau);
                if (re is null) continue;
                Match khop;
                try
                {
                    khop = re.Match(n.NoiDung);
                }
                catch (RegexMatchTimeoutException)
                {
                    continue; // mẫu quá tốn kém trên chuỗi này — bỏ qua, thà không có size còn hơn treo AutoCAD
                }
                if (!khop.Success) continue;
                var giaTri = khop.Groups.Count > 1 && khop.Groups[1].Success ? khop.Groups[1].Value : khop.Value;
                var sach = ChuanHoa(giaTri);
                if (sach.Length > 0) return sach;
            }
        }
        return "";
    }

    /// <summary>
    /// Diện tích cách nhiệt (m²) của một đoạn dài <paramref name="daiM"/> mét mang size
    /// <paramref name="size"/>. Size không hợp công thức (vd ống tròn dùng công thức chu vi
    /// chữ nhật) → null: đoạn đó BỎ QUA kèm cảnh báo, tuyệt đối không đoán.
    /// </summary>
    public static double? DienTich(string size, CongThucDanXuat congThuc, double daiM)
    {
        if (DrawSize.PhanTich(size) is not { } kt) return null;
        return congThuc switch
        {
            // Ống gió chữ nhật: chu vi 2×(W+H) — cần đủ cả bề rộng lẫn chiều cao.
            CongThucDanXuat.ChuViNhanDai when kt.CaoMm is { } cao && kt.RongMm > 0 && cao > 0 =>
                2 * (kt.RongMm + cao) / 1000 * daiM,
            // Ống tròn: π×DN — size phải là đường kính đơn (không phải WxH).
            CongThucDanXuat.PiDnNhanDai when kt.CaoMm is null && kt.RongMm > 0 =>
                Math.PI * kt.RongMm / 1000 * daiM,
            _ => null,
        };
    }

    /// <summary>Mô tả nguồn size bằng tiếng Việt cho Excel/JSON.</summary>
    public static string MoTaNguon(NguonSize nguon) => nguon switch
    {
        NguonSize.XData => "XData",
        NguonSize.Nhan => "đọc từ nhãn",
        NguonSize.HonHop => "XData + đọc từ nhãn",
        _ => "",
    };

    /// <summary>Khóa sắp xếp size để bảng đọc được: theo bề rộng rồi chiều cao; không đọc được xếp cuối.</summary>
    internal static (int Hang, double Rong, double Cao, string Tho) KhoaSapXep(string size)
    {
        if (size.Length == 0) return (2, 0, 0, "");
        if (DrawSize.PhanTich(size) is { } kt) return (0, kt.RongMm, kt.CaoMm ?? 0, size);
        return (1, 0, 0, size);
    }

    private static Regex? LayRegex(string mau) => BoNhoRegex.GetOrAdd(mau, m =>
    {
        try
        {
            return new Regex(m, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(GioiHanRegexMs));
        }
        catch (ArgumentException)
        {
            return null; // validator đã chặn từ lúc nạp rule pack; ở đây chỉ để không nổ giữa lúc bóc
        }
    });

    private static double? DocSo(string chuoi)
    {
        var sach = new string(chuoi.Where(c => char.IsDigit(c) || c is '.' or ',').ToArray()).Replace(',', '.');
        return double.TryParse(sach, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : null;
    }

    private static string So(double v) => v.ToString("0.###", CultureInfo.InvariantCulture);
}
