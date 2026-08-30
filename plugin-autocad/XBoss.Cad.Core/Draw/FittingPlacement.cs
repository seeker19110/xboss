using XBoss.Cad.Core.Matching;

namespace XBoss.Cad.Core.Draw;

/// <summary>
/// Vị trí chèn một block trên tuyến tim: điểm đã "hít" vào tim, góc xoay theo tiếp tuyến, đoạn
/// chứa điểm và khoảng cách từ điểm bấm tới tim (để lệnh vẽ cảnh báo khi bấm hụt tuyến).
/// </summary>
/// <param name="Diem">Điểm trên tim gần <c>diemBam</c> nhất (đơn vị bản vẽ).</param>
/// <param name="Goc">Góc tiếp tuyến tại điểm đó (radian, ngược chiều kim từ trục +X).</param>
/// <param name="ChiSoDoan">Đoạn chứa điểm (0-based); tại đỉnh nối là đoạn ĐI VÀO đỉnh.</param>
/// <param name="TaiDinh">Điểm rơi đúng một đỉnh nối hai đoạn (tiếp tuyến gãy — xem <see cref="FittingPlacement"/>).</param>
/// <param name="KhoangCach">Khoảng cách từ điểm bấm tới tim.</param>
public sealed record ViTriChen(Diem2 Diem, double Goc, int ChiSoDoan, bool TaiDinh, double KhoangCach);

/// <summary>Layer đặt block + cảnh báo kèm theo (rỗng = khớp đúng quy tắc bóc tách).</summary>
public sealed record LayerChen(string Layer, string? CanhBao);

/// <summary>
/// Hình học chèn phụ kiện/thiết bị (M100 §6.1 bước 4–5, FR5/FR6) — THUẦN, không tham chiếu
/// AutoCAD (FR11), test trên CI Linux.
///
/// Ba việc tính được, tách khỏi Adapter:
/// <list type="number">
/// <item>"Hít" điểm bấm vào tuyến tim và lấy <b>góc tiếp tuyến</b> tại đó (đoạn thẳng lẫn cung
/// bulge) — AC5 đòi sai số ≤0.1°.</item>
/// <item><b>Tỉ lệ chèn</b> theo size của tuyến khi manifest khai <c>scaleBySize</c>.</item>
/// <item><b>Layer</b> đặt block thiết bị sao cho <c>XBOSS_BOCKL</c> vẫn đếm được (AC4).</item>
/// </list>
///
/// Quy ước tại ĐỈNH NỐI (tiếp tuyến gãy — vd co 90°): lấy hướng ĐI VÀO đỉnh (tiếp tuyến cuối đoạn
/// trước). Chọn hướng vào vì phụ kiện chỗ ngoặt (co, tê) trong thư viện được vẽ theo chiều dòng
/// chảy đi tới; quy ước này áp dụng khi điểm hít rơi ĐÚNG đỉnh (kỹ sư bấm bằng OSNAP
/// endpoint/intersection — cách chèn phụ kiện chỗ ngoặt trong thực tế). Bấm tự do quá đỉnh thì
/// điểm rơi vào đoạn sau và góc là tiếp tuyến đoạn đó — đúng với thứ mắt nhìn thấy.
/// </summary>
public static class FittingPlacement
{
    /// <summary>Dưới ngưỡng này (đơn vị bản vẽ) coi là trùng điểm/trùng đỉnh.</summary>
    public const double NguongTrungDiem = 1e-6;

    /// <summary>
    /// Kích thước danh nghĩa (đơn vị bản vẽ) mà block phụ kiện trong thư viện được vẽ theo:
    /// block vẽ vừa đúng 1 đơn vị bề rộng, chèn với tỉ lệ = bề rộng thật ⇒ ra đúng kích thước.
    /// Quy ước một chỗ duy nhất, dùng chung cho mọi block <c>scaleBySize</c>.
    /// </summary>
    public const double KichThuocDanhNghia = 1.0;

