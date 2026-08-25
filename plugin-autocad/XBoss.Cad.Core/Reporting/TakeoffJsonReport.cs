using System.Text.Json;
using System.Text.Json.Serialization;
using XBoss.Cad.Core.Excel;
using XBoss.Cad.Core.Takeoff;

namespace XBoss.Cad.Core.Reporting;

/// <summary>Một dòng bóc tách trong báo cáo JSON — phẳng hóa TakeoffLine cho máy đọc.</summary>
public sealed record TakeoffJsonLine
{
    [JsonPropertyName("itemId")] public required string ItemId { get; init; }
    [JsonPropertyName("boqCode")] public required string BoqCode { get; init; }
    [JsonPropertyName("group")] public required string Group { get; init; }
    [JsonPropertyName("ten")] public required string Ten { get; init; }
    [JsonPropertyName("quyCach")] public required string QuyCach { get; init; }
    [JsonPropertyName("donVi")] public required string DonVi { get; init; }
    [JsonPropertyName("soDoiTuong")] public required int SoDoiTuong { get; init; }
    /// <summary>KL ĐO trên bản vẽ — không bao giờ gồm hao hụt/phụ kiện (M101 §18).</summary>
    [JsonPropertyName("khoiLuong")] public required double KhoiLuong { get; init; }
    [JsonPropertyName("handles")] public required IReadOnlyList<string> Handles { get; init; }

    // ===== v6 (M101 §6.3) — rỗng/0 khi rule pack chưa bật khóa nào =====

    [JsonPropertyName("size")] public string Size { get; init; } = "";
    /// <summary>Nguồn size: "XData" (chắc chắn) hay "đọc từ nhãn" (bán tự động, cần soát).</summary>
    [JsonPropertyName("nguonSize")] public string NguonSize { get; init; } = "";
    [JsonPropertyName("vung")] public string Vung { get; init; } = "";
    [JsonPropertyName("heSoQuyDoi")] public double HeSoQuyDoi { get; init; }
    [JsonPropertyName("moTaQuyDoi")] public string MoTaQuyDoi { get; init; } = "";
    /// <summary>KL QUY ĐỔI — cột riêng, chỉ có khi rule pack khai hệ số.</summary>
    [JsonPropertyName("klQuyDoi")] public double KlQuyDoi { get; init; }
    /// <summary>Dòng tính ra từ item khác (cách nhiệt) chứ không đo trực tiếp.</summary>
    [JsonPropertyName("danXuat")] public bool DanXuat { get; init; }
}

/// <summary>
/// Báo cáo bóc tách có cấu trúc (JSON) — sidecar máy-đọc-được đặt cạnh tệp Excel
/// (XBOSS_BOCKL_XUAT), chuẩn bị cho PR5 gửi kèm khi upload. Version rule pack
/// ghi trong mọi báo cáo (FR1).
/// </summary>
public sealed class TakeoffJsonReport
{
    [JsonPropertyName("rulePackVersion")] public required string RulePackVersion { get; init; }
    [JsonPropertyName("tenDuAn")] public required string TenDuAn { get; init; }
    [JsonPropertyName("goiThau")] public required string GoiThau { get; init; }
    [JsonPropertyName("tenBanVe")] public required string TenBanVe { get; init; }
    [JsonPropertyName("nguoiBoc")] public required string NguoiBoc { get; init; }
    [JsonPropertyName("ngayIso")] public required string NgayIso { get; init; }
    [JsonPropertyName("lines")] public required IReadOnlyList<TakeoffJsonLine> Lines { get; init; }
    [JsonPropertyName("canhBao")] public required IReadOnlyList<string> CanhBao { get; init; }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public string ToJson() => JsonSerializer.Serialize(this, JsonOptions);

    /// <summary>Dựng báo cáo từ kết quả bóc + meta đầu trang Excel (cùng một nguồn dữ liệu).</summary>
    public static TakeoffJsonReport TuKetQua(TakeoffResult ketQua, BoqExcelMeta meta) => new()
    {
        RulePackVersion = ketQua.RulePackVersion,
        TenDuAn = meta.TenDuAn,
        GoiThau = meta.GoiThau,
        TenBanVe = meta.TenBanVe,
        NguoiBoc = meta.NguoiBoc,
        NgayIso = meta.NgayIso,
        Lines = ketQua.Lines.Select(l => new TakeoffJsonLine
        {
            ItemId = l.Item.Id,
            BoqCode = l.Item.BoqCode,
            Group = l.Item.Group,
            Ten = l.Item.Name,
            QuyCach = l.Item.Spec,
            DonVi = l.Item.Unit,
            SoDoiTuong = l.ObjectCount,
            KhoiLuong = l.Quantity,
            Handles = l.Handles,
            Size = l.Size,
            NguonSize = TakeoffSize.MoTaNguon(l.NguonSize),
            Vung = l.Vung,
            HeSoQuyDoi = l.HeSoQuyDoi,
            MoTaQuyDoi = l.MoTaQuyDoi,
            KlQuyDoi = l.KlQuyDoi,
            DanXuat = l.LaDanXuat,
        }).ToList(),
        CanhBao = ketQua.Warnings.Select(w => w.ThongDiep).ToList(),
    };
}
