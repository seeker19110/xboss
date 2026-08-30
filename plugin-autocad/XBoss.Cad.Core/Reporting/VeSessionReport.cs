using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Reporting;

/// <summary>Đầu trang báo cáo phiên vẽ — phần dữ liệu Adapter biết mà XData không chứa.</summary>
public sealed record VeSessionMeta
{
    public required string RulePackVersion { get; init; }
    public required string TenBanVe { get; init; }
    public required string NgayIso { get; init; }
    public string NguoiVe { get; init; } = "";
    /// <summary>Version thư viện block đang dùng trên máy; null = máy chưa có thư viện.</summary>
    public string? ThuVienVersion { get; init; }
}

/// <summary>Thống kê một hệ: bao nhiêu tuyến, bao nhiêu block từng loại (M100 §14).</summary>
public sealed record VeThongKeHe
{
    [JsonPropertyName("heId")] public required string HeId { get; init; }
    [JsonPropertyName("soTuyen")] public int SoTuyen { get; init; }
    [JsonPropertyName("soNetBien")] public int SoNetBien { get; init; }
    [JsonPropertyName("soNhan")] public int SoNhan { get; init; }
    [JsonPropertyName("soPhuKien")] public int SoPhuKien { get; init; }
    [JsonPropertyName("soThietBi")] public int SoThietBi { get; init; }
    [JsonPropertyName("soGiaDo")] public int SoGiaDo { get; init; }
    [JsonPropertyName("soLoCho")] public int SoLoCho { get; init; }
    [JsonPropertyName("soMatCat")] public int SoMatCat { get; init; }

    /// <summary>Số vạch chia đốt đã vẽ (<c>XBOSS_VE_CHIADOT</c> — M105).</summary>
    [JsonPropertyName("soVachChia")] public int SoVachChia { get; init; }

    /// <summary>Số tag đốt đã ghi (M105).</summary>
    [JsonPropertyName("soNhanDot")] public int SoNhanDot { get; init; }

    /// <summary>
    /// Số đối tượng ngắt nét giao chéo (<c>XBOSS_VE_NGATNET</c> — M109) mà hệ này là hệ ĐI DƯỚI:
    /// vùng che + cung cầu vượt. Hệ đi TRÊN không đếm ở đây vì nó vẽ liền mạch, không sinh gì.
    /// </summary>
    [JsonPropertyName("soNgatNet")] public int SoNgatNet { get; init; }

    /// <summary>Tổng số block đã chèn của hệ (phụ kiện + thiết bị + giá đỡ + lỗ chờ).</summary>
    [JsonPropertyName("soBlock")]
    public int SoBlock => SoPhuKien + SoThietBi + SoGiaDo + SoLoCho;
}

/// <summary>
/// Một cụm tuyến ĐÃ chia đốt, gộp theo (hệ, loại tuyến, cỡ, kiểu nối) — M105 §14.
/// Đọc từ dấu chia đốt trên XData tim nên mở lại bản vẽ lúc nào cũng dựng lại được.
/// </summary>
public sealed record VeChiaDotTuyen
{
    [JsonPropertyName("heId")] public required string HeId { get; init; }
    [JsonPropertyName("itemId")] public required string ItemId { get; init; }
    [JsonPropertyName("size")] public required string Size { get; init; }
    [JsonPropertyName("kieuNoi")] public required string KieuNoi { get; init; }
    /// <summary>Kỹ sư ghi đè kiểu nối tự chọn (FR1) — phải soát lại khi nghiệm thu bản vẽ.</summary>
    [JsonPropertyName("ghiDe")] public bool GhiDe { get; init; }
    [JsonPropertyName("soTuyen")] public required int SoTuyen { get; init; }
    [JsonPropertyName("soDot")] public required int SoDot { get; init; }
    [JsonPropertyName("soMoi")] public required int SoMoi { get; init; }
    [JsonPropertyName("tongDaiMm")] public required double TongDaiMm { get; init; }
}

/// <summary>
/// Một cụm tuyến CHƯA chia đốt (tim không mang dấu chia đốt) — hoặc chưa chạy
/// <c>XBOSS_VE_CHIADOT</c>, hoặc rule pack không khai <c>jointRules</c> cho loại tuyến đó nên lệnh
/// đã BỎ QUA (M105 AC10 — không đoán mặc định). Lý do cụ thể của từng lần bỏ qua nằm trong
/// <see cref="VeSessionReport.NhatKy"/> của phiên vừa chạy lệnh.
/// </summary>
public sealed record VeChiaDotBoQua
{
    [JsonPropertyName("heId")] public required string HeId { get; init; }
    [JsonPropertyName("itemId")] public required string ItemId { get; init; }
    [JsonPropertyName("size")] public required string Size { get; init; }
    [JsonPropertyName("soTuyen")] public required int SoTuyen { get; init; }
}

/// <summary>
/// Một revision đã khoanh cloud trong bản vẽ (M110) — mỗi vùng khoanh gồm 1 cloud + 1 tam giác,
/// nên <see cref="SoDoiTuong"/> của một revision lành lặn luôn là số chẵn (lẻ = có mồ côi, phép
/// kiểm 20 của XBOSS_KIEMTRA nói rõ đối tượng nào).
/// </summary>
public sealed record VeRevisionCum
{
    [JsonPropertyName("so")] public required int So { get; init; }
    [JsonPropertyName("soDoiTuong")] public required int SoDoiTuong { get; init; }
}

