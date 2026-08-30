using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M118 FR2 (AC2/AC3/AC4) — chạy lại <c>XBOSS_HOANTHIEN</c> KHÔNG được đè lên công sửa tay của kỹ
/// sư ở 4 giai đoạn ủy thác (③ chia đốt, ④ giá đỡ, ⑥ ngắt nét, ⑧ bảng thống kê), trong khi lệnh lẻ
/// <c>XBOSS_VE_*</c> chạy tay giữ NGUYÊN hành vi cũ.
///
/// <para><b>Vì sao test nằm ở đây chứ không phải một bản vẽ thật:</b> <c>XBoss.Cad.Acad</c> là
/// net10.0-windows + acmgd/acdbmgd nên không chạy được trên CI Linux (xem
/// <c>HoanThienPipelineTests</c>). Vì vậy toàn bộ QUYẾT ĐỊNH giữ/xóa/đếm/đóng-băm được rút về Core
/// (<see cref="HoanThienKeHoach.LocDonCu{T}"/>, <see cref="HoanThienKeHoach.DemSuaTay{T}"/>,
/// <see cref="HoanThienKeHoach.DaSuaTay"/>, <see cref="HoanThienKeHoach.BamKhiPipeline"/>) và test
/// ở đây kiểm đúng các hàm đó; phần Adapter chỉ còn việc đọc điểm đại diện của thực thể ra khỏi
/// bản vẽ, được canh thêm bằng các test đọc mã nguồn ở cuối tệp (cùng khuôn
/// <c>NgatNetGuardrailTests</c>). Thao tác chuột thật vẫn là mục verify tay C12.</para>
/// </summary>
public sealed class GiuTayHoanThienTests
{
    private static string Bam(double x, double y) => RevisionSnapshot.BamHinhHoc([new Diem2(x, y)]);

    /// <summary>Thực thể do pipeline sinh, kỹ sư CHƯA đụng vào (băm hiện tại khớp băm lúc sinh).</summary>
    private static UngVienDonCu<string> ConNguyen(string ten, double x, double y) =>
        new(ten, HoanThienKeHoach.NguonM115, Bam(x, y), Bam(x, y), SuaTayXData: false);

    /// <summary>Thực thể do pipeline sinh nhưng kỹ sư đã KÉO ĐI chỗ khác (băm lệch).</summary>
    private static UngVienDonCu<string> DaDoiTay(string ten, double x, double y, double dx) =>
        new(ten, HoanThienKeHoach.NguonM115, Bam(x, y), Bam(x + dx, y), SuaTayXData: false);

    // ===== Hàm thuần DaSuaTay (chuyển về Core ở M118 FR2) =====

    [Fact]
    public void DaSuaTay_bam_khop_thi_khong_phai_sua_tay()
    {
        Assert.False(HoanThienKeHoach.DaSuaTay(Bam(10, 20), Bam(10, 20), coSuaTayXData: false));
    }

    [Fact]
    public void DaSuaTay_bam_lech_la_ky_su_da_doi_tay()
    {
        Assert.True(HoanThienKeHoach.DaSuaTay(Bam(10, 20), Bam(10.5, 20), coSuaTayXData: false));
    }

    [Fact]
    public void DaSuaTay_khong_co_bam_thi_quyen_quyet_dinh_thuoc_chinh_lenh_do()
    {
        // Thực thể sinh trước M118 hoặc do lệnh lẻ sinh: không mang băm ⇒ đi đường dọn cũ.
        Assert.False(HoanThienKeHoach.DaSuaTay(null, Bam(10, 20), coSuaTayXData: false));
        Assert.False(HoanThienKeHoach.DaSuaTay("", Bam(10, 20), coSuaTayXData: false));
    }

    [Fact]
    public void DaSuaTay_co_san_co_suatay_tren_XData_thi_giu_du_bam_khop()
    {
        Assert.True(HoanThienKeHoach.DaSuaTay(Bam(10, 20), Bam(10, 20), coSuaTayXData: true));
        Assert.True(HoanThienKeHoach.DaSuaTay(null, Bam(10, 20), coSuaTayXData: true));
    }

