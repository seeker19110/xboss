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
    /// <summary>Block phụ kiện chèn trên tuyến tim (co, tê, van, miệng gió… — M100 FR5).</summary>
    PhuKien,
    /// <summary>Block thiết bị có attribute (FCU/AHU/đầu phun — M100 FR6).</summary>
    ThietBi,
    /// <summary>
    /// ĐỊNH NGHĨA block (BlockTableRecord) do plugin nhập từ thư viện — mang version thư viện để
    /// lần chèn sau biết định nghĩa trong bản vẽ đến từ đâu (M100 §6.10/AC7).
    /// </summary>
    DinhNghiaBlock,
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
    /// <summary>Id block trong manifest thư viện (phụ kiện/thiết bị/định nghĩa block).</summary>
    public string? BlockId { get; init; }
    /// <summary>Version thư viện block mà định nghĩa/khối chèn ra lấy từ đó (M100 §6.10).</summary>
    public string? ThuVienVersion { get; init; }
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
        return ra;
    }

    private static string MaVaiTro(VaiTroVe vaiTro) => vaiTro switch
    {
        VaiTroVe.Tim => "tim",
        VaiTroVe.Bien => "bien",
        VaiTroVe.Nhan => "nhan",
        VaiTroVe.PhuKien => "phukien",
        VaiTroVe.ThietBi => "thietbi",
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
        string? doDoc = null, tim = null, blockId = null, thuVien = null;
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
                        "phukien" => VaiTroVe.PhuKien,
                        "thietbi" => VaiTroVe.ThietBi,
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
            BlockId = blockId,
            ThuVienVersion = thuVien,
        };
    }
}
