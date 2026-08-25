using System.Globalization;
using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Standardize;

/// <summary>
/// 4 bước chuẩn hóa mở rộng của rule pack v7 (M101 §6.2 — bước 8 style, 9 xref, 10 hatch,
/// 11 layout), chèn SAU bước 7 lineweight/CTB trong pipeline thứ tự cố định của M99 §6.6.
///
/// <para>Thuần, không đụng bản vẽ: nhận hiện trạng do Adapter đo + chính sách rule pack, trả
/// KẾ HOẠCH thay đổi. Adapter chỉ áp kế hoạch (và đếm số hạng mục thật sự áp được để ghi
/// <c>StepDiff</c>) — logic "đổi cái gì" nằm trọn ở đây nên test được trên CI Linux.</para>
///
/// <para>HAI TẦNG BẢO VỆ (giống <c>PhepKiemMoRong</c>): (1) cờ <c>enabled</c> trong rule pack,
/// mặc định false — v7 nạp vào cho kết quả y hệt v6; (2) thiếu dữ liệu/chưa chốt bộ chuẩn →
/// trả kế hoạch RỖNG, không đoán.</para>
/// </summary>
public static class ChuanHoaMoRong
{
    /// <summary>Nhãn bước trong báo cáo diff — Adapter dùng đúng các hằng này (một nguồn tên duy nhất).</summary>
    public const string Buoc8 = "8. Style";

    public const string Buoc9 = "9. Xref";
    public const string Buoc10 = "10. Hatch";
    public const string Buoc11 = "11. Layout";

    /// <summary>Tên tạm khi đổi tên layout 2 lượt (chống đụng tên layout chưa kịp đổi).</summary>
    public const string TienToTenTam = "~XBOSS~";

    // ===== (8) Style map =====

