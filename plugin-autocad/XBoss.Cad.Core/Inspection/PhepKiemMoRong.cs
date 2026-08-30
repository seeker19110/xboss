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

    // Thuật toán dò giao điểm nằm ở Segment2D.GiaoDiemGiuaHaiChuoi — dùng chung với
    // XBOSS_VE_NGATNET (M109 FR2), phép kiểm 11 chỉ lấy phần toạ độ.
    private static IEnumerable<(double X, double Y)> GiaoDiemGiuaHaiTim(CenterlineInfo a, CenterlineInfo b) =>
        Segment2D.GiaoDiemGiuaHaiChuoi(a.Vertices, b.Vertices).Select(g => (g.X, g.Y));

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

    // ===== (17) Tag trùng — M102 §6.4 =====

    /// <summary>
    /// Hai nhãn tag do XBOSS_VE_TAG sinh mang CÙNG chuỗi tag trong CÙNG hệ (layer tim liên kết):
    /// bảng thống kê và biên bản nghiệm thu sẽ đếm lệch, mà mắt thường rất khó soi ra.
    ///
    /// <para>So trùng trong phạm vi TỪNG HỆ, không phải cả bản vẽ: hai hệ khác nhau đánh số riêng
    /// từ 1 là quy ước bình thường (T-01 của gió và T-01 của nước không phải lỗi).</para>
    ///
    /// <para>Bản vẽ không có tag XData nào (<see cref="DrawingSnapshot.Tags"/> null) → TỰ TẮT: nhãn
    /// vẽ tay không bị báo oan (cùng hai tầng bảo vệ với phép kiểm 15).</para>
    /// </summary>
    public static InspectionFinding? TagTrung(DrawingSnapshot snapshot, ToggleCheckPolicy chinhSach)
    {
        if (!chinhSach.Enabled || snapshot.Tags is not { } tags) return null;

        var chiTiet = new List<string>();
        var handles = new List<string>();
        foreach (var nhomHe in tags
                     .Where(t => !string.IsNullOrWhiteSpace(t.Tag))
                     .GroupBy(t => t.HeLayer, StringComparer.OrdinalIgnoreCase)
                     .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase))
        {
            foreach (var nhomTag in nhomHe
                         .GroupBy(t => t.Tag.Trim(), StringComparer.OrdinalIgnoreCase)
                         .Where(g => g.Count() > 1)
                         .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase))
            {
                var ds = nhomTag.ToList();
                chiTiet.Add(
                    $"{nhomHe.Key}: tag \"{nhomTag.Key}\" dùng {ds.Count} lần ({string.Join(", ", ds.Select(t => t.Handle))})");
                foreach (var t in ds) ThemHandle(handles, t.Handle);
            }
        }

        if (chiTiet.Count == 0) return null;
        return new InspectionFinding
        {
            Id = "tag-trung",
            Ten = "Tag trùng số trong cùng hệ (XBOSS_VE_TAG)",
            Handles = handles,
            ChiTiet = chiTiet,
        };
    }

    // ===== (18) Mã BOQ mồ côi — M102 §6.5 =====

    /// <summary>
    /// Hạng mục bóc tách CÓ đối tượng khớp trên bản vẽ nhưng <c>boqCode</c> rỗng → Excel bóc tách ra
    /// cột A trống, QS phải gõ tay từng dòng. Bắt ở đây là chặn sớm, trước khi tệp tới tay QS.
    ///
    /// <para>Báo ở cấp HẠNG MỤC (không marker từng đối tượng): lỗi nằm ở rule pack theo dự án chứ
    /// không ở entity nào — nên <see cref="InspectionFinding.Handles"/> để rỗng.</para>
    ///
    /// <para>TỰ TẮT khi rule pack không khai <c>boqCode</c> ở BẤT KỲ hạng mục nào — đó là bản toàn
    /// cục (chưa gán mã theo dự án, M101 PR4), báo tất cả sẽ chỉ là nhiễu.</para>
    /// </summary>
    /// <param name="items">Hạng mục của rule pack (bản đã gán mã theo dự án nếu có).</param>
    /// <param name="idCoDoiTuong">Id hạng mục thực sự khớp đối tượng trên bản vẽ (Adapter/bộ bóc cung cấp).</param>
    public static InspectionFinding? MaBoqMoCoi(
        IReadOnlyList<RulePack.TakeoffItem> items,
        IReadOnlyCollection<string> idCoDoiTuong,
        ToggleCheckPolicy chinhSach)
    {
        if (!chinhSach.Enabled || items.Count == 0 || idCoDoiTuong.Count == 0) return null;
        if (!items.Any(i => !string.IsNullOrWhiteSpace(i.BoqCode))) return null; // rule pack toàn cục → tự tắt

        var coDoiTuong = new HashSet<string>(idCoDoiTuong, StringComparer.Ordinal);
        var chiTiet = items
            .Where(i => coDoiTuong.Contains(i.Id) && string.IsNullOrWhiteSpace(i.BoqCode))
            .Select(i => $"hạng mục \"{i.Id}\" ({i.Name}) có đối tượng trên bản vẽ nhưng chưa gán mã BOQ")
            .ToList();

        if (chiTiet.Count == 0) return null;
        return new InspectionFinding
        {
            Id = "ma-boq-mo-coi",
            Ten = "Hạng mục bóc tách chưa gán mã BOQ (cột A Excel sẽ trống)",
            Handles = [],
            ChiTiet = chiTiet,
        };
    }

    // ===== (19) Handle mồ côi trong bản chép tầng — M111 AC3 =====

    /// <summary>
    /// Đối tượng do <c>XBOSS_VE_NHANTANG</c> sinh ra (mang XData <c>TangNguon</c>/<c>NhanTang</c> —
    /// M111 FR9) mà handle tham chiếu trong chính XData của nó (tim/biên/nhãn/tuyến cắt/cặp đôi/…)
    /// trỏ tới đối tượng KHÔNG tồn tại trong tập bản chép, hoặc trỏ SANG MỘT TẦNG CHÉP KHÁC — dấu
    /// hiệu <c>FloorReplicator.AnhXaXData</c> (PR1) hoặc <c>DeepCloneObjects</c> (PR2) đã bỏ sót
    /// ánh xạ. Đây chính là bất biến guardrail 2 của M111 §2 ("không sinh handle mồ côi").
    ///
    /// <para>Không có cờ <c>enabled</c> riêng trong rule pack — TỰ TẮT khi bản vẽ không có đối
    /// tượng nhân bản tầng nào (<see cref="DrawingSnapshot.NhanTang"/> null/rỗng), cùng khuôn hai
    /// tầng bảo vệ với phép kiểm 15/17: bản vẽ chưa từng chạy <c>XBOSS_VE_NHANTANG</c> không bao
    /// giờ bị báo oan.</para>
    /// </summary>
    public static InspectionFinding? HandleMoCoiNhanTang(DrawingSnapshot snapshot)
    {
        if (snapshot.NhanTang is not { Count: > 0 } ds) return null;

        // Tầng chép của MỌI đối tượng bản chép, tra theo handle — dùng để phân giải từng tham
        // chiếu. Một handle xuất hiện ở đúng 1 tầng chép (bảng ánh xạ IdMapping của DeepCloneObjects
        // không thể sinh 2 đối tượng cùng handle).
        var tangTheoHandle = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var d in ds) tangTheoHandle[d.Handle] = d.NhanTang;

        var chiTiet = new List<string>();
        var handles = new List<string>();
        foreach (var d in ds)
        {
            foreach (var hThamChieu in d.HandleThamChieu)
            {
                if (string.IsNullOrWhiteSpace(hThamChieu)) continue;

                if (!tangTheoHandle.TryGetValue(hThamChieu, out var tangCuaHandleKia))
                {
                    chiTiet.Add(
                        $"tầng {d.NhanTang}: {d.Handle} tham chiếu {hThamChieu} — không tìm thấy trong bất kỳ bản chép nào (mồ côi)");
                    ThemHandle(handles, d.Handle);
                    continue;
                }

                if (!string.Equals(tangCuaHandleKia, d.NhanTang, StringComparison.OrdinalIgnoreCase))
                {
                    chiTiet.Add(
                        $"tầng {d.NhanTang}: {d.Handle} tham chiếu {hThamChieu} nhưng đối tượng đó thuộc tầng {tangCuaHandleKia} (trỏ sai tầng)");
                    ThemHandle(handles, d.Handle);
                }
            }
        }

        if (chiTiet.Count == 0) return null;
        return new InspectionFinding
        {
            Id = "nhantang-handle-mo-coi",
            Ten = "Handle mồ côi trong bản chép tầng (XBOSS_VE_NHANTANG — M111 AC3)",
            Handles = handles,
            ChiTiet = chiTiet,
        };
    }

    // ===== (20) Cloud/tam giác revision mồ côi — M110 FR8 =====

    /// <summary>
    /// Cloud revision không còn tam giác đi kèm (hoặc ngược lại): xóa một bên bằng lệnh
    /// <c>ERASE</c> thường thì bên kia thành MỒ CÔI — bản vẽ nộp còn tam giác "R2" chỉ vào hư
    /// không, hoặc cloud không nói được nó thuộc lần sửa nào.
    ///
    /// <para>Khác các phép kiểm mở rộng khác, phép này KHÔNG có cờ <c>enabled</c> riêng trong rule
    /// pack: nó chỉ đọc XData <c>XBOSS_VE</c> vai trò <c>Revision</c> — thứ chỉ tồn tại khi
    /// <c>XBOSS_VE_REV</c> đã chạy (mà lệnh đó lại đòi <c>drawTools.revisionPolicy.enabled</c>).
    /// Bản vẽ không có đối tượng revision nào (<see cref="DrawingSnapshot.Revision"/> null/rỗng) →
    /// TỰ TẮT, nên cloud vẽ tay bằng <c>REVCLOUD</c> của AutoCAD không bao giờ bị báo oan.</para>
    /// </summary>
    public static InspectionFinding? RevisionMoCoi(DrawingSnapshot snapshot)
    {
        if (snapshot.Revision is not { Count: > 0 } ds) return null;

        var conSong = new HashSet<string>(ds.Select(r => r.Handle), StringComparer.OrdinalIgnoreCase);
        var chiTiet = new List<string>();
        var handles = new List<string>();
        foreach (var r in ds)
        {
            var coCapDoi = r.HandleCapDoi is { Length: > 0 } cap && conSong.Contains(cap);
            if (coCapDoi) continue;
            var ten = r.LaCloud ? "Cloud revision" : "Tam giác revision";
            var thieu = r.LaCloud ? "tam giác mang số revision" : "cloud";
            var so = r.SoRevision is { } n
                ? $"R{n.ToString(CultureInfo.InvariantCulture)}"
                : "(không rõ số revision)";
            chiTiet.Add($"{ten} {so} (handle {r.Handle}) không còn {thieu} đi kèm");
            ThemHandle(handles, r.Handle);
        }

        if (chiTiet.Count == 0) return null;
        return new InspectionFinding
        {
            Id = "revision-mo-coi",
            Ten = "Cloud/tam giác revision mồ côi (XBOSS_VE_REV — cặp cloud ↔ tam giác đã đứt)",
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
