using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Takeoff;

/// <summary>
/// Gộp khối lượng bóc tách (M99 §6.5, FR13): khớp first-match theo thứ tự takeoff.items,
/// quy đổi INSUNITS→mm→factor, cộng tổng thô rồi LÀM TRÒN CHỈ Ở TỔNG mỗi item
/// (tránh tích lũy sai số), cảnh báo polyline hở / khớp nhiều item / đơn vị bản vẽ.
/// Thuần — không biết gì về AutoCAD, test trên CI Linux (FR17).
/// </summary>
public sealed class TakeoffCalculator(TakeoffSection takeoff, string rulePackVersion)
{
    public TakeoffResult Compute(IEnumerable<MeasuredObject> doiTuong, int insUnits, int xrefSkippedCount = 0)
    {
        var (toMm, canCanhBao, tenDonVi) = DrawingUnits.TuInsUnits(insUnits);
        var toMm2 = toMm * toMm;

        var tongTho = new Dictionary<string, double>(StringComparer.Ordinal);
        var soLuong = new Dictionary<string, int>(StringComparer.Ordinal);
        var handles = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var canhBao = new List<TakeoffWarning>();
        var polylineHo = new List<string>();
        var khopNhieu = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var daBocTruoc = 0;

        foreach (var obj in doiTuong)
        {
            if (obj.AlreadyMarked)
            {
                daBocTruoc++;
                continue;
            }

            var khop = takeoff.Items.Where(item => ThuocItem(item, obj)).ToList();
            if (khop.Count == 0) continue;
            var item = khop[0];
            if (khop.Count > 1)
            {
                var key = string.Join(" + ", khop.Select(i => i.Id));
                (khopNhieu.TryGetValue(key, out var ds) ? ds : khopNhieu[key] = []).Add(obj.Handle);
            }

            double phanDongGop;
            switch (item.MeasureKind)
            {
                case TakeoffMeasure.Length:
                    phanDongGop = obj.RawLength * toMm * item.Factor;
                    break;
                case TakeoffMeasure.Area:
                    if (obj.Kind == MeasuredKind.Curve && !obj.IsClosed)
                    {
                        // AC9: polyline hở không được đo diện tích — cảnh báo, không rơi sang item khác
                        // (đối tượng rõ ràng thuộc layer của item này, đo kiểu khác sẽ gây hiểu nhầm).
                        polylineHo.Add(obj.Handle);
                        continue;
                    }
                    phanDongGop = obj.RawArea * toMm2 * item.Factor;
                    break;
                case TakeoffMeasure.Count:
                default:
                    phanDongGop = item.Factor;
                    break;
            }

            tongTho[item.Id] = tongTho.GetValueOrDefault(item.Id) + phanDongGop;
            soLuong[item.Id] = soLuong.GetValueOrDefault(item.Id) + 1;
            (handles.TryGetValue(item.Id, out var hs) ? hs : handles[item.Id] = []).Add(obj.Handle);
        }

        if (polylineHo.Count > 0)
        {
            canhBao.Add(new TakeoffWarning(
                TakeoffWarningKind.OpenPolylineSkipped,
                $"{polylineHo.Count} polyline hở trên layer đo diện tích — KHÔNG đo, chạy XBOSS_KIEMTRA để dò và đóng lại.",
                polylineHo));
        }
        foreach (var (cap, hs) in khopNhieu)
        {
            canhBao.Add(new TakeoffWarning(
                TakeoffWarningKind.MultipleItemMatch,
                $"{hs.Count} đối tượng khớp nhiều item ({cap}) — chỉ tính item đứng trước trong rule pack.",
                hs));
        }
        if (canCanhBao)
        {
            canhBao.Add(new TakeoffWarning(
                TakeoffWarningKind.DrawingUnit,
                $"Đơn vị bản vẽ: {tenDonVi} (INSUNITS={insUnits}) — đã tự quy đổi về mm trước khi tính (chuẩn dự án là mm).",
                []));
        }

        var lines = takeoff.Items
            .Where(item => soLuong.ContainsKey(item.Id))
            .Select(item => new TakeoffLine
            {
                Item = item,
                ObjectCount = soLuong[item.Id],
                Quantity = Math.Round(tongTho[item.Id], SoChuSo(item.MeasureKind), MidpointRounding.AwayFromZero),
                Handles = handles[item.Id],
            })
            .ToList();

        return new TakeoffResult
        {
            RulePackVersion = rulePackVersion,
            Lines = lines,
            Warnings = canhBao,
            SkippedMarkedCount = daBocTruoc,
            XrefSkippedCount = xrefSkippedCount,
        };
    }

