using System.Globalization;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Inspection;

/// <summary>
/// 7 phép kiểm mở rộng của rule pack v5 (M101 §6.1 — số 10..16). Thuần, không đụng bản vẽ:
/// nhận snapshot + chính sách, trả <see cref="InspectionFinding"/> đúng khung báo cáo cũ
/// (<see cref="Inspector"/> gọi và gộp vào cùng mảng findings — không phá cấu trúc JSON M99).
///
/// HAI TẦNG BẢO VỆ chống báo oan, áp cho MỌI phép ở đây:
///   (1) cờ <c>enabled</c> trong rule pack, mặc định false;
///   (2) thiếu dữ liệu đầu vào (Adapter chưa quét / bản vẽ không có M100) → trả null, tự tắt.
/// Quy ước đơn vị: chiều dài/khoảng cách in ra theo mm (ngưỡng khai bằng mm nên kỹ sư so được),
/// còn TOẠ ĐỘ in theo đơn vị bản vẽ (kỹ sư gõ thẳng vào AutoCAD để nhảy tới điểm đó).
/// </summary>
public static class PhepKiemMoRong
{
    /// <summary>Nhãn cảnh báo CỐ ĐỊNH của phép kiểm 11 (M101 §18) — luôn đi kèm kết quả clash 2D.</summary>
    public const string CanhBaoClash2d =
        "Phép kiểm 11 (giao cắt khác hệ) chỉ xét giao trên MẶT BẰNG — KHÔNG thay được clash 3D: " +
        "hai tuyến giao nhau ở đây vẫn có thể khác cao độ, và không có giao điểm ở đây cũng KHÔNG " +
        "có nghĩa là các hệ không va nhau ngoài công trường.";

    /// <summary>Tên phép kiểm 11 trong báo cáo — mang sẵn chữ "(mặt bằng)" để không ai đọc nhầm.</summary>
    public const string TenClash2d = "Giao cắt khác hệ (mặt bằng) — không thay được clash 3D";

    private static string Mm(double giaTriDonViBanVe, double toMm) =>
        Math.Round(giaTriDonViBanVe * toMm).ToString("0", CultureInfo.InvariantCulture);

    private static string Toa(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);

    // ===== (10) Chồng lấn tuyến cùng hệ =====

    /// <summary>
    /// Hai tim KHÁC NHAU trên CÙNG layer nằm trong dải song song ±overlapToleranceMm và chồng nhau
    /// ≥ overlapMinLengthMm → nghi vẽ đè/vẽ đúp (bóc khối lượng sẽ đếm hai lần).
    /// Khác phép kiểm 7: ở đó hai đoạn phải trùng tuyệt đối sau khi làm tròn mm.
    /// </summary>
    public static InspectionFinding? ChongLanCungHe(DrawingSnapshot snapshot, OverlapCheckPolicy chinhSach, double toMm)
    {
        if (!chinhSach.Enabled || snapshot.Centerlines is not { } tims) return null;

        var dungSai = chinhSach.OverlapToleranceMm / toMm;
        var toiThieu = chinhSach.OverlapMinLengthMm / toMm;
        var chiTiet = new List<string>();
        var handles = new List<string>();

        foreach (var nhom in tims.Where(t => t.Vertices.Count >= 2)
                     .GroupBy(t => t.Layer, StringComparer.OrdinalIgnoreCase))
        {
            var ds = nhom.ToList();
            for (var i = 0; i < ds.Count; i++)
            {
                for (var j = i + 1; j < ds.Count; j++)
                {
                    var (min1, max1) = Bao(ds[i]);
                    var (min2, max2) = Bao(ds[j]);
                    if (!Segment2D.BaoGiaoNhau(min1, max1, min2, max2, dungSai)) continue;

                    var tong = TongChongLan(ds[i], ds[j], dungSai);
                    if (tong < toiThieu) continue;

                    chiTiet.Add(
                        $"{nhom.Key}: tim {ds[i].Handle} chồng tim {ds[j].Handle} trên ~{Mm(tong, toMm)}mm");
                    ThemHandle(handles, ds[i].Handle);
                    ThemHandle(handles, ds[j].Handle);
                }
            }
        }

        if (chiTiet.Count == 0) return null;
        return new InspectionFinding
        {
            Id = "chong-lan-cung-he",
            Ten = $"Chồng lấn tuyến cùng hệ (song song ≤ {chinhSach.OverlapToleranceMm}mm, chồng ≥ {chinhSach.OverlapMinLengthMm}mm — nghi vẽ đè)",
            Handles = handles,
            ChiTiet = chiTiet,
        };
    }

