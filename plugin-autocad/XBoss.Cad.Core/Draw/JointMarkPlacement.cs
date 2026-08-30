namespace XBoss.Cad.Core.Draw;

/// <summary>
/// Một đoạn tim đã sẵn sàng đưa vào engine chia đốt: mô hình thuần <see cref="DoanTim"/> cho Core,
/// kèm chỉ số đoạn GỐC trên polyline và khoảng cách dọc tuyến (đơn vị bản vẽ) tới đầu đoạn.
///
/// Vì sao phải giữ 2 số kèm theo: engine (<see cref="JointSegmenter.ChiaTuyen"/>) đánh
/// <c>SegmentIndex</c> theo vị trí trong danh sách ĐÃ LỌC (đoạn suy biến bị bỏ — engine từ chối
/// chiều dài 0), còn Adapter lại cần chỉ số đoạn gốc và mốc dọc tuyến để đặt vạch chia đúng chỗ.
/// </summary>
/// <param name="Doan">Đầu vào cho engine (chiều dài mm + cờ cung tròn).</param>
/// <param name="ChiSoDoanTim">Chỉ số đoạn trên polyline gốc (kể cả đoạn suy biến).</param>
/// <param name="OffsetDoc">Khoảng cách dọc tuyến (ĐƠN VỊ BẢN VẼ) từ đầu tuyến tới đầu đoạn.</param>
public sealed record DoanChiaDot(DoanTim Doan, int ChiSoDoanTim, double OffsetDoc);

/// <summary>Một vạch chia cần vẽ = một mối nối giữa đốt <paramref name="ChiSoDotTruoc"/> và đốt kế.</summary>
/// <param name="KhoangCachDoc">Khoảng cách dọc tuyến (đơn vị bản vẽ) tính từ đầu tuyến.</param>
public sealed record ViTriVachChia(
    int ChiSoDoan, int ChiSoDotTruoc, double KhoangCachDoc, Diem2 Diem, double GocTiepTuyen)
{
    /// <summary>Hướng vạch chia: VUÔNG GÓC tim tại điểm đó.</summary>
    public double GocVuongGoc => BulgeMath.ChuanHoaGoc(GocTiepTuyen + Math.PI / 2);

    /// <summary>Hai đầu vạch, đối xứng qua tim, tổng chiều dài <paramref name="chieuDai"/> (đơn vị bản vẽ).</summary>
    public (Diem2 Dau, Diem2 Cuoi) HaiDau(double chieuDai)
    {
        var nua = BulgeMath.PhapTuyenTrai(GocTiepTuyen) * (chieuDai / 2);
        return (Diem - nua, Diem + nua);
    }
}

/// <summary>Một tag đốt cần ghi, đặt cạnh TRUNG ĐIỂM đốt (M105 FR5).</summary>
public sealed record ViTriNhanDot(
    int ChiSoDot, string NoiDung, double KhoangCachDoc, Diem2 Diem, double GocTiepTuyen)
{
    /// <summary>Góc chữ — quay theo tuyến nhưng luôn lật về nửa mặt phẳng phải để đọc xuôi.</summary>
    public double GocChu
    {
        get
        {
            var g = BulgeMath.ChuanHoaGoc(GocTiepTuyen);
            if (g > Math.PI / 2) return g - Math.PI;
            if (g <= -Math.PI / 2) return g + Math.PI;
            return g;
        }
    }

    /// <summary>Điểm đặt chữ: dịch khỏi tim theo pháp tuyến trái để không đè lên tuyến/vạch chia.</summary>
    public Diem2 ViTriChu(double khoangLech) => Diem + BulgeMath.PhapTuyenTrai(GocTiepTuyen) * khoangLech;
}

/// <summary>Toàn bộ thứ cần vẽ cho MỘT tuyến sau khi chia đốt.</summary>
public sealed record BoTriChiaDot(IReadOnlyList<ViTriVachChia> Vach, IReadOnlyList<ViTriNhanDot> Nhan);

/// <summary>
/// Đặt vạch chia + tag đốt lên hình học tuyến (M105 FR5) — THUẦN, không tham chiếu AutoCAD
/// (M99 FR17), test trên CI Linux. <c>XBOSS_VE_CHIADOT</c> chỉ đọc polyline, gọi lớp này rồi vẽ.
///
/// Hai luật hình học nằm ở đây (và chỉ ở đây):
/// <list type="number">
/// <item>Mỗi đỉnh polyline là RANH GIỚI đốt bắt buộc (FR4) ⇒ mỗi cặp đỉnh liền nhau là một
/// <see cref="DoanTim"/> chia độc lập; đoạn có bulge mang cờ để engine sinh cảnh báo
/// <c>doan_cong_khong_chia_duoc</c>.</item>
/// <item>Vị trí vạch chia là chiều dài đốt CỘNG DỒN, cộng thêm cả KHE mối nối đã tiêu tốn giữa các
/// đốt trước đó — quên khe là toàn bộ vạch phía sau trôi dần về đầu tuyến (đúng lớp lỗi mà M105
/// §1 mô tả: "quên khe gioăng TDC → tuyến dài hơn thực tế").</item>
/// </list>
/// </summary>
public static class JointMarkPlacement
{
    /// <summary>Chiều dài tối thiểu của tick vạch chia trên tuyến KHÔNG có nét biên (mm — FR5).</summary>
    public const double ChieuDaiTickToiThieuMm = 100;

