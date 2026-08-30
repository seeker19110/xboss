using System.Globalization;
using System.Text.RegularExpressions;

namespace XBoss.Cad.Core.Draw;

/// <summary>Một tag đang có trong bản vẽ (Adapter đọc từ attribute <c>TAG</c> của khối thiết bị).</summary>
/// <param name="Handle">Handle khối mang tag.</param>
/// <param name="Tag">Giá trị attribute TAG (có thể rỗng = chưa đánh).</param>
/// <param name="Loai">Loại thiết bị dùng cho <c>{type}</c> (vd <c>FCU</c>).</param>
/// <param name="Khoa">Kỹ sư đã khóa tag này — đánh lại KHÔNG được đổi (M100 §6.9).</param>
public sealed record TagHienCo(string Handle, string Tag, string Loai, bool Khoa);

/// <summary>Tag đã tách theo <c>tagPattern</c>.</summary>
public sealed record TagPhanTich(string Loai, string Tang, int Stt);

/// <summary>Một vấn đề phát hiện khi quét tag (trùng hoặc nhảy số).</summary>
public sealed record VanDeTag(string MoTa, IReadOnlyList<string> Handles);

/// <summary>Kết quả quét tag toàn bản vẽ (M100 §6.9 — phép kiểm này sẽ vào XBOSS_KIEMTRA ở M101).</summary>
public sealed record KetQuaQuetTag(
    IReadOnlyList<VanDeTag> Trung,
    IReadOnlyList<VanDeTag> NhaySo,
    IReadOnlyList<string> HandleTrong,
    IReadOnlyList<string> HandleKhacMau,
    int SoTag);

/// <summary>Một lần gán tag mới (chỉ trả về khi tag THỰC SỰ đổi).</summary>
public sealed record GanTag(string Handle, string TagCu, string TagMoi);

/// <summary>
/// Đánh tag tuần tự + kiểm trùng/nhảy số theo <c>sheetSetup.tagPattern</c> (M100 §6.9, FR9e,
/// AC14) — THUẦN, không tham chiếu AutoCAD (FR11), test trên CI Linux.
///
/// Pattern nhận 3 chỗ thay: <c>{type}</c> (loại thiết bị), <c>{floor}</c> (tầng, nhập 1 lần mỗi
/// bản vẽ), <c>{seq}</c> (số thứ tự, 2 chữ số). Chỗ nào pattern không khai thì phần đó không tham
/// gia — vd pattern <c>{type}-{seq}</c> đánh số chung cho cả bản vẽ.
/// </summary>
public static class TagSchedule
{
    /// <summary>Số chữ số tối thiểu của <c>{seq}</c> (FCU-05-01, không phải FCU-05-1).</summary>
    public const int SoChuSoMacDinh = 2;

    /// <summary>Pattern dùng khi rule pack chưa khai (giữ đúng ví dụ trong M100 §6.9).</summary>
    public const string PatternMacDinh = "{type}-{floor}-{seq}";

    /// <summary>Dựng một tag theo pattern.</summary>
    public static string Dung(string? pattern, string loai, string tang, int stt, int soChuSo = SoChuSoMacDinh)
    {
        var mau = string.IsNullOrWhiteSpace(pattern) ? PatternMacDinh : pattern;
        return mau
            .Replace("{type}", loai, StringComparison.Ordinal)
            .Replace("{floor}", tang, StringComparison.Ordinal)
            .Replace("{seq}", stt.ToString(new string('0', Math.Max(1, soChuSo)), CultureInfo.InvariantCulture),
                StringComparison.Ordinal);
    }

    /// <summary>Tách một tag theo pattern; null khi tag không theo mẫu (không coi là lỗi dữ liệu).</summary>
    public static TagPhanTich? PhanTich(string? pattern, string? tag)
    {
        if (string.IsNullOrWhiteSpace(tag)) return null;
        var re = BieuThuc(pattern);
        var m = re.Match(tag.Trim());
        if (!m.Success) return null;
        var stt = m.Groups["seq"].Success && int.TryParse(m.Groups["seq"].Value, out var s) ? s : 0;
        return new TagPhanTich(
            m.Groups["type"].Success ? m.Groups["type"].Value : "",
            m.Groups["floor"].Success ? m.Groups["floor"].Value : "",
            stt);
    }

