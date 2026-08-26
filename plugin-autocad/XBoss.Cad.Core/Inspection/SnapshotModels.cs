namespace XBoss.Cad.Core.Inspection;

/// <summary>Phân loại thực thể trong snapshot kiểm tra — Adapter dựng từ bản vẽ thật.</summary>
public enum EntityKind
{
    Curve,
    Hatch,
    BlockRef,
    Text,
    Dimension,
    Other,
}

/// <summary>Thông tin 1 layer trong bảng layer (phục vụ phép kiểm 1 và 5 — M99 §6.4).</summary>
public sealed record LayerInfo
{
    public required string Name { get; init; }
    public int Aci { get; init; }
    /// <summary>Lineweight đặt trên layer (mm); null = mặc định/ByBlock.</summary>
    public double? LineweightMm { get; init; }
}

/// <summary>
/// Thông tin 1 thực thể — mọi số đo theo ĐƠN VỊ BẢN VẼ (Core quy đổi tập trung, M99 §6.7).
/// </summary>
public sealed record EntityInfo
{
    public required string Handle { get; init; }
    public required string Layer { get; init; }
    public required EntityKind Kind { get; init; }
    /// <summary>|Z| lớn nhất trên mọi đỉnh/elevation của thực thể (phép kiểm 2).</summary>
    public double MaxAbsZ { get; init; }
    public bool IsPolyline { get; init; }
    public bool IsClosed { get; init; }
    /// <summary>Khoảng cách 2 đầu mút của polyline HỞ (phân loại "gần kín" — phép kiểm 3).</summary>
    public double? EndGapDistance { get; init; }
    public double RawLength { get; init; }
    /// <summary>Nội dung text (Text/MText/thuộc tính block/dimension override) — phép kiểm 4.</summary>
    public string? TextContent { get; init; }
    /// <summary>Tên font của text style (nhận diện bảng mã TCVN3/VNI — phép kiểm 4).</summary>
    public string? TextStyleFontName { get; init; }
    /// <summary>Dimension có text/measurement override — phép kiểm 6.</summary>
    public bool HasDimOverride { get; init; }
    /// <summary>Đầu-cuối (X,Y đơn vị bản vẽ) của đường thẳng/polyline — phép kiểm 7 (trùng chồng).</summary>
    public (double X, double Y)? Start { get; init; }
    public (double X, double Y)? End { get; init; }

    /// <summary>Tên TEXTSTYLE của text/mtext (v5, phép kiểm 14). Null = không phải text / Adapter chưa cung cấp.</summary>
    public string? TextStyleName { get; init; }

    /// <summary>Tên DIMSTYLE của dimension (v5, phép kiểm 14). Null = không phải dim / chưa cung cấp.</summary>
    public string? DimStyleName { get; init; }

    /// <summary>Hình bao thực thể (đơn vị bản vẽ) — v5, phép kiểm 16. Null = Adapter không lấy được
    /// extents (thực thể suy biến, block rỗng…) → bỏ qua thực thể đó thay vì đoán vị trí.</summary>
    public (double X, double Y)? BoundsMin { get; init; }
    public (double X, double Y)? BoundsMax { get; init; }
}

/// <summary>
/// Tim tuyến đã DUỖI thành chuỗi đỉnh (cung tròn do Adapter chia nhỏ trước) — nguồn dữ liệu
/// của phép kiểm 10 (chồng lấn cùng hệ) và 11 (giao cắt khác hệ). Tách khỏi <see cref="EntityInfo"/>
/// vì hai phép kiểm này cần TỪNG ĐOẠN, trong khi EntityInfo chỉ mang 2 đầu mút (v5, M101 §6.1).
/// </summary>
public sealed record CenterlineInfo
{
    public required string Handle { get; init; }
    public required string Layer { get; init; }
    /// <summary>≥ 2 đỉnh; ít hơn thì Core bỏ qua (không có đoạn nào để so).</summary>
    public required IReadOnlyList<(double X, double Y)> Vertices { get; init; }
}

/// <summary>Một viewport trên layout (v5, phép kiểm 13).</summary>
public sealed record ViewportInfo
{
    public required string Handle { get; init; }
    /// <summary>Mẫu số tỉ lệ 1:X (vd 100 cho 1:100). Null = không đọc được → bỏ qua, không đoán.</summary>
    public double? ScaleDenominator { get; init; }
    public bool IsLocked { get; init; }
}

/// <summary>Một block reference trên layout (v5, phép kiểm 12 — khung tên).</summary>
public sealed record BlockRefInfo
{
    public required string Handle { get; init; }
    public required string BlockName { get; init; }
    /// <summary>True/false = manifest thư viện M100 khẳng định đây có/không phải kind=titleblock.
    /// Null = chưa có dữ liệu M100 → Core khớp tên theo titleblockNameMatchAny.</summary>
    public bool? IsTitleblock { get; init; }
    /// <summary>Attribute của block: TAG → giá trị (giá trị rỗng = chưa điền).</summary>
    public IReadOnlyDictionary<string, string> Attributes { get; init; } =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
}

/// <summary>Một layout (paper space) — v5, phép kiểm 12 và 13.</summary>
public sealed record LayoutInfo
{
    public required string Name { get; init; }
    public IReadOnlyList<ViewportInfo> Viewports { get; init; } = [];
    public IReadOnlyList<BlockRefInfo> BlockRefs { get; init; } = [];
}

