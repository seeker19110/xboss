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

    // ===== v6 (M101 §6.3) — vắng mặt = bóc y hệt v5 =====

    /// <summary>Size đọc từ XData <c>XBOSS_VE</c> (M100) — nguồn ƯU TIÊN khi item bật groupBySize.</summary>
    public string? SizeXData { get; init; }

    /// <summary>Nhãn text quanh đối tượng (Adapter đo khoảng cách) — nguồn phụ cho size.</summary>
    public IReadOnlyList<NhanGan> NhanGan { get; init; } = [];

    /// <summary>Tên vùng chứa đối tượng (block/hatch/tuyến không cắt ranh giới); rỗng = ngoài vùng.</summary>
    public string Vung { get; init; } = "";

    /// <summary>
    /// Tuyến cắt qua ranh giới: chiều dài từng phần theo vùng (đơn vị bản vẽ, do
    /// <c>Zoning.VungClipper</c> cắt). Rỗng = không chia vùng, dùng nguyên <see cref="RawLength"/>.
    /// </summary>
    public IReadOnlyList<PhanVungDoiTuong> PhanVung { get; init; } = [];
}

/// <summary>Một phần chiều dài của đối tượng nằm trong một vùng (đơn vị bản vẽ).</summary>
public sealed record PhanVungDoiTuong(string Vung, double RawLength);

/// <summary>Một dòng kết quả bóc: item (+ size/vùng khi có tách dòng) + tổng khối lượng đã quy đổi/làm tròn.</summary>
public sealed record TakeoffLine
{
    public required TakeoffItem Item { get; init; }
    public required int ObjectCount { get; init; }
    /// <summary>KL ĐO — khối lượng cuối theo đơn vị của item, làm tròn CHỈ Ở TỔNG (M99 FR13).</summary>
    public required double Quantity { get; init; }
    public required IReadOnlyList<string> Handles { get; init; }

    // ===== v6 (M101 §6.3) — mặc định trống/0, dòng hiện y hệt v5 =====

    /// <summary>Size của dòng khi item bật <c>groupBySize</c>; rỗng = không tách theo size.</summary>
    public string Size { get; init; } = "";

    /// <summary>Size này lấy từ đâu — luôn hiện trong Excel/JSON (M101 §18).</summary>
    public NguonSize NguonSize { get; init; } = NguonSize.KhongCo;

    /// <summary>Tên vùng của dòng; rỗng = không bóc theo vùng (hoặc phần ngoài mọi vùng).</summary>
    public string Vung { get; init; } = "";

    /// <summary>
    /// Hệ số quy đổi đã dùng (KL quy đổi = KL đo × hệ số): <c>1+wastagePct/100</c> với item đo dài/diện
    /// tích, <c>perCountAdd</c> với item đếm. 0 = rule pack không khai hệ số → không có KL quy đổi.
    /// </summary>
    public double HeSoQuyDoi { get; init; }

    /// <summary>Mô tả hệ số bằng tiếng Việt cho cột Excel (vd "hao hụt 5%", "+0.5 m tương đương/Cái").</summary>
    public string MoTaQuyDoi { get; init; } = "";

    /// <summary>KL QUY ĐỔI — cột RIÊNG, không bao giờ trộn vào <see cref="Quantity"/> (M101 §6.3/§18).</summary>
    public double KlQuyDoi { get; init; }

    /// <summary>Dòng tính ra từ item khác (cách nhiệt) chứ không đo trực tiếp trên bản vẽ.</summary>
    public bool LaDanXuat { get; init; }
}

public enum TakeoffWarningKind
{
    /// <summary>Polyline hở trên layer thuộc item đo diện tích — không đo, trỏ về XBOSS_KIEMTRA (AC9).</summary>
    OpenPolylineSkipped,
    /// <summary>Đối tượng khớp ≥2 item — chỉ tính item đầu (first-match).</summary>
    MultipleItemMatch,
    /// <summary>Đơn vị bản vẽ không phải mm — đã quy đổi tự động (AC13).</summary>
    DrawingUnit,
    /// <summary>v6: có dòng lấy size từ nhãn (bán tự động) — nhắc soát lại trước khi giao QS.</summary>
    SizeDocTuNhan,
    /// <summary>v6: item dẫn xuất (cách nhiệt) bỏ qua phần chưa xác định được size — báo số mét chưa tính.</summary>
    DanXuatThieuSize,
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
