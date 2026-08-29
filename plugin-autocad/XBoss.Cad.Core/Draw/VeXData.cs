using System.Globalization;

namespace XBoss.Cad.Core.Draw;

/// <summary>Vai trò của đối tượng do bộ lệnh vẽ sinh ra.</summary>
public enum VaiTroVe
{
    /// <summary>Polyline tim — NGUỒN SỰ THẬT của tuyến, đối tượng duy nhất được bóc khối lượng.</summary>
    Tim,
    /// <summary>Nét biên (layer <c>&lt;tim&gt;EDGE</c>) — không bao giờ được bóc khối lượng (FR4).</summary>
    Bien,
    /// <summary>Nhãn size/độ dốc trên layer annotation.</summary>
    Nhan,
    /// <summary>Tuyến cắt kỹ sư kẻ trong mặt bằng (XBOSS_VE_MATCAT) — nguồn của một hình cắt.</summary>
    TuyenCat,
    /// <summary>
    /// Đối tượng thuộc hình cắt (ký hiệu, nhãn, tên A-A). Hình cắt là SNAPSHOT: không tự cập
    /// nhật khi tuyến nguồn đổi, nên mang theo handle tuyến cắt + ngày dựng để
    /// <c>XBOSS_KIEMTRA</c> cảnh báo "mặt cắt cũ hơn tuyến" (M100 §6.4 bước 4).
    /// </summary>
    MatCat,
    /// <summary>Block phụ kiện chèn trên tuyến tim (co, tê, van, miệng gió… — M100 FR5).</summary>
    PhuKien,
    /// <summary>Block thiết bị có attribute (FCU/AHU/đầu phun — M100 FR6).</summary>
    ThietBi,
    /// <summary>
    /// ĐỊNH NGHĨA block (BlockTableRecord) do plugin nhập từ thư viện — mang version thư viện để
    /// lần chèn sau biết định nghĩa trong bản vẽ đến từ đâu (M100 §6.10/AC7).
    /// </summary>
    DinhNghiaBlock,

    /// <summary>
    /// Block giá đỡ/treo đỡ đặt dọc tuyến (<c>XBOSS_VE_GIADO</c> — M100 §6.7). Mang
    /// <see cref="VeXDataInfo.HandleTim"/> của tuyến nó đỡ: chạy lại lệnh chỉ bổ sung đoạn thiếu.
    /// </summary>
    GiaDo,

    /// <summary>
    /// Block sleeve/lỗ chờ xuyên kết cấu (<c>XBOSS_VE_LOCHO</c> — M100 §6.8). Mang đủ dữ liệu để
    /// xuất bảng builder's work mà không phải hỏi lại: size ống, size lỗ chờ, cao độ, kết cấu, trục.
    /// </summary>
    LoCho,

    /// <summary>
    /// Bảng thống kê do plugin sinh (<c>XBOSS_VE_THONGKE</c> — M100 §6.9): chạy lại thì cập nhật
    /// ĐÚNG bảng này tại chỗ, không sinh bảng đôi (FR9f).
    /// </summary>
    BangThongKe,

    /// <summary>
    /// Vạch chia đốt vuông góc tim (<c>XBOSS_VE_CHIADOT</c> — M105 FR5). Mang
    /// <see cref="VeXDataInfo.HandleTim"/> + <see cref="VeXDataInfo.ChiSoDot"/> để chạy lại lệnh
    /// xóa đúng vạch cũ CỦA TUYẾN ĐÓ rồi vẽ lại (idempotent — FR6/AC9).
    /// </summary>
    VachChia,

    /// <summary>Tag đốt đặt cạnh trung điểm đốt (<c>XBOSS_VE_CHIADOT</c> — M105 FR5).</summary>
    NhanDot,

    /// <summary>
    /// Đối tượng ngắt nét giao chéo (<c>XBOSS_VE_NGATNET</c> — M109 FR5): wipeout che vùng giao
    /// hoặc cầu vượt. Mang <see cref="VeXDataInfo.HandleTim"/> = tim ĐI DƯỚI và
    /// <see cref="VeXDataInfo.HandleTimGiao"/> = tim đi trên, nên lệnh xóa/chạy lại tìm đúng đối
    /// tượng của đúng CẶP tuyến (FR6 idempotent). KHÔNG BAO GIỜ đụng vào polyline tim (guardrail 1).
    /// </summary>
    NgatNet,
}