    // ===== AC2 — ca chính: dời tay ở CẢ 4 giai đoạn rồi chạy lại pipeline =====

    [Fact]
    public void Ac2_chay_lai_pipeline_giu_nguyen_du_4_thuc_the_da_doi_tay_va_tai_sinh_phan_con_lai()
    {
        // ③ chia đốt và ⑥ ngắt nét có ĐƯỜNG DỌN (xóa rồi sinh lại) — mỗi giai đoạn có 1 thực thể
        // kỹ sư đã dời + 2 thực thể còn nguyên.
        var chiaDot = new[]
        {
            DaDoiTay("vach-da-doi", 100, 0, dx: 25),
            ConNguyen("vach-2", 200, 0),
            ConNguyen("nhan-1", 150, 5),
        };
        var ngatNet = new[]
        {
            DaDoiTay("vungche-da-doi", 300, 40, dx: 12),
            ConNguyen("vungche-2", 400, 40),
        };

        var kqChiaDot = HoanThienKeHoach.LocDonCu(chiaDot, giuTayM115: true);
        var kqNgatNet = HoanThienKeHoach.LocDonCu(ngatNet, giuTayM115: true);

        Assert.Equal(["vach-da-doi"], kqChiaDot.GiuViSuaTay);
        Assert.Equal(["vach-2", "nhan-1"], kqChiaDot.CanXoa);
        Assert.Equal(["vungche-da-doi"], kqNgatNet.GiuViSuaTay);
        Assert.Equal(["vungche-2"], kqNgatNet.CanXoa);

        // ④ giá đỡ và ⑧ bảng thống kê KHÔNG có đường dọn (giá đỡ chỉ bổ sung chỗ thiếu, bảng cập
        // nhật tại chỗ) — chúng chỉ ĐẾM để tóm tắt nói đúng số thực thể được giữ.
        var giaDo = HoanThienKeHoach.DemSuaTay(
            [DaDoiTay("giado-da-doi", 500, 0, dx: 30), ConNguyen("giado-2", 600, 0)],
            giuTayM115: true);
        var bang = HoanThienKeHoach.DemSuaTay(
            [DaDoiTay("bang-khoiluong", 1000, 900, dx: 400)], giuTayM115: true);

        Assert.Equal(1, giaDo);
        Assert.Equal(1, bang);

        // Tóm tắt lần chạy: đúng 4 thực thể được giữ nguyên trên cả 4 giai đoạn.
        var tongGiu = kqChiaDot.GiuViSuaTay.Count + giaDo + kqNgatNet.GiuViSuaTay.Count + bang;
        Assert.Equal(4, tongGiu);
    }

    [Fact]
    public void Thuc_the_ngoai_pipeline_khong_duoc_bao_ve_du_bam_lech()
    {
        // Kỹ sư tự vẽ / lệnh lẻ sinh (không mang nguon=M115): đường dọn cũ vẫn quyết như trước —
        // đúng ranh giới "quyền quyết định thuộc chính lệnh đó".
        var la = new UngVienDonCu<string>("cua-lenh-le", null, Bam(10, 10), Bam(99, 10), false);
        var kq = HoanThienKeHoach.LocDonCu([la], giuTayM115: true);

        Assert.Empty(kq.GiuViSuaTay);
        Assert.Equal(["cua-lenh-le"], kq.CanXoa);
        Assert.Equal(0, HoanThienKeHoach.DemSuaTay([la], giuTayM115: true));
    }

    // ===== AC3 — guardrail: chạy tay lệnh lẻ thì hành vi Y HỆT trước M118 =====

    [Fact]
    public void Ac3_lenh_le_chia_dot_van_xoa_sinh_lai_vach_ky_su_da_doi_tay()
    {
        // Vạch chia mang đủ dấu M115 lẫn băm lệch, nhưng lệnh chạy tay (giuTayM115 = false) ⇒ vẫn
        // bị dọn như trước M118: lệnh lẻ không có khái niệm giữ-tay.
        var vach = new[] { DaDoiTay("vach-da-doi", 100, 0, dx: 25), ConNguyen("vach-2", 200, 0) };

        var kq = HoanThienKeHoach.LocDonCu(vach, giuTayM115: false);

        Assert.Empty(kq.GiuViSuaTay);
        Assert.Equal(["vach-da-doi", "vach-2"], kq.CanXoa);
    }

