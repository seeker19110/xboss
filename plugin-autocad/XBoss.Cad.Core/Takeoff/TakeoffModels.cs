using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Takeoff;

/// <summary>Phân loại thô của đối tượng đo được — Adapter dựng, Core gộp (M99 §4).</summary>
public enum MeasuredKind
{
    /// <summary>Đường: Line/Arc/Circle/Polyline/Ellipse/Spline — có chiều dài; polyline đóng có thêm diện tích.</summary>
    Curve,
    /// <summary>Hatch/Region — chỉ có diện tích.</summary>
    Hatch,
    /// <summary>BlockReference — đếm.</summary>
    Block,
}

/// <summary>
/// Một đối tượng đã đo từ bản vẽ. Số đo thô theo ĐƠN VỊ BẢN VẼ — Adapter không quy đổi,
/// Core quy đổi tập trung ở TakeoffCalculator (INSUNITS → mm → factor, M99 §6.7).
/// </summary>
public sealed record MeasuredObject
{
    public required string Handle { get; init; }
    public required string Layer { get; init; }
    public required MeasuredKind Kind { get; init; }
    /// <summary>Tên block gốc (dynamic block lấy tên DynamicBlockTableRecord) — chỉ với Kind=Block.</summary>
    public string? BlockName { get; init; }
    public double RawLength { get; init; }
    public double RawArea { get; init; }
    public bool IsClosed { get; init; }
    /// <summary>Đã mang XData XBOSS_BOCKL từ lần bóc trước → mặc định bỏ qua (M99 FR14).</summary>
    public bool AlreadyMarked { get; init; }
}

/// <summary>Một dòng kết quả bóc: item + tổng khối lượng đã quy đổi/làm tròn + danh sách handle.</summary>
public sealed record TakeoffLine
{
    public required TakeoffItem Item { get; init; }
    public required int ObjectCount { get; init; }
    /// <summary>Khối lượng cuối theo đơn vị của item — làm tròn CHỈ Ở TỔNG (M99 FR13).</summary>
    public required double Quantity { get; init; }
    public required IReadOnlyList<string> Handles { get; init; }
}

public enum TakeoffWarningKind
{
    /// <summary>Polyline hở trên layer thuộc item đo diện tích — không đo, trỏ về XBOSS_KIEMTRA (AC9).</summary>
    OpenPolylineSkipped,
    /// <summary>Đối tượng khớp ≥2 item — chỉ tính item đầu (first-match).</summary>
    MultipleItemMatch,
    /// <summary>Đơn vị bản vẽ không phải mm — đã quy đổi tự động (AC13).</summary>
    DrawingUnit,
}

public sealed record TakeoffWarning(TakeoffWarningKind Kind, string ThongDiep, IReadOnlyList<string> Handles);

/// <summary>Kết quả bóc tách đầy đủ — đầu vào của BoqExcelWriter và bảng kết quả trong AutoCAD.</summary>
public sealed class TakeoffResult
{
    public required string RulePackVersion { get; init; }
    /// <summary>Các dòng theo thứ tự items trong rule pack (chỉ item có ≥1 đối tượng).</summary>
    public required IReadOnlyList<TakeoffLine> Lines { get; init; }
    public required IReadOnlyList<TakeoffWarning> Warnings { get; init; }
    /// <summary>Số đối tượng bị bỏ qua vì đã bóc trước đó (AC10: "đã bóc trước đó: n đối tượng").</summary>
    public required int SkippedMarkedCount { get; init; }
    /// <summary>Số đối tượng nằm trong xref bị bỏ qua (M99 §6.5.1 — báo cho kỹ sư biết).</summary>
    public required int XrefSkippedCount { get; init; }
}