    /// <summary>Tổng chiều dài chồng lấn giữa mọi cặp đoạn của hai tim (xấp xỉ đủ dùng: hai tuyến
    /// vẽ đè nhau gần song song nên các phần chồng nằm rời nhau dọc tuyến, không cộng trùng).</summary>
    private static double TongChongLan(CenterlineInfo a, CenterlineInfo b, double dungSai)
    {
        double tong = 0;
        for (var i = 0; i + 1 < a.Vertices.Count; i++)
        {
            for (var j = 0; j + 1 < b.Vertices.Count; j++)
            {
                tong += Segment2D.ChongLanSongSong(
                    a.Vertices[i], a.Vertices[i + 1], b.Vertices[j], b.Vertices[j + 1], dungSai);
            }
        }
        return tong;
    }

    private static ((double X, double Y) Min, (double X, double Y) Max) Bao(CenterlineInfo t)
    {
        var minX = t.Vertices.Min(v => v.X);
        var minY = t.Vertices.Min(v => v.Y);
        var maxX = t.Vertices.Max(v => v.X);
        var maxY = t.Vertices.Max(v => v.Y);
        return ((minX, minY), (maxX, maxY));
    }

    private static void ThemHandle(List<string> handles, string h)
    {
        if (!handles.Contains(h, StringComparer.Ordinal)) handles.Add(h);
    }

    // ===== (11) Giao cắt khác hệ — clash 2D =====

    /// <summary>
    /// Giao điểm tim hệ A × tim hệ B cho các cặp hệ khai trong <c>clashPairs</c>. Hệ của một tim suy
    /// từ layer (phải đúng là <c>branches[].target</c> của nhóm) — không suy được thì bỏ qua, không đoán.
    /// Kết quả LUÔN đi kèm <see cref="CanhBaoClash2d"/> do <see cref="Inspector"/> thêm vào báo cáo.
    /// </summary>
    public static InspectionFinding? GiaoCatKhacHe(
        DrawingSnapshot snapshot, Clash2dCheckPolicy chinhSach, LayerMapSection layerMap)
    {
        if (!chinhSach.Enabled || chinhSach.ClashPairs.Count == 0) return null;
        if (snapshot.Centerlines is not { } tims) return null;

        // layer đích → id hệ (một nguồn tên duy nhất: layerMap).
        var heTheoLayer = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var g in layerMap.Groups)
        {
            foreach (var b in g.Branches) heTheoLayer[b.Target] = g.Id;
        }

        var capCanKiem = new HashSet<string>(StringComparer.Ordinal);
        foreach (var cap in chinhSach.ClashPairs.Where(c => c.Count == 2))
        {
            capCanKiem.Add(KhoaCap(cap[0], cap[1]));
        }

        var ds = tims
            .Where(t => t.Vertices.Count >= 2 && heTheoLayer.ContainsKey(t.Layer))
            .Select(t => (Tim: t, He: heTheoLayer[t.Layer]))
            .ToList();

        var chiTiet = new List<string>();
        var handles = new List<string>();
        for (var i = 0; i < ds.Count; i++)
        {
            for (var j = i + 1; j < ds.Count; j++)
            {
                if (string.Equals(ds[i].He, ds[j].He, StringComparison.Ordinal)) continue;
                if (!capCanKiem.Contains(KhoaCap(ds[i].He, ds[j].He))) continue;

                var (min1, max1) = Bao(ds[i].Tim);
                var (min2, max2) = Bao(ds[j].Tim);
                if (!Segment2D.BaoGiaoNhau(min1, max1, min2, max2, 0)) continue;

                foreach (var diem in GiaoDiemGiuaHaiTim(ds[i].Tim, ds[j].Tim))
                {
                    chiTiet.Add(
                        $"{ds[i].He} × {ds[j].He}: tim {ds[i].Tim.Handle} × {ds[j].Tim.Handle} tại ({Toa(diem.X)}, {Toa(diem.Y)})");
                    ThemHandle(handles, ds[i].Tim.Handle);
                    ThemHandle(handles, ds[j].Tim.Handle);
                }
            }
        }