/// <summary>Nội dung XData <c>XBOSS_VE</c> của một đối tượng do bộ lệnh vẽ sinh ra (M100 §11).</summary>
public sealed record VeXDataInfo
{
    public required VaiTroVe VaiTro { get; init; }
    /// <summary>Id hệ — khớp <c>drawTools.systems[].id</c>.</summary>
    public string HeId { get; init; } = "";
    /// <summary>Id item takeoff của loại tuyến — khớp <c>takeoff.items[].id</c>.</summary>
    public string ItemId { get; init; } = "";
    public string Size { get; init; } = "";
    public string RulePackVersion { get; init; } = "";
    /// <summary>Size do kỹ sư tự nhập, ngoài danh mục rule pack (M100 §4 — vào báo cáo phiên vẽ).</summary>
    public bool SizeTuNhap { get; init; }
    /// <summary>Độ dốc dạng chuỗi rule pack (<c>2%</c>); null = tuyến không có độ dốc.</summary>
    public string? DoDoc { get; init; }
    /// <summary>Handle của tim — có trên nét biên và nhãn (liên kết ngược).</summary>
    public string? HandleTim { get; init; }
    /// <summary>Handle các nét biên — có trên tim (liên kết xuôi, M100 §4 "XData 2 chiều").</summary>
    public IReadOnlyList<string> HandleBien { get; init; } = [];
    /// <summary>Handle các nhãn gắn với tim — để <c>XBOSS_VE_DOI</c> cập nhật nhãn (FR8).</summary>
    public IReadOnlyList<string> HandleNhan { get; init; } = [];

    /// <summary>Handle tuyến cắt sinh ra hình cắt này (chỉ vai trò <see cref="VaiTroVe.MatCat"/>).</summary>
    public string? HandleTuyenCat { get; init; }

    /// <summary>Ngày dựng hình cắt (ISO <c>yyyy-MM-dd</c>) — mốc so "mặt cắt cũ hơn tuyến".</summary>
    public string? NgayTao { get; init; }

    /// <summary>Tên mặt cắt (<c>A-A</c>) — có trên tuyến cắt lẫn các đối tượng của hình cắt.</summary>
    public string? TenMatCat { get; init; }

    /// <summary>Cao độ tim tuyến kỹ sư NHẬP TAY khi dựng mặt cắt, đơn vị bản vẽ (M100 §6.4).</summary>
    public double? CaoDo { get; init; }
    /// <summary>Id block trong manifest thư viện (phụ kiện/thiết bị/định nghĩa block).</summary>
    public string? BlockId { get; init; }
    /// <summary>Version thư viện block mà định nghĩa/khối chèn ra lấy từ đó (M100 §6.10).</summary>
    public string? ThuVienVersion { get; init; }

    /// <summary>Size lỗ chờ đã cộng khe hở (vai trò <see cref="VaiTroVe.LoCho"/>) — vd <c>DN75</c>.</summary>
    public string? SizeLoCho { get; init; }

    /// <summary>Loại kết cấu xuyên qua: Tường/Sàn/Dầm (vai trò <see cref="VaiTroVe.LoCho"/>).</summary>
    public string? KetCau { get; init; }

    /// <summary>Vị trí theo trục gần nhất (vd <c>A/3</c>) — tính lúc chèn lỗ chờ, dùng khi xuất bảng.</summary>
    public string? ViTriTruc { get; init; }

    /// <summary>
    /// Cao độ lỗ chờ do kỹ sư NHẬP TAY, đơn vị <b>mm</b> (khác <see cref="CaoDo"/> của mặt cắt —
    /// cái đó theo đơn vị bản vẽ; bảng builder's work luôn ghi mm nên tách khóa riêng cho khỏi lẫn).
    /// </summary>
    public double? CaoDoMm { get; init; }

    /// <summary>Tag của khối đã được kỹ sư KHÓA — <c>XBOSS_VE_TAG</c> đánh lại phải giữ nguyên.</summary>
    public bool TagKhoa { get; init; }

    /// <summary>Mã loại bảng thống kê (<c>thietbi</c>/<c>khoiluong</c> — xem <c>ThongKeTable.Ma</c>).</summary>
    public string? LoaiBang { get; init; }

