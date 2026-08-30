using System.Globalization;

namespace XBoss.Cad.Core.Graph;

/// <summary>Một tuyến tim đã gán thuộc tính, chép vào bản chốt để đọc lại không cần quét bản vẽ.</summary>
/// <param name="TuyenId">Handle DWG của tuyến tim — khóa trỏ ngược về đối tượng thật.</param>
public sealed record TuyenChot(
    string TuyenId, string? HeId, string? Size, double? CaoDoMm, string? KieuNoi);

/// <summary>Một nút của đồ thị đã chốt (tọa độ theo ĐƠN VỊ BẢN VẼ).</summary>
public sealed record NutChot(
    int ChiSo, double X, double Y, LoaiNut Loai, int SoNhanh, double GocDeg, string? HeId, string? Size);

/// <summary>Một cạnh của đồ thị đã chốt; <paramref name="Tu"/> → <paramref name="Den"/> là CHIỀU DÒNG.</summary>
public sealed record CanhChot(int ChiSo, int Tu, int Den, string TuyenId, double ChieuDai);

/// <summary>Một block thiết bị đã bắt vào nút.</summary>
public sealed record ThietBiChot(int Nut, string ThietBiId, string? HeId, string? Tag);

/// <summary>
/// Phụ kiện tại một nút SAU khi kỹ sư duyệt ở bước 4 (M115 §6): trạng thái, block đã chốt, và cờ
/// <paramref name="SuaTay"/> = kỹ sư đã đổi/bỏ qua so với thứ plugin suy ra.
/// </summary>
public sealed record PhuKienChot(
    int Nut,
    TrangThaiPhuKien TrangThai,
    string? NodeKind,
    string? BlockId,
    string? BlockKind,
    string? Ten,
    bool SuaTay,
    bool BoQua);

/// <summary>
/// Đồ thị tuyến ĐÃ DUYỆT ở bước 4 của M115 §6 — bản chụp đầy đủ để <c>XBOSS_HOANTHIEN</c> đọc lại
/// mà không phải dựng đồ thị lần nữa (và nhất là không đánh mất mọi chỉnh sửa tay của kỹ sư).
///
/// THUẦN: không biết gì về AutoCAD. Adapter cất bản ghi này vào Xrecord ở Named Objects Dictionary
/// của bản vẽ (khóa <c>XBOSS_TUYEN_DOTHI</c>) — cùng khuôn mốc revision của M110
/// (<c>RevisionStore</c>): trạng thái sống trong DWG nên đóng/mở lại, đổi máy vẫn đọc được.
/// </summary>
public sealed record DoThiChot(
    string NgayIso,
    string RulePackVersion,
    double NguonX,
    double NguonY,
    IReadOnlyList<TuyenChot> Tuyen,
    IReadOnlyList<NutChot> Nut,
    IReadOnlyList<CanhChot> Canh,
    IReadOnlyList<ThietBiChot> ThietBi,
    IReadOnlyList<PhuKienChot> PhuKien);

/// <summary>
/// Mã hóa/giải mã <see cref="DoThiChot"/> thành danh sách chuỗi <c>khóa=giá trị</c> — cùng triết lý
/// với <c>VeXData</c>: khóa lạ bị BỎ QUA thay vì coi là dữ liệu hỏng, nên bản sau thêm trường mà bản
/// cũ vẫn đọc được. Trường trong một dòng ngăn bằng <c>|</c>; giá trị chứa <c>|</c> được đổi thành
/// <c>/</c> lúc ghi (id/handle không bao giờ chứa ký tự này, chỉ tên phụ kiện mới có nguy cơ).
/// </summary>
public static class DoThiChotCodec
{
    /// <summary>Phiên bản định dạng — khác thì KHÔNG đọc mù, coi như bản vẽ chưa chốt đồ thị.</summary>
    public const string PhienBan = "1";

    private const string KhoaPhienBan = "dothi";

    public static IReadOnlyList<string> MaHoa(DoThiChot d)
    {
        var ra = new List<string>
        {
            $"{KhoaPhienBan}={PhienBan}",
            $"ngay={An(d.NgayIso)}",
            $"rp={An(d.RulePackVersion)}",
            $"nguon={So(d.NguonX)}|{So(d.NguonY)}",
        };
        foreach (var t in d.Tuyen)
            ra.Add($"tuyen={An(t.TuyenId)}|{An(t.HeId)}|{An(t.Size)}|{SoRong(t.CaoDoMm)}|{An(t.KieuNoi)}");
        foreach (var n in d.Nut)
        {
            ra.Add(
                $"nut={n.ChiSo.ToString(CultureInfo.InvariantCulture)}|{So(n.X)}|{So(n.Y)}|{n.Loai}|" +
                $"{n.SoNhanh.ToString(CultureInfo.InvariantCulture)}|{So(n.GocDeg)}|{An(n.HeId)}|{An(n.Size)}");
        }
        foreach (var c in d.Canh)
        {
            ra.Add(
                $"canh={c.ChiSo.ToString(CultureInfo.InvariantCulture)}|" +
                $"{c.Tu.ToString(CultureInfo.InvariantCulture)}|{c.Den.ToString(CultureInfo.InvariantCulture)}|" +
                $"{An(c.TuyenId)}|{So(c.ChieuDai)}");
        }
        foreach (var t in d.ThietBi)
            ra.Add($"tb={t.Nut.ToString(CultureInfo.InvariantCulture)}|{An(t.ThietBiId)}|{An(t.HeId)}|{An(t.Tag)}");
        foreach (var p in d.PhuKien)
        {
            ra.Add(
                $"pk={p.Nut.ToString(CultureInfo.InvariantCulture)}|{p.TrangThai}|{An(p.NodeKind)}|" +
                $"{An(p.BlockId)}|{An(p.BlockKind)}|{An(p.Ten)}|{(p.SuaTay ? "1" : "0")}|" +
                $"{(p.BoQua ? "1" : "0")}");
        }
        return ra;
    }

