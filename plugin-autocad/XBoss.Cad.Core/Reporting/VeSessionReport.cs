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

    /// <summary>Tổng số block đã chèn của hệ (phụ kiện + thiết bị + giá đỡ + lỗ chờ).</summary>
    [JsonPropertyName("soBlock")]
    public int SoBlock => SoPhuKien + SoThietBi + SoGiaDo + SoLoCho;
}

/// <summary>Một size kỹ sư tự nhập ngoài danh mục rule pack (M100 §4 — phải soát lại).</summary>
public sealed record VeSizeCustom
{
    [JsonPropertyName("heId")] public required string HeId { get; init; }
    [JsonPropertyName("itemId")] public required string ItemId { get; init; }
    [JsonPropertyName("size")] public required string Size { get; init; }
    [JsonPropertyName("soTuyen")] public required int SoTuyen { get; init; }
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
    /// <summary>Định nghĩa block do plugin nhập từ thư viện (đánh dấu trong BlockTable).</summary>
    [JsonPropertyName("soDinhNghiaBlock")] public int SoDinhNghiaBlock { get; init; }
    [JsonPropertyName("soBangThongKe")] public int SoBangThongKe { get; init; }
    [JsonPropertyName("rulePackKhac")] public required IReadOnlyList<VeVersionKhac> RulePackKhac { get; init; }
    [JsonPropertyName("thuVienKhac")] public required IReadOnlyList<VeVersionKhac> ThuVienKhac { get; init; }
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
    public static VeSessionReport Dung(
        IEnumerable<VeXDataInfo> doiTuong, VeSessionMeta meta, IReadOnlyList<string>? nhatKy = null)
    {
        var theoHe = new Dictionary<string, VeThongKeHe>(StringComparer.Ordinal);
        var sizeCustom = new Dictionary<(string He, string Item, string Size), int>();
        var rulePackKhac = new Dictionary<string, int>(StringComparer.Ordinal);
        var thuVienKhac = new Dictionary<string, int>(StringComparer.Ordinal);
        var soDinhNghia = 0;
        var soBang = 0;

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
                default:
                    // Đối tượng mất HeId (XData bị sửa tay) vẫn phải đếm được — gom vào một nhóm
                    // riêng thay vì lặng lẽ bỏ qua.
                    var he = string.IsNullOrWhiteSpace(xd.HeId) ? "(không rõ hệ)" : xd.HeId;
                    theoHe[he] = Cong(theoHe.GetValueOrDefault(he) ?? new VeThongKeHe { HeId = he }, xd.VaiTro);
                    break;
            }

            if (xd.SizeTuNhap && !string.IsNullOrWhiteSpace(xd.Size) && xd.VaiTro == VaiTroVe.Tim)
            {
                var khoa = (xd.HeId, xd.ItemId, xd.Size);
                sizeCustom[khoa] = sizeCustom.GetValueOrDefault(khoa) + 1;
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
            SoDinhNghiaBlock = soDinhNghia,
            SoBangThongKe = soBang,
            RulePackKhac = rulePackKhac.OrderBy(k => k.Key, StringComparer.Ordinal)
                .Select(k => new VeVersionKhac { Version = k.Key, SoDoiTuong = k.Value }).ToList(),
            ThuVienKhac = thuVienKhac.OrderBy(k => k.Key, StringComparer.Ordinal)
                .Select(k => new VeVersionKhac { Version = k.Key, SoDoiTuong = k.Value }).ToList(),
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
        _ => cu,
    };

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
                $"lỗ chờ {h.SoLoCho} · mặt cắt {h.SoMatCat}");
        }
        if (SizeCustom.Count > 0)
        {
            sb.AppendLine("Size ngoài danh mục rule pack:");
            foreach (var s in SizeCustom)
                sb.AppendLine($"  - {s.HeId}/{s.ItemId}: \"{s.Size}\" ({s.SoTuyen} tuyến)");
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