/// <summary>
/// Một cụm đối tượng NGẮT NÉT GIAO CHÉO (M109 FR9), gộp theo tuyến ĐI DƯỚI (hệ + loại tuyến + cỡ).
/// Đọc từ XData vai trò <c>NgatNet</c> đang sống trong bản vẽ nên mở lại bản vẽ lúc nào cũng dựng
/// lại được — khác các con số "bỏ qua theo lý do" vốn là chuyện của LẦN CHẠY lệnh và nằm trong
/// <see cref="VeSessionReport.NhatKy"/>.
/// </summary>
public sealed record VeNgatNetCum
{
    /// <summary>Hệ của tuyến ĐI DƯỚI (tuyến bị ngắt nét).</summary>
    [JsonPropertyName("heId")] public required string HeId { get; init; }
    [JsonPropertyName("itemId")] public required string ItemId { get; init; }
    [JsonPropertyName("size")] public required string Size { get; init; }
    /// <summary>Số đối tượng ngắt nét (vùng che + cung cầu vượt) của cụm.</summary>
    [JsonPropertyName("soDoiTuong")] public required int SoDoiTuong { get; init; }
    /// <summary>Trong đó bao nhiêu đối tượng mang dấu ĐẢO TAY của kỹ sư (FR7 — phải soát lại).</summary>
    [JsonPropertyName("soDaoTay")] public required int SoDaoTay { get; init; }
}

/// <summary>Một size kỹ sư tự nhập ngoài danh mục rule pack (M100 §4 — phải soát lại).</summary>
public sealed record VeSizeCustom
{
    [JsonPropertyName("heId")] public required string HeId { get; init; }
    [JsonPropertyName("itemId")] public required string ItemId { get; init; }
    [JsonPropertyName("size")] public required string Size { get; init; }
    [JsonPropertyName("soTuyen")] public required int SoTuyen { get; init; }
}

/// <summary>
/// Một cụm bản chép do <c>XBOSS_VE_NHANTANG</c> sinh ra (M111 FR10), gộp theo cặp
/// (tầng nguồn → tầng chép). Đọc từ XData <c>TangNguon</c>/<c>NhanTang</c> của chính bản vẽ nên
/// mở lại bản vẽ ở máy khác vẫn dựng lại được — đúng nguyên tắc nguồn dữ liệu của báo cáo phiên vẽ.
/// Các con số của TỪNG LẦN CHẠY (handle bị gỡ, tag không đổi được) nằm ở <see cref="VeSessionReport.NhatKy"/>.
/// </summary>
public sealed record VeNhanTangCum
{
    [JsonPropertyName("tangNguon")] public required string TangNguon { get; init; }
    [JsonPropertyName("nhanTang")] public required string NhanTang { get; init; }
    [JsonPropertyName("soDoiTuong")] public required int SoDoiTuong { get; init; }
}

/// <summary>
/// Một cụm tuyến do <c>XBOSS_VE_TUYENTUDONG</c> sinh ra (M114 FR14), gộp theo (hệ, loại tuyến, cỡ).
/// Đọc từ XData <c>TuDong</c>/<c>SuaTay</c> đang sống trong bản vẽ nên mở lại bản vẽ ở máy khác vẫn
/// dựng lại được. Các con số của TỪNG LẦN CHẠY (tổng chiều dài, số co, tỉ lệ cạnh dùng chung, danh
/// sách không giải được theo lý do) nằm ở <see cref="VeSessionReport.NhatKy"/> — chúng là chuyện
/// của lần chạy, không phải trạng thái của bản vẽ.
/// </summary>
public sealed record VeTuyenTuDongCum
{
    [JsonPropertyName("heId")] public required string HeId { get; init; }
    [JsonPropertyName("itemId")] public required string ItemId { get; init; }
    [JsonPropertyName("size")] public required string Size { get; init; }
    /// <summary>Số nhánh (polyline tim) do lệnh sinh ra.</summary>
    [JsonPropertyName("soNhanh")] public required int SoNhanh { get; init; }
    /// <summary>Trong đó bao nhiêu nhánh mang dấu SỬA TAY — chạy lại luôn giữ nguyên (FR12).</summary>
    [JsonPropertyName("soSuaTay")] public required int SoSuaTay { get; init; }
    /// <summary>Số phiên chạy khác nhau còn dấu trong bản vẽ (mã phiên trên XData).</summary>
    [JsonPropertyName("soPhien")] public required int SoPhien { get; init; }
}

/// <summary>
/// Một giai đoạn của <c>XBOSS_HOANTHIEN</c> đã để lại dấu trong bản vẽ (M115 FR3/FR4). Đọc từ
/// XData <c>nguon=M115</c> + <c>giaiDoan</c> đang sống trên chính thực thể, nên mở lại bản vẽ ở máy
/// khác vẫn dựng lại được — đúng nguồn dữ liệu của báo cáo phiên vẽ.
/// </summary>
public sealed record VeHoanThienGiaiDoan
{
    /// <summary>Khóa giai đoạn (<c>netDoi</c>, <c>phuKienTaiNut</c>…).</summary>
    [JsonPropertyName("giaiDoan")] public required string GiaiDoan { get; init; }

    /// <summary>Nhãn tiếng Việt của giai đoạn; khóa lạ (rule pack sau) giữ nguyên chuỗi khóa.</summary>
    [JsonPropertyName("nhan")] public required string Nhan { get; init; }

    /// <summary>Số thực thể giai đoạn này đã sinh ra và còn sống trong bản vẽ.</summary>
    [JsonPropertyName("soThucThe")] public required int SoThucThe { get; init; }

    /// <summary>Số tuyến tim khác nhau mà giai đoạn này đã hoàn thiện.</summary>
    [JsonPropertyName("soTuyen")] public required int SoTuyen { get; init; }

    /// <summary>Trong đó bao nhiêu thực thể mang dấu SỬA TAY — chạy lại luôn giữ nguyên (FR4).</summary>
    [JsonPropertyName("soSuaTay")] public required int SoSuaTay { get; init; }
}

/// <summary>Số đối tượng mang một version rule pack/thư viện khác bản đang dùng.</summary>
public sealed record VeVersionKhac
{
    [JsonPropertyName("version")] public required string Version { get; init; }
    [JsonPropertyName("soDoiTuong")] public required int SoDoiTuong { get; init; }
}