    /// <summary>
    /// Quét toàn bộ tag: trùng (cùng chuỗi tag trên ≥2 khối) và nhảy số (thiếu số thứ tự trong
    /// dãy 1..max của cùng loại+tầng). Tag rỗng và tag không theo mẫu được liệt riêng, KHÔNG bị
    /// coi là trùng/nhảy số (bản vẽ cũ có tag tự do là chuyện thường — báo để kỹ sư quyết).
    /// </summary>
    public static KetQuaQuetTag Quet(string? pattern, IReadOnlyList<TagHienCo> tags)
    {
        var trong = tags.Where(t => string.IsNullOrWhiteSpace(t.Tag)).Select(t => t.Handle).ToList();
        var coTag = tags.Where(t => !string.IsNullOrWhiteSpace(t.Tag)).ToList();

        var trung = coTag
            .GroupBy(t => t.Tag.Trim(), StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1)
            .Select(g => new VanDeTag(
                $"Tag \"{g.Key}\" dùng cho {g.Count()} đối tượng",
                g.Select(t => t.Handle).ToList()))
            .ToList();

        var khacMau = new List<string>();
        var theoNhom = new Dictionary<(string Loai, string Tang), List<int>>();
        foreach (var t in coTag)
        {
            var pt = PhanTich(pattern, t.Tag);
            if (pt is null)
            {
                khacMau.Add(t.Handle);
                continue;
            }
            var khoa = (pt.Loai, pt.Tang);
            if (!theoNhom.TryGetValue(khoa, out var ds)) theoNhom[khoa] = ds = [];
            ds.Add(pt.Stt);
        }

        var nhaySo = new List<VanDeTag>();
        foreach (var ((loai, tang), ds) in theoNhom.OrderBy(k => k.Key.Loai).ThenBy(k => k.Key.Tang))
        {
            var co = ds.Where(s => s > 0).ToHashSet();
            if (co.Count == 0) continue;
            var thieu = Enumerable.Range(1, co.Max()).Where(s => !co.Contains(s)).ToList();
            if (thieu.Count == 0) continue;
            var ten = string.IsNullOrEmpty(tang) ? loai : $"{loai} tầng {tang}";
            nhaySo.Add(new VanDeTag(
                $"{ten}: nhảy số — thiếu {string.Join(", ", thieu.Take(20))}{(thieu.Count > 20 ? "…" : "")}",
                []));
        }

        return new KetQuaQuetTag(trung, nhaySo, trong, khacMau, coTag.Count);
    }

    /// <summary>
    /// Đánh lại tuần tự cho <paramref name="tags"/> (thường là thiết bị của một hệ/một vùng chọn):
    /// mỗi loại một dãy số riêng, bắt đầu từ 1, BỎ QUA các số mà tag đã khóa đang giữ (§6.9 "đánh
    /// lại giữ tag đã khóa"). Thứ tự đánh: theo số cũ nếu đọc được, tag chưa có số xếp sau, cuối
    /// cùng theo handle để kết quả ổn định giữa các lần chạy.
    /// Chỉ trả về những khối THỰC SỰ đổi tag.
    /// </summary>
    public static IReadOnlyList<GanTag> DanhLai(
        string? pattern, string tang, IReadOnlyList<TagHienCo> tags, int soChuSo = SoChuSoMacDinh)
    {
        var ra = new List<GanTag>();

        foreach (var nhom in tags.GroupBy(t => t.Loai, StringComparer.OrdinalIgnoreCase))
        {
            // Số đang bị tag khóa chiếm giữ (cùng loại + cùng tầng đang đánh) — không cấp lại.
            var daChiem = new HashSet<int>();
            foreach (var t in nhom.Where(t => t.Khoa))
            {
                var pt = PhanTich(pattern, t.Tag);
                if (pt is not null && pt.Stt > 0 && string.Equals(pt.Tang, tang, StringComparison.OrdinalIgnoreCase))
                    daChiem.Add(pt.Stt);
            }

            var xep = nhom
                .Where(t => !t.Khoa)
                .OrderBy(t => PhanTich(pattern, t.Tag)?.Stt ?? int.MaxValue)
                .ThenBy(t => t.Handle, StringComparer.Ordinal)
                .ToList();

            var so = 0;
            foreach (var t in xep)
            {
                do
                {
                    so++;
                } while (daChiem.Contains(so));

                var moi = Dung(pattern, t.Loai, tang, so, soChuSo);
                if (!string.Equals(moi, t.Tag, StringComparison.Ordinal))
                    ra.Add(new GanTag(t.Handle, t.Tag, moi));
            }
        }

        return ra;
    }

    /// <summary>
    /// Loại thiết bị cho <c>{type}</c>: phần đầu của id manifest trước dấu gạch
    /// (<c>fcu-unit</c> → <c>FCU</c>); id không có gạch thì lấy nguyên id; id rỗng thì lấy tên
    /// block. Chỉ giữ chữ/số để tag không dính ký tự lạ.
    /// </summary>
    public static string LoaiTuBlock(string? blockId, string? blockName)
    {
        var nguon = string.IsNullOrWhiteSpace(blockId) ? blockName ?? "" : blockId;
        var dau = nguon.Split('-', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "";
        var sach = new string(dau.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
        return sach.Length > 0 ? sach : "TB";
    }

    // ===== Nội bộ =====

    private static Regex BieuThuc(string? pattern)
    {
        var mau = string.IsNullOrWhiteSpace(pattern) ? PatternMacDinh : pattern;
        var re = Regex.Escape(mau)
            .Replace(@"\{type}", "(?<type>.+?)", StringComparison.Ordinal)
            .Replace(@"\{floor}", "(?<floor>.+?)", StringComparison.Ordinal)
            .Replace(@"\{seq}", @"(?<seq>\d+)", StringComparison.Ordinal);
        return new Regex($"^{re}$", RegexOptions.IgnoreCase);
    }
}