    [Fact]
    public void Ac3_lenh_le_gia_do_khong_co_khai_niem_giu_tay_nen_khong_dem_gi()
    {
        // Giá đỡ chạy tay: SupportSpacing vẫn tính như cũ, không ngoại lệ nào theo băm — hàm đếm
        // trả 0 nên tóm tắt lệnh lẻ không mọc thêm dòng "Giữ nguyên N" nào.
        var giaDo = new[] { DaDoiTay("giado-da-doi", 500, 0, dx: 30), ConNguyen("giado-2", 600, 0) };

        Assert.Equal(0, HoanThienKeHoach.DemSuaTay(giaDo, giuTayM115: false));
        Assert.Equal(2, HoanThienKeHoach.LocDonCu(giaDo, giuTayM115: false).CanXoa.Count);
    }

    // ===== AC4 — băm chỉ đóng vào XData khi sinh QUA PIPELINE =====

    [Fact]
    public void Ac4_sinh_qua_pipeline_thi_co_bam_sinh_qua_lenh_le_thi_khong()
    {
        IReadOnlyList<Diem2> diem = [new Diem2(120, 45)];

        var quaPipeline = HoanThienKeHoach.BamKhiPipeline("chiaDot", diem);
        var quaLenhLe = HoanThienKeHoach.BamKhiPipeline(null, diem);

        Assert.False(string.IsNullOrEmpty(quaPipeline));
        Assert.Equal(RevisionSnapshot.BamHinhHoc(diem), quaPipeline);
        Assert.Null(quaLenhLe);
    }

    [Fact]
    public void Ac4_khong_lay_duoc_diem_dai_dien_thi_khong_bia_bam()
    {
        Assert.Null(HoanThienKeHoach.BamKhiPipeline("ngatNet", []));
    }

    [Fact]
    public void Ac4_ten_giai_doan_dong_vao_XData_phai_nam_trong_danh_muc_8_giai_doan()
    {
        // 4 giai đoạn ủy thác của FR2 — tên đóng vào GiaiDoanHoanThien là chính khóa của danh mục.
        foreach (var ten in new[] { "chiaDot", "giaDo", "ngatNet", "thongKe" })
        {
            Assert.NotNull(HoanThienKeHoach.Tim(ten));
            Assert.False(string.IsNullOrEmpty(HoanThienKeHoach.BamKhiPipeline(ten, [new Diem2(1, 2)])));
        }
    }

    // ===== Canh phần Adapter (đọc mã nguồn — không chạy được trên CI Linux) =====

    private static string MaAdapter(params string[] duongDan) =>
        File.ReadAllText(Path.Combine(
            new[] { Path.GetDirectoryName(RepoPaths.DoiChungDir)!, "XBoss.Cad.Acad" }
                .Concat(duongDan).ToArray()));

    [Fact]
    public void Ac4_ca_4_lenh_uy_thac_deu_dong_bam_qua_dung_mot_ham_cua_Core()
    {
        // Đóng băm bằng tay ở từng lệnh là mở đường cho "sinh qua lệnh lẻ vẫn có băm" (vỡ AC4) và
        // cho hai công thức điểm đại diện lệch nhau (băm luôn lệch ⇒ không bao giờ dọn được).
        foreach (var tep in new[] { "VeChiaDotCommands.cs", "VeGiadoCommands.cs", "VeNgatNetCommands.cs" })
        {
            var ma = MaAdapter("Commands", tep);
            Assert.True(
                ma.Contains("HoanThienKeHoach.BamKhiPipeline(", StringComparison.Ordinal) ||
                ma.Contains("VeThucThe.KemBam(", StringComparison.Ordinal),
                $"{tep} không đóng BamHinhHoc qua HoanThienKeHoach.BamKhiPipeline/VeThucThe.KemBam " +
                "— M118 FR2/AC4 đòi đúng một đường ghi băm.");
            Assert.DoesNotContain("BamHinhHoc = RevisionSnapshot.BamHinhHoc(", ma, StringComparison.Ordinal);
        }

        var maThongKe = MaAdapter("Commands", "VeThongkeCommands.cs");
        Assert.Contains("HoanThienKeHoach.BamKhiPipeline(", maThongKe, StringComparison.Ordinal);
    }

