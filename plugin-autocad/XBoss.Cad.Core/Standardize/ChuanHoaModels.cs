namespace XBoss.Cad.Core.Standardize;

/// <summary>Loại style mà một thực thể đang dùng (bước chuẩn hóa 8 — M101 §6.2).</summary>
public enum LoaiStyle
{
    /// <summary>DBText/MText/AttributeReference → TEXTSTYLE.</summary>
    KieuChu,

    /// <summary>Dimension → DIMSTYLE.</summary>
    KieuKichThuoc,
}

/// <summary>Một kiểu chữ đang có trong bảng TEXTSTYLE của bản vẽ (bước 8).</summary>
public sealed record KieuChuHienCo
{
    public required string Ten { get; init; }

    /// <summary>Tên font đang dùng: TypeFace của TrueType, hoặc tên tệp .shx. Rỗng = không đọc được.</summary>
    public string Font { get; init; } = "";

    /// <summary>Chiều cao cố định theo ĐƠN VỊ BẢN VẼ; 0 = kiểu chữ không cố định chiều cao.</summary>
    public double ChieuCaoCoDinh { get; init; }

    /// <summary>Hệ số bề rộng (XScale).</summary>
    public double HeSoRong { get; init; } = 1;
}

/// <summary>Một kiểu kích thước đang có trong bảng DIMSTYLE (bước 8).</summary>
public sealed record KieuKichThuocHienCo
{
    public required string Ten { get; init; }

    /// <summary>Tên kiểu chữ mà dimstyle này dùng (biến DIMTXSTY). Rỗng = không đọc được.</summary>
    public string TenKieuChu { get; init; } = "";
}

/// <summary>Một thực thể đang dùng style — Adapter liệt kê, Core quyết định có đổi hay không (bước 8).</summary>
public sealed record ThucTheDungStyle
{
    public required string Handle { get; init; }
    public required LoaiStyle Loai { get; init; }
    public required string TenStyle { get; init; }
}

/// <summary>Đổi style của một thực thể về bộ chuẩn.</summary>
public sealed record ThayDoiStyle(string Handle, LoaiStyle Loai, string StyleMoi);

/// <summary>
/// Kế hoạch bước 8. Lưu ý bất biến M99 O3: kế hoạch CHỈ gán lại kiểu style của dimension,
/// không bao giờ dựng lại/nổ tung dimension — liên kết đo (associativity) giữ nguyên.
/// </summary>
public sealed record KeHoachStyle
{
    /// <summary>Kiểu chữ chuẩn chưa có trong bảng → Adapter tạo mới.</summary>
    public bool TaoKieuChuChuan { get; init; }

    /// <summary>Kiểu chữ chuẩn đã có nhưng font/chiều cao/hệ số rộng lệch → Adapter sửa bản ghi.</summary>
    public bool SuaKieuChuChuan { get; init; }

    /// <summary>Kiểu kích thước chuẩn chưa có trong bảng → Adapter tạo mới (trỏ kiểu chữ chuẩn).</summary>
    public bool TaoKieuKichThuocChuan { get; init; }

    /// <summary>Chiều cao cố định đích theo ĐƠN VỊ BẢN VẼ (Core đã quy đổi từ mm của rule pack).</summary>
    public double ChieuCaoChuanDonViBanVe { get; init; }

    public IReadOnlyList<ThayDoiStyle> DoiStyle { get; init; } = [];
    public IReadOnlyList<string> CanhBao { get; init; } = [];

    /// <summary>Không có gì để làm (chưa chốt bộ chuẩn, hoặc bản vẽ đã đúng chuẩn).</summary>
    public bool Rong => !TaoKieuChuChuan && !SuaKieuChuChuan && !TaoKieuKichThuocChuan && DoiStyle.Count == 0;
}

/// <summary>Một tham chiếu ngoài (xref) đang gắn vào bản vẽ (bước 9).</summary>
public sealed record XrefHienCo
{
    public required string Ten { get; init; }

    /// <summary>Đường dẫn ĐANG LƯU trong bản vẽ (có thể tuyệt đối hoặc tương đối).</summary>
    public required string DuongDanLuu { get; init; }

    /// <summary>Xref không tải được (mất tệp / đường dẫn hỏng) — bước 9 chỉ BÁO, không tự sửa.</summary>
    public bool DutDuongDan { get; init; }

    public bool LaOverlay { get; init; }
}

/// <summary>Thay đổi trên một xref. <c>DuongDanMoi</c> null = giữ nguyên đường dẫn.</summary>
public sealed record ThayDoiXref(string Ten, string? DuongDanMoi, bool Bind);

public sealed record KeHoachXref
{
    public IReadOnlyList<ThayDoiXref> ThayDoi { get; init; } = [];
    public IReadOnlyList<string> CanhBao { get; init; } = [];
}

/// <summary>Một hatch trong bản vẽ (bước 10).</summary>
public sealed record HatchHienCo
{
    public required string Handle { get; init; }
    public required string Layer { get; init; }
    public required string TenMau { get; init; }
    public double TiLe { get; init; }

    /// <summary>Hatch tô đặc/gradient — LUÔN giữ nguyên (M101 §6.2 bước 10).</summary>
    public bool LaSolid { get; init; }
}

public sealed record ThayDoiHatch(string Handle, string MauMoi, double TiLeMoi);

public sealed record KeHoachHatch
{
    public IReadOnlyList<ThayDoiHatch> ThayDoi { get; init; } = [];
    public IReadOnlyList<string> CanhBao { get; init; } = [];
}

/// <summary>Một layout (paper space) — bước 11. Model space KHÔNG nằm trong danh sách này.</summary>
public sealed record LayoutChuanHoa
{
    public required string Ten { get; init; }

    /// <summary>Số viewport THẬT — Adapter bỏ viewport nền số 1 của paper space (luôn tồn tại).</summary>
    public int SoViewport { get; init; }

    /// <summary>Số đối tượng khác viewport nằm trên layout (khung tên, ghi chú…).</summary>
    public int SoDoiTuong { get; init; }
}

public sealed record DoiTenLayout(string TenCu, string TenMoi);

public sealed record KeHoachLayout
{
    public IReadOnlyList<string> XoaLayout { get; init; } = [];
    public IReadOnlyList<DoiTenLayout> DoiTen { get; init; } = [];
    public IReadOnlyList<string> CanhBao { get; init; } = [];

    public bool Rong => XoaLayout.Count == 0 && DoiTen.Count == 0;
}
