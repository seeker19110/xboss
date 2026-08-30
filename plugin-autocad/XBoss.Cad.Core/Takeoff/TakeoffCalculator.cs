using System.Globalization;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Takeoff;

/// <summary>
/// Gộp khối lượng bóc tách (M99 §6.5, FR13): khớp first-match theo thứ tự takeoff.items,
/// quy đổi INSUNITS→mm→factor, cộng tổng thô rồi LÀM TRÒN CHỈ Ở TỔNG mỗi dòng
/// (tránh tích lũy sai số), cảnh báo polyline hở / khớp nhiều item / đơn vị bản vẽ.
///
/// v6 (M101 §6.3) thêm: tách dòng theo SIZE (<c>groupBySize</c>) và theo VÙNG (Adapter cắt tuyến
/// bằng <c>Zoning.VungClipper</c>), item DẪN XUẤT cách nhiệt (<c>derivedFrom</c>+<c>formula</c>),
/// và hệ số quy đổi hao hụt/phụ kiện tính ra CỘT RIÊNG (không bao giờ trộn vào KL đo).
/// Rule pack không khai khóa mới nào → khóa gộp là (item, "", "") → kết quả y hệt v5.
///
/// Thuần — không biết gì về AutoCAD, test trên CI Linux (FR17).
/// </summary>
public sealed class TakeoffCalculator(TakeoffSection takeoff, string rulePackVersion)
{
    public TakeoffResult Compute(IEnumerable<MeasuredObject> doiTuong, int insUnits, int xrefSkippedCount = 0)
    {
        var (toMm, canCanhBao, tenDonVi) = DrawingUnits.TuInsUnits(insUnits);
        var toMm2 = toMm * toMm;

        var bang = new Dictionary<KhoaDong, Gop>();
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
            var chinh = khop[0];
            if (khop.Count > 1)
            {
                var key = string.Join(" + ", khop.Select(i => i.Id));
                (khopNhieu.TryGetValue(key, out var ds) ? ds : khopNhieu[key] = []).Add(obj.Handle);
            }

            if (chinh.MeasureKind == TakeoffMeasure.Area && obj.Kind == MeasuredKind.Curve && !obj.IsClosed)
            {
                // AC9: polyline hở không được đo diện tích — cảnh báo, không rơi sang item khác
                // (đối tượng rõ ràng thuộc layer của item này, đo kiểu khác sẽ gây hiểu nhầm).
                polylineHo.Add(obj.Handle);
                continue;
            }

            Cong(bang, chinh, obj, toMm, toMm2);
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

        return new TakeoffResult
        {
            RulePackVersion = rulePackVersion,
            Lines = DungDong(bang, canhBao),
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

        var bang = new Dictionary<KhoaDong, Gop>();
        var idLa = new List<string>();

        foreach (var (obj, itemId) in daGan)
        {
            if (!itemsTheoId.TryGetValue(itemId, out var item) || item.LaDanXuat)
            {
                idLa.Add(obj.Handle);
                continue;
            }
            Cong(bang, item, obj, toMm, toMm2);
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

        return new TakeoffResult
        {
            RulePackVersion = rulePackVersion,
            Lines = DungDong(bang, canhBao),
            Warnings = canhBao,
            SkippedMarkedCount = 0,
            XrefSkippedCount = 0,
        };
    }

    // ===== Gộp =====

    /// <summary>Khóa một dòng kết quả: item + size + vùng (size/vùng rỗng = không tách → hành vi v5).</summary>
    private readonly record struct KhoaDong(string ItemId, string Size, string Vung);

    private sealed class Gop
    {
        /// <summary>Tổng thô theo đơn vị của item (đã nhân factor), chưa làm tròn.</summary>
        internal double ThoDonVi;
        /// <summary>Tổng chiều dài thô theo mm — nền tính item dẫn xuất, độc lập factor của item nguồn.</summary>
        internal double ThoMm;
        internal int SoDoiTuong;
        internal readonly List<string> Handles = [];
        internal bool CoXData;
        internal bool CoNhan;
    }

    /// <summary>Cộng một đối tượng vào bảng gộp — tách theo size của đối tượng và theo từng phần vùng.</summary>
    private static void Cong(
        Dictionary<KhoaDong, Gop> bang, TakeoffItem item, MeasuredObject obj, double toMm, double toMm2)
    {
        var (size, nguon) = TakeoffSize.XacDinh(item, obj, toMm);

        if (item.MeasureKind == TakeoffMeasure.Length)
        {
            // Tuyến cắt ranh giới: mỗi phần cộng vào vùng của nó (tổng các phần = cả tuyến).
            var phan = obj.PhanVung.Count > 0
                ? obj.PhanVung
                : [new PhanVungDoiTuong(obj.Vung, obj.RawLength)];
            foreach (var p in phan)
            {
                var mm = p.RawLength * toMm;
                ThemVao(bang, new KhoaDong(item.Id, size, p.Vung), mm * item.Factor, mm, obj.Handle, nguon);
            }
            return;
        }

        var dongGop = item.MeasureKind == TakeoffMeasure.Area
            ? obj.RawArea * toMm2 * item.Factor
            : item.Factor;
        ThemVao(bang, new KhoaDong(item.Id, size, obj.Vung), dongGop, 0, obj.Handle, nguon);
    }

    private static void ThemVao(
        Dictionary<KhoaDong, Gop> bang, KhoaDong khoa, double dongGop, double mm, string handle, NguonSize nguon)
    {
        if (!bang.TryGetValue(khoa, out var g)) bang[khoa] = g = new Gop();
        g.ThoDonVi += dongGop;
        g.ThoMm += mm;
        // Một đối tượng cắt qua ranh giới có thể quay lại cùng vùng nhiều lần — chỉ đếm 1 lần.
        if (g.Handles.Count == 0 || g.Handles[^1] != handle)
        {
            g.Handles.Add(handle);
            g.SoDoiTuong++;
        }
        if (nguon == NguonSize.XData) g.CoXData = true;
        if (nguon == NguonSize.Nhan) g.CoNhan = true;
    }

    // ===== Dựng dòng kết quả =====

    private List<TakeoffLine> DungDong(Dictionary<KhoaDong, Gop> bang, List<TakeoffWarning> canhBao)
    {
        var lines = new List<TakeoffLine>();
        var soDongTuNhan = 0;

        foreach (var item in takeoff.Items)
        {
            if (item.LaDanXuat)
            {
                lines.AddRange(DongDanXuat(item, bang, canhBao));
                continue;
            }

            foreach (var (khoa, gop) in DongCuaItem(bang, item.Id))
            {
                var soChuSo = SoChuSo(item.MeasureKind);
                var klDo = Math.Round(gop.ThoDonVi, soChuSo, MidpointRounding.AwayFromZero);
                var (heSo, moTa) = QuyDoi(item);
                var nguon = NguonCuaDong(gop);
                if (nguon is NguonSize.Nhan or NguonSize.HonHop) soDongTuNhan++;
                lines.Add(new TakeoffLine
                {
                    Item = item,
                    ObjectCount = gop.SoDoiTuong,
                    Quantity = klDo,
                    Handles = gop.Handles,
                    Size = khoa.Size,
                    NguonSize = nguon,
                    Vung = khoa.Vung,
                    HeSoQuyDoi = heSo,
                    MoTaQuyDoi = moTa,
                    KlQuyDoi = heSo > 0
                        ? Math.Round(klDo * heSo, SoChuSoQuyDoi(item), MidpointRounding.AwayFromZero)
                        : 0,
                });
            }
        }

        if (soDongTuNhan > 0)
        {
            canhBao.Add(new TakeoffWarning(
                TakeoffWarningKind.SizeDocTuNhan,
                $"{soDongTuNhan} dòng lấy size từ NHÃN gần tuyến (bán tự động) — soát lại cột \"Nguồn size\" trước khi giao QS; " +
                "size chắc chắn là size do XBOSS_VE ghi trong XData.",
                []));
        }
        return lines;
    }

    /// <summary>Các dòng của một item, sắp xếp theo vùng rồi theo size để bảng đọc được.</summary>
    private static IEnumerable<(KhoaDong Khoa, Gop Gop)> DongCuaItem(Dictionary<KhoaDong, Gop> bang, string itemId) =>
        bang.Where(kv => kv.Key.ItemId == itemId)
            .OrderBy(kv => kv.Key.Vung.Length == 0 ? 1 : 0)   // "(ngoài vùng)" xuống cuối
            .ThenBy(kv => kv.Key.Vung, StringComparer.Ordinal)
            .ThenBy(kv => TakeoffSize.KhoaSapXep(kv.Key.Size).Hang)
            .ThenBy(kv => TakeoffSize.KhoaSapXep(kv.Key.Size).Rong)
            .ThenBy(kv => TakeoffSize.KhoaSapXep(kv.Key.Size).Cao)
            .ThenBy(kv => kv.Key.Size, StringComparer.Ordinal)
            .Select(kv => (kv.Key, kv.Value));

    /// <summary>
    /// Dòng của item dẫn xuất (cách nhiệt): tính từ CHIỀU DÀI ĐÃ TÁCH THEO SIZE của item nguồn.
    /// Phần chưa xác định được size (hoặc size không hợp công thức) bị BỎ QUA và gộp vào cảnh báo
    /// "còn X m chưa tính" — tuyệt đối không đoán size (M101 §6.3).
    /// </summary>
    private IEnumerable<TakeoffLine> DongDanXuat(
        TakeoffItem item, Dictionary<KhoaDong, Gop> bang, List<TakeoffWarning> canhBao)
    {
        var lines = new List<TakeoffLine>();
        var mmChuaTinh = 0d;
        var (heSo, moTa) = QuyDoi(item);

        foreach (var (khoa, gop) in DongCuaItem(bang, item.DerivedFrom))
        {
            var daiM = gop.ThoMm / 1000;
            var dienTich = khoa.Size.Length > 0 ? TakeoffSize.DienTich(khoa.Size, item.FormulaKind, daiM) : null;
            if (dienTich is null)
            {
                mmChuaTinh += gop.ThoMm;
                continue;
            }
            var klDo = Math.Round(dienTich.Value * item.Factor, SoChuSo(TakeoffMeasure.Area), MidpointRounding.AwayFromZero);
            lines.Add(new TakeoffLine
            {
                Item = item,
                ObjectCount = gop.SoDoiTuong,
                Quantity = klDo,
                Handles = gop.Handles,
                Size = khoa.Size,
                NguonSize = NguonCuaDong(gop),
                Vung = khoa.Vung,
                HeSoQuyDoi = heSo,
                MoTaQuyDoi = moTa,
                KlQuyDoi = heSo > 0
                    ? Math.Round(klDo * heSo, SoChuSoQuyDoi(item), MidpointRounding.AwayFromZero)
                    : 0,
                LaDanXuat = true,
            });
        }

        if (mmChuaTinh > 0)
        {
            var met = (mmChuaTinh / 1000).ToString("0.00", CultureInfo.InvariantCulture);
            canhBao.Add(new TakeoffWarning(
                TakeoffWarningKind.DanXuatThieuSize,
                $"\"{item.Name}\": còn {met} m của \"{item.DerivedFrom}\" CHƯA TÍNH vì chưa xác định được size " +
                "(hoặc size không hợp công thức) — bổ sung size cho tuyến rồi bóc lại, plugin không đoán size.",
                []));
        }
        return lines;
    }

    private static NguonSize NguonCuaDong(Gop gop) => (gop.CoXData, gop.CoNhan) switch
    {
        (true, true) => NguonSize.HonHop,
        (true, false) => NguonSize.XData,
        (false, true) => NguonSize.Nhan,
        _ => NguonSize.KhongCo,
    };

    /// <summary>Hệ số quy đổi + mô tả tiếng Việt; hệ số 0 = rule pack không khai (mặc định v5).</summary>
    private static (double HeSo, string MoTa) QuyDoi(TakeoffItem item)
    {
        if (item.MeasureKind == TakeoffMeasure.Count)
        {
            return item.PerCountAdd > 0
                ? (item.PerCountAdd, $"+{item.PerCountAdd.ToString("0.###", CultureInfo.InvariantCulture)} m tương đương/{item.Unit}")
                : (0, "");
        }
        return item.WastagePct > 0
            ? (1 + item.WastagePct / 100, $"hao hụt {item.WastagePct.ToString("0.##", CultureInfo.InvariantCulture)}%")
            : (0, "");
    }

    /// <summary>Item đếm quy đổi ra MÉT nên làm tròn theo số chữ số của phép đo dài.</summary>
    private int SoChuSoQuyDoi(TakeoffItem item) =>
        item.MeasureKind == TakeoffMeasure.Count ? takeoff.Rounding.Length : SoChuSo(item.MeasureKind);

    private int SoChuSo(TakeoffMeasure measure) => measure switch
    {
        TakeoffMeasure.Length => takeoff.Rounding.Length,
        TakeoffMeasure.Area => takeoff.Rounding.Area,
        _ => takeoff.Rounding.Count,
    };

    /// <summary>Đối tượng có thuộc item không (M99 §6.5.2): layer khớp token-boundary
    /// (rỗng = mọi layer) + tên block (nếu item khai) + đúng phân loại theo measure.
    /// Item dẫn xuất (v6) không khớp đối tượng nào — nó được TÍNH RA từ item nguồn.</summary>
    private static bool ThuocItem(TakeoffItem item, MeasuredObject obj)
    {
        if (item.LaDanXuat) return false;

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