    /// <summary>Giải mã; null khi chuỗi không phải bản chốt đồ thị (thiếu dòng phiên bản, hoặc lạ).</summary>
    public static DoThiChot? GiaiMa(IEnumerable<string> chuoi)
    {
        var co = false;
        string ngay = "", rp = "";
        double nguonX = 0, nguonY = 0;
        var tuyen = new List<TuyenChot>();
        var nut = new List<NutChot>();
        var canh = new List<CanhChot>();
        var thietBi = new List<ThietBiChot>();
        var phuKien = new List<PhuKienChot>();

        foreach (var dong in chuoi)
        {
            var dau = dong.IndexOf('=');
            if (dau <= 0) continue;
            var khoa = dong[..dau];
            var p = dong[(dau + 1)..].Split('|');
            switch (khoa)
            {
                case KhoaPhienBan:
                    if (dong[(dau + 1)..] != PhienBan) return null;
                    co = true;
                    break;
                case "ngay": ngay = p[0]; break;
                case "rp": rp = p[0]; break;
                case "nguon":
                    if (p.Length >= 2 && Doc(p[0]) is { } nx && Doc(p[1]) is { } ny) (nguonX, nguonY) = (nx, ny);
                    break;
                case "tuyen":
                    if (p.Length >= 5) tuyen.Add(new TuyenChot(p[0], Rong(p[1]), Rong(p[2]), Doc(p[3]), Rong(p[4])));
                    break;
                case "nut":
                    if (p.Length >= 8 && DocInt(p[0]) is { } nChiSo && Doc(p[1]) is { } x && Doc(p[2]) is { } y &&
                        Enum.TryParse<LoaiNut>(p[3], out var loai) && DocInt(p[4]) is { } soNhanh)
                    {
                        nut.Add(new NutChot(nChiSo, x, y, loai, soNhanh, Doc(p[5]) ?? 0, Rong(p[6]), Rong(p[7])));
                    }
                    break;
                case "canh":
                    if (p.Length >= 5 && DocInt(p[0]) is { } cChiSo && DocInt(p[1]) is { } tu &&
                        DocInt(p[2]) is { } den)
                    {
                        canh.Add(new CanhChot(cChiSo, tu, den, p[3], Doc(p[4]) ?? 0));
                    }
                    break;
                case "tb":
                    if (p.Length >= 4 && DocInt(p[0]) is { } tbNut)
                        thietBi.Add(new ThietBiChot(tbNut, p[1], Rong(p[2]), Rong(p[3])));
                    break;
                case "pk":
                    if (p.Length >= 8 && DocInt(p[0]) is { } pkNut &&
                        Enum.TryParse<TrangThaiPhuKien>(p[1], out var tt))
                    {
                        phuKien.Add(new PhuKienChot(
                            pkNut, tt, Rong(p[2]), Rong(p[3]), Rong(p[4]), Rong(p[5]), p[6] == "1", p[7] == "1"));
                    }
                    break;
                // khóa lạ (bản sau) — bỏ qua, không coi là dữ liệu hỏng
            }
        }
        return co ? new DoThiChot(ngay, rp, nguonX, nguonY, tuyen, nut, canh, thietBi, phuKien) : null;
    }

    /// <summary>Giá trị an toàn cho một ô: null/rỗng thành rỗng, <c>|</c> đổi thành <c>/</c>.</summary>
    private static string An(string? v) => (v ?? "").Replace('|', '/');

    private static string? Rong(string v) => v.Length == 0 ? null : v;

    private static string So(double v) => v.ToString("0.######", CultureInfo.InvariantCulture);

    private static string SoRong(double? v) => v is { } x ? So(x) : "";

    private static double? Doc(string v) =>
        double.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out var x) ? x : null;

    private static int? DocInt(string v) =>
        int.TryParse(v, NumberStyles.Integer, CultureInfo.InvariantCulture, out var x) ? x : null;
}
