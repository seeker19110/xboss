namespace XBoss.Cad.Core.Draw;

/// <summary>Vì sao một vị trí giá đỡ được chọn (in ra dòng lệnh để kỹ sư hiểu ngay).</summary>
public enum VaiTroViTriGiaDo
{
    /// <summary>Đầu/cuối tuyến — M100 §6.7 "điểm đầu/cuối … luôn có giá đỡ".</summary>
    DauCuoi,
    /// <summary>Vị trí chia đều theo khoảng cách chuẩn <c>supportSpacingMm</c>.</summary>
    ChiaDeu,
    /// <summary>Tại phụ kiện nặng (van, thiết bị) đã chèn trên tuyến — §6.7.</summary>
    PhuKien,
}

/// <summary>
/// Cách quy đổi chiều dài tuyến ra số khoảng khi chiều dài KHÔNG chia hết cho khoảng cách chuẩn.
/// Hai cách đều "chia đều" — khác nhau ở chỗ chấp nhận bước thật lệch chuẩn hay không.
/// </summary>
public enum CheDoChiaGiaDo
{
    /// <summary>
    /// Số khoảng = làm tròn GẦN NHẤT (mặc định — AC12: tuyến 10m, chuẩn 2400 → 4 khoảng 2500,
    /// tức 5 giá đỡ). Bước thật có thể vượt chuẩn vài phần trăm ⇒ luôn kèm cảnh báo khi vượt.
    /// </summary>
    GanNhat,

    /// <summary>
    /// Số khoảng = làm tròn LÊN ⇒ bước thật KHÔNG BAO GIỜ vượt khoảng cách chuẩn
    /// (tuyến 10m, chuẩn 2400 → 5 khoảng 2000, tức 6 giá đỡ). Chọn khi tiêu chuẩn treo đỡ
    /// của dự án là ngưỡng cứng.
    /// </summary>
    KhongVuot,
}

/// <summary>Một vị trí giá đỡ đã tính xong (toạ độ + hướng đặt block).</summary>
/// <param name="KhoangCachDoc">Khoảng cách dọc theo tuyến tính từ điểm đầu (đơn vị bản vẽ).</param>
/// <param name="Diem">Toạ độ trên tim tuyến.</param>
/// <param name="GocTiepTuyen">Hướng tuyến tại điểm đó (radian).</param>
public sealed record ViTriGiaDo(
    double KhoangCachDoc, Diem2 Diem, double GocTiepTuyen, VaiTroViTriGiaDo VaiTro)
{
    /// <summary>Góc đặt block giá đỡ: VUÔNG GÓC tuyến (M100 §6.7 "tự xoay vuông góc tuyến").</summary>
    public double GocVuongGoc => BulgeMath.ChuanHoaGoc(GocTiepTuyen + Math.PI / 2);
}

/// <summary>
/// Kết quả rải giá đỡ trên một tuyến: cần đặt thêm những vị trí nào, vị trí nào đã có giá đỡ
/// (chạy lại → chỉ bổ sung đoạn thiếu, không đặt trùng — §6.7).
/// </summary>
public sealed record KetQuaGiaDo(
    IReadOnlyList<ViTriGiaDo> CanDat,
    IReadOnlyList<ViTriGiaDo> DaCo,
    double ChieuDai,
    double BuocThat,
    IReadOnlyList<string> CanhBao)
{
    /// <summary>Tổng số vị trí giá đỡ của tuyến sau khi chạy lệnh (đã có + đặt thêm).</summary>
    public int TongViTri => CanDat.Count + DaCo.Count;
}

