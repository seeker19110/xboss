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
///
/// <paramref name="Buoc"/> + <paramref name="ThuTuTrongBuoc"/> (M106 FR10) xếp lệnh vào quy trình
/// chuẩn 6 giai đoạn (<see cref="QuyTrinh"/>) — cố ý KHÔNG có giá trị mặc định: thêm lệnh mới mà
/// quên xếp bước thì không biên dịch nổi, không cần trông chờ ai nhớ.
/// <paramref name="Nhom"/> (panel Ribbon, gom theo kỹ thuật) và <paramref name="Buoc"/> (trình tự
/// dùng thật) là hai trục KHÁC nhau: <c>XBOSS_UPLOAD</c> nằm panel "Kết nối" nhưng thuộc bước 6.
/// </summary>
public sealed record LenhInfo(
    string Ten,
    string Nhan,
    string MoTa,
    NhomLenh Nhom,
    BuocQuyTrinh Buoc,
    int ThuTuTrongBuoc,
    bool LenhChinh = false,
    bool CanRulePack = false);

/// <summary>
/// Danh mục lệnh XBOSS_* — NGUỒN SỰ THẬT DUY NHẤT cho Ribbon, bảng điều khiển, trình dẫn quy
/// trình (M106) và trợ giúp. Test <c>LenhCatalogTests</c> đối chiếu danh mục này với mọi
/// <c>[CommandMethod]</c> trong mã Adapter: thêm/xóa lệnh mà quên cập nhật ở đây là CI đỏ;
/// <c>QuyTrinhTests</c> canh mỗi lệnh được xếp đúng một chỗ trong 6 giai đoạn (M106 FR10).
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
            NhomLenh.KetNoi, BuocQuyTrinh.KetNoi, 1, LenhChinh: true),
        new("XBOSS_RULEPACK", "Nạp rule pack",
            "Nạp tệp rule pack JSON tải tay từ trang /engineering/chuan-hoa-ban-ve (khi chưa ghép thiết bị).",
            NhomLenh.KetNoi, BuocQuyTrinh.KetNoi, 2),
        new("XBOSS_UPLOAD", "Upload hồ sơ",
            "Đẩy bản vẽ đã chuẩn hóa + báo cáo JSON lên server XBoss (cần đăng nhập).",
            NhomLenh.KetNoi, BuocQuyTrinh.BocVaNop, 3),

        // ── Chuẩn hóa ──
        new("XBOSS_KIEMTRA", "Kiểm tra",
            "Chỉ kiểm, không sửa: rà bản vẽ theo rule pack, khoanh tròn vị trí lệch chuẩn + báo cáo JSON.",
            NhomLenh.ChuanHoa, BuocQuyTrinh.ChuanHoaNen, 1, LenhChinh: true, CanRulePack: true),
        new("XBOSS_CHUANHOA", "Chuẩn hóa",
            "Xem trước diff rồi sửa bản vẽ theo rule pack (layer/style/xref/hatch/layout) — 1 lần UNDO hoàn tác tất cả.",
            NhomLenh.ChuanHoa, BuocQuyTrinh.ChuanHoaNen, 2, CanRulePack: true),
        new("XBOSS_BATCH", "Chạy hàng loạt",
            "Kiểm tra/chuẩn hóa cả thư mục bản vẽ, xuất báo cáo từng tệp.",
            NhomLenh.ChuanHoa, BuocQuyTrinh.ChuanHoaNen, 3, CanRulePack: true),

        // ── Bóc khối lượng ──
        new("XBOSS_BOCKL", "Bóc khối lượng",
            "Đo chiều dài/diện tích/đếm block theo rule pack, hỗ trợ bóc theo size + theo vùng; chống bóc trùng bằng XData.",
            NhomLenh.BocKhoiLuong, BuocQuyTrinh.BocVaNop, 1, LenhChinh: true, CanRulePack: true),
        new("XBOSS_BOCKL_XOA", "Xóa dấu bóc",
            "Gỡ XData + tô màu của các đối tượng đã bóc để bóc lại từ đầu.",
            NhomLenh.BocKhoiLuong, BuocQuyTrinh.PhuTro, 1, CanRulePack: true),
        new("XBOSS_BOCKL_XUAT", "Xuất Excel BOQ",
            "Xuất khối lượng đã bóc ra Excel đúng mẫu công ty, kèm sheet đối chiếu BOQ hợp đồng (tùy chọn).",
            NhomLenh.BocKhoiLuong, BuocQuyTrinh.BocVaNop, 2, CanRulePack: true),

        // ── Vẽ shop drawing (M100 — 15 lệnh + M105 chia đốt + M107 nhận tuyến có sẵn
        //    + M109 ngắt nét giao chéo + M114 hành lang) ──
        // XBOSS_VE_HANHLANG nằm panel "Vẽ shop drawing" (kỹ thuật: cùng bộ lệnh vẽ) nhưng thuộc
        // BƯỚC 2 chuẩn bị nền (M114 FR16) — chuẩn bị hành lang xong mới đi tuyến được.
        new("XBOSS_VE_HANHLANG", "Hành lang",
            "Khai hành lang đi ống cho đi tuyến tự động: vẽ mới hoặc NHẬN polyline có sẵn (giữ nguyên " +
            "từng đỉnh), kèm bề rộng khả dụng, cao độ đáy dầm/trần và hệ được phép đi qua; sửa/xóa được.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.ChuanHoaNen, 4, CanRulePack: true),
        new("XBOSS_VE_NEN", "Chuẩn bị nền",
            "Dựng đủ layer/style theo rule pack để bắt đầu vẽ shop drawing.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.VeShopDrawing, 1, CanRulePack: true),
        new("XBOSS_VE", "Vẽ tuyến",
            "Vẽ tuyến ống/ống gió đúng chuẩn ngay từ đầu: layer + size XData + nét biên tự động.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.VeShopDrawing, 2, LenhChinh: true, CanRulePack: true),
        new("XBOSS_VE_NHANTUYEN", "Nhận tuyến có sẵn",
            "Khai hệ/loại/cỡ cho tuyến của bản thiết kế người khác: đổi layer chuẩn + gắn dữ liệu XBoss + " +
            "sinh nét biên, hình học tim giữ nguyên — dùng được ngay mọi lệnh XBoss.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.VeShopDrawing, 3, CanRulePack: true),
        new("XBOSS_VE_NHAN", "Nhãn size",
            "Sinh nhãn size liên kết XData cho các tuyến đã vẽ.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.VeShopDrawing, 4, CanRulePack: true),
        new("XBOSS_VE_DOI", "Đổi size/hệ",
            "Đổi size hoặc hệ của tuyến đã vẽ — layer/XData/nhãn cập nhật theo.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.VeShopDrawing, 8, CanRulePack: true),
        new("XBOSS_VE_PHUKIEN", "Phụ kiện",
            "Đặt block phụ kiện (co/tê/van…) từ thư viện, tự khớp size với tuyến.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.VeShopDrawing, 5, CanRulePack: true),
        new("XBOSS_VE_THIETBI", "Thiết bị",
            "Đặt block thiết bị (FCU/AHU/quạt…) từ thư viện có version.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.VeShopDrawing, 6, CanRulePack: true),
        new("XBOSS_VE_NHANTANG", "Nhân bản tầng",
            "Chép hệ của tầng điển hình sang N tầng khác kèm ánh xạ lại toàn bộ liên kết dữ liệu và " +
            "đổi tag theo tầng — có bảng xem trước bắt buộc, một lần UNDO hoàn tác cả N tầng.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.VeShopDrawing, 7, CanRulePack: true),
        new("XBOSS_VE_THUVIEN", "Thư viện block",
            "Tải/đồng bộ thư viện block từ server hoặc nhập từ tệp manifest + DWG.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.PhuTro, 2, CanRulePack: true),
        new("XBOSS_VE_DEXUAT", "Đề xuất block",
            "Gửi một block trong bản vẽ lên hàng chờ duyệt để thêm vào thư viện chuẩn (Admin/PM duyệt trên web).",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.PhuTro, 3, CanRulePack: true),
        new("XBOSS_VE_DEXUAT_LO", "Nạp block hàng loạt",
            "Gửi MỌI block của bản vẽ (tệp thư viện tổng hợp) lên hàng chờ; máy chủ tự đề xuất phân loại, Admin/PM duyệt theo lô trên web.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.PhuTro, 4, CanRulePack: true),
        new("XBOSS_VE_CHIADOT", "Chia đốt",
            "Chia tuyến đã vẽ thành đốt chế tạo theo kiểu nối của rule pack: vạch chia + tag đốt trên layer riêng.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.ChiTietCheTao, 1, CanRulePack: true),
        new("XBOSS_VE_GIADO", "Giá đỡ",
            "Rải giá đỡ tự động dọc tuyến theo khoảng cách rule pack.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.ChiTietCheTao, 2, CanRulePack: true),
        new("XBOSS_VE_LOCHO", "Lỗ chờ/sleeve",
            "Đặt lỗ chờ/sleeve tại giao tuyến với tường/dầm + bảng thống kê lỗ chờ.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.ChiTietCheTao, 3, CanRulePack: true),
        new("XBOSS_VE_TAG", "Đánh tag",
            "Đánh tag tuần tự cho tuyến/thiết bị theo hệ.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.ChiTietCheTao, 4, CanRulePack: true),
        new("XBOSS_VE_THONGKE", "Bảng thống kê",
            "Dựng bảng thống kê khối lượng/thiết bị ngay trong bản vẽ.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.HoSoBanVe, 2, CanRulePack: true),
        new("XBOSS_VE_MATCAT", "Mặt cắt",
            "Dựng mặt cắt bán tự động từ tuyến cắt (cao độ nhập tay — bản vẽ 2D không chứa cao độ thật).",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.HoSoBanVe, 1, CanRulePack: true),
        new("XBOSS_VE_NGATNET", "Ngắt nét giao chéo",
            "Ngắt nét tuyến ĐI DƯỚI tại chỗ giao theo hạng ưu tiên hệ của rule pack (đảo tay được từng " +
            "cặp): vùng che cho tuyến 2 nét biên, cầu vượt cho tuyến đơn nét. Tim giữ nguyên từng đỉnh.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.HoSoBanVe, 3, CanRulePack: true),
        new("XBOSS_VE_TRANGIN", "Trang in",
            "Dựng layout trang in + khung tên theo rule pack.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.HoSoBanVe, 4, CanRulePack: true),
        new("XBOSS_VE_REV", "Khoanh revision",
            "Khoanh revision cloud + tam giác số revision cho các vùng đã sửa; đề xuất sẵn vùng cần " +
            "khoanh bằng cách so với mốc của lần chốt revision trước.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.HoSoBanVe, 5, CanRulePack: true),
        new("XBOSS_VE_REV_CHOT", "Chốt revision",
            "Chốt một revision: ghi ngày/nội dung/người vào bảng revision khung tên của mọi layout, " +
            "lưu mốc so sánh cho lần sửa sau, cảnh báo vùng đã đổi mà chưa khoanh.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.HoSoBanVe, 6, CanRulePack: true),
        new("XBOSS_VE_REV_HIENTHI", "Hiện/ẩn revision",
            "Bật/tắt hiển thị cloud theo từng revision (mỗi revision một layer con) — bản in nộp " +
            "thường chỉ khoanh lần sửa mới nhất, cloud cũ vẫn tra ngược được.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.HoSoBanVe, 7, CanRulePack: true),
        new("XBOSS_VE_BAOCAO", "Báo cáo phiên vẽ",
            "Chỉ đọc: tổng hợp số tuyến/block theo hệ + size ngoài danh mục, ghi JSON cạnh DWG.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.HoSoBanVe, 8, CanRulePack: true),
        new("XBOSS_VE_NGATNET_XOA", "Xóa ngắt nét",
            "Gỡ sạch đối tượng ngắt nét giao chéo (vùng che + cầu vượt) trong vùng chọn hoặc cả bản vẽ, " +
            "trả bản vẽ về trước khi chạy XBOSS_VE_NGATNET.",
            NhomLenh.VeShopDrawing, BuocQuyTrinh.PhuTro, 6, CanRulePack: true),

        // ── Bảng điều khiển (M102) ──
        new("XBOSS_BANG", "Bảng điều khiển",
            "Bật/tắt bảng XBoss: tab Quy trình (6 giai đoạn — đang ở bước nào, tiếp theo làm gì) " +
            "và tab Trạng thái (đăng nhập, rule pack, kết quả kiểm tra/bóc tách/vẽ gần nhất).",
            NhomLenh.BangDieuKhien, BuocQuyTrinh.PhuTro, 5, LenhChinh: true),
    ];

    /// <summary>Các nhóm theo thứ tự hiện trên Ribbon.</summary>
    public static IEnumerable<IGrouping<NhomLenh, LenhInfo>> TheoNhom() =>
        TatCa.GroupBy(l => l.Nhom);
}