    /// <summary>
    /// Điểm chèn + góc tiếp tuyến trên tuyến tim (danh sách đỉnh + bulge như LWPOLYLINE).
    /// Null khi tuyến có ít hơn 2 đỉnh phân biệt.
    /// </summary>
    public static ViTriChen? TrenTuyen(IReadOnlyList<DinhPolyline> tim, Diem2 diemBam, bool kin = false)
    {
        if (tim.Count < 2) return null;
        var soDoan = kin ? tim.Count : tim.Count - 1;

        ViTriChen? totNhat = null;
        for (var i = 0; i < soDoan; i++)
        {
            var a = tim[i];
            var b = tim[(i + 1) % tim.Count];
            if (a.Diem.KhoangCach(b.Diem) <= NguongTrungDiem) continue; // đỉnh trùng — không có đoạn

            var (diem, goc) = GanNhatTrenDoan(a.Diem, b.Diem, a.Bulge, diemBam);
            var kc = diem.KhoangCach(diemBam);
            // So sánh CHẶT: điểm rơi đúng đỉnh chung thì đoạn ĐI VÀO (đoạn trước) thắng, đúng quy
            // ước "tại đỉnh lấy hướng vào".
            if (totNhat is not null && kc >= totNhat.KhoangCach) continue;
            totNhat = new ViTriChen(diem, goc, i, TaiDinh: false, KhoangCach: kc);
        }
        if (totNhat is null) return null;

        // Điểm rơi đúng đỉnh nối hai đoạn ⇒ tiếp tuyến gãy: lấy hướng ĐI VÀO đỉnh.
        var chiSo = totNhat.ChiSoDoan;
        var dau = tim[chiSo];
        var cuoi = tim[(chiSo + 1) % tim.Count];
        // (a) Rơi vào đỉnh CUỐI của đoạn và còn đoạn sau ⇒ đỉnh nối: hướng vào = tiếp tuyến cuối đoạn này.
        if (totNhat.Diem.KhoangCach(cuoi.Diem) <= NguongTrungDiem && (kin || chiSo + 1 < soDoan))
        {
            return totNhat with
            {
                Goc = BulgeMath.HuongCuoiDoan(dau.Diem, cuoi.Diem, dau.Bulge),
                TaiDinh = true,
            };
        }
        // (b) Rơi vào đỉnh ĐẦU của đoạn (đoạn trước suy biến nên không thắng ở vòng trên).
        if (totNhat.Diem.KhoangCach(dau.Diem) <= NguongTrungDiem && (chiSo > 0 || kin))
        {
            var truoc = DoanTruocConHinhHoc(tim, chiSo, soDoan, kin);
            if (truoc is { } t)
            {
                return totNhat with
                {
                    Goc = BulgeMath.HuongCuoiDoan(tim[t].Diem, tim[(t + 1) % tim.Count].Diem, tim[t].Bulge),
                    TaiDinh = true,
                };
            }
        }
        return totNhat;
    }

    /// <summary>Chỉ số đoạn liền trước <paramref name="chiSo"/> còn hình học; null khi không có.</summary>
    private static int? DoanTruocConHinhHoc(
        IReadOnlyList<DinhPolyline> tim, int chiSo, int soDoan, bool kin)
    {
        for (var b = 1; b < soDoan; b++)
        {
            var i = chiSo - b;
            if (i < 0)
            {
                if (!kin) return null;
                i += soDoan;
            }
            if (tim[i].Diem.KhoangCach(tim[(i + 1) % tim.Count].Diem) > NguongTrungDiem) return i;
        }
        return null;
    }

    /// <summary>
    /// Điểm gần <paramref name="diemBam"/> nhất trên MỘT đoạn (thẳng hoặc cung) + tiếp tuyến tại đó.
    /// Ngoài phạm vi đoạn thì kẹp về đầu mút gần hơn (đúng cách AutoCAD "hít" vào đường).
    /// </summary>
    private static (Diem2 Diem, double Goc) GanNhatTrenDoan(Diem2 dau, Diem2 cuoi, double bulge, Diem2 diemBam)
    {
        if (BulgeMath.LaThang(bulge) || BulgeMath.Cung(dau, cuoi, bulge) is not { } cung)
        {
            var v = cuoi - dau;
            var binhPhuong = v.X * v.X + v.Y * v.Y;
            var t = binhPhuong <= 0 ? 0 : ((diemBam - dau).X * v.X + (diemBam - dau).Y * v.Y) / binhPhuong;
            t = Math.Clamp(t, 0, 1);
            return (dau + v * t, BulgeMath.GocDayCung(dau, cuoi));
        }

        var toTam = diemBam - cung.Tam;
        if (toTam.DoDai <= NguongTrungDiem) return KepVeDauMut(dau, cuoi, bulge, diemBam);

        var gocDiem = Math.Atan2(toTam.Y, toTam.X);
        var gocDau = Math.Atan2(dau.Y - cung.Tam.Y, dau.X - cung.Tam.X);
        var gocMo = BulgeMath.GocMo(bulge);
        var lech = BulgeMath.ChuanHoaGoc(gocDiem - gocDau);
        // Đưa độ lệch về cùng chiều quay của cung rồi so với góc mở.
        if (gocMo > 0)
        {
            if (lech < 0) lech += 2 * Math.PI;
            if (lech > gocMo) return KepVeDauMut(dau, cuoi, bulge, diemBam);
        }
        else
        {
            if (lech > 0) lech -= 2 * Math.PI;
            if (lech < gocMo) return KepVeDauMut(dau, cuoi, bulge, diemBam);
        }

        var tren = new Diem2(
            cung.Tam.X + cung.BanKinh * Math.Cos(gocDiem),
            cung.Tam.Y + cung.BanKinh * Math.Sin(gocDiem));
        // Tiếp tuyến của đường tròn = bán kính quay ±90° theo chiều đi của cung.
        var goc = gocDiem + (cung.NguocKim ? Math.PI / 2 : -Math.PI / 2);
        return (tren, BulgeMath.ChuanHoaGoc(goc));
    }

