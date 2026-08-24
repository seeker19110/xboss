namespace XBoss.Cad.Core.Geometry;

/// <summary>
/// Quy đổi đơn vị bản vẽ theo biến INSUNITS của AutoCAD (M99 §6.7):
/// chuẩn dự án là mm; INSUNITS khác → quy đổi tự động + cảnh báo;
/// INSUNITS=0 (Unitless) → coi là mm kèm cảnh báo mạnh.
/// </summary>
public static class DrawingUnits
{
    /// <summary>Hệ số nhân: 1 đơn vị bản vẽ = ? mm. Kèm cờ có cần cảnh báo và nhãn tiếng Việt.</summary>
    public static (double ToMm, bool CanCanhBao, string Ten) TuInsUnits(int insUnits) => insUnits switch
    {
        0 => (1.0, true, "Không khai đơn vị (Unitless) — coi là mm"),
        1 => (25.4, true, "inch"),
        2 => (304.8, true, "foot"),
        4 => (1.0, false, "mm"),
        5 => (10.0, true, "cm"),
        6 => (1000.0, true, "m"),
        14 => (100.0, true, "dm"),
        _ => (1.0, true, $"INSUNITS={insUnits} không hỗ trợ — coi là mm, KIỂM TRA LẠI ĐƠN VỊ"),
    };
}
