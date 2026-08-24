using XBoss.Cad.Core.Fonts;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Layers;
using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Inspection;

/// <summary>Một nhóm phát hiện của XBOSS_KIEMTRA (M99 §6.4 — 7 phép kiểm).</summary>
public sealed record InspectionFinding
{
    /// <summary>Slug ổn định cho báo cáo JSON: layer-sai / lech-z / polyline-ho / font-cu /
    /// lineweight-lech / dim-override / rac-hinh-hoc.</summary>
    public required string Id { get; init; }
    public required string Ten { get; init; }
    public required IReadOnlyList<string> Handles { get; init; }
    public required IReadOnlyList<string> ChiTiet { get; init; }
}

public sealed class InspectionReport
{
    public required string RulePackVersion { get; init; }
    public required IReadOnlyList<InspectionFinding> Findings { get; init; }
    public required IReadOnlyList<string> CanhBao { get; init; }
    public int TongSoLoi => Findings.Sum(f => Math.Max(f.Handles.Count, f.ChiTiet.Count));
}

/// <summary>
/// Bộ kiểm thuần (M99 FR12): nhận snapshot + rule pack, trả các nhóm phát hiện.
/// KHÔNG đụng bản vẽ — highlight/marker là việc của Adapter dựa trên danh sách handle.
/// </summary>
public sealed class Inspector
{
    private readonly CadRulePack _pack;
    private readonly LayerMapper _mapper;
    private readonly VietnameseTextConverter _fonts;

    public Inspector(CadRulePack pack)
    {
        _pack = pack;
        _mapper = new LayerMapper(pack.LayerMap);
        _fonts = new VietnameseTextConverter(pack.FontMap);
    }

