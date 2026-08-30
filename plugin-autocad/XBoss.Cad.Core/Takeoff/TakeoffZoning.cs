using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Zoning;

namespace XBoss.Cad.Core.Takeoff;

/// <summary>
/// Cầu nối giữa hình học vùng (<see cref="VungClipper"/>) và dữ liệu bóc tách — để Adapter chỉ
/// còn việc đọc hình học từ AutoCAD rồi gọi một hàm THUẦN (M101 FR4: mọi tính toán ở Core).
/// </summary>
public static class TakeoffZoning
{
    /// <summary>
    /// Tên vùng ghi vào XData khi một đối tượng bị ranh giới cắt làm nhiều phần: XBOSS_BOCKL_XUAT
    /// dựng lại từ XData KHÔNG có ranh giới trong tay nên không tách lại được — thà ghi rõ là
    /// "cắt nhiều vùng" còn hơn gán bừa vào một vùng.
    /// </summary>
    public const string NhieuVung = "(cắt nhiều vùng)";

    /// <summary>Chiều dài tuyến theo từng vùng; danh sách vùng rỗng → trả rỗng (không chia vùng).</summary>
    public static IReadOnlyList<PhanVungDoiTuong> ChiaTuyen(
        IReadOnlyList<DoanTuyen> tuyen, IReadOnlyList<RanhGioiVung> vung)
    {
        if (vung.Count == 0 || tuyen.Count == 0) return [];
        return VungClipper.GopTheoVung(VungClipper.Cat(tuyen, vung))
            .Select(x => new PhanVungDoiTuong(x.Vung, x.ChieuDai))
            .ToList();
    }

    /// <summary>
    /// Tên vùng để ghi vào XData của từng đối tượng đã bóc: đối tượng chỉ nằm trong một vùng thì
    /// ghi đúng tên vùng đó, đối tượng bị ranh giới cắt (xuất hiện ở nhiều dòng) ghi
    /// <see cref="NhieuVung"/> — XBOSS_BOCKL_XUAT không dựng lại được phần chia nên không giả vờ biết.
    /// </summary>
    public static IReadOnlyDictionary<string, string> VungTheoHandle(TakeoffResult ketQua)
    {
        var ra = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var line in ketQua.Lines)
        {
            foreach (var handle in line.Handles)
            {
                if (ra.TryGetValue(handle, out var cu))
                {
                    if (!string.Equals(cu, line.Vung, StringComparison.Ordinal)) ra[handle] = NhieuVung;
                }
                else
                {
                    ra[handle] = line.Vung;
                }
            }
        }
        return ra;
    }

    /// <summary>
    /// Ngưỡng tìm nhãn lớn nhất (mm) trong toàn rule pack; 0 = không item nào bật
    /// <c>sizeFromNearbyText</c> → Adapter khỏi quét nhãn (không tốn thời gian trên bản vẽ lớn).
    /// </summary>
    public static double NguongNhanLonNhatMm(TakeoffSection takeoff) =>
        takeoff.Items
            .Where(i => i.SizeFromNearbyText is { Enabled: true })
            .Select(i => i.SizeFromNearbyText!.MaxDistanceMm)
            .DefaultIfEmpty(0)
            .Max();
}
