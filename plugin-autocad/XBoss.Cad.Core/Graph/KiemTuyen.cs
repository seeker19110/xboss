using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Graph;

/// <summary>Mức nghiêm trọng của một phát hiện khi kiểm đồ thị tuyến.</summary>
public enum MucLoiTuyen
{
    /// <summary>CHẶN — không cho chạy bước hoàn thiện (M115 §6, AC6).</summary>
    Chan,

    /// <summary>Cảnh báo — vẫn chạy được, nhưng kết quả sẽ thiếu.</summary>
    CanhBao,
}

/// <summary>Nhóm lỗi/cảnh báo — để hộp thoại lọc và đếm được, không phải so chuỗi thông báo.</summary>
public enum LoaiLoiTuyen
{
    /// <summary>Đầu tuyến tự do: không chạm thiết bị lẫn tuyến khác (CHẶN).</summary>
    TuyenHo,

    /// <summary>Đoạn tuyến chưa gán cỡ — không bóc được, không chọn được phụ kiện (CHẶN).</summary>
    ThieuSize,

    /// <summary>Đầu tuyến bắt vào thiết bị của hệ KHÁC (CHẶN).</summary>
    ThietBiSaiHe,

    /// <summary>Từ 3 nhánh trở lên gặp nhau ở một nút mà cao độ không đồng nhất (CHẶN).</summary>
    CaoDoMauThuan,

    /// <summary>Tuyến chưa gán đủ hệ/cỡ/cao độ (cảnh báo).</summary>
    ThieuThuocTinh,

    /// <summary>Đoạn tuyến không nối được về điểm nguồn nên chưa biết chiều dòng (cảnh báo).</summary>
    KhongNoiVeNguon,
}

/// <summary>Một phát hiện, có đủ dữ liệu để hộp thoại bấm-tới-đối-tượng (zoom) theo M115 §6.</summary>
public sealed record LoiTuyen(
    MucLoiTuyen Muc,
    LoaiLoiTuyen Loai,
    string ThongDiep,
    string? TuyenId = null,
    int? Nut = null,
    Diem2? ViTri = null,
    string? ThietBiId = null);

/// <summary>Kết quả kiểm: đạt khi KHÔNG còn lỗi chặn nào.</summary>
public sealed record KetQuaKiemTuyen(IReadOnlyList<LoiTuyen> Chan, IReadOnlyList<LoiTuyen> CanhBao)
{
    /// <summary>Đủ điều kiện chạy bước hoàn thiện (M115 §6 bước 5) chưa.</summary>
    public bool Dat => Chan.Count == 0;

    /// <summary>Toàn bộ phát hiện, lỗi chặn trước cảnh báo.</summary>
    public IEnumerable<LoiTuyen> TatCa => Chan.Concat(CanhBao);
}

/// <summary>
/// Kiểm đồ thị tuyến trước khi cho hoàn thiện bản vẽ (M115 §7 FR2, AC6) — THUẦN, test trên CI Linux.
///
/// 4 lỗi CHẶN đúng theo đặc tả: tuyến hở, thiếu cỡ, thiết bị nối sai hệ, cao độ mâu thuẫn tại nút.
/// Cảnh báo: tuyến chưa gán đủ thuộc tính, đoạn không nối được về nguồn.
///
/// Ranh giới giữa "đoạn lên/xuống" (hợp lệ) và "cao độ mâu thuẫn" (chặn) đặt ở SỐ NHÁNH: 2 nhánh
/// lệch cao độ là đoạn lên/xuống bình thường, nhưng từ 3 nhánh trở lên mà cao độ không đồng nhất
/// thì không chế tạo được một cái tê như thế — phải tách đoạn lên/xuống rồi mới rẽ.
/// </summary>
public static class KiemTuyen
{
    /// <summary>Kiểm toàn bộ đồ thị.</summary>
    public static KetQuaKiemTuyen Kiem(TuyenGraph g)
    {
        var nutPhanLoai = NutPhanLoai.PhanLoai(g);
        return Kiem(g, nutPhanLoai);
    }