        if (chiTiet.Count == 0) return null;
        return new InspectionFinding
        {
            Id = "giao-cat-khac-he",
            Ten = TenClash2d,
            Handles = handles,
            ChiTiet = chiTiet,
        };
    }

    private static string KhoaCap(string a, string b) =>
        string.CompareOrdinal(a, b) <= 0 ? $"{a}|{b}" : $"{b}|{a}";

    private static IEnumerable<(double X, double Y)> GiaoDiemGiuaHaiTim(CenterlineInfo a, CenterlineInfo b)
    {
        for (var i = 0; i + 1 < a.Vertices.Count; i++)
        {
            for (var j = 0; j + 1 < b.Vertices.Count; j++)
            {
                var d = Segment2D.GiaoDiem(a.Vertices[i], a.Vertices[i + 1], b.Vertices[j], b.Vertices[j + 1]);
                if (d is { } diem) yield return diem;
            }
        }
    }

    // ===== (12) Khung tên thiếu/sai trường =====

    /// <summary>
    /// Block khung tên trên layout mà attribute bắt buộc thiếu/rỗng. Nhận diện khung tên: manifest
    /// M100 (<see cref="BlockRefInfo.IsTitleblock"/>) nếu có, không thì khớp tên theo
    /// <c>titleblockNameMatchAny</c>. Layout không có khung tên → không báo (có thể chưa dựng trang in).
    /// </summary>
    public static InspectionFinding? KhungTenThieuTruong(DrawingSnapshot snapshot, TitleblockCheckPolicy chinhSach)
    {
        if (!chinhSach.Enabled || chinhSach.RequiredAttributes.Count == 0) return null;
        if (snapshot.Layouts is not { } layouts) return null;

        var chiTiet = new List<string>();
        var handles = new List<string>();
        foreach (var layout in layouts)
        {
            foreach (var block in layout.BlockRefs.Where(b => LaKhungTen(b, chinhSach)))
            {
                var thieu = chinhSach.RequiredAttributes
                    .Where(tag => !block.Attributes.TryGetValue(tag, out var v) || string.IsNullOrWhiteSpace(v))
                    .ToList();
                if (thieu.Count == 0) continue;
                chiTiet.Add($"{layout.Name} / {block.BlockName}: thiếu {string.Join(", ", thieu)}");
                ThemHandle(handles, block.Handle);
            }
        }

        if (chiTiet.Count == 0) return null;
        return new InspectionFinding
        {
            Id = "khung-ten-thieu-truong",
            Ten = "Khung tên thiếu/để rỗng trường bắt buộc",
            Handles = handles,
            ChiTiet = chiTiet,
        };
    }

    private static bool LaKhungTen(BlockRefInfo block, TitleblockCheckPolicy chinhSach) =>
        block.IsTitleblock ?? TokenMatcher.MatchesAny(block.BlockName, chinhSach.TitleblockNameMatchAny);

    // ===== (13) Viewport không khóa / tỉ lệ lạ =====

    /// <summary>Viewport chưa khóa (lỡ zoom là in sai tỉ lệ) hoặc tỉ lệ ngoài danh mục
    /// <c>scales</c>. Viewport không đọc được tỉ lệ → bỏ qua, không đoán.</summary>
    public static InspectionFinding? ViewportLeChuan(DrawingSnapshot snapshot, ViewportCheckPolicy chinhSach)
    {
        if (!chinhSach.Enabled || snapshot.Layouts is not { } layouts) return null;

        var chiTiet = new List<string>();
        var handles = new List<string>();
        foreach (var layout in layouts)
        {
            foreach (var vp in layout.Viewports)
            {
                var loi = new List<string>();
                if (chinhSach.RequireLocked && !vp.IsLocked) loi.Add("chưa khóa");
                if (chinhSach.Scales.Count > 0 && vp.ScaleDenominator is { } mau &&
                    !chinhSach.Scales.Any(s => Math.Abs(s - mau) <= 1e-6))
                {
                    loi.Add($"tỉ lệ 1:{Toa(mau)} ngoài danh mục ({string.Join(", ", chinhSach.Scales.Select(s => "1:" + Toa(s)))})");
                }
                if (loi.Count == 0) continue;
                chiTiet.Add($"{layout.Name} / viewport {vp.Handle}: {string.Join("; ", loi)}");
                ThemHandle(handles, vp.Handle);
            }
        }

        if (chiTiet.Count == 0) return null;
        return new InspectionFinding
        {
            Id = "viewport-le-chuan",
            Ten = "Viewport chưa khóa hoặc tỉ lệ ngoài danh mục",
            Handles = handles,
            ChiTiet = chiTiet,
        };
    }

    // ===== (14) Text/Dim style lệch chuẩn =====

    /// <summary>
    /// Text/Dimension dùng style ngoài bộ chuẩn khai ở <c>styleMap</c> — báo TÊN style kèm SỐ đối
    /// tượng đang dùng (bản vẽ thật hàng nghìn chữ, liệt kê từng dòng là vô dụng) nhưng vẫn trả đủ
    /// handle để highlight. Chưa khai tên chuẩn → tự tắt.
    /// </summary>
    public static InspectionFinding? StyleLechChuan(
        DrawingSnapshot snapshot, ToggleCheckPolicy chinhSach, StyleMapSection styleMap)
    {
        if (!chinhSach.Enabled) return null;

        var chuanText = BoChuan(styleMap.TextStyle.Name, styleMap.TextStyle.AcceptAlso);
        var chuanDim = BoChuan(styleMap.DimStyle.Name, styleMap.DimStyle.AcceptAlso);
        if (chuanText is null && chuanDim is null) return null;

        var demText = new SortedDictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var demDim = new SortedDictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var handles = new List<string>();

        foreach (var e in snapshot.Entities)
        {
            if (chuanText is not null && e.TextStyleName is { Length: > 0 } ts && !chuanText.Contains(ts))
            {
                demText[ts] = demText.TryGetValue(ts, out var n) ? n + 1 : 1;
                ThemHandle(handles, e.Handle);
            }
            if (chuanDim is not null && e.DimStyleName is { Length: > 0 } ds && !chuanDim.Contains(ds))
            {
                demDim[ds] = demDim.TryGetValue(ds, out var n) ? n + 1 : 1;
                ThemHandle(handles, e.Handle);
            }
        }

        var chiTiet = demText.Select(kv => $"textstyle \"{kv.Key}\": {kv.Value} đối tượng")
            .Concat(demDim.Select(kv => $"dimstyle \"{kv.Key}\": {kv.Value} đối tượng"))
            .ToList();
        if (chiTiet.Count == 0) return null;

        return new InspectionFinding
        {
            Id = "style-lech-chuan",
            Ten = "Text/Dimension dùng style ngoài bộ chuẩn (styleMap)",
            Handles = handles,
            ChiTiet = chiTiet,
        };
    }

    /// <summary>Bộ style chấp nhận được; null = chưa khai tên chuẩn → không kiểm nhánh đó.</summary>
    private static HashSet<string>? BoChuan(string ten, IReadOnlyList<string> chapNhanThem)
    {
        if (string.IsNullOrWhiteSpace(ten)) return null;
        var bo = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ten };
        foreach (var t in chapNhanThem)
        {
            if (!string.IsNullOrWhiteSpace(t)) bo.Add(t);
        }
        return bo;
    }

    // ===== (15) Nhãn size lệch XData =====

    /// <summary>
    /// Nhãn do XBOSS_VE_NHAN sinh mà nội dung không còn chứa size trong XData của tim liên kết.
    /// Bản vẽ không có dữ liệu M100 (<see cref="DrawingSnapshot.NhanLienKet"/> null) → TỰ TẮT:
    /// nhãn vẽ tay tuyệt đối không bị báo oan (M101 §6.1 phép kiểm 15).
    /// </summary>
    public static InspectionFinding? NhanLechXData(DrawingSnapshot snapshot, ToggleCheckPolicy chinhSach)
    {
        if (!chinhSach.Enabled || snapshot.NhanLienKet is not { } nhanDs) return null;

        var chiTiet = new List<string>();
        var handles = new List<string>();
        foreach (var nhan in nhanDs)
        {
            var size = ChuanHoaSize(nhan.SizeTheoXData);
            if (size.Length == 0) continue; // tim mất XData size → không đoán, không báo
            // Khớp theo RANH GIỚI TOKEN (cùng bộ matcher với layerMap/takeoff): "DN100" KHÔNG được
            // coi là mang size "DN10", còn "Ống gió 300x200" thì vẫn khớp size "300x200".
            if (TokenMatcher.HasToken(ChuanHoaSize(nhan.NoiDung), size)) continue;
            chiTiet.Add($"nhãn {nhan.Handle} ghi \"{nhan.NoiDung}\" nhưng tim {nhan.TimHandle} có size \"{nhan.SizeTheoXData}\"");
            ThemHandle(handles, nhan.Handle);
        }

        if (chiTiet.Count == 0) return null;
        return new InspectionFinding
        {
            Id = "nhan-lech-xdata",
            Ten = "Nhãn size lệch dữ liệu tuyến (XData XBOSS_VE)",
            Handles = handles,
            ChiTiet = chiTiet,
        };
    }

    /// <summary>Bỏ khoảng trắng + đưa về chữ hoa để so "300 x 200" với "300X200" ra như nhau.</summary>
    private static string ChuanHoaSize(string s) =>
        new(s.Where(c => !char.IsWhiteSpace(c)).Select(char.ToUpperInvariant).ToArray());

    // ===== (16) Đối tượng ngoài khung =====

    /// <summary>
    /// Rác "vẽ nháp để quên" làm ZOOM EXTENTS vỡ. "Bao chính" = hình bao của NỬA số thực thể gần
    /// tâm trung vị nhất — cố ý không dùng extents thô của bản vẽ, vì extents thô do CHÍNH đối tượng
    /// rác định nghĩa nên không bao giờ bắt được nó. Thực thể có tâm cách bao chính quá
    /// <c>strayDistanceFactor</c> × đường chéo bao chính → báo.
    /// </summary>
    public static InspectionFinding? DoiTuongNgoaiKhung(
        DrawingSnapshot snapshot, StrayCheckPolicy chinhSach, double toMm)
    {
        if (!chinhSach.Enabled) return null;

        var ds = snapshot.Entities
            .Where(e => e.BoundsMin is not null && e.BoundsMax is not null)
            .Select(e => (
                e.Handle,
                Min: e.BoundsMin!.Value,
                Max: e.BoundsMax!.Value,
                Tam: ((e.BoundsMin!.Value.X + e.BoundsMax!.Value.X) / 2, (e.BoundsMin!.Value.Y + e.BoundsMax!.Value.Y) / 2)))
            .ToList();
        if (ds.Count < Math.Max(chinhSach.MinEntitiesForExtents, 4)) return null;

        var tamX = TrungVi(ds.Select(d => d.Tam.Item1));
        var tamY = TrungVi(ds.Select(d => d.Tam.Item2));
        var loi = ds
            .OrderBy(d => Segment2D.ChieuDai(d.Tam, (tamX, tamY)))
            .Take((ds.Count + 1) / 2)
            .ToList();

        var baoMin = (X: loi.Min(d => d.Min.X), Y: loi.Min(d => d.Min.Y));
        var baoMax = (X: loi.Max(d => d.Max.X), Y: loi.Max(d => d.Max.Y));
        var duongCheo = Segment2D.ChieuDai(baoMin, baoMax);
        if (duongCheo <= 0) return null; // bao chính suy biến → không kết luận gì

        var nguong = chinhSach.StrayDistanceFactor * duongCheo;
        var chiTiet = new List<string>();
        var handles = new List<string>();
        foreach (var d in ds)
        {
            var cach = Segment2D.KhoangCachDiemToiHinhChuNhat(d.Tam, baoMin, baoMax);
            if (cach <= nguong) continue;
            chiTiet.Add($"{d.Handle}: cách bao chính ~{Mm(cach, toMm)}mm (ngưỡng {Mm(nguong, toMm)}mm)");
            ThemHandle(handles, d.Handle);
        }

        if (chiTiet.Count == 0) return null;
        return new InspectionFinding
        {
            Id = "doi-tuong-ngoai-khung",
            Ten = $"Đối tượng ngoài khung (cách bao chính > {chinhSach.StrayDistanceFactor}× đường chéo — làm ZOOM EXTENTS vỡ)",
            Handles = handles,
            ChiTiet = chiTiet,
        };
    }

    private static double TrungVi(IEnumerable<double> giaTri)
    {
        var ds = giaTri.OrderBy(v => v).ToList();
        if (ds.Count == 0) return 0;
        return ds.Count % 2 == 1 ? ds[ds.Count / 2] : (ds[ds.Count / 2 - 1] + ds[ds.Count / 2]) / 2;
    }
}
