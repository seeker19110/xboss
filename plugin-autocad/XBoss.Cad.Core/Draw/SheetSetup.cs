using System.Globalization;
using System.Text.RegularExpressions;

namespace XBoss.Cad.Core.Draw;

/// <summary>
/// Phần "tính được" của trang in và mặt cắt (M100 §6.3/§6.4, FR9a/FR9b): quy đổi tỉ lệ viewport,
/// đặt tên layout/mặt cắt theo pattern rule pack, chọn khổ giấy chuẩn của máy in, tra khung tên
/// trong manifest thư viện. THUẦN — không tham chiếu AutoCAD (FR11), test trên CI Linux.
///
/// Đặt ở đây (không nằm trong lệnh Adapter) vì Adapter KHÔNG build được trên CI: mọi luật đặt
/// tên/tỉ lệ phải bị kẹp bằng test, Adapter chỉ còn gọi API AutoCAD (M100 §9).
/// </summary>
public static class SheetSetup
{
    /// <summary>
    /// Tỉ lệ tùy chỉnh của viewport = số mm GIẤY trên 1 đơn vị bản vẽ.
    /// Bản vẽ mm ở tỉ lệ 1:50 → 1/50 (AC10: 1000mm mô hình = 20mm giấy);
    /// bản vẽ đơn vị mét ở 1:50 → 1000/50 = 20.
    /// </summary>
    public static double TiLeViewport(double tiLe, double mmMoiDonVi)
    {
        if (tiLe <= 0) throw new ArgumentOutOfRangeException(nameof(tiLe), "Tỉ lệ in phải là số dương.");
        if (mmMoiDonVi <= 0)
            throw new ArgumentOutOfRangeException(nameof(mmMoiDonVi), "Số mm trên 1 đơn vị bản vẽ phải dương.");
        return mmMoiDonVi / tiLe;
    }

    /// <summary>
    /// Tên layout kế tiếp theo <c>sheetSetup.layoutNamePattern</c> (vd <c>SHOP-{system}-{seq}</c>).
    /// <c>{seq}</c> đánh 2 chữ số để tab layout xếp đúng thứ tự (SHOP-HVAC-01, -02…); pattern
    /// không có <c>{seq}</c> thì thêm hậu tố số khi trùng tên. So tên KHÔNG phân biệt hoa thường
    /// (AutoCAD cũng vậy).
    /// </summary>
    public static string TenLayoutKeTiep(string pattern, string heId, IEnumerable<string> tenDaCo)
    {
        var mau = string.IsNullOrWhiteSpace(pattern) ? "SHOP-{system}-{seq}" : pattern;
        var daCo = new HashSet<string>(tenDaCo, StringComparer.OrdinalIgnoreCase);
        var goc = mau.Replace("{system}", heId, StringComparison.Ordinal);

        if (!goc.Contains("{seq}", StringComparison.Ordinal))
        {
            if (!daCo.Contains(goc)) return goc;
            for (var i = 2; ; i++)
            {
                var thu = $"{goc}-{i}";
                if (!daCo.Contains(thu)) return thu;
            }
        }

        var re = new Regex(
            "^" + Regex.Escape(goc).Replace(@"\{seq}", @"(\d+)", StringComparison.Ordinal) + "$",
            RegexOptions.IgnoreCase);
        var lonNhat = 0;
        foreach (var ten in daCo)
        {
            var m = re.Match(ten);
            if (m.Success && int.TryParse(m.Groups[1].Value, out var so) && so > lonNhat) lonNhat = so;
        }
        return goc.Replace("{seq}", (lonNhat + 1).ToString("00", CultureInfo.InvariantCulture), StringComparison.Ordinal);
    }

    /// <summary>
    /// Tên mặt cắt kế tiếp theo <c>sheetSetup.sectionNamePattern</c> (vd <c>{alpha}-{alpha}</c>
    /// → A-A, B-B… rồi AA-AA khi hết chữ cái). Bỏ qua các chữ cái đã dùng trong bản vẽ.
    /// </summary>
    public static string TenMatCatKeTiep(string pattern, IEnumerable<string> tenDaCo)
    {
        var mau = string.IsNullOrWhiteSpace(pattern) ? "{alpha}-{alpha}" : pattern;
        if (!mau.Contains("{alpha}", StringComparison.Ordinal)) return mau;

        var re = new Regex(
            "^" + Regex.Escape(mau).Replace(@"\{alpha}", "([A-Z]+)", StringComparison.Ordinal) + "$",
            RegexOptions.IgnoreCase);
        var daDung = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var ten in tenDaCo)
        {
            var m = re.Match(ten.Trim());
            if (m.Success) daDung.Add(m.Groups[1].Value);
        }

