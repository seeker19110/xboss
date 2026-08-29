using XBoss.Cad.Core.Geometry;

namespace XBoss.Cad.Core.Draw;

/// <summary>Quyết định trên–dưới tại một điểm giao (M109 FR3).</summary>
/// <param name="HeTren">Id hệ đi TRÊN (vẽ liền mạch).</param>
/// <param name="HeDuoi">Id hệ đi DƯỚI (bị ngắt nét).</param>
/// <param name="TheoDaoTay">Kết quả đến từ kỹ sư đảo tay chứ không phải từ <c>priority</c>.</param>
public readonly record struct QuyetDinhTrenDuoi(string HeTren, string HeDuoi, bool TheoDaoTay);

/// <summary>
/// Cầu vượt cho tuyến ĐƠN NÉT đi dưới (M109 FR4, phương án C): tuyến bị cắt hiển thị giữa
/// <paramref name="Dau"/> và <paramref name="Cuoi"/>, nối lại bằng cung tròn bán kính
/// <paramref name="BanKinh"/> đi vòng qua tuyến đi trên.
/// </summary>
/// <param name="ThanhCong">false = không dựng được, xem <paramref name="LyDo"/> (bỏ qua điểm giao đó).</param>
/// <param name="Bulge">Bulge của cung theo quy ước polyline AutoCAD (<see cref="BulgeMath"/>).</param>
public sealed record KetQuaCauVuot(
    bool ThanhCong,
    string? LyDo,
    Diem2 Dau = default,
    Diem2 Cuoi = default,
    Diem2 Tam = default,
    double BanKinh = 0,
    double Bulge = 0);

/// <summary>
/// Hình học ngắt nét giao chéo (M109 FR3/FR4) — THUẦN, không tham chiếu assembly AutoCAD nên test
/// chạy trên CI Linux. Adapter chỉ việc dựng <c>Wipeout</c>/polyline theo toạ độ trả về ở đây.
///
/// Đơn vị: mọi tham số hình học theo ĐƠN VỊ BẢN VẼ; quy đổi từ <c>clearanceMm</c>/<c>jogRadiusMm</c>
/// của rule pack do caller làm (<see cref="DrawingUnits"/>) — cùng quy ước với
/// <see cref="Segment2D"/> và <see cref="EdgeOffset"/>.
///
/// GUARDRAIL M109 §2: không hàm nào ở đây trả về thao tác cắt/chia tim. Kết quả chỉ là đối tượng
/// hiển thị SINH THÊM; polyline tim giữ nguyên từng đỉnh.
/// </summary>
public static class CrossingGeometry
{
    /// <summary>Dưới ngưỡng này coi là hướng suy biến / hai tuyến song song.</summary>
    private const double NguongSuyBien = 1e-9;

    /// <summary>
    /// Hạng ưu tiên trình bày của một hệ: chỉ số trong <paramref name="priority"/>; hệ KHÔNG khai
    /// xếp SAU CÙNG (<see cref="int.MaxValue"/>) đúng theo <c>crossingPolicy.priorityNote</c>.
    /// </summary>
    public static int HangUuTien(string heId, IReadOnlyList<string> priority)
    {
        for (var i = 0; i < priority.Count; i++)
        {
            if (string.Equals(priority[i], heId, StringComparison.Ordinal)) return i;
        }
        return int.MaxValue;
    }

    /// <summary>
    /// Chọn tuyến đi trên giữa hai hệ. <c>null</c> = hai tuyến CÙNG HỆ ⇒ không ngắt nét, caller ghi
    /// vào mục báo cáo riêng (FR3).
    ///
    /// Hai hệ cùng không khai trong <c>priority</c> thì xếp theo thứ tự ordinal của id — cốt để kết
    /// quả TẤT ĐỊNH (chạy lại cho ra y hệt, AC4), không mang ý nghĩa kỹ thuật nào.
    ///
    /// <paramref name="daoTay"/> = kỹ sư đã đảo chiều điểm giao này (FR7): ĐẢO THẲNG kết quả và
    /// thắng <c>priority</c>, để chạy lại lệnh giữ nguyên quyết định của kỹ sư (AC5).
    /// </summary>
    public static QuyetDinhTrenDuoi? ChonTrenDuoi(
        string heA, string heB, IReadOnlyList<string> priority, bool daoTay = false)
    {
        if (string.Equals(heA, heB, StringComparison.Ordinal)) return null;

        var hangA = HangUuTien(heA, priority);
        var hangB = HangUuTien(heB, priority);
        var aDiTren = hangA != hangB
            ? hangA < hangB
            : string.CompareOrdinal(heA, heB) < 0;
        if (daoTay) aDiTren = !aDiTren;

        return aDiTren
            ? new QuyetDinhTrenDuoi(heA, heB, daoTay)
            : new QuyetDinhTrenDuoi(heB, heA, daoTay);
    }

    /// <summary>
    /// Góc giao có đủ lớn để ngắt nét không (FR3): góc &lt; <paramref name="minAngleDeg"/> thì KHÔNG
    /// ngắt (giao gần song song ⇒ vùng che dài lê thê, che mất tuyến).
    /// </summary>
    public static bool DuGocDeNgat(double gocDeg, double minAngleDeg) => gocDeg >= minAngleDeg;