/// <summary>
/// Báo cáo phiên vẽ (M100 §14) — JSON đặt cạnh DWG, cùng khung báo cáo M99
/// (<see cref="StandardizeReport"/> / <see cref="TakeoffJsonReport"/>): version rule pack ghi
/// trong MỌI báo cáo, bản tiếng Việt in ra dòng lệnh, bản JSON cho máy đọc.
///
/// Nguồn dữ liệu là XData <c>XBOSS_VE</c> đang SỐNG trong bản vẽ (không phải biến RAM của phiên):
/// đóng/mở lại bản vẽ, đổi máy vẫn xuất được đúng — trừ nhật ký đụng độ định nghĩa block
/// (<see cref="NhatKy"/>) vốn là sự kiện tương tác, chỉ có trong phiên AutoCAD hiện tại.
///
/// THUẦN — dựng nội dung ở Core, Adapter chỉ quét thực thể rồi ghi tệp (M100 FR11).
/// </summary>
public sealed class VeSessionReport
{
    [JsonPropertyName("rulePackVersion")] public required string RulePackVersion { get; init; }
    [JsonPropertyName("thuVienVersion")] public string? ThuVienVersion { get; init; }
    [JsonPropertyName("tenBanVe")] public required string TenBanVe { get; init; }
    [JsonPropertyName("ngayIso")] public required string NgayIso { get; init; }
    [JsonPropertyName("nguoiVe")] public string NguoiVe { get; init; } = "";
    [JsonPropertyName("heThong")] public required IReadOnlyList<VeThongKeHe> HeThong { get; init; }
    [JsonPropertyName("sizeCustom")] public required IReadOnlyList<VeSizeCustom> SizeCustom { get; init; }
    /// <summary>Mục chia đốt (M105): các cụm tuyến đã chia đốt trong bản vẽ.</summary>
    [JsonPropertyName("chiaDot")] public required IReadOnlyList<VeChiaDotTuyen> ChiaDot { get; init; }
    /// <summary>Mục chia đốt (M105): các cụm tuyến chưa/không chia được (xem <see cref="VeChiaDotBoQua"/>).</summary>
    [JsonPropertyName("chiaDotBoQua")] public required IReadOnlyList<VeChiaDotBoQua> ChiaDotBoQua { get; init; }
    /// <summary>Mục ngắt nét giao chéo (M109 FR9): các cụm đối tượng ngắt nét theo tuyến đi dưới.</summary>
    [JsonPropertyName("ngatNet")] public required IReadOnlyList<VeNgatNetCum> NgatNet { get; init; }
    /// <summary>Mục revision (M110): các revision đã khoanh cloud trong bản vẽ.</summary>
    [JsonPropertyName("revision")] public IReadOnlyList<VeRevisionCum> Revision { get; init; } = [];
    /// <summary>Định nghĩa block do plugin nhập từ thư viện (đánh dấu trong BlockTable).</summary>
    [JsonPropertyName("soDinhNghiaBlock")] public int SoDinhNghiaBlock { get; init; }
    [JsonPropertyName("soBangThongKe")] public int SoBangThongKe { get; init; }

    /// <summary>
    /// Số đoạn hành lang đã khai bằng <c>XBOSS_VE_HANHLANG</c> (M114 FR3). KHÔNG khai
    /// <c>required</c> để báo cáo dựng bằng mã cũ vẫn biên dịch được.
    /// </summary>
    [JsonPropertyName("soHanhLang")] public int SoHanhLang { get; init; }

    /// <summary>
    /// Mục đi tuyến tự động (M114 FR14): các cụm tuyến do <c>XBOSS_VE_TUYENTUDONG</c> sinh ra.
    /// KHÔNG khai <c>required</c> để báo cáo dựng bằng mã cũ vẫn biên dịch được.
    /// </summary>
    [JsonPropertyName("tuyenTuDong")] public IReadOnlyList<VeTuyenTuDongCum> TuyenTuDong { get; init; } = [];
    [JsonPropertyName("rulePackKhac")] public required IReadOnlyList<VeVersionKhac> RulePackKhac { get; init; }
    [JsonPropertyName("thuVienKhac")] public required IReadOnlyList<VeVersionKhac> ThuVienKhac { get; init; }
    /// <summary>
    /// Mục nhân bản tầng (M111 FR10): mỗi cặp tầng nguồn → tầng chép và số đối tượng của nó.
    /// KHÔNG khai <c>required</c> để báo cáo dựng bằng mã cũ vẫn biên dịch được — bản vẽ chưa
    /// nhân bản tầng nào thì danh sách rỗng.
    /// </summary>
    [JsonPropertyName("nhanTang")] public IReadOnlyList<VeNhanTangCum> NhanTang { get; init; } = [];

    /// <summary>
    /// Mục hoàn thiện bản vẽ (M115 FR3): mỗi giai đoạn của <c>XBOSS_HOANTHIEN</c> đã sinh bao nhiêu
    /// thực thể. KHÔNG khai <c>required</c> để báo cáo dựng bằng mã cũ vẫn biên dịch được.
    /// </summary>
    [JsonPropertyName("hoanThien")] public IReadOnlyList<VeHoanThienGiaiDoan> HoanThien { get; init; } = [];

    /// <summary>Số nút kỹ sư đã bấm BỎ QUA ở bước duyệt đồ thị (<c>pk.BoQua=1</c> — M115 §6 bước 4).</summary>
    [JsonPropertyName("hoanThienNutBoQua")] public int HoanThienNutBoQua { get; init; }

    /// <summary>Số nút CHƯA QUYẾT được phụ kiện — plugin không chèn block gần đúng (M115 FR2).</summary>
    [JsonPropertyName("hoanThienNutChuaQuyet")] public int HoanThienNutChuaQuyet { get; init; }