    // ===== Chia đốt (M105 FR6) =====
    // Trên TIM: 4 khóa tóm tắt dưới đây là "dấu đã chia đốt" — nguồn của bảng đốt trong bản vẽ và
    // của mục chia đốt trong báo cáo phiên vẽ, đọc lại được sau khi đóng/mở bản vẽ.
    // Trên VẠCH/TAG: HandleTim + ChiSoDot đủ để chạy lại lệnh dọn đúng đối tượng cũ.

    /// <summary>Kiểu nối đã dùng để chia đốt (slug rule pack, vd <c>tdc</c>); null = tuyến chưa chia.</summary>
    public string? KieuNoi { get; init; }

    /// <summary>Kỹ sư ghi đè kiểu nối tự chọn (FR1) — vào báo cáo để soát lại.</summary>
    public bool KieuNoiGhiDe { get; init; }

    /// <summary>Số đốt của tuyến sau khi chia (chỉ trên tim).</summary>
    public int? SoDot { get; init; }

    /// <summary>Số mối nối của tuyến (Σ(nᵢ−1) theo đoạn — chỉ trên tim).</summary>
    public int? SoMoiNoi { get; init; }

    /// <summary>Tổng chiều dài tuyến đã chia (mm — chỉ trên tim).</summary>
    public double? TongDaiDotMm { get; init; }

    /// <summary>Số thứ tự đốt trong tuyến (trên tag đốt, và đốt ĐỨNG TRƯỚC trên vạch chia).</summary>
    public int? ChiSoDot { get; init; }

    // ===== Ngắt nét giao chéo (M109 FR5/FR7) =====

    /// <summary>
    /// Handle tim ĐI TRÊN của cặp giao (vai trò <see cref="VaiTroVe.NgatNet"/>);
    /// <see cref="HandleTim"/> của cùng đối tượng là tim ĐI DƯỚI — cái bị ngắt nét.
    /// </summary>
    public string? HandleTimGiao { get; init; }

    /// <summary>
    /// Kỹ sư đã ĐẢO TAY chiều trên–dưới tại điểm giao này (FR7). Chạy lại lệnh phải giữ nguyên
    /// quyết định của kỹ sư thay vì áp lại <c>crossingPolicy.priority</c> (AC5).
    /// </summary>
    public bool DaoTay { get; init; }
}

/// <summary>
/// Mã hóa/giải mã XData của bộ lệnh vẽ dưới dạng danh sách chuỗi <c>khóa=giá trị</c>
/// (mỗi chuỗi thành một <c>ExtendedDataAsciiString</c> ở tầng Adapter — cùng cách M99 dùng cho
/// appname <c>XBOSS_BOCKL</c>). Dạng khóa=giá trị để các PR sau (VE_DOI, giá đỡ, mặt cắt) thêm
/// trường mà bản cũ vẫn đọc được: khóa lạ bị bỏ qua, không làm hỏng dữ liệu.
/// THUẦN — Adapter chỉ lo chuyển đổi sang ResultBuffer.
/// </summary>
public static class VeXData
{
    /// <summary>Appname XData của bộ lệnh vẽ (M100 §11). KHÔNG đụng appname XBOSS_BOCKL của M99.</summary>
    public const string AppName = "XBOSS_VE";

    /// <summary>Phiên bản định dạng XData — đọc trước, khác thì biết là bản mới hơn.</summary>
    public const string PhienBan = "1";

    private const string KhoaPhienBan = "ve";

