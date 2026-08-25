namespace XBoss.Cad.Core.Ui;

/// <summary>Nhóm lệnh — mỗi nhóm là 1 panel trên Ribbon tab "XBoss" (M102).</summary>
public enum NhomLenh
{
    KetNoi,
    ChuanHoa,
    BocKhoiLuong,
    VeShopDrawing,
    BangDieuKhien,
}

/// <summary>
/// Một lệnh XBOSS_* dưới góc nhìn UI: tên lệnh gõ được, nhãn nút tiếng Việt, tooltip.
/// <paramref name="LenhChinh"/> = nút to trên Ribbon (các nút còn lại trong nhóm là nút nhỏ).
/// </summary>
public sealed record LenhInfo(
    string Ten,
    string Nhan,
    string MoTa,
    NhomLenh Nhom,
    bool LenhChinh = false,
    bool CanRulePack = false);

/// <summary>
/// Danh mục lệnh XBOSS_* — NGUỒN SỰ THẬT DUY NHẤT cho Ribbon, bảng điều khiển và trợ giúp
/// (M102). Test <c>LenhCatalogTests</c> đối chiếu danh mục này với mọi <c>[CommandMethod]</c>
/// trong mã Adapter: thêm/xóa lệnh mà quên cập nhật ở đây là CI đỏ.
/// </summary>
public static class LenhCatalog
{
    public static string TenNhom(NhomLenh nhom) => nhom switch
    {
        NhomLenh.KetNoi => "Kết nối",
        NhomLenh.ChuanHoa => "Chuẩn hóa",
        NhomLenh.BocKhoiLuong => "Bóc khối lượng",
        NhomLenh.VeShopDrawing => "Vẽ shop drawing",
        NhomLenh.BangDieuKhien => "Bảng điều khiển",
        _ => nhom.ToString(),
    };

    /// <summary>Tiêu đề tab trên Ribbon.</summary>
    public const string TenTab = "XBoss";

    /// <summary>Id tab — cố định để không đăng ký trùng khi plugin nạp lại.</summary>
    public const string IdTab = "XBOSS_RIBBON_TAB";

