using System.Text.Json;

namespace XBoss.Cad.Core.Ui;

/// <summary>Mức độ của một dòng trạng thái — quyết định màu chữ trên bảng điều khiển.</summary>
public enum MucDo { BinhThuong, Tot, CanhBao }

/// <summary>Một dòng trên bảng điều khiển: nhãn mục + nội dung + mức độ.</summary>
public sealed record DongTrangThai(string Muc, string NoiDung, MucDo MucDo);

/// <summary>Một khối (section) trên bảng điều khiển, kèm lệnh gợi ý (nút hành động nhanh).</summary>
public sealed record KhoiTrangThai(string TieuDe, IReadOnlyList<DongTrangThai> Dong, string? LenhGoiY);

/// <summary>
/// Trạng thái phiên plugin — dữ liệu THÔ do Adapter gom (đọc CredentialStore/RulePackStore/
/// sidecar JSON cạnh DWG). Tách record thuần để logic dựng bảng test được không cần AutoCAD.
/// </summary>
public sealed record TrangThaiPhien
{
    public string? ServerUrl { get; init; }
    public bool DaGhepThietBi { get; init; }
    public string? RulePackVersion { get; init; }
    public int SoQuyTacBoc { get; init; }
    public int SoNhomLayer { get; init; }
    public string? LoiRulePack { get; init; }
    /// <summary>Tên tệp bản vẽ đang mở; null khi bản vẽ chưa lưu/không có tài liệu.</summary>
    public string? TenBanVe { get; init; }
    /// <summary>Tóm tắt các sidecar JSON cạnh DWG (kiểm tra/chuẩn hóa/bóc tách/phiên vẽ).</summary>
    public IReadOnlyList<DongTrangThai> KetQuaGanNhat { get; init; } = [];
}

/// <summary>
/// Dựng nội dung bảng điều khiển (M102) từ trạng thái phiên — LOGIC THUẦN, không chạm
/// AutoCAD/WinForms, test ở <c>BangDieuKhienTests</c>. Adapter chỉ vẽ đúng những khối này.
/// </summary>
public static class BangDieuKhienModel
{
    public static IReadOnlyList<KhoiTrangThai> Dung(TrangThaiPhien t)
    {
        var ketNoi = new List<DongTrangThai>
        {
            new("Server", t.ServerUrl ?? "Chưa cấu hình — chạy XBOSS_LOGIN", t.ServerUrl is null ? MucDo.CanhBao : MucDo.BinhThuong),
            t.DaGhepThietBi
                ? new("Thiết bị", "Đã ghép — token trong Credential Manager", MucDo.Tot)
                : new("Thiết bị", "Chưa ghép — upload/đối chiếu BOQ sẽ từ chối chạy", MucDo.CanhBao),
        };

        var rulePack = new List<DongTrangThai>();
        if (t.LoiRulePack is not null)
        {
            rulePack.Add(new("Rule pack", t.LoiRulePack, MucDo.CanhBao));
        }
        else if (t.RulePackVersion is null)
        {
            rulePack.Add(new("Rule pack", "Chưa nạp — mọi lệnh kiểm tra/chuẩn hóa/bóc tách/vẽ sẽ từ chối chạy", MucDo.CanhBao));
        }
        else
        {
            rulePack.Add(new("Rule pack", $"{t.RulePackVersion} — {t.SoQuyTacBoc} quy tắc bóc tách, {t.SoNhomLayer} nhóm layer", MucDo.Tot));
        }

        var banVe = new List<DongTrangThai>
        {
            new("Bản vẽ", t.TenBanVe ?? "Chưa lưu/chưa mở bản vẽ nào", t.TenBanVe is null ? MucDo.CanhBao : MucDo.BinhThuong),
        };
        banVe.AddRange(t.KetQuaGanNhat.Count > 0
            ? t.KetQuaGanNhat
            : [new DongTrangThai("Kết quả", "Chưa có báo cáo nào cạnh bản vẽ này", MucDo.BinhThuong)]);

        return
        [
            new("Kết nối XBoss", ketNoi, t.DaGhepThietBi ? null : "XBOSS_LOGIN"),
            new("Rule pack", rulePack, t.RulePackVersion is null ? "XBOSS_RULEPACK" : null),
            new("Bản vẽ hiện hành", banVe, null),
        ];
    }
}

/// <summary>
/// Đọc tóm tắt 1 dòng từ các sidecar JSON mà các lệnh XBOSS_* ghi cạnh DWG
/// (<c>.xboss-kiemtra.json</c> / <c>.xboss-report.json</c> / <c>.xboss-takeoff.json</c> /
/// <c>.xboss-ve.json</c>). Parse PHÒNG THỦ bằng JsonDocument: sidecar hỏng/format lạ
/// → trả null, không ném — bảng điều khiển không được sập vì một tệp báo cáo cũ.
/// </summary>
public static class SidecarSummary
{
    /// <summary>Đuôi tệp sidecar (nối sau đường dẫn DWG đầy đủ) → nhãn mục hiển thị.</summary>
    public static readonly IReadOnlyList<(string DuoiTep, string Nhan)> CacLoai =
    [
        (".xboss-kiemtra.json", "Kiểm tra"),
        (".xboss-report.json", "Chuẩn hóa"),
        (".xboss-takeoff.json", "Bóc KL"),
        (".xboss-ve.json", "Phiên vẽ"),
    ];

    public static DongTrangThai? TomTat(string nhan, string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var goc = doc.RootElement;
            if (goc.ValueKind != JsonValueKind.Object) return null;

            var ngay = Chuoi(goc, "ngayIso");
            var version = Chuoi(goc, "rulePackVersion");
            var duoi = string.Join(" · ", new[] { version, ngay }.Where(s => s is not null));
            if (duoi.Length > 0) duoi = $" ({duoi})";

            return nhan switch
            {
                "Kiểm tra" => TomTatKiemTra(goc, duoi),
                "Chuẩn hóa" => TomTatMang(goc, "steps", "bước sửa", duoi),
                "Bóc KL" => TomTatMang(goc, "lines", "dòng khối lượng", duoi),
                "Phiên vẽ" => new DongTrangThai("Phiên vẽ", $"Có báo cáo phiên vẽ{duoi}", MucDo.BinhThuong),
                _ => null,
            };
        }
        catch (JsonException)
        {
            return null;
        }

        DongTrangThai TomTatKiemTra(JsonElement goc, string duoi)
        {
            var soLoi = goc.TryGetProperty("tongSoLoi", out var e) && e.ValueKind == JsonValueKind.Number
                ? e.GetInt32()
                : (goc.TryGetProperty("findings", out var f) && f.ValueKind == JsonValueKind.Array ? f.GetArrayLength() : 0);
            return soLoi == 0
                ? new DongTrangThai(nhan, $"Đạt chuẩn — 0 lỗi{duoi}", MucDo.Tot)
                : new DongTrangThai(nhan, $"{soLoi} lỗi lệch chuẩn{duoi}", MucDo.CanhBao);
        }

        DongTrangThai? TomTatMang(JsonElement goc, string khoa, string donVi, string duoi) =>
            goc.TryGetProperty(khoa, out var m) && m.ValueKind == JsonValueKind.Array
                ? new DongTrangThai(nhan, $"{m.GetArrayLength()} {donVi}{duoi}", MucDo.BinhThuong)
                : null;
    }

    private static string? Chuoi(JsonElement goc, string khoa) =>
        goc.TryGetProperty(khoa, out var e) && e.ValueKind == JsonValueKind.String ? e.GetString() : null;
}