    /// <summary>Nhật ký tương tác của phiên: đụng độ định nghĩa block và lựa chọn của kỹ sư (AC7).</summary>
    [JsonPropertyName("nhatKy")] public required IReadOnlyList<string> NhatKy { get; init; }
    [JsonPropertyName("canhBao")] public required IReadOnlyList<string> CanhBao { get; init; }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public string ToJson() => JsonSerializer.Serialize(this, JsonOptions);

    /// <summary>Tổng số tuyến tim của mọi hệ.</summary>
    [JsonIgnore] public int TongTuyen => HeThong.Sum(h => h.SoTuyen);

    /// <summary>Tổng số block đã chèn của mọi hệ.</summary>
    [JsonIgnore] public int TongBlock => HeThong.Sum(h => h.SoBlock);

    /// <summary>
    /// Dựng báo cáo từ XData của mọi đối tượng do bộ lệnh vẽ sinh ra trong bản vẽ.
    /// <paramref name="nhatKy"/> = <c>VeContext.NhatKyPhien</c> của Adapter (có thể rỗng).
    /// </summary>
    /// <param name="doThi">
    /// Đồ thị đã chốt của <c>XBOSS_TUYEN_DOTHI</c> (M115) — nguồn của hai con số "nút bỏ qua" và
    /// "nút chưa quyết". null = bản vẽ chưa chốt đồ thị lần nào.
    /// </param>
    public static VeSessionReport Dung(
        IEnumerable<VeXDataInfo> doiTuong, VeSessionMeta meta, IReadOnlyList<string>? nhatKy = null,
        Graph.DoThiChot? doThi = null)
    {
        var theoHe = new Dictionary<string, VeThongKeHe>(StringComparer.Ordinal);
        var sizeCustom = new Dictionary<(string He, string Item, string Size), int>();
        var chiaDot = new Dictionary<(string He, string Item, string Size, string Kieu, bool GhiDe), VeChiaDotTuyen>();
        var chuaChia = new Dictionary<(string He, string Item, string Size), int>();
        var nhanTang = new Dictionary<(string Nguon, string Dich), int>();
        var ngatNet = new Dictionary<(string He, string Item, string Size), (int So, int Dao)>();
        var tuDong = new Dictionary<(string He, string Item, string Size), (int So, int Sua, HashSet<string> Phien)>();
        var hoanThien = new Dictionary<string, (int So, int Sua, HashSet<string> Tuyen)>(StringComparer.Ordinal);
        var rulePackKhac = new Dictionary<string, int>(StringComparer.Ordinal);
        var thuVienKhac = new Dictionary<string, int>(StringComparer.Ordinal);
        var revision = new Dictionary<int, int>();
        var soDinhNghia = 0;
        var soBang = 0;
        var soHanhLang = 0;

        foreach (var xd in doiTuong)
        {
            switch (xd.VaiTro)
            {
                case VaiTroVe.DinhNghiaBlock:
                    soDinhNghia++;
                    break;
                case VaiTroVe.BangThongKe:
                    soBang++;
                    break;
                case VaiTroVe.HanhLang:
                    // Hành lang (M114 FR3) KHÔNG thuộc hệ nào (danh sách hệ rỗng = mọi hệ đi qua
                    // được) nên đếm riêng — gom vào bảng theo hệ chỉ đẻ ra nhóm "(không rõ hệ)"
                    // toàn số 0 trong mọi báo cáo.
                    soHanhLang++;
                    break;
                case VaiTroVe.PhoiHop:
                    // Marker xung đột phối hợp (M116 FR2) là DẤU KIỂM trên layer riêng, không phải
                    // đối tượng nghiệp vụ của hệ nào — cộng vào thống kê hệ là thổi phồng số tuyến/
                    // khối của bản vẽ, đúng lỗi mà guardrail của M110 đã chặn cho revision. Số liệu
                    // phối hợp có ô riêng trong báo cáo ở M116 PR3.
                    break;
                case VaiTroVe.Revision:
                    // Cloud/tam giác revision là CHÚ THÍCH, không thuộc hệ nào (guardrail 1 của
                    // M110: không đụng hình học nghiệp vụ) — đếm riêng, không cộng vào thống kê hệ.
                    var soRev = xd.SoRevision ?? 0;
                    revision[soRev] = revision.GetValueOrDefault(soRev) + 1;
                    break;
                default:
                    // Đối tượng mất HeId (XData bị sửa tay) vẫn phải đếm được — gom vào một nhóm
                    // riêng thay vì lặng lẽ bỏ qua.
                    var he = string.IsNullOrWhiteSpace(xd.HeId) ? "(không rõ hệ)" : xd.HeId;
                    theoHe[he] = Cong(theoHe.GetValueOrDefault(he) ?? new VeThongKeHe { HeId = he }, xd.VaiTro);
                    break;
            }

            // Dấu bản chép (M111): chỉ đối tượng do XBOSS_VE_NHANTANG sinh ra mới có đủ 2 khóa này.
            if (!string.IsNullOrWhiteSpace(xd.TangNguon) && !string.IsNullOrWhiteSpace(xd.NhanTang))
            {
                var khoaTang = (xd.TangNguon!, xd.NhanTang!);
                nhanTang[khoaTang] = nhanTang.GetValueOrDefault(khoaTang) + 1;
            }

            if (xd.SizeTuNhap && !string.IsNullOrWhiteSpace(xd.Size) && xd.VaiTro == VaiTroVe.Tim)
            {
                var khoa = (xd.HeId, xd.ItemId, xd.Size);
                sizeCustom[khoa] = sizeCustom.GetValueOrDefault(khoa) + 1;
            }

            // Mục chia đốt (M105): chỉ TIM mới mang dấu chia đốt; vạch/tag chỉ trỏ về tim.
            if (xd.VaiTro == VaiTroVe.Tim) CongChiaDot(chiaDot, chuaChia, xd);

            // Mục đi tuyến tự động (M114 FR14): chỉ TIM mới mang dấu TuDong (nét biên chỉ trỏ về tim).
            if (xd is { VaiTro: VaiTroVe.Tim, TuDong: true })
            {
                var khoaTd = (xd.HeId, xd.ItemId, xd.Size);
                if (!tuDong.TryGetValue(khoaTd, out var cuTd)) cuTd = (0, 0, new HashSet<string>(StringComparer.Ordinal));
                if (xd.PhienTuyen is { Length: > 0 } phien) cuTd.Phien.Add(phien);
                tuDong[khoaTd] = (cuTd.So + 1, cuTd.Sua + (xd.SuaTay ? 1 : 0), cuTd.Phien);
            }

            // Mục hoàn thiện (M115 FR3/FR4): chỉ thực thể do XBOSS_HOANTHIEN sinh ra mới mang dấu
            // nguon=M115; giai đoạn nào sinh ra nó nằm ngay trên XData, không phải suy từ vai trò.
            if (string.Equals(xd.NguonHoanThien, HoanThienKeHoach.NguonM115, StringComparison.Ordinal) &&
                xd.GiaiDoanHoanThien is { Length: > 0 } giaiDoan)
            {
                if (!hoanThien.TryGetValue(giaiDoan, out var cuHt))
                    cuHt = (0, 0, new HashSet<string>(StringComparer.OrdinalIgnoreCase));
                if (xd.HandleTim is { Length: > 0 } timGoc) cuHt.Tuyen.Add(timGoc);
                hoanThien[giaiDoan] = (cuHt.So + 1, cuHt.Sua + (xd.SuaTay ? 1 : 0), cuHt.Tuyen);
            }

            // Mục ngắt nét (M109 FR9): XData của đối tượng ngắt nét mang hệ/loại/cỡ của tuyến ĐI
            // DƯỚI (tuyến bị ngắt), nên gộp theo đúng bộ ba đó.
            if (xd.VaiTro == VaiTroVe.NgatNet)
            {
                var khoaNgat = (xd.HeId, xd.ItemId, xd.Size);
                var cuNgat = ngatNet.GetValueOrDefault(khoaNgat);
                ngatNet[khoaNgat] = (cuNgat.So + 1, cuNgat.Dao + (xd.DaoTay ? 1 : 0));
            }

            if (!string.IsNullOrWhiteSpace(xd.RulePackVersion) &&
                !string.Equals(xd.RulePackVersion, meta.RulePackVersion, StringComparison.Ordinal))
            {
                rulePackKhac[xd.RulePackVersion] = rulePackKhac.GetValueOrDefault(xd.RulePackVersion) + 1;
            }

            if (xd.ThuVienVersion is { Length: > 0 } tv && meta.ThuVienVersion is { Length: > 0 } tvHienHanh &&
                !string.Equals(tv, tvHienHanh, StringComparison.Ordinal))
            {
                thuVienKhac[tv] = thuVienKhac.GetValueOrDefault(tv) + 1;
            }
        }

        var dsSizeCustom = sizeCustom
            .Select(kv => new VeSizeCustom
            {
                HeId = kv.Key.He,
                ItemId = kv.Key.Item,
                Size = kv.Key.Size,
                SoTuyen = kv.Value,
            })
            .OrderBy(s => s.HeId, StringComparer.Ordinal)
            .ThenBy(s => s.ItemId, StringComparer.Ordinal)
            .ThenBy(s => s.Size, StringComparer.Ordinal)
            .ToList();

        var dsChiaDot = chiaDot.Values
            .OrderBy(c => c.HeId, StringComparer.Ordinal)
            .ThenBy(c => c.ItemId, StringComparer.Ordinal)
            .ThenBy(c => c.Size, StringComparer.Ordinal)
            .ThenBy(c => c.KieuNoi, StringComparer.Ordinal)
            .ToList();
        var dsChuaChia = chuaChia
            .Select(kv => new VeChiaDotBoQua
            {
                HeId = kv.Key.He,
                ItemId = kv.Key.Item,
                Size = kv.Key.Size,
                SoTuyen = kv.Value,
            })
            .OrderBy(c => c.HeId, StringComparer.Ordinal)
            .ThenBy(c => c.ItemId, StringComparer.Ordinal)
            .ThenBy(c => c.Size, StringComparer.Ordinal)
            .ToList();

        var dsNhanTang = nhanTang
            .Select(kv => new VeNhanTangCum
            {
                TangNguon = kv.Key.Nguon,
                NhanTang = kv.Key.Dich,
                SoDoiTuong = kv.Value,
            })
            .OrderBy(c => c.TangNguon, StringComparer.Ordinal)
            .ThenBy(c => c.NhanTang, StringComparer.Ordinal)
            .ToList();

        var dsNgatNet = ngatNet
            .Select(kv => new VeNgatNetCum
            {
                HeId = kv.Key.He,
                ItemId = kv.Key.Item,
                Size = kv.Key.Size,
                SoDoiTuong = kv.Value.So,
                SoDaoTay = kv.Value.Dao,
            })
            .OrderBy(c => c.HeId, StringComparer.Ordinal)
            .ThenBy(c => c.ItemId, StringComparer.Ordinal)
            .ThenBy(c => c.Size, StringComparer.Ordinal)
            .ToList();

        var dsTuDong = tuDong
            .Select(kv => new VeTuyenTuDongCum
            {
                HeId = kv.Key.He,
                ItemId = kv.Key.Item,
                Size = kv.Key.Size,
                SoNhanh = kv.Value.So,
                SoSuaTay = kv.Value.Sua,
                SoPhien = kv.Value.Phien.Count,
            })
            .OrderBy(c => c.HeId, StringComparer.Ordinal)
            .ThenBy(c => c.ItemId, StringComparer.Ordinal)
            .ThenBy(c => c.Size, StringComparer.Ordinal)
            .ToList();

        // Thứ tự bảng hoàn thiện bám ĐÚNG thứ tự chạy 1..8 của HoanThienKeHoach.DanhMuc (không sắp
        // theo bảng chữ cái): người đọc báo cáo đang dò lại đúng trình tự lệnh đã chạy.
        var dsHoanThien = hoanThien
            .Select(kv => new
            {
                Khoa = kv.Key,
                GiaiDoan = HoanThienKeHoach.Tim(kv.Key),
                kv.Value,
            })
            .OrderBy(x => x.GiaiDoan?.SoThuTu ?? int.MaxValue)
            .ThenBy(x => x.Khoa, StringComparer.Ordinal)
            .Select(x => new VeHoanThienGiaiDoan
            {
                GiaiDoan = x.Khoa,
                Nhan = x.GiaiDoan?.Nhan ?? x.Khoa,
                SoThucThe = x.Value.So,
                SoTuyen = x.Value.Tuyen.Count,
                SoSuaTay = x.Value.Sua,
            })
            .ToList();

        var canhBao = new List<string>();
        if (dsSizeCustom.Count > 0)
        {
            canhBao.Add(
                $"{dsSizeCustom.Sum(s => s.SoTuyen)} tuyến dùng size NGOÀI danh mục rule pack " +
                $"({dsSizeCustom.Count} size khác nhau) — soát lại trước khi bóc khối lượng, hoặc bổ sung " +
                "size vào rule pack version sau.");
        }
        if (rulePackKhac.Count > 0)
        {
            canhBao.Add(
                "Bản vẽ trộn nhiều version rule pack: " +
                string.Join(", ", rulePackKhac.OrderBy(k => k.Key, StringComparer.Ordinal)
                    .Select(k => $"{k.Key} ({k.Value} đối tượng)")) +
                $" khác bản đang dùng {meta.RulePackVersion} — quy tắc layer/size có thể đã đổi giữa chừng.");
        }
        if (dsChuaChia.Count > 0 && dsChiaDot.Count > 0)
        {
            // Chỉ cảnh báo khi bản vẽ ĐÃ chia đốt một phần: chưa chạy lệnh lần nào thì việc mọi
            // tuyến "chưa chia" là bình thường, kêu lên chỉ thành nhiễu.
            canhBao.Add(
                $"{dsChuaChia.Sum(c => c.SoTuyen)} tuyến CHƯA chia đốt trong khi các tuyến khác đã chia — " +
                "chạy lại XBOSS_VE_CHIADOT cho phần còn lại, hoặc kiểm rule pack có khai jointRules cho " +
                "loại tuyến đó không (thiếu thì lệnh bỏ qua, không đoán mặc định).");
        }
        var dsGhiDe = dsChiaDot.Where(c => c.GhiDe).ToList();
        if (dsGhiDe.Count > 0)
        {
            canhBao.Add(
                $"{dsGhiDe.Sum(c => c.SoTuyen)} tuyến chia đốt bằng kiểu nối GHI ĐÈ TAY " +
                $"({string.Join(", ", dsGhiDe.Select(c => $"{c.ItemId} {c.Size} → {c.KieuNoi}"))}) — " +
                "không phải kiểu rule pack tự chọn theo cỡ, soát lại trước khi phát hành bản vẽ.");
        }
        var soDaoTay = dsNgatNet.Sum(c => c.SoDaoTay);
        if (soDaoTay > 0)
        {
            // FR7/AC5 — đảo tay THẮNG priority và sống mãi trong bản vẽ, nên phải nổi lên báo cáo:
            // đây là chỗ duy nhất người nghiệm thu bản vẽ thấy được "chỗ này không theo quy ước chung".
            canhBao.Add(
                $"{soDaoTay} đối tượng ngắt nét mang dấu ĐẢO TAY của kỹ sư (" +
                string.Join(", ", dsNgatNet.Where(c => c.SoDaoTay > 0)
                    .Select(c => $"{c.HeId}/{c.ItemId} {c.Size}: {c.SoDaoTay}")) +
                ") — chiều trên–dưới ở đó KHÔNG theo crossingPolicy.priority, soát lại trước khi phát hành.");
        }
        var soSuaTay = dsTuDong.Sum(c => c.SoSuaTay);
        if (soSuaTay > 0)
        {
            // FR12 — tuyến sửa tay được TÔN TRỌNG (chạy lại bỏ qua), nên nó là chỗ duy nhất người
            // nghiệm thu thấy được "nhánh này không còn khớp kết quả đi tuyến tự động".
            canhBao.Add(
                $"{soSuaTay} tuyến tự động mang dấu SỬA TAY (" +
                string.Join(", ", dsTuDong.Where(c => c.SoSuaTay > 0)
                    .Select(c => $"{c.HeId}/{c.ItemId} {c.Size}: {c.SoSuaTay}")) +
                ") — XBOSS_VE_TUYENTUDONG chạy lại sẽ GIỮ NGUYÊN chúng, soát lại trước khi phát hành.");
        }
        var soSuaTayHt = dsHoanThien.Sum(c => c.SoSuaTay);
        if (soSuaTayHt > 0)
        {
            // FR4 — thực thể hoàn thiện đã sửa tay được GIỮ khi chạy lại, nên nó là chỗ duy nhất
            // người nghiệm thu thấy được "chỗ này không còn khớp kết quả tự động".
            canhBao.Add(
                $"{soSuaTayHt} thực thể do XBOSS_HOANTHIEN sinh ra mang dấu SỬA TAY (" +
                string.Join(", ", dsHoanThien.Where(c => c.SoSuaTay > 0)
                    .Select(c => $"{c.Nhan}: {c.SoSuaTay}")) +
                ") — chạy lại lệnh sẽ GIỮ NGUYÊN chúng, soát lại trước khi phát hành.");
        }
        if (thuVienKhac.Count > 0)
        {
            canhBao.Add(
                "Bản vẽ có block từ version thư viện khác: " +
                string.Join(", ", thuVienKhac.OrderBy(k => k.Key, StringComparer.Ordinal)
                    .Select(k => $"{k.Key} ({k.Value} khối)")) +
                $" khác bản đang dùng {meta.ThuVienVersion}.");
        }

        return new VeSessionReport
        {
            RulePackVersion = meta.RulePackVersion,
            ThuVienVersion = meta.ThuVienVersion,
            TenBanVe = meta.TenBanVe,
            NgayIso = meta.NgayIso,
            NguoiVe = meta.NguoiVe,
            HeThong = theoHe.Values.OrderBy(h => h.HeId, StringComparer.Ordinal).ToList(),
            SizeCustom = dsSizeCustom,
            ChiaDot = dsChiaDot,
            ChiaDotBoQua = dsChuaChia,
            Revision = revision
                .OrderBy(kv => kv.Key)
                .Select(kv => new VeRevisionCum { So = kv.Key, SoDoiTuong = kv.Value })
                .ToList(),
            NgatNet = dsNgatNet,
            SoDinhNghiaBlock = soDinhNghia,
            SoBangThongKe = soBang,
            SoHanhLang = soHanhLang,
            TuyenTuDong = dsTuDong,
            RulePackKhac = rulePackKhac.OrderBy(k => k.Key, StringComparer.Ordinal)
                .Select(k => new VeVersionKhac { Version = k.Key, SoDoiTuong = k.Value }).ToList(),
            ThuVienKhac = thuVienKhac.OrderBy(k => k.Key, StringComparer.Ordinal)
                .Select(k => new VeVersionKhac { Version = k.Key, SoDoiTuong = k.Value }).ToList(),
            NhanTang = dsNhanTang,
            HoanThien = dsHoanThien,
            HoanThienNutBoQua = doThi?.PhuKien.Count(p => p.BoQua) ?? 0,
            HoanThienNutChuaQuyet =
                doThi?.PhuKien.Count(p => !p.BoQua && p.TrangThai == Graph.TrangThaiPhuKien.ChuaQuyet) ?? 0,
            NhatKy = nhatKy is null ? [] : [.. nhatKy],
            CanhBao = canhBao,
        };
    }

