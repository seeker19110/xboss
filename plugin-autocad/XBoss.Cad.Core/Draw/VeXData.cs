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
    /// Revision cloud và tam giác mang số revision (<c>XBOSS_VE_REV</c> — M110 FR3). Mang
    /// <see cref="VeXDataInfo.SoRevision"/>, danh sách handle đối tượng nằm trong vùng
    /// (<see cref="VeXDataInfo.HandleTrongVung"/>) và <see cref="VeXDataInfo.HandleCapDoi"/>
    /// (cloud ↔ tam giác) để xóa/sửa luôn đi cặp — cùng kiểu liên kết 2 chiều tim↔biên của M100.
    /// </summary>
    Revision,
    /// Đối tượng ngắt nét giao chéo (<c>XBOSS_VE_NGATNET</c> — M109 FR5): wipeout che vùng giao
    /// hoặc cầu vượt. Mang <see cref="VeXDataInfo.HandleTim"/> = tim ĐI DƯỚI và
    /// <see cref="VeXDataInfo.HandleTimGiao"/> = tim đi trên, nên lệnh xóa/chạy lại tìm đúng đối
    /// tượng của đúng CẶP tuyến (FR6 idempotent). KHÔNG BAO GIỜ đụng vào polyline tim (guardrail 1).
    /// </summary>
    NgatNet,

    /// <summary>
    /// Polyline tim HÀNH LANG do <c>XBOSS_VE_HANHLANG</c> vẽ mới hoặc NHẬN từ polyline có sẵn
    /// (M114 FR3). Mang bề rộng khả dụng, cao độ đáy dầm/trần, danh sách hệ được phép đi qua và
    /// sổ chiếm chỗ <see cref="VeXDataInfo.LanDaCap"/> — nhờ đó trạng thái chiếm làn SỐNG TRONG
    /// BẢN VẼ, hệ chạy sau đọc được ngay cả khi mở lại bản vẽ hôm khác.
    /// </summary>
    HanhLang,
}

/// <summary>
/// Một bản ghi chiếm chỗ trong sổ <see cref="VeXDataInfo.LanDaCap"/> của hành lang (M114 FR3):
/// hệ nào, tầng nào, chiếm làn từ đâu tới đâu (mm tính từ MÉP TRÁI hành lang — cùng gốc đo với
/// <c>planMultiTierCorridor</c> bên TS, xem <see cref="Routing.CapPhatLanTang"/>) và ở cao độ nào.
/// </summary>
public sealed record LanChiem(string HeId, string TierId, double LanTuMm, double LanDenMm, double CaoDoMm)
{
    /// <summary>Bề rộng làn đã chiếm (mm).</summary>
    public double BeRongMm => Math.Abs(LanDenMm - LanTuMm);
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
    ///
    /// <para>M115 §6 bước 2: trên vai trò <see cref="VaiTroVe.Tim"/>, đây là CAO ĐỘ TIM TUYẾN do
    /// <c>XBOSS_TUYEN_GAN</c> ghi — cùng đơn vị mm, cùng khóa XData <c>caodomm</c>, vì
    /// <c>TuyenDauVao.CaoDoMm</c> của bộ dựng đồ thị cũng đo bằng mm.</para>
    /// </summary>
    public double? CaoDoMm { get; init; }

    /// <summary>
    /// Vật liệu tuyến do kỹ sư gõ tay ở <c>XBOSS_TUYEN_GAN</c> (M115 §6 bước 2). Rule pack không
    /// khai danh mục vật liệu nên đây là chuỗi tự do; null = kỹ sư để trống.
    /// </summary>
    public string? VatLieu { get; init; }

    /// <summary>Cách nhiệt tuyến, cùng cơ chế gõ tay như <see cref="VatLieu"/>.</summary>
    public string? CachNhiet { get; init; }

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

    // ===== Revision cloud (M110 FR3) — có trên CẢ cloud lẫn tam giác của vai trò Revision.

    /// <summary>Số revision của cloud/tam giác (số nguyên: 1 = R1). null = không phải đối tượng revision.</summary>
    public int? SoRevision { get; init; }

    /// <summary>Handle của đối tượng đi cặp: trên cloud là tam giác, trên tam giác là cloud (FR3/FR8).</summary>
    public string? HandleCapDoi { get; init; }

    /// <summary>Handle các đối tượng nằm trong vùng cloud — nguồn của cảnh báo bỏ sót (FR5).</summary>
    public IReadOnlyList<string> HandleTrongVung { get; init; } = [];
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

    // ===== Nhân bản tầng điển hình (M111 FR9) =====
    // Hai khóa dưới đây CHỈ có trên bản chép do XBOSS_VE_NHANTANG sinh ra — dấu nhận diện để chạy
    // lại lệnh biết tầng đích đã chép rồi (bỏ qua / chép đè), và để báo cáo truy được nguồn gốc.