/// <summary>
/// Rải giá đỡ/treo đỡ dọc tuyến tim (M100 §6.7, FR9c, AC12) — THUẦN, không tham chiếu AutoCAD
/// (FR11), test trên CI Linux.
///
/// Luật (theo §6.7): điểm đầu và điểm cuối LUÔN có giá đỡ; tại phụ kiện nặng đã chèn trên tuyến
/// luôn có giá đỡ; phần còn lại chia đều theo <c>supportSpacingMm</c> của loại tuyến (theo size).
/// Chạy lại trên tuyến đã có giá đỡ thì chỉ trả về các vị trí CÒN THIẾU — vị trí nào đã có giá đỡ
/// trong bán kính <c>dungSai</c> thì bỏ qua (chống đặt chồng).
///
/// <b>Ghi chú về AC12</b> (tuyến 10m, chuẩn 2400 → "5 giá đỡ"): 5 giá đỡ ở 2 đầu nghĩa là 4 khoảng
/// × 2500 — tức bước thật VƯỢT chuẩn 2400 khoảng 4%. Không có cách nào vừa ra đúng 5 vừa giữ mọi
/// bước ≤ 2400 (4 khoảng ≤ 2400 chỉ phủ được 9600 &lt; 10000). Lớp này chọn mặc định
/// <see cref="CheDoChiaGiaDo.GanNhat"/> để khớp AC12, và luôn CẢNH BÁO khi bước thật vượt chuẩn;
/// ai cần ngưỡng cứng thì chạy chế độ <see cref="CheDoChiaGiaDo.KhongVuot"/> (ra 6 giá đỡ × 2000).
/// </summary>
public static class SupportSpacing
{
    /// <summary>Dưới ngưỡng này (đơn vị bản vẽ) coi là trùng vị trí/đoạn suy biến.</summary>
    public const double NguongTrung = 1e-9;

    /// <summary>Tỉ lệ mặc định của bước thật dùng làm bán kính "đã có giá đỡ ở đây".</summary>
    public const double TyLeDungSaiMacDinh = 0.25;

    // ===== Hình học tuyến (dùng chung cho giá đỡ, lỗ chờ và các PR sau) =====

    /// <summary>Chiều dài tuyến (đơn vị bản vẽ), cộng cả đoạn thẳng lẫn cung.</summary>
    public static double ChieuDaiTuyen(IReadOnlyList<DinhPolyline> tim, bool kin = false)
    {
        var tong = 0.0;
        foreach (var (a, b) in Doan(tim, kin)) tong += BulgeMath.ChieuDaiDoan(a.Diem, b.Diem, a.Bulge);
        return tong;
    }

    /// <summary>
    /// Điểm + hướng tiếp tuyến tại khoảng cách <paramref name="doc"/> dọc tuyến (kẹp về đầu/cuối
    /// khi ra ngoài phạm vi). Null khi tuyến không đủ 2 đỉnh phân biệt.
    /// </summary>
    public static (Diem2 Diem, double Goc)? TaiKhoangCach(
        IReadOnlyList<DinhPolyline> tim, double doc, bool kin = false)
    {
        var danhSach = Doan(tim, kin).ToList();
        var cuoiCung = danhSach.FindLastIndex(d => BulgeMath.ChieuDaiDoan(d.Dau.Diem, d.Cuoi.Diem, d.Dau.Bulge) > NguongTrung);
        if (cuoiCung < 0) return null;

        var conLai = Math.Max(doc, 0);
        for (var i = 0; i <= cuoiCung; i++)
        {
            var (a, b) = danhSach[i];
            var dai = BulgeMath.ChieuDaiDoan(a.Diem, b.Diem, a.Bulge);
            if (dai <= NguongTrung) continue;
            // Đoạn có chiều dài CUỐI CÙNG nhận cả phần dư (doc vượt chiều dài tuyến ⇒ kẹp về điểm cuối).
            if (conLai <= dai || i == cuoiCung)
                return TrongDoan(a.Diem, b.Diem, a.Bulge, Math.Min(conLai, dai));
            conLai -= dai;
        }
        return null;
    }

    /// <summary>
    /// Khoảng cách dọc tuyến của điểm gần <paramref name="diem"/> nhất trên tim — dùng để quy đổi
    /// vị trí giá đỡ/phụ kiện đã có trong bản vẽ về cùng một trục toạ độ với các vị trí tính ra.
    /// Null khi tuyến không đủ 2 đỉnh phân biệt.
    /// </summary>
    public static double? KhoangCachDocCua(IReadOnlyList<DinhPolyline> tim, Diem2 diem, bool kin = false)
    {
        // Dùng CHÍNH bộ "hít điểm vào tuyến" của FittingPlacement (một luật chiếu điểm duy nhất
        // cho cả chèn phụ kiện lẫn giá đỡ) rồi cộng chiều dài các đoạn phía trước.
        if (FittingPlacement.TrenTuyen(tim, diem, kin) is not { } vt) return null;

        var danhSach = Doan(tim, kin).ToList();
        if (vt.ChiSoDoan >= danhSach.Count) return null;

        var tong = 0.0;
        for (var i = 0; i < vt.ChiSoDoan; i++)
        {
            var (a, b) = danhSach[i];
            tong += BulgeMath.ChieuDaiDoan(a.Diem, b.Diem, a.Bulge);
        }
        var (dau, cuoi) = danhSach[vt.ChiSoDoan];
        return tong + DocTrongDoan(dau.Diem, cuoi.Diem, dau.Bulge, vt.Diem);
    }

