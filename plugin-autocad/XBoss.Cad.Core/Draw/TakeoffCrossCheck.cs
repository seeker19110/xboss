using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Draw;

/// <summary>
/// Đối chiếu thiết bị khai trong <c>drawTools</c> với bảng bóc tách (M100 §15, §18 rủi ro trôi tên):
/// mọi <c>systems[].equipment[]</c> phải trỏ tới item takeoff <c>measure=count</c> CÓ
/// <c>blockNameMatchAny</c> — thiếu thì thiết bị chèn ra sẽ không được XBOSS_BOCKL đếm (FR6).
/// Trả CẢNH BÁO, không ném: rule pack vẫn dùng được, chỉ là hạng mục đó bóc hụt — người phát hành
/// rule pack thấy cảnh báo trong báo cáo/CI và sửa ở version sau.
/// </summary>
public static class TakeoffCrossCheck
{
    public static IReadOnlyList<string> Kiem(DrawToolsSection drawTools, TakeoffSection takeoff)
    {
        var canhBao = new List<string>();
        var theoId = takeoff.Items.ToDictionary(i => i.Id, StringComparer.Ordinal);

        foreach (var sys in drawTools.Systems)
        {
            foreach (var id in sys.Equipment)
            {
                if (!theoId.TryGetValue(id, out var item))
                {
                    canhBao.Add($"Hệ \"{sys.Id}\": thiết bị \"{id}\" không có trong takeoff.items — chèn ra sẽ không đếm được.");
                    continue;
                }
                if (item.MeasureKind != TakeoffMeasure.Count)
                {
                    canhBao.Add(
                        $"Hệ \"{sys.Id}\": thiết bị \"{id}\" là item measure=\"{item.Measure}\", phải là \"count\" mới đếm theo block được.");
                    continue;
                }
                if (item.BlockNameMatchAny is not { Count: > 0 })
                {
                    canhBao.Add(
                        $"Hệ \"{sys.Id}\": item \"{id}\" thiếu blockNameMatchAny — XBOSS_BOCKL không biết đếm block tên gì.");
                }
            }
        }
        return canhBao;
    }
}