    /// <summary>Nhãn tầng NGUỒN đã chép ra đối tượng này; null = không phải bản chép.</summary>
    public string? TangNguon { get; init; }

    /// <summary>Nhãn tầng của chính bản chép này (tầng đích).</summary>
    public string? NhanTang { get; init; }

    // ===== Hành lang + đi tuyến tự động (M114 FR3/FR11/FR12) =====

    /// <summary>Bề rộng khả dụng của hành lang (mm) — vai trò <see cref="VaiTroVe.HanhLang"/>.</summary>
    public double? BeRongMm { get; init; }

    /// <summary>Cao độ đáy dầm của đoạn hành lang (mm) — HỎI kỹ sư, không suy (M100 §6.3).</summary>
    public double? CotDayDamMm { get; init; }

    /// <summary>Cao độ trần của đoạn hành lang (mm) — HỎI kỹ sư, không suy.</summary>
    public double? CotTranMm { get; init; }

    /// <summary>Id hệ được phép đi qua hành lang; rỗng = mọi hệ (mặc định FR2).</summary>
    public IReadOnlyList<string> HeChoPhep { get; init; } = [];

    /// <summary>Sổ chiếm chỗ của hành lang — mỗi hệ chạy qua ghi thêm một bản ghi (FR3/FR9).</summary>
    public IReadOnlyList<LanChiem> LanDaCap { get; init; } = [];

    /// <summary>Tuyến do <c>XBOSS_VE_TUYENTUDONG</c> sinh (FR11) — chạy lại được phép dựng lại.</summary>
    public bool TuDong { get; init; }

    /// <summary>Mã phiên chạy đã sinh tuyến này — gỡ đúng chiếm chỗ của phiên đó khi chạy lại (FR13).</summary>
    public string? PhienTuyen { get; init; }

    /// <summary>Kỹ sư đã sửa hình học tuyến tự động (FR12) — chạy lại BỎ QUA, không đè công của người.</summary>
    public bool SuaTay { get; init; }

    /// <summary>
    /// Băm hình học của tuyến tự động NGAY LÚC SINH (<see cref="RevisionSnapshot.BamHinhHoc"/> —
    /// cùng cơ chế mốc của M110, làm tròn 0,1 mm). Lần chạy sau băm lại đỉnh hiện tại: lệch nghĩa
    /// là kỹ sư đã kéo/sửa tay ⇒ đặt <see cref="SuaTay"/> và BỎ QUA tuyến đó (M114 FR12).
    ///
    /// <para>Băm sống ngay trên đối tượng chứ không nằm trong một mốc riêng ở Named Objects
    /// Dictionary: trạng thái của M114 luôn sống trong bản vẽ (FR3), nên tuyến copy sang bản vẽ
    /// khác vẫn tự mang theo mốc so của chính nó.</para>
    /// </summary>
    public string? BamHinhHoc { get; init; }
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
        Them(ra, "vatlieu", tt.VatLieu);
        Them(ra, "cachnhiet", tt.CachNhiet);
        if (tt.TagKhoa) ra.Add("tagkhoa=1");
        Them(ra, "bang", tt.LoaiBang);
        Them(ra, "kieunoi", tt.KieuNoi);
        if (tt.KieuNoiGhiDe) ra.Add("kieunoighide=1");
        if (tt.SoDot is { } sd) ra.Add($"sodot={sd.ToString(CultureInfo.InvariantCulture)}");
        if (tt.SoMoiNoi is { } sm) ra.Add($"somoi={sm.ToString(CultureInfo.InvariantCulture)}");
        if (tt.TongDaiDotMm is { } td)
            ra.Add($"tongdaidot={td.ToString("0.######", CultureInfo.InvariantCulture)}");
        if (tt.ChiSoDot is { } cs) ra.Add($"chisodot={cs.ToString(CultureInfo.InvariantCulture)}");
        if (tt.SoRevision is { } sr) ra.Add($"rev={sr.ToString(CultureInfo.InvariantCulture)}");
        Them(ra, "capdoi", tt.HandleCapDoi);
        foreach (var h in tt.HandleTrongVung) Them(ra, "trongvung", h);
        Them(ra, "timgiao", tt.HandleTimGiao);
        if (tt.DaoTay) ra.Add("daotay=1");
        Them(ra, "tangnguon", tt.TangNguon);
        Them(ra, "nhantang", tt.NhanTang);
        if (tt.BeRongMm is { } br) ra.Add($"berong={So(br)}");
        if (tt.CotDayDamMm is { } cdd) ra.Add($"cotdaydam={So(cdd)}");
        if (tt.CotTranMm is { } ct) ra.Add($"cottran={So(ct)}");
        foreach (var h in tt.HeChoPhep) Them(ra, "hecho", h);
        foreach (var l in tt.LanDaCap)
            ra.Add($"lan={l.HeId}|{l.TierId}|{So(l.LanTuMm)}|{So(l.LanDenMm)}|{So(l.CaoDoMm)}");
        if (tt.TuDong) ra.Add("tudong=1");
        Them(ra, "phien", tt.PhienTuyen);
        if (tt.SuaTay) ra.Add("suatay=1");
        Them(ra, "bamhh", tt.BamHinhHoc);
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
        VaiTroVe.Revision => "revision",
        VaiTroVe.NgatNet => "ngatnet",
        VaiTroVe.HanhLang => "hanhlang",
        _ => "blockdef",
    };

