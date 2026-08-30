using System.Globalization;

namespace XBoss.Cad.Core.Coordination;

/// <summary>Ba cách xử lý mà rule pack cho phép đề xuất (M116 §6 bước 4/§7 FR3) + một việc dữ liệu.</summary>
public enum LoaiDeXuat
{
    /// <summary>Hệ ưu tiên thấp hơn nhường cao độ theo <c>crossingPolicy.priority</c>.</summary>
    NhuongCaoDo,

    /// <summary>Dịch sang làn trống / tầng khác trong hành lang.</summary>
    DichLan,

    /// <summary>Không tránh được bằng cao độ/làn ⇒ cần fitting vượt (két nước, ống mềm…).</summary>
    FittingVuot,

    /// <summary>Tuyến thiếu cao độ — bổ sung dữ liệu rồi quét lại (M116 §11), không đoán hộ.</summary>
    BoSungCaoDo,
}

/// <summary>
/// Một đề xuất xử lý kèm theo xung đột. <paramref name="HeNhuong"/> rỗng = luật không chỉ được hệ
/// nào phải nhường (kỹ sư quyết).
/// </summary>
/// <param name="SoLieuMm">Số đo đi kèm đề xuất (cao độ mới / lượng cần dịch thêm) — null nếu không có.</param>
public sealed record DeXuat(LoaiDeXuat Loai, string HeNhuong, string MoTa, double? SoLieuMm = null);

/// <summary>
/// Sinh đề xuất xử lý CHỈ từ bảng luật rule pack (M116 §7 FR3) — không heuristic ngầm:
/// <list type="bullet">
/// <item>thứ tự nhường lấy từ <c>crossingPolicy.priority</c> (qua
/// <c>coordinationPolicy.priorityFrom</c>), hệ không khai xếp SAU CÙNG và ngang hàng nhau;</item>
/// <item>cao độ mới suy từ chính hình học hai tuyến (mép trên tuyến nhường xuống ngay dưới mép dưới
/// tuyến giữ), không phải một con số nghĩ ra;</item>
/// <item>không phân được thứ tự ⇒ chuyển sang "cần fitting vượt" và NÓI RÕ lý do, tuyệt đối không
/// đoán bừa ai nhường ai.</item>
/// </list>
/// Plugin không bao giờ tự sửa tuyến (guardrail M116 §2) — đề xuất chỉ là chữ để kỹ sư quyết.
/// </summary>
public static class DeXuatXuLy
{
    /// <summary>Hạng ưu tiên của một hệ; hệ không khai trong bảng xếp SAU CÙNG (ngang hàng nhau).</summary>
    public static int Hang(string heId, IReadOnlyList<string> hangUuTien)
    {
        for (var i = 0; i < hangUuTien.Count; i++)
        {
            if (string.Equals(hangUuTien[i], heId, StringComparison.Ordinal)) return i;
        }
        return int.MaxValue;
    }

    /// <summary>
    /// Trong hai tuyến, tuyến nào phải NHƯỜNG (hạng lớn hơn = ưu tiên thấp hơn). Hai hệ cùng hạng
    /// — kể cả hai hệ đều không khai trong bảng — trả null: KHÔNG suy được chiều nhường.
    /// </summary>
    public static (TuyenPhoiHop Nhuong, TuyenPhoiHop Giu)? AiNhuong(
        TuyenPhoiHop a, TuyenPhoiHop b, IReadOnlyList<string> hangUuTien)
    {
        var hangA = Hang(a.HeId, hangUuTien);
        var hangB = Hang(b.HeId, hangUuTien);
        if (hangA == hangB) return null;
        return hangA > hangB ? (a, b) : (b, a);
    }

    /// <summary>Đề xuất cho xung đột CỨNG lớp 1 — giao cắt khi dải cao độ chồng nhau.</summary>
    public static IReadOnlyList<DeXuat> ChoGiaoCat(
        TuyenPhoiHop a, TuyenPhoiHop b, IReadOnlyList<string> hangUuTien)
    {
        var ds = new List<DeXuat>();
        if (AiNhuong(a, b, hangUuTien) is { } phan && phan.Nhuong.CoCaoDo && phan.Giu.CoCaoDo)
        {
            // Mép TRÊN tuyến nhường hạ xuống ngay dưới mép DƯỚI tuyến giữ ⇒ tim mới = đáy tuyến
            // giữ − nửa bề cao tuyến nhường. Số này suy từ hình học hai tuyến, không phải hằng số.
            var caoDoMoi = phan.Giu.DayMm - phan.Nhuong.BeCaoMm / 2;
            ds.Add(new DeXuat(
                LoaiDeXuat.NhuongCaoDo,
                phan.Nhuong.HeId,
                $"Hệ {phan.Nhuong.HeId} ưu tiên thấp hơn {phan.Giu.HeId} (crossingPolicy.priority) nên nhường: " +
                $"hạ tim tuyến {phan.Nhuong.Id} từ {So(phan.Nhuong.CaoDoMm ?? 0)} mm xuống {So(caoDoMoi)} mm " +
                $"để mép trên nằm dưới mép dưới hệ {phan.Giu.HeId} ({So(phan.Giu.DayMm)} mm).",
                caoDoMoi));
            ds.Add(new DeXuat(
                LoaiDeXuat.FittingVuot,
                phan.Nhuong.HeId,
                $"Nếu không hạ được cao độ (vướng dầm/độ dốc/trần): cần fitting vượt trên tuyến " +
                $"{phan.Nhuong.Id} tại chỗ giao."));
            return ds;
        }

        ds.Add(new DeXuat(
            LoaiDeXuat.FittingVuot,
            "",
            $"Hai hệ {a.HeId} và {b.HeId} cùng hạng ưu tiên (hoặc chưa khai trong crossingPolicy.priority) " +
            "nên không suy được ai nhường cao độ — cần fitting vượt, hoặc bổ sung thứ tự ưu tiên vào rule pack."));
        return ds;
    }