    // ===== Rải giá đỡ =====

    /// <summary>
    /// Vị trí giá đỡ trên một tuyến.
    /// <paramref name="khoangCach"/> tính theo ĐƠN VỊ BẢN VẼ (caller quy đổi mm → đơn vị bản vẽ).
    /// <paramref name="daCoDoc"/>/<paramref name="phuKienDoc"/> là khoảng cách dọc tuyến của các
    /// giá đỡ đã có / phụ kiện nặng trên tuyến (xem <see cref="KhoangCachDocCua"/>).
    /// </summary>
    public static KetQuaGiaDo Tinh(
        IReadOnlyList<DinhPolyline> tim,
        double khoangCach,
        bool kin = false,
        IReadOnlyList<double>? daCoDoc = null,
        IReadOnlyList<double>? phuKienDoc = null,
        CheDoChiaGiaDo cheDo = CheDoChiaGiaDo.GanNhat,
        double? dungSai = null)
    {
        var canhBao = new List<string>();
        if (khoangCach <= 0)
        {
            return new KetQuaGiaDo([], [], 0, 0,
                ["Khoảng cách giá đỡ phải lớn hơn 0 — rule pack chưa khai supportSpacingMm cho loại tuyến/size này."]);
        }

        var chieuDai = ChieuDaiTuyen(tim, kin);
        if (chieuDai <= NguongTrung)
        {
            return new KetQuaGiaDo([], [], chieuDai, 0,
                ["Tuyến quá ngắn (không có chiều dài) — không rải được giá đỡ."]);
        }

        var soKhoang = SoKhoang(chieuDai, khoangCach, cheDo);
        var buocThat = chieuDai / soKhoang;
        if (buocThat > khoangCach * (1 + 1e-9))
        {
            canhBao.Add(
                $"Bước thật {buocThat:0.#} vượt khoảng cách chuẩn {khoangCach:0.#} " +
                $"({(buocThat / khoangCach - 1) * 100:0.#}%) vì chia đều cả tuyến {chieuDai:0.#}. " +
                "Chạy lại chọn KHONGVUOT nếu tiêu chuẩn treo đỡ là ngưỡng cứng.");
        }

        var banKinhTrung = dungSai ?? buocThat * TyLeDungSaiMacDinh;
        var chon = new List<(double Doc, VaiTroViTriGiaDo VaiTro)>();

        void ThemNeuChuaCo(double doc, VaiTroViTriGiaDo vaiTro)
        {
            var d = Math.Clamp(doc, 0, chieuDai);
            // Tuyến kín: đầu và cuối là CÙNG một điểm.
            if (kin && chieuDai - d <= banKinhTrung) d = 0;
            if (chon.Any(c => Math.Abs(c.Doc - d) <= banKinhTrung)) return;
            chon.Add((d, vaiTro));
        }

        // (1) Đầu/cuối luôn có (tuyến kín chỉ có một điểm nối).
        ThemNeuChuaCo(0, VaiTroViTriGiaDo.DauCuoi);
        if (!kin) ThemNeuChuaCo(chieuDai, VaiTroViTriGiaDo.DauCuoi);

        // (2) Phụ kiện nặng — ưu tiên hơn lưới chia đều (giá đỡ phải đỡ đúng chỗ tải nặng).
        foreach (var doc in phuKienDoc ?? []) ThemNeuChuaCo(doc, VaiTroViTriGiaDo.PhuKien);

        // (3) Lưới chia đều; vị trí nào đã bị (1)/(2) chiếm trong bán kính dung sai thì bỏ.
        for (var i = 1; i < soKhoang; i++) ThemNeuChuaCo(i * buocThat, VaiTroViTriGiaDo.ChiaDeu);

        var canDat = new List<ViTriGiaDo>();
        var daCo = new List<ViTriGiaDo>();
        foreach (var (doc, vaiTro) in chon.OrderBy(c => c.Doc))
        {
            if (TaiKhoangCach(tim, doc, kin) is not { } tren) continue;
            var vt = new ViTriGiaDo(doc, tren.Diem, tren.Goc, vaiTro);
            var trung = (daCoDoc ?? []).Any(d => Math.Abs(d - doc) <= banKinhTrung);
            (trung ? daCo : canDat).Add(vt);
        }

        return new KetQuaGiaDo(canDat, daCo, chieuDai, buocThat, canhBao);
    }