    /// <summary>
    /// Đưa text/dimension về bộ style chuẩn khai ở <c>styleMap</c> (khối dùng chung với phép kiểm 14).
    /// Chưa chốt tên chuẩn → trả kế hoạch rỗng. Style nằm trong <c>acceptAlso</c> được giữ nguyên.
    ///
    /// <para><b>Công tắc bật/tắt:</b> khối <c>styleMap</c> là DỮ LIỆU (không có cờ enabled) nên bước 8
    /// dùng chung công tắc với phép kiểm 14 — <c>inspectionPolicy.styleDeviation.enabled</c>, mặc định
    /// false ở v5/v6/v7. Cố ý một công tắc: công ty đã chốt bộ style chuẩn thì KIỂM ra lỗi gì,
    /// CHUẨN HÓA sửa đúng thứ đó — hai bên không thể trôi khỏi nhau, và không phải khai trùng styleMap.</para>
    ///
    /// <para><b>Không phá associativity (M99 O3):</b> kế hoạch chỉ nói "gán style X cho thực thể Y" —
    /// Adapter đặt lại <c>TextStyleId</c>/<c>DimensionStyle</c>, tuyệt đối không dựng lại dimension.</para>
    /// </summary>
    /// <param name="toMm">Hệ số quy đổi đơn vị bản vẽ → mm (rule pack khai chiều cao bằng mm).</param>
    public static KeHoachStyle LapKeHoachStyle(
        ToggleCheckPolicy chinhSach,
        StyleMapSection styleMap,
        IReadOnlyList<KieuChuHienCo> kieuChuHienCo,
        IReadOnlyList<KieuKichThuocHienCo> kieuKichThuocHienCo,
        IReadOnlyList<ThucTheDungStyle> thucThe,
        double toMm)
    {
        if (!chinhSach.Enabled) return new KeHoachStyle();
        var tenChuanChu = styleMap.TextStyle.Name.Trim();
        var tenChuanDim = styleMap.DimStyle.Name.Trim();
        if (tenChuanChu.Length == 0 && tenChuanDim.Length == 0) return new KeHoachStyle();
        if (toMm <= 0) toMm = 1;

        var canhBao = new List<string>();
        var doiStyle = new List<ThayDoiStyle>();

        // ----- Kiểu chữ chuẩn -----
        var chuanChuHienCo = kieuChuHienCo.FirstOrDefault(k => Bang(k.Ten, tenChuanChu));
        var chieuCaoDich = styleMap.TextStyle.FixedHeightMm / toMm;
        var taoChu = tenChuanChu.Length > 0 && chuanChuHienCo is null;
        var suaChu = false;
        if (chuanChuHienCo is not null)
        {
            var fontLech = styleMap.TextStyle.FontFile.Length > 0 &&
                           !Bang(chuanChuHienCo.Font, styleMap.TextStyle.FontFile) &&
                           !Bang(chuanChuHienCo.Font, BoDuoiFont(styleMap.TextStyle.FontFile));
            var caoLech = Math.Abs(chuanChuHienCo.ChieuCaoCoDinh - chieuCaoDich) > 1e-9;
            // widthFactor = 0 nghĩa là rule pack không chốt hệ số rộng → không đụng tới.
            var rongLech = styleMap.TextStyle.WidthFactor > 0 &&
                           Math.Abs(chuanChuHienCo.HeSoRong - styleMap.TextStyle.WidthFactor) > 1e-9;
            suaChu = fontLech || caoLech || rongLech;
        }

        // ----- Kiểu kích thước chuẩn -----
        var chuanDimHienCo = kieuKichThuocHienCo.FirstOrDefault(k => Bang(k.Ten, tenChuanDim));
        var taoDim = tenChuanDim.Length > 0 && chuanDimHienCo is null;
        if (chuanDimHienCo is not null && styleMap.DimStyle.TextStyleName.Length > 0 &&
            chuanDimHienCo.TenKieuChu.Length > 0 &&
            !Bang(chuanDimHienCo.TenKieuChu, styleMap.DimStyle.TextStyleName))
        {
            canhBao.Add(
                $"Kiểu kích thước chuẩn \"{chuanDimHienCo.Ten}\" trong bản vẽ đang dùng kiểu chữ " +
                $"\"{chuanDimHienCo.TenKieuChu}\" chứ không phải \"{styleMap.DimStyle.TextStyleName}\" như rule pack — " +
                "chuẩn hóa KHÔNG tự đổi (đổi kiểu chữ của dimstyle làm xê dịch chữ kích thước trên toàn bản vẽ). " +
                "Sửa tay bằng DIMSTYLE nếu đúng là sai chuẩn.");
        }

        // ----- Thực thể dùng style lạ -----
        var boChu = BoChapNhan(tenChuanChu, styleMap.TextStyle.AcceptAlso);
        var boDim = BoChapNhan(tenChuanDim, styleMap.DimStyle.AcceptAlso);
        foreach (var tt in thucThe)
        {
            if (tt.TenStyle.Length == 0) continue; // Adapter không đọc được tên style → bỏ qua, không đoán
            switch (tt.Loai)
            {
                case LoaiStyle.KieuChu when boChu is not null && !boChu.Contains(tt.TenStyle):
                    doiStyle.Add(new ThayDoiStyle(tt.Handle, LoaiStyle.KieuChu, tenChuanChu));
                    break;
                case LoaiStyle.KieuKichThuoc when boDim is not null && !boDim.Contains(tt.TenStyle):
                    doiStyle.Add(new ThayDoiStyle(tt.Handle, LoaiStyle.KieuKichThuoc, tenChuanDim));
                    break;
            }
        }

        return new KeHoachStyle
        {
            TaoKieuChuChuan = taoChu,
            SuaKieuChuChuan = suaChu,
            TaoKieuKichThuocChuan = taoDim,
            ChieuCaoChuanDonViBanVe = chieuCaoDich,
            DoiStyle = doiStyle,
            CanhBao = canhBao,
        };
    }

