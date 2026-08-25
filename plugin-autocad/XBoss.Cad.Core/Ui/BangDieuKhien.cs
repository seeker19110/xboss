using System.Text.Json;
using XBoss.Cad.Core.Api;

namespace XBoss.Cad.Core.Ui;

/// <summary>Mức độ của một dòng trạng thái — quyết định màu chữ trên bảng điều khiển.</summary>
public enum MucDo { BinhThuong, Tot, CanhBao }

/// <summary>Một dòng trên bảng điều khiển: nhãn mục + nội dung + mức độ.</summary>
public sealed record DongTrangThai(string Muc, string NoiDung, MucDo MucDo);

/// <summary>
/// Một khối (section) trên bảng điều khiển, kèm lệnh gợi ý (nút hành động nhanh).
/// <paramref name="NhanLenh"/> = chữ trên nút; null thì Adapter tự đặt "Chạy &lt;lệnh&gt;".
/// </summary>
public sealed record KhoiTrangThai(
    string TieuDe,
    IReadOnlyList<DongTrangThai> Dong,
    string? LenhGoiY,
    string? NhanLenh = null);

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

    // ===== Thư viện block + đề xuất (M103 §4) =====

    /// <summary>Version thư viện block trong cache; null = chưa có/không dùng được.</summary>
    public string? ThuVienVersion { get; init; }
    public int SoBlockThuVien { get; init; }
    /// <summary>Lý do thư viện block không dùng được (cache hỏng/chưa tải).</summary>
    public string? LoiThuVien { get; init; }

    /// <summary>Đề xuất block lấy từ server (Admin/PM: của cả đội) — rỗng khi chưa gọi được.</summary>
    public IReadOnlyList<XBossApiClient.DeXuatTomTat> DeXuat { get; init; } = [];
    /// <summary>Người đang xem là Admin/PM (thấy đề xuất của cả đội, duyệt trên web).</summary>
    public bool LaNguoiDuyet { get; init; }
    /// <summary>Vì sao chưa lấy được danh sách đề xuất (mất mạng/chưa ghép thiết bị).</summary>
    public string? LoiDeXuat { get; init; }
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
            KhoiThuVienBlock(t),
            new("Bản vẽ hiện hành", banVe, null),
        ];
    }

    /// <summary>
    /// Khối "Thư viện block" (M103 §4): version thư viện đang dùng + trạng thái đề xuất
    /// (chờ duyệt + kết quả gần nhất). Chưa có thư viện thì nút đổi thành nạp thư viện — đề xuất
    /// bắt buộc dựng trên thư viện hiện hành nên không có thư viện là không đề xuất được.
    /// </summary>
    private static KhoiTrangThai KhoiThuVienBlock(TrangThaiPhien t)
    {
        var dong = new List<DongTrangThai>
        {
            t.ThuVienVersion is null
                ? new("Thư viện", t.LoiThuVien ?? "Chưa có trên máy — chạy XBOSS_LOGIN hoặc XBOSS_VE_THUVIEN", MucDo.CanhBao)
                : new("Thư viện", $"{t.ThuVienVersion} — {t.SoBlockThuVien} block", MucDo.Tot),
        };

        var nhanDeXuat = t.LaNguoiDuyet ? "Đề xuất (cả đội)" : "Đề xuất của tôi";
        if (t.LoiDeXuat is not null)
        {
            dong.Add(new(nhanDeXuat, t.LoiDeXuat, MucDo.BinhThuong));
        }
        else
        {
            var cho = t.DeXuat.Where(d => d.Status == "pending").ToList();
            dong.Add(cho.Count == 0
                ? new DongTrangThai(nhanDeXuat, "Không có đề xuất nào chờ duyệt", MucDo.BinhThuong)
                : new DongTrangThai(
                    nhanDeXuat,
                    $"{cho.Count} chờ duyệt: {string.Join(", ", cho.Select(d => d.BlockName))}",
                    MucDo.CanhBao));

            // Kết quả gần nhất (server trả mới nhất trước) — người đề xuất phải thấy được vì sao
            // bị từ chối, và block đã lên thư viện version nào khi được duyệt.
            if (t.DeXuat.FirstOrDefault(d => d.Status != "pending") is { } ganNhat)
            {
                var chiTiet = ganNhat.Status switch
                {
                    "approved" => ganNhat.PublishedVersion is { Length: > 0 } v
                        ? $"đã duyệt → thư viện {v}"
                        : "đã duyệt",
                    "rejected" => $"bị từ chối — {ganNhat.RejectReason ?? "không ghi lý do"}",
                    "stale" => "thư viện đã đổi version — dựng lại bằng XBOSS_VE_DEXUAT",
                    _ => ganNhat.StatusNhan,
                };
                dong.Add(new("Gần nhất", $"{ganNhat.BlockName}: {chiTiet}",
                    ganNhat.Status == "approved" ? MucDo.Tot : MucDo.CanhBao));
            }
        }

        return t.ThuVienVersion is null
            ? new KhoiTrangThai("Thư viện block", dong, "XBOSS_VE_THUVIEN", "Nạp thư viện block")
            : new KhoiTrangThai("Thư viện block", dong, "XBOSS_VE_DEXUAT", "Đề xuất block…");
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
