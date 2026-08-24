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
}