    /// <summary>Bộ style chấp nhận được; null = chưa khai tên chuẩn → không đụng nhánh đó.</summary>
    private static HashSet<string>? BoChapNhan(string ten, IReadOnlyList<string> chapNhanThem)
    {
        if (ten.Length == 0) return null;
        var bo = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ten };
        foreach (var t in chapNhanThem)
        {
            if (!string.IsNullOrWhiteSpace(t)) bo.Add(t.Trim());
        }
        return bo;
    }

    /// <summary>"arial.ttf" → "arial": bảng TEXTSTYLE có thể lưu font TrueType bằng TypeFace không đuôi.</summary>
    private static string BoDuoiFont(string tenTep)
    {
        var cham = tenTep.LastIndexOf('.');
        return cham > 0 ? tenTep[..cham] : tenTep;
    }

    // ===== (9) Xref =====

    /// <summary>
    /// Chính sách tham chiếu ngoài. Mặc định (và cả khi bật) chỉ làm 2 việc an toàn: BÁO xref đứt
    /// đường dẫn và tương đối hóa đường dẫn tuyệt đối. Bind CHỈ xảy ra với xref có tên khớp
    /// <c>bindMatchAny</c> — danh sách này rỗng ở bản phát hành nên mặc định KHÔNG bind gì (M101 §6.2).
    /// </summary>
    /// <param name="thuMucBanVe">Thư mục chứa DWG; rỗng (bản vẽ chưa lưu) → bỏ qua việc tương đối hóa.</param>
    public static KeHoachXref LapKeHoachXref(
        XrefPolicySection chinhSach, IReadOnlyList<XrefHienCo> xrefs, string thuMucBanVe)
    {
        if (!chinhSach.Enabled) return new KeHoachXref();

        var thayDoi = new List<ThayDoiXref>();
        var canhBao = new List<string>();

        foreach (var xref in xrefs)
        {
            if (xref.DutDuongDan)
            {
                canhBao.Add(
                    $"Xref \"{xref.Ten}\" ĐỨT đường dẫn (\"{xref.DuongDanLuu}\") — chuẩn hóa chỉ báo, " +
                    "KHÔNG tự dò tệp thay thế (gắn nhầm bản vẽ khác vào hồ sơ nguy hiểm hơn mất xref). " +
                    "Dùng lệnh XREF để gán lại đường dẫn.");
                continue; // đường dẫn đã hỏng thì đừng đụng vào cho hỏng thêm
            }

            var bind = TokenMatcher.MatchesAny(xref.Ten, chinhSach.BindMatchAny);
            string? duongDanMoi = null;
            if (chinhSach.TuongDoiHoa && thuMucBanVe.Length > 0 && LaDuongDanTuyetDoi(xref.DuongDanLuu))
            {
                duongDanMoi = DuongDanTuongDoi(thuMucBanVe, xref.DuongDanLuu);
                if (duongDanMoi is null)
                {
                    canhBao.Add(
                        $"Xref \"{xref.Ten}\" nằm khác ổ đĩa/máy chủ với bản vẽ (\"{xref.DuongDanLuu}\") — " +
                        "không tương đối hóa được. Chép xref về cùng cây thư mục dự án rồi gán lại.");
                }
                else if (string.Equals(duongDanMoi, xref.DuongDanLuu, StringComparison.OrdinalIgnoreCase))
                {
                    duongDanMoi = null; // đã đúng dạng rồi
                }
            }

            if (bind)
            {
                canhBao.Add(
                    $"Xref \"{xref.Ten}\" khớp bindMatchAny → sẽ BIND vào bản vẽ. Bind là một chiều: layer của " +
                    "xref nhập vào dưới tên \"<tên xref>$0$<layer>\" nên phải chạy XBOSS_CHUANHOA lần nữa để " +
                    "ánh xạ lại layer.");
            }

            if (duongDanMoi is not null || bind) thayDoi.Add(new ThayDoiXref(xref.Ten, duongDanMoi, bind));
        }

        return new KeHoachXref { ThayDoi = thayDoi, CanhBao = canhBao };
    }

    /// <summary>Đường dẫn tuyệt đối kiểu Windows: có ổ đĩa (<c>C:\…</c>) hoặc UNC (<c>\\máy\…</c>).</summary>
    public static bool LaDuongDanTuyetDoi(string duongDan)
    {
        if (duongDan.Length >= 2 && duongDan[0] is '\\' or '/' && duongDan[1] is '\\' or '/') return true;
        return duongDan.Length >= 3 && char.IsLetter(duongDan[0]) && duongDan[1] == ':' &&
               duongDan[2] is '\\' or '/';
    }

    /// <summary>
    /// Đường dẫn tương đối kiểu AutoCAD từ thư mục bản vẽ tới tệp xref (luôn dùng dấu <c>\</c> và
    /// mở đầu bằng <c>.\</c> hoặc <c>..\</c> — đúng dạng AutoCAD ghi vào trường Saved Path).
    /// Trả null khi hai bên khác gốc (khác ổ đĩa/máy chủ) — khi đó không có đường tương đối nào.
    /// Hàm THUẦN, không đụng hệ tệp, nên chạy và test được trên Linux dù dữ liệu là đường dẫn Windows.
    /// </summary>
    public static string? DuongDanTuongDoi(string thuMucBanVe, string duongDanXref)
    {
        var tu = TachDoan(thuMucBanVe);
        var den = TachDoan(duongDanXref);
        if (tu.Count == 0 || den.Count == 0) return null;
        if (!string.Equals(tu[0], den[0], StringComparison.OrdinalIgnoreCase)) return null; // khác gốc

        var chung = 0;
        while (chung < tu.Count && chung < den.Count &&
               string.Equals(tu[chung], den[chung], StringComparison.OrdinalIgnoreCase))
        {
            chung++;
        }

        var phan = new List<string>();
        for (var i = chung; i < tu.Count; i++) phan.Add("..");
        for (var i = chung; i < den.Count; i++) phan.Add(den[i]);
        if (phan.Count == 0) return null; // xref chính là thư mục bản vẽ — dữ liệu vô nghĩa
        var noi = string.Join("\\", phan);
        return phan[0] == ".." ? noi : ".\\" + noi;
    }

    private static List<string> TachDoan(string duongDan) =>
        duongDan.Split('\\', '/').Where(d => d.Length > 0 && d != ".").ToList();

    // ===== (10) Hatch =====

    /// <summary>
    /// Đưa mẫu hatch + tỉ lệ về chuẩn theo layer (<c>hatchMap.byLayer</c>, first-match, khớp layer
    /// theo RANH GIỚI TOKEN như layerMap/takeoff). Hatch solid/gradient giữ nguyên tuyệt đối.
    /// </summary>
    public static KeHoachHatch LapKeHoachHatch(HatchMapSection chinhSach, IReadOnlyList<HatchHienCo> hatches)
    {
        if (!chinhSach.Enabled || chinhSach.ByLayer.Count == 0) return new KeHoachHatch();

        var thayDoi = new List<ThayDoiHatch>();
        var soSolidGiuNguyen = 0;

        foreach (var h in hatches)
        {
            var quyDinh = chinhSach.ByLayer.FirstOrDefault(q => TokenMatcher.MatchesAny(h.Layer, q.LayerMatchAny));
            if (quyDinh is null) continue; // layer không có quy định — không bịa (cùng tinh thần bước 7)
            if (h.LaSolid)
            {
                soSolidGiuNguyen++;
                continue;
            }
            var mauLech = !Bang(h.TenMau, quyDinh.Pattern);
            var tiLeLech = Math.Abs(h.TiLe - quyDinh.Scale) > 1e-9;
            if (!mauLech && !tiLeLech) continue;
            thayDoi.Add(new ThayDoiHatch(h.Handle, quyDinh.Pattern, quyDinh.Scale));
        }

        var canhBao = new List<string>();
        if (soSolidGiuNguyen > 0)
        {
            canhBao.Add(
                $"Giữ nguyên {soSolidGiuNguyen} hatch tô đặc/gradient nằm trên layer có quy định mẫu — " +
                "đổi mẫu của hatch solid là phá ký hiệu tô đặc, không phải chuẩn hóa (M101 §6.2 bước 10).");
        }
        return new KeHoachHatch { ThayDoi = thayDoi, CanhBao = canhBao };
    }

    // ===== (11) Layout =====

    /// <summary>
    /// Dọn layout: xóa layout rỗng (không viewport thật, không đối tượng) và — chỉ khi
    /// <c>renameLayouts</c> bật — đặt lại tên theo <c>namePattern</c> với <c>{seq}</c> đánh 2 chữ số
    /// theo thứ tự Adapter đưa vào. LUÔN giữ lại ít nhất một layout (AutoCAD đòi vậy).
    /// </summary>
    public static KeHoachLayout LapKeHoachLayout(
        LayoutPolicySection chinhSach, IReadOnlyList<LayoutChuanHoa> layouts)
    {
        if (!chinhSach.Enabled || layouts.Count == 0) return new KeHoachLayout();

        var canhBao = new List<string>();
        var xoa = new List<string>();
        var giuLai = new List<LayoutChuanHoa>(layouts);

        if (chinhSach.RemoveEmpty)
        {
            var rong = layouts.Where(l => l.SoViewport == 0 && l.SoDoiTuong == 0).ToList();
            if (rong.Count == layouts.Count)
            {
                // Xóa hết thì AutoCAD tự dựng lại một layout trắng — giữ lại layout đầu cho tường minh.
                rong = rong.Skip(1).ToList();
                canhBao.Add(
                    "Mọi layout của bản vẽ đều rỗng — giữ lại layout đầu tiên vì AutoCAD luôn cần ít nhất một layout.");
            }
            xoa = rong.Select(l => l.Ten).ToList();
            giuLai = layouts.Where(l => !xoa.Contains(l.Ten, StringComparer.OrdinalIgnoreCase)).ToList();
        }

        var doiTen = new List<DoiTenLayout>();
        if (chinhSach.RenameLayouts && chinhSach.NamePattern.Contains("{seq}", StringComparison.Ordinal))
        {
            for (var i = 0; i < giuLai.Count; i++)
            {
                var tenMoi = chinhSach.NamePattern.Replace(
                    "{seq}", (i + 1).ToString("00", CultureInfo.InvariantCulture), StringComparison.Ordinal);
                if (Bang(giuLai[i].Ten, tenMoi)) continue;
                doiTen.Add(new DoiTenLayout(giuLai[i].Ten, tenMoi));
            }
            if (doiTen.Count > 0)
            {
                canhBao.Add(
                    $"Đổi tên {doiTen.Count} layout theo mẫu \"{chinhSach.NamePattern}\" — tên layout có thể đang được " +
                    "tham chiếu từ sheet set/hồ sơ đã nộp, kiểm lại trước khi phát hành bản vẽ.");
            }
        }

        return new KeHoachLayout { XoaLayout = xoa, DoiTen = doiTen, CanhBao = canhBao };
    }

    private static bool Bang(string a, string b) => string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
}