    /// <summary>Số khoảng chia của tuyến (luôn ≥ 1 — tuyến ngắn hơn một bước vẫn có 2 đầu).</summary>
    public static int SoKhoang(double chieuDai, double khoangCach, CheDoChiaGiaDo cheDo)
    {
        if (chieuDai <= 0 || khoangCach <= 0) return 1;
        var ty = chieuDai / khoangCach;
        var so = cheDo == CheDoChiaGiaDo.KhongVuot
            ? (int)Math.Ceiling(ty - 1e-9)
            : (int)Math.Round(ty, MidpointRounding.AwayFromZero);
        return Math.Max(1, so);
    }

    // ===== Nội bộ =====

    /// <summary>
    /// Các đoạn của tuyến theo ĐÚNG chỉ số đoạn thô (không lọc đoạn suy biến) — phải khớp 1-1 với
    /// <c>ViTriChen.ChiSoDoan</c> của <see cref="FittingPlacement"/>, nếu không thì quy đổi vị trí
    /// giá đỡ/phụ kiện đã có sẽ lệch sang đoạn khác.
    /// </summary>
    private static List<(DinhPolyline Dau, DinhPolyline Cuoi)> Doan(
        IReadOnlyList<DinhPolyline> tim, bool kin)
    {
        var ra = new List<(DinhPolyline, DinhPolyline)>();
        if (tim.Count < 2) return ra;
        var soDoan = kin ? tim.Count : tim.Count - 1;
        for (var i = 0; i < soDoan; i++) ra.Add((tim[i], tim[(i + 1) % tim.Count]));
        return ra;
    }

    /// <summary>Điểm + tiếp tuyến tại khoảng cách <paramref name="doc"/> tính từ đầu MỘT đoạn.</summary>
    private static (Diem2 Diem, double Goc) TrongDoan(Diem2 dau, Diem2 cuoi, double bulge, double doc)
    {
        if (BulgeMath.LaThang(bulge) || BulgeMath.Cung(dau, cuoi, bulge) is not { } cung)
        {
            var v = cuoi - dau;
            var dai = v.DoDai;
            var t = dai <= NguongTrung ? 0 : doc / dai;
            return (dau + v * t, BulgeMath.GocDayCung(dau, cuoi));
        }

        var gocDau = Math.Atan2(dau.Y - cung.Tam.Y, dau.X - cung.Tam.X);
        var quet = doc / cung.BanKinh * (cung.NguocKim ? 1 : -1);
        var g = gocDau + quet;
        var diem = new Diem2(
            cung.Tam.X + cung.BanKinh * Math.Cos(g),
            cung.Tam.Y + cung.BanKinh * Math.Sin(g));
        var tiep = g + (cung.NguocKim ? Math.PI / 2 : -Math.PI / 2);
        return (diem, BulgeMath.ChuanHoaGoc(tiep));
    }

    /// <summary>Khoảng cách từ đầu đoạn tới một điểm NẰM TRÊN đoạn đó.</summary>
    private static double DocTrongDoan(Diem2 dau, Diem2 cuoi, double bulge, Diem2 tren)
    {
        if (BulgeMath.LaThang(bulge) || BulgeMath.Cung(dau, cuoi, bulge) is not { } cung)
            return dau.KhoangCach(tren);

        var gocDau = Math.Atan2(dau.Y - cung.Tam.Y, dau.X - cung.Tam.X);
        var gocTren = Math.Atan2(tren.Y - cung.Tam.Y, tren.X - cung.Tam.X);
        var lech = cung.NguocKim ? gocTren - gocDau : gocDau - gocTren;
        lech %= 2 * Math.PI;
        if (lech < 0) lech += 2 * Math.PI;
        return cung.BanKinh * lech;
    }
}
