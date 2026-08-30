using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Draw;

/// <summary>
/// Quy ước màu/nét cho layer do bộ lệnh vẽ TẠO MỚI (M100 FR9: "đúng màu/lineweight theo
/// lineweightMap"). Rule pack v4 chỉ khai lineweight THEO MÀU ACI (bảng CTB), không khai màu cho
/// từng layer đích — nên bộ lệnh vẽ chọn ACI theo đúng "purpose" của bảng đó rồi lấy lineweight
/// từ chính bảng đó, không bịa số:
///
/// <list type="bullet">
/// <item>tim của tuyến CÓ nét biên (ống gió, máng cáp) → ACI 4 "Nét tim ống, trục Centerline"</item>
/// <item>tim của tuyến KHÔNG có nét biên (ống tròn) → ACI 2 "Nét ống nhánh, máng cáp, van khóa"
/// (chính nét tim là nét ống nhìn thấy trên bản vẽ)</item>
/// <item>nét biên → ACI 2 (đường bao ống gió/máng — nét thấy)</item>
/// <item>nhãn → ACI 7 "Chữ ghi chú Text, Dimension"</item>
/// </list>
///
/// Layer ĐÃ CÓ SẴN thì giữ nguyên màu (không đụng bản thiết kế nền — FR9).
/// </summary>
public static class VeLayerStyle
{
    public const int AciTimCoNetBien = 4;
    public const int AciTimTran = 2;
    public const int AciNetBien = 2;
    public const int AciNhan = 7;

    /// <summary>
    /// Layer hành lang (M114 <c>routingPolicy.corridorLayer</c>) — ACI 4 như nét tim/trục: hành
    /// lang là ĐƯỜNG DỰNG HÌNH cho việc đi tuyến, không phải nét thấy của thiết bị nào, nên đi
    /// cùng hạng "Nét tim ống, trục Centerline" của bảng CTB thay vì bịa một màu mới.
    /// </summary>
    public const int AciHanhLang = AciTimCoNetBien;

    /// <summary>ACI cho layer tim theo <c>edgeStyle</c> của loại tuyến.</summary>
    public static int AciChoTim(string? edgeStyle) =>
        string.Equals(edgeStyle, "double", StringComparison.Ordinal) ? AciTimCoNetBien : AciTimTran;

    /// <summary>
    /// Tên layer nét biên = layer tim + <c>drawTools.edgeLayerSuffix</c> (FR4).
    /// KHÔNG hard-code hậu tố ở bất kỳ đâu khác — hậu tố là dữ liệu rule pack.
    /// </summary>
    public static string LayerNetBien(string layerTim, string hauTo) => layerTim + hauTo;

    /// <summary>Lineweight (mm) quy định cho một ACI; null = bảng CTB không quy định (không bịa).</summary>
    public static double? LineweightMm(LineweightMapSection bang, int aci) =>
        bang.ByAci.FirstOrDefault(c => c.Aci == aci)?.LineweightMm;
}