/// <summary>
/// Nhãn size do XBOSS_VE_NHAN (M100) sinh, kèm size đọc từ XData của tim liên kết —
/// v5, phép kiểm 15. Chỉ Adapter có M100 mới dựng được danh sách này.
/// </summary>
public sealed record LabelLinkInfo
{
    public required string Handle { get; init; }
    /// <summary>Nội dung nhãn hiển thị (vd "300x200" hoặc "Ø300 i=1%").</summary>
    public required string NoiDung { get; init; }
    /// <summary>Handle của tim mà nhãn trỏ tới (XData XBOSS_VE).</summary>
    public required string TimHandle { get; init; }
    /// <summary>Size ghi trong XData của tim; rỗng = tim mất XData → bỏ qua nhãn đó, không đoán.</summary>
    public required string SizeTheoXData { get; init; }
}

/// <summary>
/// Phần thuộc XREF mà Adapter CỐ Ý không đưa vào snapshot (quy tắc dự án 2026-08-26: "xref thì bỏ
/// qua hết"). Kiểm nội dung xref là báo lỗi trên thứ kỹ sư KHÔNG sửa được ở bản vẽ chủ, mà lệnh
/// chuẩn hóa cũng bỏ qua đúng tập này — hai tầng phải cùng phạm vi, nếu không thì "xem trước
/// chuẩn hóa" báo N lỗi rồi sửa được 0 và bản vẽ không bao giờ về trạng thái đạt chuẩn.
/// Core chỉ BÁO số lượng để kỹ sư biết phạm vi kiểm, không phán xét gì thêm.
/// </summary>
public sealed record XrefBoQua
{
    /// <summary>Layer phụ thuộc xref (<c>SymbolTableRecord.IsDependent</c>) không đưa vào kiểm.</summary>
    public int SoLayer { get; init; }

    /// <summary>Khối chèn xref trong model space không đưa vào kiểm.</summary>
    public int SoKhoiChen { get; init; }

    public int Tong => SoLayer + SoKhoiChen;
}

/// <summary>Snapshot bản vẽ để kiểm — Adapter chỉ dựng dữ liệu, không phán xét.</summary>
public sealed class DrawingSnapshot
{
    public required IReadOnlyList<LayerInfo> Layers { get; init; }
    public required IReadOnlyList<EntityInfo> Entities { get; init; }
    public required int InsUnits { get; init; }

    /// <summary>Tên các layer đang ĐƯỢC DÙNG bởi ít nhất 1 thực thể trên TOÀN bản vẽ
    /// (mọi block table record, kể cả paper space) — phép kiểm 8 (layer rỗng,
    /// purgePolicy.deepPurge.reportEmptyLayers). Null = Adapter không cung cấp → bỏ phép kiểm
    /// (không được suy từ Entities vì snapshot chỉ chứa model space, sẽ báo oan).</summary>
    public IReadOnlyCollection<string>? UsedLayerNames { get; init; }

    /// <summary>Tên các block NẶC DANH (anonymous, "*U…"/"*D…") không phải layout/xref —
    /// phép kiểm 9 (purgePolicy.deepPurge.reportAnonymousBlocks). Rỗng = không có/không quét.</summary>
    public IReadOnlyList<string> AnonymousBlockNames { get; init; } = [];

    /// <summary>Tim tuyến đã duỗi đỉnh — phép kiểm 10/11 (v5). Null = Adapter không quét
    /// → hai phép kiểm đó TỰ TẮT (không suy từ Entities: EntityInfo chỉ có 2 đầu mút,
    /// polyline gãy khúc sẽ bị hiểu sai thành đoạn thẳng và báo oan).</summary>
    public IReadOnlyList<CenterlineInfo>? Centerlines { get; init; }

    /// <summary>Danh sách layout (paper space) — phép kiểm 12/13 (v5). Null = Adapter không quét
    /// → hai phép kiểm đó tự tắt.</summary>
    public IReadOnlyList<LayoutInfo>? Layouts { get; init; }

    /// <summary>Nhãn size có XData M100 kèm size của tim — phép kiểm 15 (v5).
    /// Null = bản vẽ/plugin KHÔNG có dữ liệu M100 → phép kiểm 15 tự tắt (M101 §6.1).</summary>
    public IReadOnlyList<LabelLinkInfo>? NhanLienKet { get; init; }

    /// <summary>
    /// Tag do XBOSS_VE_TAG sinh (M100) — phép kiểm 17. <c>null</c> = Adapter chưa quét hoặc bản vẽ
    /// không có XData tag nào → phép tự tắt (không báo oan nhãn vẽ tay).
    /// </summary>
    public IReadOnlyList<TagInfo>? Tags { get; init; }

    /// <summary>Phần thuộc xref Adapter đã bỏ qua khi dựng snapshot — null = Adapter không đếm
    /// (bản vẽ không có xref, hoặc đường dựng snapshot cũ) ⇒ không báo gì.</summary>
    public XrefBoQua? XrefDaBoQua { get; init; }
}

/// <summary>Một tag XBOSS_VE_TAG đọc từ XData — phép kiểm 17 (tag trùng).</summary>
public sealed record TagInfo
{
    public required string Handle { get; init; }

    /// <summary>Chuỗi tag hiển thị (vd "T-05").</summary>
    public required string Tag { get; init; }

    /// <summary>Layer của tim liên kết — dùng làm "hệ" để so trùng trong phạm vi từng hệ.</summary>
    public required string HeLayer { get; init; }
}