    private static string So(double v) => v.ToString("0.######", CultureInfo.InvariantCulture);

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
        string? vatLieu = null, cachNhiet = null;
        string? tangNguon = null, nhanTang = null;
        var kieuNoiGhiDe = false;
        int? soDot = null, soMoiNoi = null, chiSoDot = null;
        string? timGiao = null;
        var daoTay = false;
        double? tongDaiDotMm = null;
        var tagKhoa = false;
        int? soRevision = null;
        string? handleCapDoi = null;
        var bien = new List<string>();
        var nhan = new List<string>();
        var trongVung = new List<string>();
        var heChoPhep = new List<string>();
        var lanDaCap = new List<LanChiem>();
        double? beRongMm = null, cotDayDamMm = null, cotTranMm = null;
        string? phienTuyen = null;
        string? bamHinhHoc = null;
        var tuDong = false;
        var suaTay = false;

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
                        "revision" => VaiTroVe.Revision,
                        "ngatnet" => VaiTroVe.NgatNet,
                        "hanhlang" => VaiTroVe.HanhLang,
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
                case "vatlieu": vatLieu = giaTri; break;
                case "cachnhiet": cachNhiet = giaTri; break;
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
                case "rev":
                    if (int.TryParse(giaTri, NumberStyles.Integer, CultureInfo.InvariantCulture, out var sr))
                        soRevision = sr;
                    break;
                case "capdoi": handleCapDoi = giaTri; break;
                case "trongvung": trongVung.Add(giaTri); break;
                case "timgiao": timGiao = giaTri; break;
                case "daotay": daoTay = giaTri == "1"; break;
                case "tangnguon": tangNguon = giaTri; break;
                case "nhantang": nhanTang = giaTri; break;
                case "berong":
                    if (double.TryParse(giaTri, NumberStyles.Float, CultureInfo.InvariantCulture, out var br2))
                        beRongMm = br2;
                    break;
                case "cotdaydam":
                    if (double.TryParse(giaTri, NumberStyles.Float, CultureInfo.InvariantCulture, out var cdd2))
                        cotDayDamMm = cdd2;
                    break;
                case "cottran":
                    if (double.TryParse(giaTri, NumberStyles.Float, CultureInfo.InvariantCulture, out var ct2))
                        cotTranMm = ct2;
                    break;
                case "hecho": heChoPhep.Add(giaTri); break;
                case "lan":
                    if (DocLanChiem(giaTri) is { } lan) lanDaCap.Add(lan);
                    break;
                case "tudong": tuDong = giaTri == "1"; break;
                case "phien": phienTuyen = giaTri; break;
                case "suatay": suaTay = giaTri == "1"; break;
                case "bamhh": bamHinhHoc = giaTri; break;
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
            VatLieu = vatLieu,
            CachNhiet = cachNhiet,
            TagKhoa = tagKhoa,
            LoaiBang = loaiBang,
            KieuNoi = kieuNoi,
            KieuNoiGhiDe = kieuNoiGhiDe,
            SoDot = soDot,
            SoMoiNoi = soMoiNoi,
            TongDaiDotMm = tongDaiDotMm,
            ChiSoDot = chiSoDot,
            SoRevision = soRevision,
            HandleCapDoi = handleCapDoi,
            HandleTrongVung = trongVung,
            HandleTimGiao = timGiao,
            DaoTay = daoTay,
            TangNguon = tangNguon,
            NhanTang = nhanTang,
            BeRongMm = beRongMm,
            CotDayDamMm = cotDayDamMm,
            CotTranMm = cotTranMm,
            HeChoPhep = heChoPhep,
            LanDaCap = lanDaCap,
            TuDong = tuDong,
            PhienTuyen = phienTuyen,
            SuaTay = suaTay,
            BamHinhHoc = bamHinhHoc,
        };
    }

    /// <summary>Đọc một bản ghi chiếm chỗ <c>heId|tierId|tu|den|caodo</c>; null nếu dòng hỏng.</summary>
    private static LanChiem? DocLanChiem(string giaTri)
    {
        var phan = giaTri.Split('|');
        if (phan.Length != 5) return null;
        if (!double.TryParse(phan[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var tu)) return null;
        if (!double.TryParse(phan[3], NumberStyles.Float, CultureInfo.InvariantCulture, out var den)) return null;
        if (!double.TryParse(phan[4], NumberStyles.Float, CultureInfo.InvariantCulture, out var caoDo)) return null;
        return new LanChiem(phan[0], phan[1], tu, den, caoDo);
    }
}