    /// <summary>Đề xuất cho xung đột MỀM lớp 2 — tranh chấp bề rộng hành lang.</summary>
    /// <param name="thieuMm">Bề rộng còn thiếu (mm) so với hành lang.</param>
    public static IReadOnlyList<DeXuat> ChoHanhLang(
        string hanhLangId,
        IReadOnlyList<TuyenPhoiHop> tuyen,
        double thieuMm,
        IReadOnlyList<string> hangUuTien)
    {
        var nhuong = HeUuTienThapNhat(tuyen, hangUuTien);
        return
        [
            new DeXuat(
                LoaiDeXuat.DichLan,
                nhuong,
                $"Hành lang \"{hanhLangId}\" thiếu {So(thieuMm)} mm bề rộng cho {tuyen.Count} tuyến cùng tầng " +
                $"({string.Join(", ", tuyen.Select(t => t.MoTaNgan))}) — dịch hệ {nhuong} (ưu tiên thấp nhất " +
                "trong nhóm) sang làn trống hoặc tầng cao độ khác.",
                thieuMm),
        ];
    }

    /// <summary>Đề xuất cho CẢNH BÁO lớp 3 — khoảng cách nhỏ hơn ngưỡng quy phạm.</summary>
    public static IReadOnlyList<DeXuat> ChoKhoangCach(
        TuyenPhoiHop a,
        TuyenPhoiHop b,
        double khoangCachMm,
        double nguongMm,
        IReadOnlyList<string> hangUuTien)
    {
        var thieu = nguongMm - khoangCachMm;
        if (AiNhuong(a, b, hangUuTien) is { } phan)
        {
            return
            [
                new DeXuat(
                    LoaiDeXuat.DichLan,
                    phan.Nhuong.HeId,
                    $"Dịch tuyến {phan.Nhuong.Id} (hệ {phan.Nhuong.HeId}, ưu tiên thấp hơn " +
                    $"{phan.Giu.HeId}) ra xa thêm {So(thieu)} mm để đạt khoảng cách quy phạm {So(nguongMm)} mm.",
                    thieu),
            ];
        }

        return
        [
            new DeXuat(
                LoaiDeXuat.DichLan,
                "",
                $"Hai hệ {a.HeId} và {b.HeId} cùng hạng ưu tiên nên luật không chỉ được hệ nào phải dịch — " +
                $"kỹ sư chọn tuyến dịch ra xa thêm {So(thieu)} mm để đạt {So(nguongMm)} mm.",
                thieu),
        ];
    }

    /// <summary>
    /// Đề xuất cho ca thiếu dữ liệu cao độ (M116 §11) — không đoán cao độ, chỉ nói rõ phải bổ sung
    /// gì rồi quét lại.
    /// </summary>
    public static IReadOnlyList<DeXuat> ChoThieuCaoDo(params TuyenPhoiHop[] tuyen) =>
        tuyen
            .Where(t => !t.CoCaoDo)
            .Select(t => new DeXuat(
                LoaiDeXuat.BoSungCaoDo,
                t.HeId,
                $"Tuyến {t.Id} (hệ {t.HeId}) thiếu cao độ/bề cao — gán bằng XBOSS_TUYEN_GAN (M115) " +
                "rồi quét lại để kiểm được lớp giao cắt cao độ."))
            .ToList();

    /// <summary>
    /// Hệ ưu tiên THẤP NHẤT trong nhóm (hạng lớn nhất). Hoà hạng thì lấy id lớn nhất theo thứ tự
    /// ordinal — tie-break thuần kỹ thuật để kết quả TẤT ĐỊNH, không phải một luật ngầm về hệ nào
    /// dễ dịch hơn (rule pack không nói điều đó).
    /// </summary>
    private static string HeUuTienThapNhat(
        IReadOnlyList<TuyenPhoiHop> tuyen, IReadOnlyList<string> hangUuTien) =>
        tuyen
            .Select(t => t.HeId)
            .Distinct(StringComparer.Ordinal)
            .OrderByDescending(he => Hang(he, hangUuTien))
            .ThenByDescending(he => he, StringComparer.Ordinal)
            .First();

    private static string So(double v) => v.ToString("0.###", CultureInfo.InvariantCulture);
}