    private static VeThongKeHe Cong(VeThongKeHe cu, VaiTroVe vaiTro) => vaiTro switch
    {
        VaiTroVe.Tim => cu with { SoTuyen = cu.SoTuyen + 1 },
        VaiTroVe.Bien => cu with { SoNetBien = cu.SoNetBien + 1 },
        VaiTroVe.Nhan => cu with { SoNhan = cu.SoNhan + 1 },
        VaiTroVe.PhuKien => cu with { SoPhuKien = cu.SoPhuKien + 1 },
        VaiTroVe.ThietBi => cu with { SoThietBi = cu.SoThietBi + 1 },
        VaiTroVe.GiaDo => cu with { SoGiaDo = cu.SoGiaDo + 1 },
        VaiTroVe.LoCho => cu with { SoLoCho = cu.SoLoCho + 1 },
        // Tuyến cắt và các đối tượng của hình cắt đều thuộc một hình cắt — đếm chung.
        VaiTroVe.TuyenCat or VaiTroVe.MatCat => cu with { SoMatCat = cu.SoMatCat + 1 },
        VaiTroVe.VachChia => cu with { SoVachChia = cu.SoVachChia + 1 },
        VaiTroVe.NhanDot => cu with { SoNhanDot = cu.SoNhanDot + 1 },
        VaiTroVe.NgatNet => cu with { SoNgatNet = cu.SoNgatNet + 1 },
        _ => cu,
    };