    [Fact]
    public void Ac3_lenh_gia_do_khong_bao_gio_xoa_thuc_the_nao()
    {
        // Bất biến §6.7 (và là lý do AC3 của ④ luôn đúng): XBOSS_VE_GIADO chỉ BỔ SUNG chỗ còn
        // thiếu, không có một đường xóa nào — kể cả khi chạy qua pipeline.
        var ma = MaAdapter("Commands", "VeGiadoCommands.cs");
        Assert.DoesNotContain("Erase()", ma, StringComparison.Ordinal);

        // Tập "đã có" vẫn là MỌI giá đỡ trên tuyến, không lọc theo băm/sửa tay — nếu lọc thì lệnh
        // sẽ chèn giá đỡ mới đè đúng chỗ kỹ sư vừa dời đi.
        Assert.Contains(
            "QuyVeDoc(dinh, kin, khoiCu, k => k.VaiTro == VaiTroVe.GiaDo)", ma, StringComparison.Ordinal);
    }

    [Fact]
    public void Ac3_duong_don_giu_tay_chi_bat_khi_chay_qua_pipeline()
    {
        // ③: đường dọn nhận cờ giuTayM115 tính THẲNG từ giaiDoanM115 — lệnh lẻ (null) đi đường cũ.
        Assert.Contains(
            "giuTayM115: giaiDoanM115 is not null",
            MaAdapter("Commands", "VeChiaDotCommands.cs"),
            StringComparison.Ordinal);

        // ⑥: lệnh lẻ và XBOSS_VE_NGATNET_XOA vẫn gọi VeThucThe.XoaNgatNet (xóa hết như cũ).
        var maNgatNet = MaAdapter("Commands", "VeNgatNetCommands.cs");
        Assert.Contains("VeThucThe.XoaNgatNet(db, tr, canDon)", maNgatNet, StringComparison.Ordinal);
        Assert.Contains("VeThucThe.XoaNgatNetGiuTay(db, tr, canDon)", maNgatNet, StringComparison.Ordinal);
        Assert.Contains("if (giaiDoanM115 is null)", maNgatNet, StringComparison.Ordinal);

        // Hai caller KHÁC của đường dọn chia đốt (đổi cỡ tuyến, đổi nhãn tuyến) không truyền cờ nào
        // — hành vi của chúng không đổi (M118 non-goal).
        foreach (var tep in new[] { "VeDoiCommands.cs", "VeNhanTuyenCommands.cs" })
        {
            var ma = MaAdapter("Commands", tep);
            Assert.Contains("VeThucThe.XoaChiaDotCua(", ma, StringComparison.Ordinal);
            Assert.DoesNotContain("XoaChiaDotGiuTay", ma, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void Ac2_bang_thong_ke_cap_nhat_tai_cho_khong_dat_lai_vi_tri()
    {
        // "Sửa tay" của một bảng = kéo bảng đi chỗ khác. Cập nhật nội dung tuyệt đối không được
        // đụng Table.Position, nếu không thì chạy lại là kéo bảng về góc cũ.
        var maBang = MaAdapter("Services", "VeBangService.cs");
        var doNoiDung = maBang[maBang.IndexOf("internal static void DoNoiDung(", StringComparison.Ordinal)..];
        Assert.DoesNotContain("Position", doNoiDung, StringComparison.Ordinal);

        // Vị trí mới CHỈ được hỏi khi chưa có bảng cũ (bangCu is null).
        var maThongKe = MaAdapter("Commands", "VeThongkeCommands.cs");
        Assert.Contains("if (bangCu is null)", maThongKe, StringComparison.Ordinal);
        Assert.Contains("VeBangService.DoNoiDung(cu,", maThongKe, StringComparison.Ordinal);
    }
}