        for (var i = 0; ; i++)
        {
            var chu = ChuCaiThu(i);
            if (daDung.Contains(chu)) continue;
            return mau.Replace("{alpha}", chu, StringComparison.Ordinal);
        }
    }

    /// <summary>Chữ cái thứ n theo kiểu cột Excel: 0→A … 25→Z, 26→AA.</summary>
    public static string ChuCaiThu(int n)
    {
        if (n < 0) throw new ArgumentOutOfRangeException(nameof(n));
        var ra = "";
        var i = n;
        do
        {
            ra = (char)('A' + i % 26) + ra;
            i = i / 26 - 1;
        } while (i >= 0);
        return ra;
    }

    /// <summary>
    /// Chọn tên khổ giấy chuẩn (canonical media name) của máy in cho khổ khai trong rule pack
    /// (<c>A1</c>): khớp theo TOKEN nên "A1" không dính "A10"/"A1_expand". Ưu tiên khổ ISO,
    /// rồi bản không mở rộng lề (không <c>full_bleed</c>/<c>expand</c>), rồi tên ngắn nhất.
    /// Null = máy in không có khổ đó (Adapter giữ khổ mặc định + cảnh báo).
    /// </summary>
    public static string? ChonTenKhoGiay(IEnumerable<string> danhSach, string kho)
    {
        if (string.IsNullOrWhiteSpace(kho)) return null;
        var can = kho.Trim();

        string? tot = null;
        (int Iso, int MoRong, int Dai, string Ten) diemTot = default;
        foreach (var ten in danhSach)
        {
            if (string.IsNullOrWhiteSpace(ten)) continue;
            if (!TachToken(ten).Any(t => string.Equals(t, can, StringComparison.OrdinalIgnoreCase))) continue;

            var thap = ten.ToLowerInvariant();
            var diem = (
                Iso: thap.StartsWith("iso", StringComparison.Ordinal) ? 0 : 1,
                MoRong: thap.Contains("full_bleed") || thap.Contains("fullbleed") || thap.Contains("expand") ? 1 : 0,
                Dai: ten.Length,
                Ten: ten);
            if (tot is null || SoSanh(diem, diemTot) < 0)
            {
                tot = ten;
                diemTot = diem;
            }
        }
        return tot;

        static int SoSanh(
            (int Iso, int MoRong, int Dai, string Ten) a, (int Iso, int MoRong, int Dai, string Ten) b)
        {
            if (a.Iso != b.Iso) return a.Iso - b.Iso;
            if (a.MoRong != b.MoRong) return a.MoRong - b.MoRong;
            if (a.Dai != b.Dai) return a.Dai - b.Dai;
            return string.CompareOrdinal(a.Ten, b.Ten);
        }
    }

    private static IEnumerable<string> TachToken(string ten) =>
        ten.Split(new[] { '_', '-', ' ', '(', ')', '.', ',', 'x', 'X' }, StringSplitOptions.RemoveEmptyEntries);

    /// <summary>
    /// Khung tên cho một khổ giấy: ưu tiên <c>sheetSetup.titleblockId</c>, khổ không khớp thì tìm
    /// block <c>kind=titleblock</c> khác đúng khổ. Trả lý do tiếng Việt khi không có
    /// (M100 §15: titleblockId thiếu trong manifest → lỗi rõ ràng, không chèn khung rỗng).
    /// </summary>
    public static (BlockDef? Khung, string? Loi) TimKhungTen(
        BlockManifest manifest, SheetSetupSection sheetSetup, string kho)
    {
        var theoKho = manifest.TheoLoai(BlockKind.Titleblock)
            .FirstOrDefault(b => string.Equals(b.Paper, kho, StringComparison.OrdinalIgnoreCase));

        var id = sheetSetup.TitleblockId;
        if (!string.IsNullOrWhiteSpace(id))
        {
            var khai = manifest.TimTheoId(id);
            if (khai is null)
            {
                return (null,
                    $"sheetSetup.titleblockId = \"{id}\" không có trong manifest thư viện block " +
                    $"(version {manifest.Version}) — phát hành lại thư viện hoặc sửa rule pack.");
            }
            if (khai.KindEnum != BlockKind.Titleblock)
                return (null, $"Block \"{id}\" trong manifest không phải kind=titleblock.");
            if (string.Equals(khai.Paper, kho, StringComparison.OrdinalIgnoreCase)) return (khai, null);
            if (theoKho is not null) return (theoKho, null);
            return (null,
                $"Thư viện block chưa có khung tên khổ {kho} (sheetSetup.titleblockId \"{id}\" là khổ {khai.Paper}).");
        }

        return theoKho is not null
            ? (theoKho, null)
            : (null, $"Thư viện block chưa có khung tên khổ {kho} (kind=titleblock).");
    }
}