    /// <summary>
    /// Cộng một TIM vào mục chia đốt: có dấu chia đốt (kiểu nối + số đốt) thì vào nhóm "đã chia",
    /// không có thì vào nhóm "chưa chia/bỏ qua".
    /// </summary>
    private static void CongChiaDot(
        Dictionary<(string He, string Item, string Size, string Kieu, bool GhiDe), VeChiaDotTuyen> daChia,
        Dictionary<(string He, string Item, string Size), int> chuaChia,
        VeXDataInfo xd)
    {
        if (xd.KieuNoi is not { Length: > 0 } kieu || xd.SoDot is not { } soDot)
        {
            var khoaChua = (xd.HeId, xd.ItemId, xd.Size);
            chuaChia[khoaChua] = chuaChia.GetValueOrDefault(khoaChua) + 1;
            return;
        }

        var khoa = (xd.HeId, xd.ItemId, xd.Size, kieu, xd.KieuNoiGhiDe);
        var cu = daChia.GetValueOrDefault(khoa);
        daChia[khoa] = new VeChiaDotTuyen
        {
            HeId = xd.HeId,
            ItemId = xd.ItemId,
            Size = xd.Size,
            KieuNoi = kieu,
            GhiDe = xd.KieuNoiGhiDe,
            SoTuyen = (cu?.SoTuyen ?? 0) + 1,
            SoDot = (cu?.SoDot ?? 0) + soDot,
            SoMoi = (cu?.SoMoi ?? 0) + (xd.SoMoiNoi ?? 0),
            TongDaiMm = (cu?.TongDaiMm ?? 0) + (xd.TongDaiDotMm ?? 0),
        };
    }

