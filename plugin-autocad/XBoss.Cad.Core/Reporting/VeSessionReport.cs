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
/// kiểm 19 của XBOSS_KIEMTRA nói rõ đối tượng nào).
/// </summary>
public sealed record VeRevisionCum
{
    [JsonPropertyName("so")] public required int So { get; init; }
    [JsonPropertyName("soDoiTuong")] public required int SoDoiTuong { get; init; }
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
    /// <summary>Mục chia đốt (M105): các cụm tuyến đã chia đốt trong bản vẽ.</summary>
    [JsonPropertyName("chiaDot")] public required IReadOnlyList<VeChiaDotTuyen> ChiaDot { get; init; }
    /// <summary>Mục chia đốt (M105): các cụm tuyến chưa/không chia được (xem <see cref="VeChiaDotBoQua"/>).</summary>
    [JsonPropertyName("chiaDotBoQua")] public required IReadOnlyList<VeChiaDotBoQua> ChiaDotBoQua { get; init; }
    /// <summary>Định nghĩa block do plugin nhập từ thư viện (đánh dấu trong BlockTable).</summary>
    /// <summary>Mục revision (M110): các revision đã khoanh cloud trong bản vẽ.</summary>
    [JsonPropertyName("revision")] public IReadOnlyList<VeRevisionCum> Revision { get; init; } = [];
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
        var chiaDot = new Dictionary<(string He, string Item, string Size, string Kieu, bool GhiDe), VeChiaDotTuyen>();
        var chuaChia = new Dictionary<(string He, string Item, string Size), int>();
        var rulePackKhac = new Dictionary<string, int>(StringComparer.Ordinal);
        var thuVienKhac = new Dictionary<string, int>(StringComparer.Ordinal);
        var revision = new Dictionary<int, int>();
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

            if (xd.SizeTuNhap && !string.IsNullOrWhiteSpace(xd.Size) && xd.VaiTro == VaiTroVe.Tim)
            {
                var khoa = (xd.HeId, xd.ItemId, xd.Size);
                sizeCustom[khoa] = sizeCustom.GetValueOrDefault(khoa) + 1;
            }

            // Mục chia đốt (M105): chỉ TIM mới mang dấu chia đốt; vạch/tag chỉ trỏ về tim.
            if (xd.VaiTro == VaiTroVe.Tim) CongChiaDot(chiaDot, chuaChia, xd);

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
        VaiTroVe.VachChia => cu with { SoVachChia = cu.SoVachChia + 1 },
        VaiTroVe.NhanDot => cu with { SoNhanDot = cu.SoNhanDot + 1 },
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
                $"tag đốt {h.SoNhanDot}");
        }
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
        if (NhatKy.Count > 0)
        {
            sb.AppendLine("Nhật ký phiên (đụng độ định nghĩa block và lựa chọn của kỹ sư):");
            foreach (var d in NhatKy) sb.AppendLine($"  - {d}");
        }
        foreach (var c in CanhBao) sb.AppendLine($"⚠ {c}");
        return sb.ToString();
    }
}
