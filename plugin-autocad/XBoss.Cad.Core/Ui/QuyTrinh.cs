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
/// Trạng thái một bước trong trình dẫn quy trình (M106 FR7). Hàm SUY trạng thái từ token/rule
/// pack/sidecar/XData là <see cref="QuyTrinh.TinhTrang"/> ngay trong tệp này (PR2 — FR8): mọi điều
/// kiện nằm một chỗ, có test — không rải trong UI.
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

/// <summary>
/// Dấu hiệu của phiên làm việc + bản vẽ hiện hành, ĐÃ ĐỌC SẴN, để suy trạng thái 6 giai đoạn
/// (M106 FR8). Cố ý là dữ liệu THUẦN: Core không mở <c>Database</c>, không đọc tệp — Adapter đọc
/// (token, rule pack, sidecar cạnh DWG, XData trên bản vẽ) rồi truyền vào. Nhờ vậy toàn bộ quy
/// tắc "bước nào xong / vì sao chưa vào được" test được trên CI Linux, và UI không có nhánh điều
/// kiện nào của riêng nó.
///
/// Mặc định mọi trường = false/null nghĩa là "chưa có dấu hiệu nào" — trạng thái của một phiên
/// vừa mở AutoCAD, chưa đăng nhập, chưa mở bản vẽ.
/// </summary>
public sealed record DauHieuQuyTrinh
{
    // ===== Bước 1 — Kết nối =====

    /// <summary>Đã ghép thiết bị: có token trong Credential Manager cho server đang cấu hình.</summary>
    public bool CoTokenThietBi { get; init; }

    /// <summary>Rule pack nạp được (không phải "có tệp" — tệp hỏng vẫn tính là chưa nạp).</summary>
    public bool CoRulePack { get; init; }

    // ===== Bản vẽ hiện hành =====

    /// <summary>
    /// Có bản vẽ đang mở VÀ đã lưu ra tệp. Mọi dấu hiệu của bước 2..6 đều đọc từ bản vẽ/sidecar
    /// cạnh nó, nên chưa có bản vẽ thì các bước đó là <see cref="TrangThaiBuoc.KhongApDung"/>
    /// chứ không phải "chưa làm" — nói "chưa làm" là đổ lỗi cho kỹ sư về việc họ chưa thể làm.
    /// </summary>
    public bool CoBanVe { get; init; }

    // ===== Bước 2 — Chuẩn hóa nền =====

    /// <summary>
    /// Số lỗi trong sidecar <c>.xboss-kiemtra.json</c> cạnh DWG; <c>null</c> = chưa có sidecar
    /// hoặc không đọc được (chưa chứng minh được nền sạch → chưa tính là xong).
    /// </summary>
    public int? SoLoiKiemTra { get; init; }

    // ===== Bước 3 — Vẽ shop drawing =====

    /// <summary>Bản vẽ có tuyến tim mang XData <c>XBOSS_VE</c> (vai trò <c>Tim</c>).</summary>
    public bool CoTuyen { get; init; }

    // ===== Bước 4 — Chi tiết chế tạo =====

    /// <summary>Có vạch/tag chia đốt, hoặc tuyến đã mang tóm tắt kiểu nối (M105).</summary>
    public bool CoChiaDot { get; init; }

    /// <summary>Có block giá đỡ do <c>XBOSS_VE_GIADO</c> rải.</summary>
    public bool CoGiaDo { get; init; }

    /// <summary>Có khối mang thẻ <c>TAG</c> đã điền (<c>XBOSS_VE_TAG</c>).</summary>
    public bool CoTag { get; init; }

    // ===== Bước 5 — Hồ sơ bản vẽ =====

    /// <summary>Có bảng thống kê do <c>XBOSS_VE_THONGKE</c> sinh (XData vai trò <c>BangThongKe</c>).</summary>
    public bool CoBangThongKe { get; init; }

    /// <summary>Có layout trang in đặt theo mẫu tên của rule pack (<c>XBOSS_VE_TRANGIN</c>).</summary>
    public bool CoTrangIn { get; init; }

    // ===== Bước 6 — Bóc & nộp =====

    /// <summary>Có đối tượng mang dấu bóc (XData appname takeoff của rule pack).</summary>
    public bool CoDauBoc { get; init; }

