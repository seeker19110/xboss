using System.Globalization;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Routing;

/// <summary>
/// Một đoạn hành lang đang được cấp làn (M114 FR9) — số đo giữ mm như XData hành lang.
/// </summary>
/// <param name="LanDaCap">Sổ chiếm chỗ ĐANG có trong DWG (FR3) — hệ chạy sau đọc được của hệ chạy trước.</param>
public sealed record HanhLangCapLan(
    string Id,
    double BeRongMm,
    double CotDayDamMm,
    double CotTranMm,
    IReadOnlyList<LanChiem>? LanDaCap = null)
{
    /// <summary>Sổ chiếm chỗ, không bao giờ null.</summary>
    public IReadOnlyList<LanChiem> So => LanDaCap ?? [];
}

/// <summary>Một hệ xin làn trong hành lang: cần rộng bao nhiêu và thiết diện cao bao nhiêu (mm).</summary>
public sealed record YeuCauLan(string HeId, double BeRongMm, double CaoThietDienMm = 0);

/// <summary>Một hệ KHÔNG cấp được làn — nêu đúng hành lang và hệ đang chiếm (guardrail 3, AC7).</summary>
public sealed record LanKhongCap(string HeId, string HanhLangId, string LyDo);

/// <summary>Kết quả cấp tầng/làn cho một hành lang.</summary>
/// <param name="LanMoi">Các làn cấp được, theo thứ tự yêu cầu.</param>
/// <param name="KhongCap">Các hệ không cấp được kèm lý do đếm được.</param>
/// <param name="SoSauKhiCap">Sổ chiếm chỗ sau khi ghi thêm — caller ghi ngược vào XData hành lang (FR9).</param>
public sealed record KetQuaCapLan(
    IReadOnlyList<LanChiem> LanMoi,
    IReadOnlyList<LanKhongCap> KhongCap,
    IReadOnlyList<LanChiem> SoSauKhiCap);

/// <summary>
/// Cấp tầng + làn cho các hệ đi qua một hành lang (M114 FR9) — bản Core C# của
/// <c>planMultiTierCorridor</c> (TS, <c>lib/ky-thuat/engineering-cad-corridor.ts</c>). THUẦN,
/// test trên CI Linux, mọi tham số lấy từ <c>drawTools.routingPolicy</c> nên hai bản dùng chung
/// DỮ LIỆU; bộ đối chứng <c>plugin-autocad/doi-chung/routing-doi-chung.json</c> ghim THUẬT TOÁN
/// (M114 §2 #2 — cơ chế đã trị rủi ro số 1 của M99).
///
/// Quy ước số đo (bám đúng <c>planMultiTierCorridor</c> để hai tầng đối chiếu được):
/// <list type="bullet">
/// <item>Làn đo từ MÉP TRÁI hành lang; làn đầu tiên của một tầng bắt đầu ở <c>laneGapMm.default</c>.</item>
/// <item>Làn kế tiếp trong CÙNG tầng đặt sau làn cuối một khe hở: <c>laneGapMm.elecToHot</c> khi một
/// trong hai làn kề là hệ điện, còn lại <c>laneGapMm.default</c>.</item>
/// <item>Tầng khai <c>offsetFromBeamMm</c>: cao độ = đáy dầm − offset − chiều cao thiết diện.
/// Tầng khai <c>offsetFromCeilingMm</c> (sát trần): cao độ = trần + offset, làn đặt GIỮA hành lang
/// và không đẩy con trỏ làn — đúng như nhánh sprinkler bên TS.</item>
/// </list>
///
/// Hết bề rộng thì NÓI hết làn (guardrail 3): nêu đúng hành lang và các hệ đang chiếm, tuyệt đối
/// không nới bề rộng hay ép hai làn chồng lên nhau cho xong.
/// </summary>
public static class CapPhatLanTang
{
    /// <summary>
    /// Cấp tầng/làn lần lượt cho <paramref name="yeuCau"/> trong <paramref name="hanhLang"/>.
    /// </summary>
    /// <param name="chinhSach">Khối <c>drawTools.routingPolicy</c> đang phát hành.</param>
    /// <param name="heDien">
    /// Id các hệ ĐIỆN — quyết định khi nào dùng <c>laneGapMm.elecToHot</c> thay cho
    /// <c>laneGapMm.default</c>. Truyền tường minh vì rule pack không có cờ "hệ điện": Core KHÔNG
    /// đoán hộ bằng tên tier (đoán sai là kéo khe hở điện–nóng xuống dưới mức an toàn).
    /// </param>
    public static KetQuaCapLan Cap(
        RoutingPolicySection chinhSach,
        HanhLangCapLan hanhLang,
        IReadOnlyList<YeuCauLan> yeuCau,
        IReadOnlyCollection<string>? heDien = null)
    {
        var dien = new HashSet<string>(heDien ?? [], StringComparer.Ordinal);
        var so = new List<LanChiem>(hanhLang.So);
        var lanMoi = new List<LanChiem>();
        var khongCap = new List<LanKhongCap>();

        foreach (var yc in yeuCau)
        {
            var tier = chinhSach.TierCuaHe(yc.HeId);
            if (tier is null)
            {
                khongCap.Add(new LanKhongCap(
                    yc.HeId,
                    hanhLang.Id,
                    $"Hệ \"{yc.HeId}\" không nằm ở tier nào trong drawTools.routingPolicy.tiers — " +
                    "không biết cấp tầng nào."));
                continue;
            }

            var caoDo = CaoDoTier(tier, hanhLang, yc.CaoThietDienMm);
            if (caoDo is not { } cd)
            {
                khongCap.Add(new LanKhongCap(
                    yc.HeId,
                    hanhLang.Id,
                    $"Tier \"{tier.Id}\" không khai offsetFromBeamMm lẫn offsetFromCeilingMm — " +
                    "không suy được cao độ."));
                continue;
            }

            var satTran = tier.OffsetFromCeilingMm.HasValue;
            var lanTu = satTran
                ? LamTron(hanhLang.BeRongMm / 2)
                : LamTron(ConTro(so, tier.Id, yc.HeId, chinhSach, dien));
            var lanDen = lanTu + yc.BeRongMm;

            if (lanDen > hanhLang.BeRongMm + 1e-9)
            {
                var dangChiem = so.Count == 0
                    ? "chưa hệ nào"
                    : string.Join(", ", so.Select(l => l.HeId).Distinct(StringComparer.Ordinal));
                khongCap.Add(new LanKhongCap(
                    yc.HeId,
                    hanhLang.Id,
                    $"Hành lang \"{hanhLang.Id}\" hết làn: cần tới {So(lanDen)} mm mà bề rộng khả dụng " +
                    $"chỉ {So(hanhLang.BeRongMm)} mm (đang chiếm: {dangChiem})."));
                continue;
            }

            var lan = new LanChiem(yc.HeId, tier.Id, lanTu, lanDen, cd);
            lanMoi.Add(lan);
            so.Add(lan);
        }

        return new KetQuaCapLan(lanMoi, khongCap, so);
    }