    public InspectionReport Run(DrawingSnapshot snapshot)
    {
        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits(snapshot.InsUnits);
        var findings = new List<InspectionFinding>();
        var canhBao = new List<string>();
        if (canCanhBaoDonVi)
            canhBao.Add($"Đơn vị bản vẽ: {tenDonVi} (INSUNITS={snapshot.InsUnits}) — dung sai đã quy đổi tương ứng, chuẩn dự án là mm.");

        // (1) Layer sai chuẩn — tên sẽ bị đổi khi chuẩn hóa.
        var layerSai = snapshot.Layers
            .Where(l => !string.Equals(_mapper.Map(l.Name), l.Name, StringComparison.Ordinal))
            .Select(l => $"{l.Name} → {_mapper.Map(l.Name)}")
            .ToList();
        if (layerSai.Count > 0)
            findings.Add(new InspectionFinding { Id = "layer-sai", Ten = "Layer sai chuẩn (sẽ đổi tên khi chuẩn hóa)", Handles = [], ChiTiet = layerSai });

        // (2) Lệch Z / elevation.
        var zTol = _pack.InspectionPolicy.ZToleranceMm / toMm; // dung sai mm → đơn vị bản vẽ
        var lechZ = snapshot.Entities.Where(e => e.MaxAbsZ > zTol).Select(e => e.Handle).ToList();
        if (lechZ.Count > 0)
            findings.Add(new InspectionFinding { Id = "lech-z", Ten = "Thực thể lệch Z (≠0)", Handles = lechZ, ChiTiet = [] });

        // (3) Polyline hở — layer đo diện tích + layer khai thêm; "gần kín" báo trên mọi layer.
        var op = _pack.InspectionPolicy.OpenPolyline;
        var layerDienTich = op.CheckLayersFromAreaTakeoff
            ? _pack.Takeoff.Items.Where(i => i.MeasureKind == TakeoffMeasure.Area).SelectMany(i => i.LayerMatchAny).ToList()
            : new List<string>();
        var layerKiemHo = layerDienTich.Concat(op.ExtraLayersMatchAny).ToList();
        var gapTol = op.NearGapToleranceMm / toMm;
        var hoThat = new List<string>();
        var ganKin = new List<string>();
        foreach (var e in snapshot.Entities.Where(e => e.IsPolyline && !e.IsClosed))
        {
            var ganKinEntity = e.EndGapDistance is { } gap && gap <= gapTol;
            var thuocLayerKiem = layerKiemHo.Count > 0 && TokenMatcher.MatchesAny(e.Layer, layerKiemHo);
            if (ganKinEntity && (thuocLayerKiem || op.ReportNearClosedOnAllLayers)) ganKin.Add(e.Handle);
            else if (thuocLayerKiem) hoThat.Add(e.Handle);
        }
        if (hoThat.Count > 0)
            findings.Add(new InspectionFinding { Id = "polyline-ho", Ten = "Polyline hở trên layer đo diện tích", Handles = hoThat, ChiTiet = [] });
        if (ganKin.Count > 0)
            findings.Add(new InspectionFinding { Id = "polyline-gan-kin", Ten = $"Polyline gần kín (2 đầu cách ≤ {op.NearGapToleranceMm}mm — nghi vẽ thiếu 1 cú click)", Handles = ganKin, ChiTiet = [] });

        // (4) Font cũ TCVN3/VNI.
        var fontCu = snapshot.Entities
            .Where(e => e.TextContent is { Length: > 0 } t && _fonts.ContainsLegacyEncoding(t, e.TextStyleFontName))
            .Select(e => e.Handle)
            .ToList();
        if (fontCu.Count > 0)
            findings.Add(new InspectionFinding { Id = "font-cu", Ten = "Text mã hóa font cũ TCVN3/VNI", Handles = fontCu, ChiTiet = [] });

        // (5) Lineweight lệch bảng CTB theo ACI (kiểm ở mức layer — chuẩn dự án vẽ ByLayer).
        var lwLech = new List<string>();
        foreach (var l in snapshot.Layers)
        {
            var quyDinh = _pack.LineweightMap.ByAci.FirstOrDefault(c => c.Aci == l.Aci);
            if (quyDinh is null || l.LineweightMm is null) continue;
            if (Math.Abs(l.LineweightMm.Value - quyDinh.LineweightMm) > 1e-9)
                lwLech.Add($"{l.Name}: ACI {l.Aci} đang {l.LineweightMm}mm, quy định {quyDinh.LineweightMm}mm");
        }
        if (lwLech.Count > 0)
            findings.Add(new InspectionFinding { Id = "lineweight-lech", Ten = "Lineweight lệch bảng CTB", Handles = [], ChiTiet = lwLech });

        // (6) Dimension override.
        var dimOv = snapshot.Entities.Where(e => e.HasDimOverride).Select(e => e.Handle).ToList();
        if (dimOv.Count > 0)
            findings.Add(new InspectionFinding { Id = "dim-override", Ten = "Dimension có override", Handles = dimOv, ChiTiet = [] });

        // (7) Rác hình học: zero-length + trùng chồng (khóa làm tròn mm, cả 2 chiều).
        var dp = _pack.PurgePolicy.DeepPurge;
        var zeroTol = dp.ZeroLengthToleranceMm / toMm;
        var zero = snapshot.Entities
            .Where(e => e.Kind == EntityKind.Curve && !e.IsClosed && e.RawLength <= zeroTol)
            .Select(e => e.Handle)
            .ToList();
        var trung = TimTrungChong(snapshot.Entities, toMm);
        var rac = zero.Concat(trung).Distinct().ToList();
        if (rac.Count > 0)
        {
            findings.Add(new InspectionFinding
            {
                Id = "rac-hinh-hoc",
                Ten = "Rác hình học (zero-length / trùng chồng)",
                Handles = rac,
                ChiTiet = [$"zero-length: {zero.Count}", $"trùng chồng: {trung.Count}"],
            });
        }

        return new InspectionReport { RulePackVersion = _pack.Version, Findings = findings, CanhBao = canhBao };
    }

    /// <summary>Đối tượng trùng chồng: cùng khóa (đầu, cuối) làm tròn về mm nguyên, so cả
    /// chiều thuận lẫn ngược (đúng purgePolicy.deepPurge.duplicateKeyRounding). Giữ bản đầu,
    /// liệt kê các bản sau. Public vì bước overkill của pipeline chuẩn hóa (Adapter) dùng
    /// chung danh sách này để xoá — một thuật toán duy nhất cho kiểm lẫn sửa.</summary>
    public static List<string> TimTrungChong(IReadOnlyList<EntityInfo> entities, double toMm)
    {
        var daThay = new HashSet<string>(StringComparer.Ordinal);
        var trung = new List<string>();
        foreach (var e in entities)
        {
            if (e.Kind != EntityKind.Curve || e.Start is not { } s || e.End is not { } d) continue;
            // + 0.0 để chuẩn hóa -0 về 0 (Math.Round(-0.4) trả -0, in ra "-0" làm lệch khóa).
            var a = (X: Math.Round(s.X * toMm) + 0.0, Y: Math.Round(s.Y * toMm) + 0.0);
            var b = (X: Math.Round(d.X * toMm) + 0.0, Y: Math.Round(d.Y * toMm) + 0.0);
            // Chuẩn hoá chiều để (A→B) và (B→A) ra cùng khóa.
            var (p, q) = a.X < b.X || (a.X == b.X && a.Y <= b.Y) ? (a, b) : (b, a);
            var key = $"{p.X},{p.Y}|{q.X},{q.Y}";
            if (!daThay.Add(key)) trung.Add(e.Handle);
        }
        return trung;
    }
}
