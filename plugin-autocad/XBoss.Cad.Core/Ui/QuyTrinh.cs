namespace XBoss.Cad.Core.Ui;

/// <summary>
/// Bước trong vòng đời một bản vẽ shop drawing (M106 §6) — NGUỒN SỰ THẬT của thứ tự lệnh cho cả
/// Ribbon, trình dẫn quy trình và tài liệu.
///
/// Giá trị số CÓ ý nghĩa (1..6 = thứ tự hiện trong trình dẫn); <see cref="PhuTro"/> đứng ngoài dòng
/// chảy chính nên mang giá trị lớn để luôn xếp cuối khi sắp theo số.
/// </summary>
public enum BuocQuyTrinh
{
    /// <summary>1 — ghép thiết bị với server và nạp rule pack.</summary>
    KetNoi = 1,

    /// <summary>2 — kiểm tra/chuẩn hóa nền bản vẽ trước khi vẽ.</summary>
    ChuanHoaNen = 2,

    /// <summary>3 — vẽ tuyến/nhãn/phụ kiện/thiết bị trên nền đã chuẩn.</summary>
    VeShopDrawing = 3,

    /// <summary>4 — chia đốt, giá đỡ, lỗ chờ, tag: chi tiết cho xưởng chế tạo.</summary>
    ChiTietCheTao = 4,

    /// <summary>5 — mặt cắt, bảng thống kê, trang in, báo cáo phiên vẽ.</summary>
    HoSoBanVe = 5,

    /// <summary>6 — bóc khối lượng, xuất Excel và nộp hồ sơ lên server.</summary>
    BocVaNop = 6,

    /// <summary>Lệnh phụ trợ — dùng khi cần, không thuộc dòng chảy chính (M106 §6).</summary>
    PhuTro = 99,
}

/// <summary>
/// Trạng thái một bước trong trình dẫn quy trình (M106 FR7). Khai sẵn ở PR1 để hộp thoại/palette
/// của PR2 cắm vào; hàm SUY trạng thái từ token/rule pack/sidecar/XData là việc của PR2 (FR8) và
/// sẽ đặt ngay trong tệp này để mọi điều kiện nằm một chỗ, có test — không rải trong UI.
/// </summary>
public enum TrangThaiBuoc
{
    /// <summary>Chưa làm / chưa đủ dấu hiệu hoàn thành (○).</summary>
    Chua,

    /// <summary>Đã có dấu hiệu hoàn thành (✓).</summary>
    Xong,

    /// <summary>Không áp dụng cho bản vẽ/phiên làm việc này (–).</summary>
    KhongApDung,
}

/// <summary>
/// Tình trạng một bước để trình dẫn hiển thị: trạng thái + lý do tiếng Việt khi chưa đủ điều kiện
/// vào bước (nút mờ kèm lý do, nhưng VẪN bấm được — M106 §6 "hướng dẫn, không phải cổng chặn").
/// </summary>
public sealed record TinhTrangBuoc(BuocQuyTrinh Buoc, TrangThaiBuoc TrangThai, string? LyDo = null);

/// <summary>Một giai đoạn của quy trình chuẩn (M106 §6).</summary>
/// <param name="Buoc">Mã bước.</param>
/// <param name="Ten">Tên giai đoạn hiện trên trình dẫn.</param>
/// <param name="DieuKienVao">Điều kiện vào bước — hiển thị làm lý do khi nút bị làm mờ.</param>
/// <param name="DauHieuXong">Dấu hiệu "đã xong" — mô tả thứ PR2 sẽ đi dò để suy trạng thái.</param>
public sealed record GiaiDoanQuyTrinh(
    BuocQuyTrinh Buoc,
    string Ten,
    string DieuKienVao,
    string DauHieuXong);

/// <summary>
/// Quy trình chuẩn 6 giai đoạn của XBoss (M106 §6) — thứ tự dưới đây là vòng đời một bản vẽ shop
/// drawing, rút từ M99 §6 + M100 §6.1 + M105.
///
/// Thuần, không chạm AutoCAD ⇒ test trên CI Linux. Ai đổi thứ tự ở đây là đổi luôn thứ tự trên
/// Ribbon lẫn trình dẫn — cố ý, để không bao giờ có hai thứ tự khác nhau trong cùng một plugin.
/// </summary>
public static class QuyTrinh
{
    /// <summary>6 giai đoạn, ĐÚNG thứ tự M106 §6.</summary>
    public static readonly IReadOnlyList<GiaiDoanQuyTrinh> CacGiaiDoan =
    [
        new(BuocQuyTrinh.KetNoi,
            "Kết nối",
            "Luôn vào được — đây là bước đầu tiên của mọi phiên làm việc.",
            "Có token thiết bị còn hạn và rule pack nạp được."),
        new(BuocQuyTrinh.ChuanHoaNen,
            "Chuẩn hóa nền",
            "Cần rule pack đã nạp (bước Kết nối).",
            "Sidecar .xboss-kiemtra.json không còn lỗi chặn."),
        new(BuocQuyTrinh.VeShopDrawing,
            "Vẽ shop drawing",
            "Cần nền đã chuẩn hóa (bước Chuẩn hóa nền).",
            "Bản vẽ có tuyến mang XData của XBOSS_VE."),
        new(BuocQuyTrinh.ChiTietCheTao,
            "Chi tiết chế tạo",
            "Cần bản vẽ đã có tuyến (bước Vẽ shop drawing).",
            "Tuyến mang dấu chia đốt / giá đỡ / tag."),
        new(BuocQuyTrinh.HoSoBanVe,
            "Hồ sơ bản vẽ",
            "Cần bản vẽ đã có tuyến (bước Vẽ shop drawing).",
            "Có layout trang in và bảng thống kê."),
        new(BuocQuyTrinh.BocVaNop,
            "Bóc & nộp",
            "Cần bước Chuẩn hóa nền sạch lỗi chặn.",
            "Có sidecar -takeoff.json và upload trả về revision."),
    ];

    /// <summary>Nhãn tiếng Việt của một bước (kể cả nhóm phụ trợ).</summary>
    public static string Nhan(BuocQuyTrinh buoc) =>
        buoc == BuocQuyTrinh.PhuTro
            ? "Phụ trợ"
            : CacGiaiDoan.FirstOrDefault(g => g.Buoc == buoc)?.Ten ?? buoc.ToString();

    /// <summary>Nhãn tiếng Việt của trạng thái một bước (dùng chung cho trình dẫn PR2).</summary>
    public static string Nhan(TrangThaiBuoc trangThai) => trangThai switch
    {
        TrangThaiBuoc.Xong => "Đã xong",
        TrangThaiBuoc.KhongApDung => "Không áp dụng",
        _ => "Chưa làm",
    };

    /// <summary>Số thứ tự hiện trên trình dẫn (1..6); phụ trợ trả null vì đứng ngoài dòng chảy.</summary>
    public static int? SoThuTu(BuocQuyTrinh buoc) =>
        buoc == BuocQuyTrinh.PhuTro ? null : (int)buoc;

    /// <summary>Các lệnh của một bước, ĐÚNG thứ tự dùng thật (<c>LenhInfo.ThuTuTrongBuoc</c>).</summary>
    public static IReadOnlyList<LenhInfo> LenhCua(BuocQuyTrinh buoc) =>
        LenhCatalog.TatCa
            .Where(l => l.Buoc == buoc)
            .OrderBy(l => l.ThuTuTrongBuoc)
            .ToList();
}