    /// <summary>
    /// Cắt polyline tim thành các đoạn cho engine chia đốt. Đoạn suy biến (2 đỉnh trùng nhau) bị
    /// LOẠI — engine từ chối chiều dài 0 — nhưng vẫn cộng vào mốc dọc tuyến để vạch không lệch.
    /// </summary>
    /// <param name="toMm">1 đơn vị bản vẽ = bao nhiêu mm (<c>DrawingUnits.TuInsUnits</c>).</param>
    public static List<DoanChiaDot> DoanTuTim(IReadOnlyList<DinhPolyline> tim, bool kin, double toMm)
    {
        var ra = new List<DoanChiaDot>();
        if (tim.Count < 2) return ra;

        var soDoan = kin ? tim.Count : tim.Count - 1;
        var offset = 0.0;
        for (var i = 0; i < soDoan; i++)
        {
            var dau = tim[i];
            var cuoi = tim[(i + 1) % tim.Count];
            var dai = BulgeMath.ChieuDaiDoan(dau.Diem, cuoi.Diem, dau.Bulge);
            if (dai > SupportSpacing.NguongTrung)
            {
                ra.Add(new DoanChiaDot(
                    new DoanTim { LengthMm = dai * toMm, HasBulge = !BulgeMath.LaThang(dau.Bulge) },
                    i,
                    offset));
            }
            offset += dai;
        }
        return ra;
    }

    /// <summary>
    /// Chiều dài vạch chia (mm) theo nhóm hệ (FR5): tuyến có nét biên (<c>edgeStyle: "double"</c> —
    /// ống gió, máng cáp) lấy đúng bề rộng W để vạch chạm 2 nét biên; tuyến không biên (ống nước)
    /// dùng tick đối xứng qua tim dài 2× bán kính danh nghĩa (= DN), tối thiểu
    /// <see cref="ChieuDaiTickToiThieuMm"/> để DN nhỏ vẫn nhìn thấy được khi in.
    /// </summary>
    public static double ChieuDaiVachMm(string? edgeStyle, CoTuyen co)
    {
        if (string.Equals(edgeStyle, "double", StringComparison.Ordinal) && co.W is > 0) return co.W.Value;
        var dn = co.DN ?? co.W ?? 0;
        return Math.Max(2 * (dn / 2), ChieuDaiTickToiThieuMm);
    }

    /// <summary>
    /// Vị trí vạch chia + tag đốt của một tuyến đã chia.
    /// <paramref name="doan"/> phải là CHÍNH danh sách đã dùng để dựng <see cref="YeuCauChiaDot"/>
    /// (cùng thứ tự) — <c>DotChia.SegmentIndex</c> đánh theo danh sách đó.
    /// Vị trí nào rơi ra ngoài tuyến (dữ liệu hỏng) bị bỏ qua thay vì vẽ bừa.
    /// </summary>
    public static BoTriChiaDot BoTri(
        KetQuaChiaDot ketQua,
        IReadOnlyList<DoanChiaDot> doan,
        IReadOnlyList<DinhPolyline> tim,
        bool kin,
        double toMm)
    {
        var vach = new List<ViTriVachChia>();
        var nhan = new List<ViTriNhanDot>();
        if (toMm <= 0) return new BoTriChiaDot(vach, nhan);

        foreach (var nhom in ketQua.Pieces.GroupBy(p => p.SegmentIndex).OrderBy(g => g.Key))
        {
            if (nhom.Key < 0 || nhom.Key >= doan.Count) continue;
            var goc = doan[nhom.Key];
            var dsDot = nhom.OrderBy(p => p.PieceIndex).ToList();

            var cong = 0.0; // mm tính từ ĐẦU ĐOẠN, đã gồm cả khe mối nối đã đi qua
            for (var i = 0; i < dsDot.Count; i++)
            {
                var dot = dsDot[i];

                if (SupportSpacing.TaiKhoangCach(tim, goc.OffsetDoc + (cong + dot.LengthMm / 2) / toMm, kin)
                    is { } giua)
                {
                    nhan.Add(new ViTriNhanDot(
                        dot.PieceIndex, dot.Tag, goc.OffsetDoc + (cong + dot.LengthMm / 2) / toMm,
                        giua.Diem, giua.Goc));
                }

                cong += dot.LengthMm;
                if (i >= dsDot.Count - 1) break;

                // Vạch chia đặt tại CUỐI đốt vừa xong (mép trước của khe mối nối) — một vạch cho
                // một mối, không vẽ 2 vạch sát nhau cho 2 mép khe (khe 0–5 mm, in ra chỉ thành
                // vệt đen).
                if (SupportSpacing.TaiKhoangCach(tim, goc.OffsetDoc + cong / toMm, kin) is { } tren)
                {
                    vach.Add(new ViTriVachChia(
                        nhom.Key, dot.PieceIndex, goc.OffsetDoc + cong / toMm, tren.Diem, tren.Goc));
                }
                cong += ketQua.JointGapMm;
            }
        }

        return new BoTriChiaDot(vach, nhan);
    }
}
