using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;

namespace XBoss.Cad.Core.Graph;

/// <summary>Loại nút suy ra từ đồ thị tuyến (M115 §6 bước 3).</summary>
public enum LoaiNut
{
    /// <summary>Nút gốc của chiều dòng — kỹ sư bấm điểm nguồn ở đây.</summary>
    Nguon,

    /// <summary>Đầu tuyến không chạm thiết bị lẫn tuyến khác — tuyến hở (lỗi chặn).</summary>
    DauTuDo,

    /// <summary>Đầu tuyến bắt vào tâm một block thiết bị.</summary>
    KetNoiThietBi,

    /// <summary>3 nhánh gặp nhau.</summary>
    Te,

    /// <summary>Từ 4 nhánh trở lên — không có phụ kiện tiêu chuẩn, để kỹ sư quyết.</summary>
    NgaTu,

    /// <summary>2 nhánh, hướng đổi tại đỉnh — co hay cút là do bảng luật quyết theo góc.</summary>
    DoiHuong,

    /// <summary>2 nhánh thẳng hàng nhưng khác cỡ — côn giảm.</summary>
    Giam,

    /// <summary>2 nhánh lệch cao độ — đoạn lên/xuống.</summary>
    DoanLenXuong,

    /// <summary>2 nhánh thẳng, cùng cỡ, cùng cao độ — không cần phụ kiện.</summary>
    Thang,
}

/// <summary>
/// Kết quả phân loại một nút. <see cref="Loai"/> là loại CHÍNH (quyết định phụ kiện suy ra), còn
/// <see cref="DoiSize"/>/<see cref="DoiCaoDo"/> giữ nguyên để kỹ sư thấy phần còn lại ở bước duyệt:
/// một nút vừa đổi hướng vừa đổi cỡ chỉ suy ra MỘT phụ kiện chính, cái thứ hai là quyết định của
/// người (M115 §6 bước 4), plugin không tự chồng hai phụ kiện lên một điểm.
/// </summary>
/// <param name="GocDoiHuongDeg">
/// Góc đổi hướng của dòng tại nút (0..180°): nút 2 nhánh là góc gãy của tuyến; nút 3 nhánh là góc
/// giữa nhánh rẽ và trục chính; loại khác = 0.
/// </param>
/// <param name="Size">Cỡ nguyên văn LỚN NHẤT trong các nhánh tại nút — khóa tra bảng phụ kiện.</param>
public sealed record PhanLoaiNut(
    int Nut,
    LoaiNut Loai,
    int SoNhanh,
    double GocDoiHuongDeg,
    bool DoiSize,
    bool DoiCaoDo,
    string? HeId,
    string? Size,
    string? ThietBiId);

/// <summary>
/// Phân loại từng nút của <see cref="TuyenGraph"/> (M115 §6 bước 3) — THUẦN, test trên CI Linux.
///
/// Thứ tự ưu tiên khi một nút thỏa nhiều mô tả: Nguồn → Kết nối thiết bị → Ngã tư (≥4 nhánh) →
/// Tê (3 nhánh) → Đầu tự do (1 nhánh) → với nút 2 nhánh: đoạn lên/xuống → đổi hướng → giảm → thẳng.
/// Cao độ đứng trước góc vì đoạn lên/xuống là thay đổi TUYẾN (phải chèn hai co đứng), không phải
/// một cái co nằm.
/// </summary>
public static class NutPhanLoai
{
    /// <summary>Dưới ngưỡng này coi hai vector là suy biến, không tính được góc.</summary>
    private const double NguongSuyBien = 1e-12;

    /// <summary>Phân loại MỌI nút của đồ thị, theo thứ tự chỉ số nút.</summary>
    public static IReadOnlyList<PhanLoaiNut> PhanLoai(TuyenGraph g)
    {
        var ra = new List<PhanLoaiNut>(g.Nut.Count);
        for (var n = 0; n < g.Nut.Count; n++) ra.Add(PhanLoaiMotNut(g, n));
        return ra;
    }

    /// <summary>Phân loại một nút.</summary>
    public static PhanLoaiNut PhanLoaiMotNut(TuyenGraph g, int nut)
    {
        var canh = g.CanhTaiNut(nut);
        var soNhanh = canh.Count;
        var thietBi = g.ThietBiTaiNut(nut);

        var heId = canh
            .Select(e => g.Canh[e].HeId)
            .FirstOrDefault(h => !string.IsNullOrWhiteSpace(h));

        var cacCo = canh
            .Select(e => g.Canh[e].Size)
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s!)
            .ToList();
        var doiSize = cacCo.Distinct(StringComparer.Ordinal).Count() > 1;
        var size = cacCo
            .OrderByDescending(s => KhoaCo(s) ?? double.NegativeInfinity)
            .ThenBy(s => s, StringComparer.Ordinal)
            .FirstOrDefault();

