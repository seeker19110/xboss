using System.Text.Json;
using System.Text.Json.Serialization;

namespace XBoss.Cad.Core.Coordination;

/// <summary>
/// Tóm tắt xung đột phối hợp của MỘT LỚP KIỂM (M116 PR3 §6 bước 5) — nguồn duy nhất cho cả mục
/// <c>phoiHop</c> trong <c>VeSessionReport</c> (báo cáo phiên vẽ), sidecar
/// <c>&lt;dwg&gt;.xboss-phoihop.json</c> gửi kèm <c>XBOSS_UPLOAD</c>, và panel web trên
/// <c>/engineering/chuan-hoa-ban-ve</c> — ba nơi đọc CÙNG một con số, không mỗi nơi tự đếm một kiểu.
/// </summary>
public sealed record PhoiHopTomTatLop
{
    /// <summary>Khóa lớp kiểm (<c>LopKiem</c> dạng chuỗi) — ổn định qua các version rule pack.</summary>
    [JsonPropertyName("lop")] public required string Lop { get; init; }

    /// <summary>Nhãn tiếng Việt (<see cref="NhanLopKiem"/>) — nguồn chữ hiển thị duy nhất.</summary>
    [JsonPropertyName("nhan")] public required string Nhan { get; init; }

    [JsonPropertyName("tongSo")] public required int TongSo { get; init; }
    [JsonPropertyName("soCung")] public required int SoCung { get; init; }
    [JsonPropertyName("soMem")] public required int SoMem { get; init; }
    [JsonPropertyName("soCanhBao")] public required int SoCanhBao { get; init; }
    [JsonPropertyName("soChuaXuLy")] public required int SoChuaXuLy { get; init; }
    [JsonPropertyName("soChapNhan")] public required int SoChapNhan { get; init; }
    [JsonPropertyName("soBoQua")] public required int SoBoQua { get; init; }
}

/// <summary>
/// Tóm tắt TOÀN BỘ xung đột phối hợp của một lần quét (<c>XBOSS_PHOIHOP</c>/
/// <c>XBOSS_PHOIHOP_BAOCAO</c>) — tổng cộng + chia theo <see cref="LopKiem"/>. THUẦN — không chạm
/// AutoCAD lẫn WPF, test CI.
/// </summary>
public sealed class PhoiHopTomTat
{
    [JsonPropertyName("tongSo")] public required int TongSo { get; init; }
    [JsonPropertyName("soCung")] public required int SoCung { get; init; }
    [JsonPropertyName("soMem")] public required int SoMem { get; init; }
    [JsonPropertyName("soCanhBao")] public required int SoCanhBao { get; init; }
    [JsonPropertyName("soChuaXuLy")] public required int SoChuaXuLy { get; init; }
    [JsonPropertyName("soChapNhan")] public required int SoChapNhan { get; init; }
    [JsonPropertyName("soBoQua")] public required int SoBoQua { get; init; }
    [JsonPropertyName("theoLop")] public required IReadOnlyList<PhoiHopTomTatLop> TheoLop { get; init; }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public string ToJson() => JsonSerializer.Serialize(this, JsonOptions);

    /// <summary>
    /// Dựng tóm tắt từ danh sách (xung đột, trạng thái xử lý) — Adapter/ViewModel truyền vào cặp
    /// này từ <c>DongXungDot</c> (<c>d.XungDot, d.TrangThai</c>) để Core KHÔNG phải biết tới
    /// <c>Ui.ViewModels</c> (tránh vòng phụ thuộc ngược — <c>DongXungDot</c> vốn đã tham chiếu
    /// <c>Coordination</c>, không phải chiều ngược lại).
    /// </summary>
    public static PhoiHopTomTat Tu(IReadOnlyList<(XungDot XungDot, TrangThaiXungDot TrangThai)> dong)
    {
        var theoLop = dong
            .GroupBy(d => d.XungDot.Lop)
            .OrderBy(g => g.Key)
            .Select(g => new PhoiHopTomTatLop
            {
                Lop = g.Key.ToString(),
                Nhan = NhanLopKiem.Cua(g.Key),
                TongSo = g.Count(),
                SoCung = g.Count(d => d.XungDot.Muc == MucXungDot.Cung),
                SoMem = g.Count(d => d.XungDot.Muc == MucXungDot.Mem),
                SoCanhBao = g.Count(d => d.XungDot.Muc == MucXungDot.CanhBao),
                SoChuaXuLy = g.Count(d => d.TrangThai == TrangThaiXungDot.ChuaXuLy),
                SoChapNhan = g.Count(d => d.TrangThai == TrangThaiXungDot.ChapNhan),
                SoBoQua = g.Count(d => d.TrangThai == TrangThaiXungDot.BoQua),
            })
            .ToList();

        return new PhoiHopTomTat
        {
            TongSo = dong.Count,
            SoCung = dong.Count(d => d.XungDot.Muc == MucXungDot.Cung),
            SoMem = dong.Count(d => d.XungDot.Muc == MucXungDot.Mem),
            SoCanhBao = dong.Count(d => d.XungDot.Muc == MucXungDot.CanhBao),
            SoChuaXuLy = dong.Count(d => d.TrangThai == TrangThaiXungDot.ChuaXuLy),
            SoChapNhan = dong.Count(d => d.TrangThai == TrangThaiXungDot.ChapNhan),
            SoBoQua = dong.Count(d => d.TrangThai == TrangThaiXungDot.BoQua),
            TheoLop = theoLop,
        };
    }
}