    /// <summary>Có sidecar <c>.xboss-takeoff.json</c> cạnh DWG (<c>XBOSS_BOCKL_XUAT</c> ghi ra).</summary>
    public bool CoSidecarBocKl { get; init; }
}

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

    // ===== Suy trạng thái từng bước (M106 FR8) =====
    //
    // Lý do dưới đây là lý do CHƯA ĐỦ ĐIỀU KIỆN VÀO BƯỚC (cột "Điều kiện vào bước" của §6) — trình
    // dẫn làm mờ nút và hiện nguyên văn câu này, NHƯNG vẫn cho bấm: §6 chốt "đây là hướng dẫn,
    // không phải cổng chặn" (có ca hợp lệ: mở lại bản vẽ đã chuẩn hóa từ phiên trước). Chặn cứng
    // là việc của bản thân từng lệnh.

    private const string LyDoChuaRulePack =
        "Chưa nạp rule pack — chạy XBOSS_LOGIN hoặc XBOSS_RULEPACK trước.";

    private const string LyDoChuaCoBanVe =
        "Chưa mở bản vẽ nào (hoặc bản vẽ chưa lưu ra tệp) — các bước sau bước 1 đều đọc từ bản vẽ.";

    private const string LyDoNenChuaSach =
        "Nền chưa kiểm tra sạch lỗi — chạy XBOSS_KIEMTRA (và XBOSS_CHUANHOA nếu còn lỗi) trước.";

    private const string LyDoChuaCoTuyen =
        "Bản vẽ chưa có tuyến nào — vẽ bằng XBOSS_VE trước.";

    private const string LyDoPhuTro =
        "Lệnh phụ trợ — dùng khi cần, không nằm trong dòng chảy 6 bước.";

    /// <summary>
    /// Tình trạng của 6 giai đoạn, ĐÚNG thứ tự §6 — thứ trình dẫn vẽ ra (M106 FR7/FR8/AC5).
    /// </summary>
    public static IReadOnlyList<TinhTrangBuoc> TinhTrangTatCa(DauHieuQuyTrinh dauHieu) =>
        CacGiaiDoan.Select(g => TinhTrang(g.Buoc, dauHieu)).ToList();

    /// <summary>
    /// Suy trạng thái một bước từ dấu hiệu đã đọc sẵn (M106 FR8) — TOÀN BỘ quy tắc của trình dẫn
    /// nằm ở đây.
    ///
    /// Dấu hiệu "đã xong" bám đúng cột cuối bảng §6 và đều là thứ SỐNG TRONG BẢN VẼ/tệp cạnh nó
    /// (XData, sidecar), không phải trạng thái phiên: mở lại bản vẽ đã làm dở từ hôm trước thì
    /// trình dẫn vẫn nhận đúng các bước đã xong, không bắt làm lại từ đầu.
    /// </summary>
    public static TinhTrangBuoc TinhTrang(BuocQuyTrinh buoc, DauHieuQuyTrinh dauHieu)
    {
        if (buoc == BuocQuyTrinh.PhuTro)
            return new(buoc, TrangThaiBuoc.KhongApDung, LyDoPhuTro);

        // Bước 1 là bước duy nhất không đọc gì từ bản vẽ — luôn vào được, không có lý do làm mờ.
        if (buoc == BuocQuyTrinh.KetNoi)
            return new(
                buoc,
                dauHieu is { CoTokenThietBi: true, CoRulePack: true } ? TrangThaiBuoc.Xong : TrangThaiBuoc.Chua);

        if (!dauHieu.CoBanVe)
            return new(buoc, TrangThaiBuoc.KhongApDung, LyDoChuaCoBanVe);

        // "Nền sạch" = sidecar kiểm tra gần nhất báo 0 lỗi. Chưa có sidecar (null) KHÔNG tính là
        // sạch: chưa ai kiểm thì chưa biết, và đoán rộng tay ở đây là dẫn kỹ sư đi tiếp trên nền lỗi.
        var nenSach = dauHieu.SoLoiKiemTra == 0;

        var lyDo = new List<string>();

        // Rule pack là điều kiện vào bước 2 theo §6; từ bước 3 trở đi mọi lệnh đều khai
        // CanRulePack nên thiếu rule pack cũng phải nói ra — không thì trình dẫn để kỹ sư bấm vào
        // một lệnh chắc chắn từ chối chạy mà không báo trước.
        if (!dauHieu.CoRulePack) lyDo.Add(LyDoChuaRulePack);

        bool xong;
        switch (buoc)
        {
            case BuocQuyTrinh.ChuanHoaNen:
                xong = nenSach;
                break;

            case BuocQuyTrinh.VeShopDrawing:
                if (!nenSach) lyDo.Add(LyDoNenChuaSach);
                xong = dauHieu.CoTuyen;
                break;

            case BuocQuyTrinh.ChiTietCheTao:
                if (!dauHieu.CoTuyen) lyDo.Add(LyDoChuaCoTuyen);
                // §6: "tuyến mang dấu chia đốt / giá đỡ / tag" — HOẶC, vì không phải bản vẽ nào
                // cũng cần cả ba (ống nước không chia đốt, ống gió không phải lúc nào cũng có tag).
                xong = dauHieu.CoChiaDot || dauHieu.CoGiaDo || dauHieu.CoTag;
                break;

            case BuocQuyTrinh.HoSoBanVe:
                if (!dauHieu.CoTuyen) lyDo.Add(LyDoChuaCoTuyen);
                // §6: "có layout trang in + bảng thống kê" — VÀ, thiếu một trong hai là hồ sơ chưa đủ.
                xong = dauHieu.CoTrangIn && dauHieu.CoBangThongKe;
                break;

            case BuocQuyTrinh.BocVaNop:
                if (!nenSach) lyDo.Add(LyDoNenChuaSach);
                // §6 còn tính "upload trả về revision", nhưng upload KHÔNG để lại dấu vết nào cạnh
                // DWG (server giữ revision) nên offline không suy được — dừng ở dấu hiệu bóc xong:
                // có dấu bóc trên bản vẽ VÀ sidecar -takeoff.json (XBOSS_BOCKL_XUAT đã chạy).
                xong = dauHieu.CoDauBoc && dauHieu.CoSidecarBocKl;
                break;

            default:
                throw new ArgumentOutOfRangeException(
                    nameof(buoc), buoc, "Bước lạ — thêm giai đoạn mới phải khai luật suy trạng thái ở đây.");
        }

        return new(
            buoc,
            xong ? TrangThaiBuoc.Xong : TrangThaiBuoc.Chua,
            lyDo.Count == 0 ? null : string.Join(" ", lyDo));
    }
}