        var caoDo = canh
            .Select(e => g.Canh[e].CaoDoMm)
            .Where(c => c.HasValue)
            .Select(c => c!.Value)
            .ToList();
        var doiCaoDo = caoDo.Count >= 2 && caoDo.Max() - caoDo.Min() > g.ThamSo.DungSaiCaoDoMm;

        var goc = GocDoiHuong(g, nut);

        var loai =
            nut == g.NutNguon ? LoaiNut.Nguon
            : thietBi is not null ? LoaiNut.KetNoiThietBi
            : soNhanh >= 4 ? LoaiNut.NgaTu
            : soNhanh == 3 ? LoaiNut.Te
            : soNhanh <= 1 ? LoaiNut.DauTuDo
            : doiCaoDo ? LoaiNut.DoanLenXuong
            : goc >= g.ThamSo.GocDoiHuongToiThieuDeg ? LoaiNut.DoiHuong
            : doiSize ? LoaiNut.Giam
            : LoaiNut.Thang;

        return new PhanLoaiNut(nut, loai, soNhanh, goc, doiSize, doiCaoDo, heId, size, thietBi?.ThietBiId);
    }

    /// <summary>
    /// Góc đổi hướng của dòng tại nút, 0..180° — KHÁC <see cref="Segment2D.GocGiaoDeg"/> vốn gập về
    /// 0..90 (góc GIAO của hai tuyến, không phân biệt gãy nhẹ với gãy gập).
    ///
    /// Nút 2 nhánh: hai nhánh đi ra ngược hướng nhau (180° giữa 2 vector ra) = tuyến thẳng = 0°.
    /// Nút 3 nhánh: trục chính là cặp nhánh thẳng hàng nhất, góc trả về là góc rẽ nhỏ nhất của
    /// nhánh còn lại so với trục — tê chuẩn cho 90°, tê xiên 45° cho 45°.
    /// Nút khác: 0.
    /// </summary>
    public static double GocDoiHuong(TuyenGraph g, int nut)
    {
        var canh = g.CanhTaiNut(nut);
        var huong = canh.Select(e => g.HuongRaKhoiNut(e, nut)).Where(v => v.DoDai > NguongSuyBien).ToList();

        if (huong.Count == 2) return 180 - GocGiuaDeg(huong[0], huong[1]);
        if (huong.Count != 3) return 0;

        // Cặp thẳng hàng nhất = cặp có góc giữa 2 hướng ra lớn nhất (gần 180°).
        var (i, j) = (0, 1);
        var lonNhat = double.NegativeInfinity;
        for (var a = 0; a < 3; a++)
        {
            for (var b = a + 1; b < 3; b++)
            {
                var goc = GocGiuaDeg(huong[a], huong[b]);
                if (goc <= lonNhat) continue;
                lonNhat = goc;
                (i, j) = (a, b);
            }
        }
        var re = huong[3 - i - j];
        return Math.Min(GocGiuaDeg(re, huong[i]), GocGiuaDeg(re, huong[j]));
    }

    /// <summary>Góc giữa hai vector, 0..180° (không gập về 0..90 như góc giao tuyến).</summary>
    private static double GocGiuaDeg(Diem2 u, Diem2 v)
    {
        var mau = u.DoDai * v.DoDai;
        if (mau < NguongSuyBien) return 0;
        var cos = Math.Clamp((u.X * v.X + u.Y * v.Y) / mau, -1, 1);
        return Math.Acos(cos) * 180 / Math.PI;
    }

    /// <summary>
    /// Khóa so cỡ (mm) của một chuỗi size: CẠNH LỚN max(W,H) với <c>300x200</c>, số DN với
    /// <c>DN50</c> — ĐÚNG quy ước <c>jointRules.selection</c>. Không đọc được → null.
    /// </summary>
    public static double? KhoaCo(string? size)
    {
        if (DrawSize.PhanTich(size) is not { } kt) return null;
        return kt.CaoMm is { } cao ? Math.Max(kt.RongMm, cao) : kt.RongMm;
    }
}