    /// <summary>
    /// Gộp khối lượng từ các đối tượng ĐÃ GÁN item (đọc lại itemId từ XData — FR16,
    /// XBOSS_BOCKL_XUAT): không khớp lại quy tắc, tôn trọng phân loại tại thời điểm bóc.
    /// Item id không còn trong rule pack hiện tại → cảnh báo, bỏ qua đối tượng đó.
    /// </summary>
    public TakeoffResult ComputeAssigned(
        IEnumerable<(MeasuredObject DoiTuong, string ItemId)> daGan, int insUnits)
    {
        var (toMm, canCanhBao, tenDonVi) = DrawingUnits.TuInsUnits(insUnits);
        var toMm2 = toMm * toMm;
        var itemsTheoId = takeoff.Items.ToDictionary(i => i.Id, StringComparer.Ordinal);

        var tongTho = new Dictionary<string, double>(StringComparer.Ordinal);
        var soLuong = new Dictionary<string, int>(StringComparer.Ordinal);
        var handles = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var idLa = new List<string>();

        foreach (var (obj, itemId) in daGan)
        {
            if (!itemsTheoId.TryGetValue(itemId, out var item))
            {
                idLa.Add(obj.Handle);
                continue;
            }
            var phanDongGop = item.MeasureKind switch
            {
                TakeoffMeasure.Length => obj.RawLength * toMm * item.Factor,
                TakeoffMeasure.Area => obj.RawArea * toMm2 * item.Factor,
                _ => item.Factor,
            };
            tongTho[item.Id] = tongTho.GetValueOrDefault(item.Id) + phanDongGop;
            soLuong[item.Id] = soLuong.GetValueOrDefault(item.Id) + 1;
            (handles.TryGetValue(item.Id, out var hs) ? hs : handles[item.Id] = []).Add(obj.Handle);
        }

        var canhBao = new List<TakeoffWarning>();
        if (idLa.Count > 0)
        {
            canhBao.Add(new TakeoffWarning(
                TakeoffWarningKind.MultipleItemMatch,
                $"{idLa.Count} đối tượng mang item id không còn trong rule pack {rulePackVersion} — bỏ qua (bóc lại bằng XBOSS_BOCKL).",
                idLa));
        }
        if (canCanhBao)
        {
            canhBao.Add(new TakeoffWarning(
                TakeoffWarningKind.DrawingUnit,
                $"Đơn vị bản vẽ: {tenDonVi} (INSUNITS={insUnits}) — đã tự quy đổi về mm trước khi tính (chuẩn dự án là mm).",
                []));
        }

        var lines = takeoff.Items
            .Where(item => soLuong.ContainsKey(item.Id))
            .Select(item => new TakeoffLine
            {
                Item = item,
                ObjectCount = soLuong[item.Id],
                Quantity = Math.Round(tongTho[item.Id], SoChuSo(item.MeasureKind), MidpointRounding.AwayFromZero),
                Handles = handles[item.Id],
            })
            .ToList();

        return new TakeoffResult
        {
            RulePackVersion = rulePackVersion,
            Lines = lines,
            Warnings = canhBao,
            SkippedMarkedCount = 0,
            XrefSkippedCount = 0,
        };
    }

    private int SoChuSo(TakeoffMeasure measure) => measure switch
    {
        TakeoffMeasure.Length => takeoff.Rounding.Length,
        TakeoffMeasure.Area => takeoff.Rounding.Area,
        _ => takeoff.Rounding.Count,
    };

    /// <summary>Đối tượng có thuộc item không (M99 §6.5.2): layer khớp token-boundary
    /// (rỗng = mọi layer) + tên block (nếu item khai) + đúng phân loại theo measure.</summary>
    private static bool ThuocItem(TakeoffItem item, MeasuredObject obj)
    {
        var dungLoai = item.MeasureKind switch
        {
            TakeoffMeasure.Length => obj.Kind == MeasuredKind.Curve,
            // Area nhận cả curve (kể cả hở — để phát cảnh báo AC9) lẫn hatch/region.
            TakeoffMeasure.Area => obj.Kind is MeasuredKind.Curve or MeasuredKind.Hatch,
            TakeoffMeasure.Count => obj.Kind == MeasuredKind.Block,
            _ => false,
        };
        if (!dungLoai) return false;

        if (item.LayerMatchAny.Count > 0 && !TokenMatcher.MatchesAny(obj.Layer, item.LayerMatchAny)) return false;

        if (item.BlockNameMatchAny is { Count: > 0 })
        {
            if (obj.BlockName is null || !TokenMatcher.MatchesAny(obj.BlockName, item.BlockNameMatchAny)) return false;
        }
        return true;
    }
}
