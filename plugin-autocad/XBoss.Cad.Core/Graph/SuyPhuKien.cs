using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Graph;

/// <summary>Trạng thái phụ kiện suy ra tại một nút.</summary>
public enum TrangThaiPhuKien
{
    /// <summary>Có luật khớp — biết chèn block nào.</summary>
    DaChon,

    /// <summary>Không luật nào khớp: kỹ sư quyết ở bước 4. KHÔNG phải lỗi, KHÔNG đoán bừa.</summary>
    ChuaQuyet,

    /// <summary>Loại nút này không cần phụ kiện (nguồn, đầu tuyến vào thiết bị, đoạn thẳng).</summary>
    KhongCan,
}

/// <summary>Phụ kiện suy ra cho một nút (M115 §6 bước 3) — đầu vào của danh sách duyệt ở bước 4.</summary>
/// <param name="NodeKind">Loại nút của luật đã khớp (<c>co</c>/<c>cut</c>/<c>te</c>/<c>giam</c>); null khi chưa quyết.</param>
/// <param name="LyDo">Câu tiếng Việt hiện thẳng cho kỹ sư — vì sao chọn/không chọn được.</param>
public sealed record PhuKienTaiNut(
    int Nut,
    LoaiNut LoaiNut,
    TrangThaiPhuKien TrangThai,
    string? NodeKind,
    string? BlockId,
    string? BlockKind,
    string? Ten,
    string LyDo);

/// <summary>
/// Suy phụ kiện tại nút theo bảng luật <c>drawTools.completionPolicy.fittingRules</c>
/// (M115 §7 FR2) — THUẦN, test trên CI Linux.
///
/// Nguyên tắc cứng: KHÔNG luật nào khớp thì trả <see cref="TrangThaiPhuKien.ChuaQuyet"/> kèm lý do,
/// KHÔNG bao giờ chọn block "gần đúng". Chọn sai phụ kiện đi thẳng vào khối lượng và vào bản vẽ thi
/// công; một nút chưa quyết chỉ tốn của kỹ sư một cú click ở bước duyệt.
/// </summary>
public static class SuyPhuKien
{
    /// <summary>Suy phụ kiện cho mọi nút đã phân loại.</summary>
    public static IReadOnlyList<PhuKienTaiNut> Suy(
        IReadOnlyList<PhanLoaiNut> nut, CompletionPolicySection cp) =>
        nut.Select(n => SuyMotNut(n, cp)).ToList();

    /// <summary>Suy phụ kiện cho một nút đã phân loại.</summary>
    public static PhuKienTaiNut SuyMotNut(PhanLoaiNut n, CompletionPolicySection cp)
    {
        var loaiLuat = LoaiLuatCho(n.Loai);
        if (n.Loai == LoaiNut.DauTuDo)
        {
            return ChuaQuyet(n,
                "Đầu tuyến tự do — đây là lỗi chặn (tuyến hở) ở bước kiểm, không phải nút cần phụ kiện.");
        }
        if (loaiLuat.Count == 0)
        {
            return n.Loai is LoaiNut.NgaTu or LoaiNut.DoanLenXuong
                ? ChuaQuyet(n, n.Loai == LoaiNut.NgaTu
                    ? $"Nút {n.SoNhanh} nhánh — không có phụ kiện tiêu chuẩn cho ngã tư, kỹ sư tự chọn."
                    : "Hai nhánh lệch cao độ — đoạn lên/xuống chưa có bảng luật, kỹ sư tự chọn.")
                : new PhuKienTaiNut(n.Nut, n.Loai, TrangThaiPhuKien.KhongCan, null, null, null, null,
                    "Loại nút này không cần phụ kiện.");
        }

        if (string.IsNullOrWhiteSpace(n.HeId))
            return ChuaQuyet(n, "Tuyến tại nút chưa gán hệ nên không tra được bảng luật phụ kiện.");

        var luat = TraLuat(cp, n.HeId!, loaiLuat, n.Size, n.GocDoiHuongDeg);
        if (luat is null)
        {
            return ChuaQuyet(n,
                $"Không luật nào của hệ \"{n.HeId}\" khớp (cỡ \"{n.Size ?? "chưa gán"}\", " +
                $"góc {n.GocDoiHuongDeg:0.#}°) — kỹ sư tự chọn ở bước duyệt.");
        }

        var themCo = n.DoiSize && luat.LoaiNut != LoaiNutPhuKien.Giam
            ? " Nút này còn ĐỔI CỠ: côn giảm đi kèm là quyết định của kỹ sư ở bước duyệt."
            : "";
        return new PhuKienTaiNut(
            n.Nut, n.Loai, TrangThaiPhuKien.DaChon, luat.NodeKind, luat.BlockId, luat.BlockKind, luat.Name,
            $"Khớp luật \"{luat.Name}\" (hệ {luat.SystemId}, góc {n.GocDoiHuongDeg:0.#}° trong " +
            $"[{luat.MinAngleDeg:0.#}; {luat.MaxAngleDeg:0.#}), cỡ " +
            $"{(luat.MaxSizeMm is { } m ? $"≤ {m:0.#} mm" : "mọi cỡ")}).{themCo}");
    }

    /// <summary>
    /// Tra luật đầu tiên khớp (first-match theo thứ tự khai — cùng triết lý layerMap/takeoff).
    /// null = chưa quyết.
    /// </summary>
    public static FittingRule? TraLuat(
        CompletionPolicySection cp,
        string heId,
        IReadOnlyCollection<LoaiNutPhuKien> loaiLuat,
        string? size,
        double gocDeg)
    {
        var khoaCo = NutPhanLoai.KhoaCo(size);
        return cp.FittingRules.FirstOrDefault(r =>
            string.Equals(r.SystemId, heId, StringComparison.Ordinal) &&
            r.LoaiNut is { } loai && loaiLuat.Contains(loai) &&
            r.HopCo(khoaCo) &&
            r.HopGoc(gocDeg));
    }

    /// <summary>
    /// Loại luật được phép xét cho một loại nút. Nút đổi hướng xét CẢ <c>co</c> lẫn <c>cut</c> —
    /// khoảng góc trong rule pack mới là thứ quyết định nút đó là co hay cút (M115 §6 bước 3).
    /// </summary>
    private static IReadOnlyCollection<LoaiNutPhuKien> LoaiLuatCho(LoaiNut loai) => loai switch
    {
        LoaiNut.DoiHuong => [LoaiNutPhuKien.Co, LoaiNutPhuKien.Cut],
        LoaiNut.Te => [LoaiNutPhuKien.Te],
        LoaiNut.Giam => [LoaiNutPhuKien.Giam],
        _ => [],
    };

    private static PhuKienTaiNut ChuaQuyet(PhanLoaiNut n, string lyDo) =>
        new(n.Nut, n.Loai, TrangThaiPhuKien.ChuaQuyet, null, null, null, null, lyDo);
}