    /// <summary>
    /// Vùng che (4 đỉnh, phương án B) cho tuyến đi dưới tại điểm giao — hình chữ nhật ĐẶT THEO tuyến
    /// ĐI TRÊN:
    /// <list type="bullet">
    /// <item>ngang tuyến đi trên: <c>bề rộng tuyến đi trên + 2 × clearance</c> (đúng M109 FR4);</item>
    /// <item>dọc tuyến đi trên: vừa đủ trùm hết bề rộng tuyến đi dưới khi cắt chéo —
    /// <c>(bề rộng dưới / 2) / sin(góc giao)</c> mỗi bên, không nới thêm (nới nữa là che oan phần
    /// tuyến dưới nằm ngoài vùng giao).</item>
    /// </list>
    /// Tuyến đơn nét đi dưới có <paramref name="beRongDuoi"/> = 0 ⇒ vùng che suy biến thành đoạn,
    /// nên ca đó dùng cầu vượt (<see cref="CauVuot"/>) chứ không dùng wipeout.
    /// Trả danh sách RỖNG khi hai tuyến song song/hướng suy biến (không có vùng giao xác định).
    /// </summary>
    public static IReadOnlyList<Diem2> VungChe(
        Diem2 diemGiao,
        (double X, double Y) huongTren,
        (double X, double Y) huongDuoi,
        double beRongTren,
        double beRongDuoi,
        double clearance)
    {
        var truc = ChuanHoa(huongTren);
        if (truc is not { } u) return [];

        var sin = Math.Sin(Segment2D.GocGiaoDeg(huongTren, huongDuoi) * Math.PI / 180);
        if (sin < NguongSuyBien) return [];

        var nuaNgang = beRongTren / 2 + clearance;
        var nuaDoc = beRongDuoi / 2 / sin;

        var doc = u * nuaDoc;
        var ngang = new Diem2(-u.Y, u.X) * nuaNgang; // pháp tuyến trái của tuyến đi trên

        return
        [
            diemGiao - doc - ngang,
            diemGiao + doc - ngang,
            diemGiao + doc + ngang,
            diemGiao - doc + ngang,
        ];
    }

    /// <summary>
    /// Cầu vượt cho tuyến ĐƠN NÉT đi dưới (phương án C): cắt tuyến dưới trên đoạn trùm hết bề rộng
    /// tuyến đi trên cộng khe hở — nửa dây cung <c>(bề rộng trên / 2 + clearance) / sin(góc giao)</c>
    /// mỗi bên — rồi nối hai đầu bằng CUNG NHỎ bán kính <paramref name="banKinh"/> vòng về phía pháp
    /// tuyến trái của tuyến đi dưới.
    ///
    /// Bán kính nhỏ hơn nửa dây thì KHÔNG có cung nào đi qua hai đầu ⇒ trả
    /// <see cref="KetQuaCauVuot.ThanhCong"/> = false kèm lý do tiếng Việt (caller bỏ qua điểm giao
    /// và đếm vào báo cáo, không vẽ hình sai).
    /// </summary>
    public static KetQuaCauVuot CauVuot(
        Diem2 diemGiao,
        (double X, double Y) huongDuoi,
        (double X, double Y) huongTren,
        double beRongTren,
        double clearance,
        double banKinh)
    {
        var truc = ChuanHoa(huongDuoi);
        if (truc is not { } u) return new KetQuaCauVuot(false, "Tuyến đi dưới có hướng suy biến (độ dài 0).");
        if (banKinh <= 0) return new KetQuaCauVuot(false, "jogRadiusMm phải dương.");

        var sin = Math.Sin(Segment2D.GocGiaoDeg(huongDuoi, huongTren) * Math.PI / 180);
        if (sin < NguongSuyBien)
            return new KetQuaCauVuot(false, "Hai tuyến song song — không xác định được vùng giao.");

        var nuaDay = (beRongTren / 2 + clearance) / sin;
        if (nuaDay > banKinh)
        {
            return new KetQuaCauVuot(
                false,
                $"Vùng giao rộng {nuaDay * 2:0.#} (đơn vị bản vẽ) vượt đường kính cung {banKinh * 2:0.#} — " +
                "tăng jogRadiusMm hoặc chuyển gapMode sang wipeout.");
        }

        var dau = diemGiao - u * nuaDay;
        var cuoi = diemGiao + u * nuaDay;

        // Tâm cung nằm trên trung trực dây, lệch về phía PHẢI để cung nhỏ vồng sang trái tuyến dưới.
        var phapTuyenTrai = new Diem2(-u.Y, u.X);
        var caoTam = Math.Sqrt(Math.Max(0, banKinh * banKinh - nuaDay * nuaDay));
        var tam = diemGiao - phapTuyenTrai * caoTam;

        // Nửa góc mở của cung nhỏ. Tâm nằm bên PHẢI dây nên đi từ Dau tới Cuoi là quay THEO chiều
        // kim đồng hồ ⇒ Δθ âm, mà bulge = tan(Δθ/4) nên bulge âm (quy ước BulgeMath).
        var nuaGoc = Math.Asin(Math.Clamp(nuaDay / banKinh, -1, 1));
        var bulge = -Math.Tan(nuaGoc / 2);

        return new KetQuaCauVuot(true, null, dau, cuoi, tam, banKinh, bulge);
    }

    /// <summary>Vector đơn vị của một hướng; null khi hướng suy biến.</summary>
    private static Diem2? ChuanHoa((double X, double Y) huong)
    {
        var dai = Math.Sqrt(huong.X * huong.X + huong.Y * huong.Y);
        if (dai < NguongSuyBien) return null;
        return new Diem2(huong.X / dai, huong.Y / dai);
    }
}