    private static (Diem2 Diem, double Goc) KepVeDauMut(Diem2 dau, Diem2 cuoi, double bulge, Diem2 diemBam) =>
        diemBam.KhoangCach(dau) <= diemBam.KhoangCach(cuoi)
            ? (dau, BulgeMath.HuongDauDoan(dau, cuoi, bulge))
            : (cuoi, BulgeMath.HuongCuoiDoan(dau, cuoi, bulge));

    /// <summary>
    /// Tỉ lệ chèn block theo size của tuyến (manifest <c>scaleBySize</c>): tỉ lệ ĐỀU theo kích
    /// thước nhìn thấy trên mặt bằng — bề rộng W của <c>300x200</c>, đường kính của <c>DN50</c>
    /// (chiều cao H của ống gió không thấy trên mặt bằng nên không kéo méo block).
    /// <paramref name="toMm"/> = hệ số quy đổi đơn vị bản vẽ → mm (như <c>DrawingUnits.TuInsUnits</c>).
    /// Null khi không đọc được size (lệnh vẽ chèn tỉ lệ 1 kèm cảnh báo, không bịa kích thước).
    /// </summary>
    public static double? TyLeTheoSize(string? size, double toMm = 1.0)
    {
        if (toMm <= 0) return null;
        if (DrawSize.PhanTich(size) is not { } kt) return null;
        var rongDonVi = kt.RongMm / toMm;
        return rongDonVi > 0 ? rongDonVi / KichThuocDanhNghia : null;
    }

    /// <summary>
    /// Layer đặt block THIẾT BỊ của một hệ (thiết bị không nằm trên tuyến nên không mượn được
    /// layer của tim — AC4 vẫn đòi <c>XBOSS_BOCKL</c> đếm được):
    /// <list type="bullet">
    /// <item>item takeoff có <c>layerMatchAny</c> → chọn layer tuyến ĐẦU TIÊN của hệ khớp bảng đó;</item>
    /// <item>không khớp cái nào → vẫn trả layer tuyến đầu tiên nhưng kèm cảnh báo (chèn được,
    /// nhưng bóc sẽ hụt — kỹ sư phải biết ngay);</item>
    /// <item><c>layerMatchAny</c> rỗng (đếm mọi layer) → layer tuyến đầu tiên của hệ.</item>
    /// </list>
    /// Null khi hệ chưa khai tuyến nào (rule pack đã chặn từ validator, đây là chốt chặn cuối).
    /// </summary>
    public static LayerChen? LayerChoThietBi(DrawSystem he, IReadOnlyList<string>? layerMatchAny)
    {
        if (he.Lines.Count == 0) return null;
        var macDinh = he.Lines[0].Layer;
        if (layerMatchAny is not { Count: > 0 }) return new LayerChen(macDinh, null);

        var khop = he.Lines.FirstOrDefault(l => TokenMatcher.MatchesAny(l.Layer, layerMatchAny));
        if (khop is not null) return new LayerChen(khop.Layer, null);
        return new LayerChen(
            macDinh,
            $"Không layer tuyến nào của hệ \"{he.Id}\" khớp layerMatchAny ({string.Join(", ", layerMatchAny)}) — " +
            $"chèn tạm lên \"{macDinh}\", XBOSS_BOCKL sẽ KHÔNG đếm thiết bị này (sửa rule pack ở version sau).");
    }
}