    public static IReadOnlyList<string> MaHoa(VeXDataInfo tt)
    {
        var ra = new List<string>
        {
            $"{KhoaPhienBan}={PhienBan}",
            $"vaitro={MaVaiTro(tt.VaiTro)}",
        };
        Them(ra, "he", tt.HeId);
        Them(ra, "item", tt.ItemId);
        Them(ra, "size", tt.Size);
        Them(ra, "rp", tt.RulePackVersion);
        if (tt.SizeTuNhap) ra.Add("custom=1");
        Them(ra, "dodoc", tt.DoDoc);
        Them(ra, "tim", tt.HandleTim);
        Them(ra, "blockid", tt.BlockId);
        Them(ra, "tv", tt.ThuVienVersion);
        foreach (var h in tt.HandleBien) Them(ra, "bien", h);
        foreach (var h in tt.HandleNhan) Them(ra, "nhan", h);
        Them(ra, "tuyencat", tt.HandleTuyenCat);
        Them(ra, "ngay", tt.NgayTao);
        Them(ra, "tenmc", tt.TenMatCat);
        if (tt.CaoDo is { } cd) ra.Add($"caodo={cd.ToString("0.######", CultureInfo.InvariantCulture)}");
        Them(ra, "sizelc", tt.SizeLoCho);
        Them(ra, "ketcau", tt.KetCau);
        Them(ra, "truc", tt.ViTriTruc);
        if (tt.CaoDoMm is { } cdm) ra.Add($"caodomm={cdm.ToString("0.######", CultureInfo.InvariantCulture)}");
        if (tt.TagKhoa) ra.Add("tagkhoa=1");
        Them(ra, "bang", tt.LoaiBang);
        Them(ra, "kieunoi", tt.KieuNoi);
        if (tt.KieuNoiGhiDe) ra.Add("kieunoighide=1");
        if (tt.SoDot is { } sd) ra.Add($"sodot={sd.ToString(CultureInfo.InvariantCulture)}");
        if (tt.SoMoiNoi is { } sm) ra.Add($"somoi={sm.ToString(CultureInfo.InvariantCulture)}");
        if (tt.TongDaiDotMm is { } td)
            ra.Add($"tongdaidot={td.ToString("0.######", CultureInfo.InvariantCulture)}");
        if (tt.ChiSoDot is { } cs) ra.Add($"chisodot={cs.ToString(CultureInfo.InvariantCulture)}");
        Them(ra, "timgiao", tt.HandleTimGiao);
        if (tt.DaoTay) ra.Add("daotay=1");
        return ra;
    }

    // Mã vai trò phải khớp 1-1 với nhánh giải mã trong GiaiMa — thêm vai trò mới thì sửa CẢ HAI.
    private static string MaVaiTro(VaiTroVe vaiTro) => vaiTro switch
    {
        VaiTroVe.Tim => "tim",
        VaiTroVe.Bien => "bien",
        VaiTroVe.Nhan => "nhan",
        VaiTroVe.TuyenCat => "tuyencat",
        VaiTroVe.MatCat => "matcat",
        VaiTroVe.PhuKien => "phukien",
        VaiTroVe.ThietBi => "thietbi",
        VaiTroVe.GiaDo => "giado",
        VaiTroVe.LoCho => "locho",
        VaiTroVe.BangThongKe => "bang",
        VaiTroVe.VachChia => "vachchia",
        VaiTroVe.NhanDot => "nhandot",
        VaiTroVe.NgatNet => "ngatnet",
        _ => "blockdef",
    };

    private static void Them(List<string> ra, string khoa, string? giaTri)
    {
        if (!string.IsNullOrWhiteSpace(giaTri)) ra.Add($"{khoa}={giaTri}");
    }

    /// <summary>Giải mã; null khi chuỗi không phải XData của bộ lệnh vẽ.</summary>
    public static VeXDataInfo? GiaiMa(IEnumerable<string> chuoi)
    {
        var co = false;
        VaiTroVe vaiTro = VaiTroVe.Tim;
        string he = "", item = "", size = "", rp = "";
        var custom = false;
        string? doDoc = null, tim = null, tuyenCat = null, ngay = null, tenMc = null;
        string? blockId = null, thuVien = null;
        string? sizeLoCho = null, ketCau = null, viTriTruc = null, loaiBang = null;
        double? caoDo = null, caoDoMm = null;
        string? kieuNoi = null;
        var kieuNoiGhiDe = false;
        int? soDot = null, soMoiNoi = null, chiSoDot = null;
        string? timGiao = null;
        var daoTay = false;
        double? tongDaiDotMm = null;
        var tagKhoa = false;
        var bien = new List<string>();
        var nhan = new List<string>();

        foreach (var dong in chuoi)
        {
            var dau = dong.IndexOf('=');
            if (dau <= 0) continue;
            var khoa = dong[..dau];
            var giaTri = dong[(dau + 1)..];
            switch (khoa)
            {
                case KhoaPhienBan: co = true; break;
                case "vaitro":
                    vaiTro = giaTri switch
                    {
                        "bien" => VaiTroVe.Bien,
                        "nhan" => VaiTroVe.Nhan,
                        "tuyencat" => VaiTroVe.TuyenCat,
                        "matcat" => VaiTroVe.MatCat,
                        "phukien" => VaiTroVe.PhuKien,
                        "thietbi" => VaiTroVe.ThietBi,
                        "giado" => VaiTroVe.GiaDo,
                        "locho" => VaiTroVe.LoCho,
                        "bang" => VaiTroVe.BangThongKe,
                        "vachchia" => VaiTroVe.VachChia,
                        "nhandot" => VaiTroVe.NhanDot,
                        "ngatnet" => VaiTroVe.NgatNet,
                        "blockdef" => VaiTroVe.DinhNghiaBlock,
                        _ => VaiTroVe.Tim,
                    };
                    break;
                case "he": he = giaTri; break;
                case "item": item = giaTri; break;
                case "size": size = giaTri; break;
                case "rp": rp = giaTri; break;
                case "custom": custom = giaTri == "1"; break;
                case "dodoc": doDoc = giaTri; break;
                case "tim": tim = giaTri; break;
                case "blockid": blockId = giaTri; break;
                case "tv": thuVien = giaTri; break;
                case "bien": bien.Add(giaTri); break;
                case "nhan": nhan.Add(giaTri); break;
                case "tuyencat": tuyenCat = giaTri; break;
                case "ngay": ngay = giaTri; break;
                case "tenmc": tenMc = giaTri; break;
                case "caodo":
                    if (double.TryParse(giaTri, NumberStyles.Float, CultureInfo.InvariantCulture, out var cd))
                        caoDo = cd;
                    break;
                case "sizelc": sizeLoCho = giaTri; break;
                case "ketcau": ketCau = giaTri; break;
                case "truc": viTriTruc = giaTri; break;
                case "caodomm":
                    if (double.TryParse(giaTri, NumberStyles.Float, CultureInfo.InvariantCulture, out var cdm))
                        caoDoMm = cdm;
                    break;
                case "tagkhoa": tagKhoa = giaTri == "1"; break;
                case "bang": loaiBang = giaTri; break;
                case "kieunoi": kieuNoi = giaTri; break;
                case "kieunoighide": kieuNoiGhiDe = giaTri == "1"; break;
                case "sodot":
                    if (int.TryParse(giaTri, NumberStyles.Integer, CultureInfo.InvariantCulture, out var sd))
                        soDot = sd;
                    break;
                case "somoi":
                    if (int.TryParse(giaTri, NumberStyles.Integer, CultureInfo.InvariantCulture, out var sm))
                        soMoiNoi = sm;
                    break;
                case "tongdaidot":
                    if (double.TryParse(giaTri, NumberStyles.Float, CultureInfo.InvariantCulture, out var td))
                        tongDaiDotMm = td;
                    break;
                case "chisodot":
                    if (int.TryParse(giaTri, NumberStyles.Integer, CultureInfo.InvariantCulture, out var cs))
                        chiSoDot = cs;
                    break;
                case "timgiao": timGiao = giaTri; break;
                case "daotay": daoTay = giaTri == "1"; break;
                // khóa lạ (PR sau) — bỏ qua, không coi là dữ liệu hỏng
            }
        }
        if (!co) return null;
        return new VeXDataInfo
        {
            VaiTro = vaiTro,
            HeId = he,
            ItemId = item,
            Size = size,
            RulePackVersion = rp,
            SizeTuNhap = custom,
            DoDoc = doDoc,
            HandleTim = tim,
            HandleBien = bien,
            HandleNhan = nhan,
            HandleTuyenCat = tuyenCat,
            NgayTao = ngay,
            TenMatCat = tenMc,
            CaoDo = caoDo,
            BlockId = blockId,
            ThuVienVersion = thuVien,
            SizeLoCho = sizeLoCho,
            KetCau = ketCau,
            ViTriTruc = viTriTruc,
            CaoDoMm = caoDoMm,
            TagKhoa = tagKhoa,
            LoaiBang = loaiBang,
            KieuNoi = kieuNoi,
            KieuNoiGhiDe = kieuNoiGhiDe,
            SoDot = soDot,
            SoMoiNoi = soMoiNoi,
            TongDaiDotMm = tongDaiDotMm,
            ChiSoDot = chiSoDot,
            HandleTimGiao = timGiao,
            DaoTay = daoTay,
        };
    }
}