    /// <summary>Kiểm với kết quả phân loại nút đã tính sẵn (tránh phân loại 2 lần).</summary>
    public static KetQuaKiemTuyen Kiem(TuyenGraph g, IReadOnlyList<PhanLoaiNut> nutPhanLoai)
    {
        var chan = new List<LoiTuyen>();
        var canhBao = new List<LoiTuyen>();

        // (1) Tuyến hở — đầu tự do không chạm thiết bị lẫn tuyến khác.
        foreach (var n in nutPhanLoai.Where(n => n.Loai == LoaiNut.DauTuDo))
        {
            var tuyenId = g.CanhTaiNut(n.Nut).Select(e => g.Canh[e].TuyenId).FirstOrDefault();
            chan.Add(new LoiTuyen(
                MucLoiTuyen.Chan, LoaiLoiTuyen.TuyenHo,
                $"Tuyến hở: đầu tuyến tại ({g.Nut[n.Nut].ViTri.X:0.###}; {g.Nut[n.Nut].ViTri.Y:0.###}) " +
                "không chạm thiết bị nào và cũng không chạm tuyến khác.",
                tuyenId, n.Nut, g.Nut[n.Nut].ViTri));
        }

        // (2) Thiếu cỡ — báo MỘT lần cho mỗi tuyến, không mỗi cạnh (một pline chia ra hàng chục cạnh).
        foreach (var tuyenId in g.Canh
                     .Where(c => string.IsNullOrWhiteSpace(c.Size))
                     .Select(c => c.TuyenId)
                     .Distinct(StringComparer.Ordinal))
        {
            var canh = g.Canh.First(c => string.Equals(c.TuyenId, tuyenId, StringComparison.Ordinal));
            chan.Add(new LoiTuyen(
                MucLoiTuyen.Chan, LoaiLoiTuyen.ThieuSize,
                $"Tuyến \"{tuyenId}\" chưa gán cỡ — không bóc được khối lượng và không tra được phụ kiện.",
                tuyenId, canh.Tu, g.Nut[canh.Tu].ViTri));
        }

        // (3) Thiết bị nối sai hệ. Block chưa khai hệ thì KHÔNG kết tội sai hệ — đó là thiếu thuộc tính.
        foreach (var tb in g.ThietBi)
        {
            var heTaiNut = g.CanhTaiNut(tb.Nut)
                .Select(e => g.Canh[e].HeId)
                .Where(h => !string.IsNullOrWhiteSpace(h))
                .Distinct(StringComparer.Ordinal)
                .ToList();
            if (string.IsNullOrWhiteSpace(tb.HeId))
            {
                canhBao.Add(new LoiTuyen(
                    MucLoiTuyen.CanhBao, LoaiLoiTuyen.ThieuThuocTinh,
                    $"Thiết bị \"{tb.Tag ?? tb.ThietBiId}\" chưa khai hệ — không đối chiếu được với hệ của tuyến.",
                    null, tb.Nut, g.Nut[tb.Nut].ViTri, tb.ThietBiId));
                continue;
            }
            if (heTaiNut.Count == 0 || tb.KhopHe) continue;
            chan.Add(new LoiTuyen(
                MucLoiTuyen.Chan, LoaiLoiTuyen.ThietBiSaiHe,
                $"Thiết bị \"{tb.Tag ?? tb.ThietBiId}\" thuộc hệ \"{tb.HeId}\" nhưng tuyến nối vào nó " +
                $"thuộc hệ \"{string.Join(", ", heTaiNut)}\".",
                null, tb.Nut, g.Nut[tb.Nut].ViTri, tb.ThietBiId));
        }

        // (4) Cao độ mâu thuẫn tại nút từ 3 nhánh trở lên.
        foreach (var n in nutPhanLoai.Where(n => n.DoiCaoDo && n.SoNhanh >= 3))
        {
            var caoDo = g.CanhTaiNut(n.Nut)
                .Select(e => g.Canh[e].CaoDoMm)
                .Where(c => c.HasValue)
                .Select(c => c!.Value)
                .Distinct()
                .OrderBy(c => c);
            chan.Add(new LoiTuyen(
                MucLoiTuyen.Chan, LoaiLoiTuyen.CaoDoMauThuan,
                $"Cao độ mâu thuẫn: {n.SoNhanh} nhánh gặp nhau tại một nút nhưng cao độ khác nhau " +
                $"({string.Join(" / ", caoDo.Select(c => $"{c:0.#} mm"))}) — vượt dung sai " +
                $"{g.ThamSo.DungSaiCaoDoMm:0.#} mm. Phải tách đoạn lên/xuống trước rồi mới rẽ nhánh.",
                null, n.Nut, g.Nut[n.Nut].ViTri));
        }

        // (5) Cảnh báo — tuyến chưa gán đủ thuộc tính (hệ/cỡ/cao độ).
        foreach (var t in g.TuyenGoc)
        {
            var thieu = new List<string>();
            if (string.IsNullOrWhiteSpace(t.HeId)) thieu.Add("hệ");
            if (string.IsNullOrWhiteSpace(t.Size)) thieu.Add("cỡ");
            if (t.CaoDoMm is null) thieu.Add("cao độ");
            if (thieu.Count == 0) continue;
            canhBao.Add(new LoiTuyen(
                MucLoiTuyen.CanhBao, LoaiLoiTuyen.ThieuThuocTinh,
                $"Tuyến \"{t.Id}\" chưa gán: {string.Join(", ", thieu)}.",
                t.Id, null, t.Dinh.Count > 0 ? t.Dinh[0] : (Diem2?)null));
        }

        // (6) Cảnh báo — đoạn không nối được về nguồn (chiều dòng chưa xác định).
        foreach (var tuyenId in g.CanhChuaDinhChieu
                     .Select(e => g.Canh[e].TuyenId)
                     .Distinct(StringComparer.Ordinal))
        {
            var canh = g.Canh.First(c =>
                string.Equals(c.TuyenId, tuyenId, StringComparison.Ordinal) &&
                g.CanhChuaDinhChieu.Contains(c.ChiSo));
            canhBao.Add(new LoiTuyen(
                MucLoiTuyen.CanhBao, LoaiLoiTuyen.KhongNoiVeNguon,
                $"Tuyến \"{tuyenId}\" không nối được về điểm nguồn — chưa xác định được chiều dòng.",
                tuyenId, canh.Tu, g.Nut[canh.Tu].ViTri));
        }

        return new KetQuaKiemTuyen(chan, canhBao);
    }
}