    /// <summary>Bản đọc được cho dòng lệnh AutoCAD (NFR2 — toàn bộ tiếng Việt).</summary>
    public string ToVietnameseText()
    {
        var sb = new StringBuilder();
        sb.AppendLine($"=== Báo cáo phiên vẽ — {TenBanVe} ===");
        sb.AppendLine(
            $"Rule pack: {RulePackVersion} · Thư viện block: {ThuVienVersion ?? "(chưa có)"} · {NgayIso}" +
            (string.IsNullOrEmpty(NguoiVe) ? "" : $" · {NguoiVe}"));
        if (HeThong.Count == 0)
        {
            sb.AppendLine("Bản vẽ chưa có đối tượng nào do bộ lệnh XBOSS_VE_* sinh ra.");
        }
        foreach (var h in HeThong)
        {
            sb.AppendLine(
                $"[{h.HeId}] tuyến {h.SoTuyen} · nét biên {h.SoNetBien} · nhãn {h.SoNhan} · " +
                $"phụ kiện {h.SoPhuKien} · thiết bị {h.SoThietBi} · giá đỡ {h.SoGiaDo} · " +
                $"lỗ chờ {h.SoLoCho} · mặt cắt {h.SoMatCat} · vạch chia {h.SoVachChia} · " +
                $"tag đốt {h.SoNhanDot} · ngắt nét {h.SoNgatNet}");
        }
        if (SoHanhLang > 0)
            sb.AppendLine($"Hành lang đã khai (XBOSS_VE_HANHLANG): {SoHanhLang} đoạn");
        if (SizeCustom.Count > 0)
        {
            sb.AppendLine("Size ngoài danh mục rule pack:");
            foreach (var s in SizeCustom)
                sb.AppendLine($"  - {s.HeId}/{s.ItemId}: \"{s.Size}\" ({s.SoTuyen} tuyến)");
        }
        if (ChiaDot.Count > 0)
        {
            sb.AppendLine("Chia đốt — tuyến ĐÃ chia:");
            foreach (var c in ChiaDot)
            {
                sb.AppendLine(
                    $"  - {c.HeId}/{c.ItemId} {c.Size} · {c.KieuNoi}{(c.GhiDe ? " (ghi đè tay)" : "")}: " +
                    $"{c.SoTuyen} tuyến, {c.SoDot} đốt, {c.SoMoi} mối, tổng dài " +
                    $"{c.TongDaiMm.ToString("#,##0.#", CultureInfo.InvariantCulture)}mm");
            }
        }
        if (ChiaDotBoQua.Count > 0)
        {
            sb.AppendLine(
                "Chia đốt — tuyến CHƯA chia (chưa chạy XBOSS_VE_CHIADOT, hoặc rule pack không khai " +
                "jointRules nên lệnh bỏ qua — lý do từng lần xem nhật ký phiên):");
            foreach (var c in ChiaDotBoQua)
                sb.AppendLine($"  - {c.HeId}/{c.ItemId} {c.Size}: {c.SoTuyen} tuyến");
        }
        if (Revision.Count > 0)
        {
            sb.AppendLine("Revision cloud (XBOSS_VE_REV) — mỗi vùng khoanh gồm 1 cloud + 1 tam giác:");
            foreach (var r in Revision)
            {
                var so = r.So == 0 ? "(không rõ số)" : $"R{r.So.ToString(CultureInfo.InvariantCulture)}";
                sb.AppendLine($"  - {so}: {r.SoDoiTuong} đối tượng");
            }
        }
        if (NhanTang.Count > 0)
        {
            sb.AppendLine("Nhân bản tầng (XBOSS_VE_NHANTANG) — đọc từ dấu bản chép trong bản vẽ:");
            foreach (var c in NhanTang)
                sb.AppendLine($"  - tầng {c.TangNguon} → tầng {c.NhanTang}: {c.SoDoiTuong} đối tượng");
        }
        if (TuyenTuDong.Count > 0)
        {
            sb.AppendLine("Đi tuyến tự động (XBOSS_VE_TUYENTUDONG) — đọc từ dấu TuDong trong bản vẽ:");
            foreach (var c in TuyenTuDong)
            {
                sb.AppendLine(
                    $"  - {c.HeId}/{c.ItemId} {c.Size}: {c.SoNhanh} nhánh, {c.SoPhien} phiên chạy" +
                    (c.SoSuaTay > 0 ? $" (trong đó {c.SoSuaTay} nhánh đã sửa tay — chạy lại giữ nguyên)" : ""));
            }
        }
        if (HoanThien.Count > 0)
        {
            sb.AppendLine("Hoàn thiện bản vẽ (XBOSS_HOANTHIEN) — theo từng giai đoạn, thứ tự chạy ① → ⑧:");
            foreach (var c in HoanThien)
            {
                sb.AppendLine(
                    $"  - {c.Nhan}: {c.SoThucThe} thực thể trên {c.SoTuyen} tuyến" +
                    (c.SoSuaTay > 0 ? $" (trong đó {c.SoSuaTay} đã sửa tay — chạy lại giữ nguyên)" : ""));
            }
            if (HoanThienNutBoQua + HoanThienNutChuaQuyet > 0)
            {
                sb.AppendLine(
                    $"  - Nút KHÔNG chèn phụ kiện: {HoanThienNutBoQua} nút kỹ sư bấm bỏ qua, " +
                    $"{HoanThienNutChuaQuyet} nút chưa quyết được (plugin không chèn block gần đúng).");
            }
        }
        if (NgatNet.Count > 0)
        {
            sb.AppendLine("Ngắt nét giao chéo — theo tuyến ĐI DƯỚI (tuyến bị ngắt):");
            foreach (var c in NgatNet)
            {
                sb.AppendLine(
                    $"  - {c.HeId}/{c.ItemId} {c.Size}: {c.SoDoiTuong} đối tượng" +
                    (c.SoDaoTay > 0 ? $" (trong đó {c.SoDaoTay} đảo tay)" : ""));
            }
        }
        if (NhatKy.Count > 0)
        {
            sb.AppendLine("Nhật ký phiên (đụng độ định nghĩa block và lựa chọn của kỹ sư):");
            foreach (var d in NhatKy) sb.AppendLine($"  - {d}");
        }
        foreach (var c in CanhBao) sb.AppendLine($"⚠ {c}");
        return sb.ToString();
    }
}