    /// <summary>Gỡ chiếm chỗ của một hệ khỏi sổ trước khi dựng lại (FR13 — không rò rỉ làn).</summary>
    public static IReadOnlyList<LanChiem> GoChiemCho(IReadOnlyList<LanChiem> so, string heId) =>
        so.Where(l => !string.Equals(l.HeId, heId, StringComparison.Ordinal)).ToList();

    /// <summary>Khe hở (mm) giữa 2 làn kề nhau — hệ điện đứng cạnh hệ khác thì dùng elecToHot.</summary>
    public static double KheHo(
        RoutingPolicySection chinhSach,
        string heA,
        string heB,
        IReadOnlyCollection<string> heDien) =>
        heDien.Contains(heA) || heDien.Contains(heB)
            ? chinhSach.LaneGapMm.ElecToHot
            : chinhSach.LaneGapMm.Default;

    private static double ConTro(
        List<LanChiem> so,
        string tierId,
        string heMoi,
        RoutingPolicySection chinhSach,
        IReadOnlyCollection<string> heDien)
    {
        LanChiem? cuoi = null;
        foreach (var lan in so)
        {
            if (!string.Equals(lan.TierId, tierId, StringComparison.Ordinal)) continue;
            if (cuoi is null || lan.LanDenMm > cuoi.LanDenMm) cuoi = lan;
        }

        return cuoi is null
            ? chinhSach.LaneGapMm.Default
            : cuoi.LanDenMm + KheHo(chinhSach, cuoi.HeId, heMoi, heDien);
    }

    private static double? CaoDoTier(RoutingTierSection tier, HanhLangCapLan hanhLang, double caoThietDien)
    {
        if (tier.OffsetFromBeamMm is { } tuDam)
            return LamTron(hanhLang.CotDayDamMm - tuDam - caoThietDien);
        if (tier.OffsetFromCeilingMm is { } tuTran)
            return LamTron(hanhLang.CotTranMm + tuTran);
        return null;
    }

    /// <summary>Làm tròn như <c>Math.round</c> của JS (nửa đơn vị làm tròn LÊN) — giữ 2 tầng khớp nhau.</summary>
    private static double LamTron(double x) => Math.Floor(x + 0.5);

    private static string So(double x) => x.ToString("0.###", CultureInfo.InvariantCulture);
}