    public static readonly IReadOnlyList<LenhInfo> TatCa =
    [
        // ── Kết nối ──
        new("XBOSS_LOGIN", "Đăng nhập",
            "Ghép thiết bị với server XBoss (mã duyệt trên web) rồi tải rule pack + thư viện block mới nhất.",
            NhomLenh.KetNoi, LenhChinh: true),
        new("XBOSS_RULEPACK", "Nạp rule pack",
            "Nạp tệp rule pack JSON tải tay từ trang /engineering/chuan-hoa-ban-ve (khi chưa ghép thiết bị).",
            NhomLenh.KetNoi),
        new("XBOSS_UPLOAD", "Upload hồ sơ",
            "Đẩy bản vẽ đã chuẩn hóa + báo cáo JSON lên server XBoss (cần đăng nhập).",
            NhomLenh.KetNoi),

        // ── Chuẩn hóa ──
        new("XBOSS_KIEMTRA", "Kiểm tra",
            "Chỉ kiểm, không sửa: rà bản vẽ theo rule pack, khoanh tròn vị trí lệch chuẩn + báo cáo JSON.",
            NhomLenh.ChuanHoa, LenhChinh: true, CanRulePack: true),
        new("XBOSS_CHUANHOA", "Chuẩn hóa",
            "Xem trước diff rồi sửa bản vẽ theo rule pack (layer/style/xref/hatch/layout) — 1 lần UNDO hoàn tác tất cả.",
            NhomLenh.ChuanHoa, CanRulePack: true),
        new("XBOSS_BATCH", "Chạy hàng loạt",
            "Kiểm tra/chuẩn hóa cả thư mục bản vẽ, xuất báo cáo từng tệp.",
            NhomLenh.ChuanHoa, CanRulePack: true),

        // ── Bóc khối lượng ──
        new("XBOSS_BOCKL", "Bóc khối lượng",
            "Đo chiều dài/diện tích/đếm block theo rule pack, hỗ trợ bóc theo size + theo vùng; chống bóc trùng bằng XData.",
            NhomLenh.BocKhoiLuong, LenhChinh: true, CanRulePack: true),
        new("XBOSS_BOCKL_XOA", "Xóa dấu bóc",
            "Gỡ XData + tô màu của các đối tượng đã bóc để bóc lại từ đầu.",
            NhomLenh.BocKhoiLuong, CanRulePack: true),
        new("XBOSS_BOCKL_XUAT", "Xuất Excel BOQ",
            "Xuất khối lượng đã bóc ra Excel đúng mẫu công ty, kèm sheet đối chiếu BOQ hợp đồng (tùy chọn).",
            NhomLenh.BocKhoiLuong, CanRulePack: true),

        // ── Vẽ shop drawing (M100 — 14 lệnh) ──
        new("XBOSS_VE_NEN", "Chuẩn bị nền",
            "Dựng đủ layer/style theo rule pack để bắt đầu vẽ shop drawing.",
            NhomLenh.VeShopDrawing, CanRulePack: true),
        new("XBOSS_VE", "Vẽ tuyến",
            "Vẽ tuyến ống/ống gió đúng chuẩn ngay từ đầu: layer + size XData + nét biên tự động.",
            NhomLenh.VeShopDrawing, LenhChinh: true, CanRulePack: true),
        new("XBOSS_VE_NHAN", "Nhãn size",
            "Sinh nhãn size liên kết XData cho các tuyến đã vẽ.",
            NhomLenh.VeShopDrawing, CanRulePack: true),
        new("XBOSS_VE_DOI", "Đổi size/hệ",
            "Đổi size hoặc hệ của tuyến đã vẽ — layer/XData/nhãn cập nhật theo.",
            NhomLenh.VeShopDrawing, CanRulePack: true),
        new("XBOSS_VE_PHUKIEN", "Phụ kiện",
            "Đặt block phụ kiện (co/tê/van…) từ thư viện, tự khớp size với tuyến.",
            NhomLenh.VeShopDrawing, CanRulePack: true),
        new("XBOSS_VE_THIETBI", "Thiết bị",
            "Đặt block thiết bị (FCU/AHU/quạt…) từ thư viện có version.",
            NhomLenh.VeShopDrawing, CanRulePack: true),
        new("XBOSS_VE_THUVIEN", "Thư viện block",
            "Tải/đồng bộ thư viện block từ server hoặc nhập từ tệp manifest + DWG.",
            NhomLenh.VeShopDrawing, CanRulePack: true),
        new("XBOSS_VE_DEXUAT", "Đề xuất block",
            "Gửi một block trong bản vẽ lên hàng chờ duyệt để thêm vào thư viện chuẩn (Admin/PM duyệt trên web).",
            NhomLenh.VeShopDrawing, CanRulePack: true),
        new("XBOSS_VE_GIADO", "Giá đỡ",
            "Rải giá đỡ tự động dọc tuyến theo khoảng cách rule pack.",
            NhomLenh.VeShopDrawing, CanRulePack: true),
        new("XBOSS_VE_LOCHO", "Lỗ chờ/sleeve",
            "Đặt lỗ chờ/sleeve tại giao tuyến với tường/dầm + bảng thống kê lỗ chờ.",
            NhomLenh.VeShopDrawing, CanRulePack: true),
        new("XBOSS_VE_TAG", "Đánh tag",
            "Đánh tag tuần tự cho tuyến/thiết bị theo hệ.",
            NhomLenh.VeShopDrawing, CanRulePack: true),
        new("XBOSS_VE_THONGKE", "Bảng thống kê",
            "Dựng bảng thống kê khối lượng/thiết bị ngay trong bản vẽ.",
            NhomLenh.VeShopDrawing, CanRulePack: true),
        new("XBOSS_VE_MATCAT", "Mặt cắt",
            "Dựng mặt cắt bán tự động từ tuyến cắt (cao độ nhập tay — bản vẽ 2D không chứa cao độ thật).",
            NhomLenh.VeShopDrawing, CanRulePack: true),
        new("XBOSS_VE_TRANGIN", "Trang in",
            "Dựng layout trang in + khung tên theo rule pack.",
            NhomLenh.VeShopDrawing, CanRulePack: true),
        new("XBOSS_VE_BAOCAO", "Báo cáo phiên vẽ",
            "Chỉ đọc: tổng hợp số tuyến/block theo hệ + size ngoài danh mục, ghi JSON cạnh DWG.",
            NhomLenh.VeShopDrawing, CanRulePack: true),

        // ── Bảng điều khiển (M102) ──
        new("XBOSS_BANG", "Bảng điều khiển",
            "Bật/tắt bảng điều khiển XBoss: trạng thái đăng nhập, rule pack, kết quả kiểm tra/bóc tách/vẽ gần nhất.",
            NhomLenh.BangDieuKhien, LenhChinh: true),
    ];

    /// <summary>Các nhóm theo thứ tự hiện trên Ribbon.</summary>
    public static IEnumerable<IGrouping<NhomLenh, LenhInfo>> TheoNhom() =>
        TatCa.GroupBy(l => l.Nhom);
}
