using XBoss.Cad.Core.Ui;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M106 §6/FR10/AC7 — quy trình chuẩn 6 giai đoạn và việc xếp bước cho từng lệnh.
/// Đây là cổng chống "thêm lệnh mà quên xếp bước": <see cref="LenhInfo"/> bắt buộc khai
/// <c>Buoc</c>/<c>ThuTuTrongBuoc</c> (không biên dịch nổi nếu thiếu), còn các ca dưới đây canh
/// phần mà trình biên dịch không canh được — trùng thứ tự, bước rỗng, sai trình tự §6.
/// </summary>
public class QuyTrinhTests
{
    [Fact]
    public void Sau_giai_doan_dung_thu_tu_dac_ta()
    {
        Assert.Equal(
            [
                BuocQuyTrinh.KetNoi,
                BuocQuyTrinh.ChuanHoaNen,
                BuocQuyTrinh.VeShopDrawing,
                BuocQuyTrinh.ChiTietCheTao,
                BuocQuyTrinh.HoSoBanVe,
                BuocQuyTrinh.BocVaNop,
            ],
            QuyTrinh.CacGiaiDoan.Select(g => g.Buoc));

        // Số thứ tự hiện trên trình dẫn phải là 1..6 liên tục, đúng thứ tự khai.
        Assert.Equal([1, 2, 3, 4, 5, 6], QuyTrinh.CacGiaiDoan.Select(g => QuyTrinh.SoThuTu(g.Buoc)!.Value));
        Assert.Null(QuyTrinh.SoThuTu(BuocQuyTrinh.PhuTro));
    }

    [Fact]
    public void Moi_giai_doan_co_ten_dieu_kien_vao_va_dau_hieu_xong_tieng_Viet()
    {
        foreach (var g in QuyTrinh.CacGiaiDoan)
        {
            Assert.False(string.IsNullOrWhiteSpace(g.Ten), $"{g.Buoc}: thiếu tên giai đoạn");
            Assert.False(string.IsNullOrWhiteSpace(g.DieuKienVao), $"{g.Buoc}: thiếu điều kiện vào bước");
            Assert.False(string.IsNullOrWhiteSpace(g.DauHieuXong), $"{g.Buoc}: thiếu dấu hiệu đã xong");
            Assert.Equal(g.Ten, QuyTrinh.Nhan(g.Buoc));
        }
        Assert.Equal("Phụ trợ", QuyTrinh.Nhan(BuocQuyTrinh.PhuTro));
    }

    [Fact]
    public void Moi_trang_thai_buoc_co_nhan_tieng_Viet()
    {
        foreach (var t in Enum.GetValues<TrangThaiBuoc>())
            Assert.False(string.IsNullOrWhiteSpace(QuyTrinh.Nhan(t)), $"{t}: thiếu nhãn");
    }

    [Fact]
    public void Moi_lenh_deu_duoc_xep_vao_mot_buoc_hop_le()
    {
        foreach (var l in LenhCatalog.TatCa)
        {
            Assert.True(Enum.IsDefined(l.Buoc), $"{l.Ten}: Buoc lạ ({l.Buoc})");
            Assert.True(l.ThuTuTrongBuoc >= 1, $"{l.Ten}: ThuTuTrongBuoc phải ≥ 1");
        }
    }

    [Fact]
    public void Trong_cung_mot_buoc_khong_trung_thu_tu_va_danh_so_lien_tuc_tu_1()
    {
        foreach (var nhom in LenhCatalog.TatCa.GroupBy(l => l.Buoc))
        {
            var thuTu = nhom.Select(l => l.ThuTuTrongBuoc).Order().ToList();
            Assert.Equal(
                Enumerable.Range(1, nhom.Count()),
                thuTu);
        }
    }

    [Fact]
    public void Sau_buoc_chinh_deu_co_it_nhat_mot_lenh()
    {
        foreach (var g in QuyTrinh.CacGiaiDoan)
            Assert.NotEmpty(QuyTrinh.LenhCua(g.Buoc));
    }

    [Fact]
    public void Lenh_cua_moi_buoc_dung_thu_tu_dung_lenh_cua_dac_ta_M106()
    {
        // Bảng §6 của M106 — chép nguyên trình tự dùng thật, để đổi thứ tự trong LenhCatalog mà
        // quên cập nhật đặc tả (hoặc ngược lại) thì đỏ ngay.
        Assert.Equal(
            ["XBOSS_LOGIN", "XBOSS_RULEPACK"],
            QuyTrinh.LenhCua(BuocQuyTrinh.KetNoi).Select(l => l.Ten));
        Assert.Equal(
            // XBOSS_VE_HANHLANG đứng cuối bước 2 (M114 FR16): hành lang là mẩu dữ liệu nền cuối
            // cùng phải chuẩn bị trước khi sang bước vẽ shop drawing.
            ["XBOSS_KIEMTRA", "XBOSS_CHUANHOA", "XBOSS_BATCH", "XBOSS_VE_HANHLANG"],
            QuyTrinh.LenhCua(BuocQuyTrinh.ChuanHoaNen).Select(l => l.Ten));
        Assert.Equal(
            [
                // XBOSS_VE_TUYENTUDONG đứng TRƯỚC XBOSS_VE (M114 FR16).
                "XBOSS_VE_NEN", "XBOSS_VE_TUYENTUDONG", "XBOSS_VE", "XBOSS_VE_NHANTUYEN", "XBOSS_VE_NHAN",
                "XBOSS_VE_PHUKIEN", "XBOSS_VE_THIETBI", "XBOSS_VE_NHANTANG", "XBOSS_VE_DOI",
                // M117 §6 bước 5 — tuyến gợi ý từ sơ đồ nguyên lý là đầu vào của quy trình M115.
                "XBOSS_TUYEN_GOIY",
                // M115 §6 bước 2–3–5 — gán thuộc tính tuyến tim, dựng/duyệt đồ thị, rồi hoàn thiện.
                "XBOSS_TUYEN_GAN", "XBOSS_TUYEN_DOTHI", "XBOSS_HOANTHIEN",
            ],
            QuyTrinh.LenhCua(BuocQuyTrinh.VeShopDrawing).Select(l => l.Ten));
        Assert.Equal(
            ["XBOSS_VE_CHIADOT", "XBOSS_VE_GIADO", "XBOSS_VE_LOCHO", "XBOSS_VE_TAG"],
            QuyTrinh.LenhCua(BuocQuyTrinh.ChiTietCheTao).Select(l => l.Ten));
        Assert.Equal(
            [
                "XBOSS_VE_MATCAT", "XBOSS_VE_THONGKE", "XBOSS_VE_NGATNET", "XBOSS_VE_TRANGIN",
                // M110 FR10 — 3 lệnh revision đứng SAU XBOSS_VE_TRANGIN (khoanh → chốt → hiện/ẩn).
                "XBOSS_VE_REV", "XBOSS_VE_REV_CHOT", "XBOSS_VE_REV_HIENTHI", "XBOSS_VE_BAOCAO",
            ],
            QuyTrinh.LenhCua(BuocQuyTrinh.HoSoBanVe).Select(l => l.Ten));
        Assert.Equal(
            ["XBOSS_BOCKL", "XBOSS_BOCKL_XUAT", "XBOSS_UPLOAD"],
            QuyTrinh.LenhCua(BuocQuyTrinh.BocVaNop).Select(l => l.Ten));
        Assert.Equal(
            [
                "XBOSS_BOCKL_XOA", "XBOSS_VE_THUVIEN", "XBOSS_VE_DEXUAT", "XBOSS_VE_DEXUAT_LO",
                "XBOSS_BANG", "XBOSS_VE_NGATNET_XOA", "XBOSS_TUYEN_GOIY_XOA",
            ],
            QuyTrinh.LenhCua(BuocQuyTrinh.PhuTro).Select(l => l.Ten));
    }

    [Fact]
    public void Sap_nut_trong_moi_panel_Ribbon_theo_buoc_roi_thu_tu_trong_buoc_la_don_nghia()
    {
        // RibbonBuilder xếp nút trong panel bằng khóa (Buoc, ThuTuTrongBuoc) — M106 FR10/AC7.
        // Khóa phải DUY NHẤT trong từng panel, không thì thứ tự nút phụ thuộc thứ tự khai trong
        // danh mục (thay đổi âm thầm khi ai đó chèn lệnh mới vào giữa).
        foreach (var nhom in LenhCatalog.TheoNhom())
        {
            var khoa = nhom.Select(l => (l.Buoc, l.ThuTuTrongBuoc)).ToList();
            Assert.Equal(khoa.Count, khoa.Distinct().Count());
        }

        // Panel "Vẽ shop drawing" gom lệnh của 4 bước khác nhau; sắp theo mỗi ThuTuTrongBuoc sẽ
        // đan xen (mỗi bước đều đánh số từ 1) nên Buoc phải là khóa sắp ĐẦU TIÊN.
        var ve = LenhCatalog.TatCa
            .Where(l => l.Nhom == NhomLenh.VeShopDrawing)
            .OrderBy(l => l.Buoc).ThenBy(l => l.ThuTuTrongBuoc)
            .Select(l => l.Ten)
            .ToList();
        Assert.Equal(
            [
                // Panel này gom cả XBOSS_VE_HANHLANG của bước 2 (M114 FR16) nên nó đứng đầu.
                "XBOSS_VE_HANHLANG",
                "XBOSS_VE_NEN", "XBOSS_VE_TUYENTUDONG", "XBOSS_VE", "XBOSS_VE_NHANTUYEN", "XBOSS_VE_NHAN",
                "XBOSS_VE_PHUKIEN", "XBOSS_VE_THIETBI", "XBOSS_VE_NHANTANG", "XBOSS_VE_DOI",
                "XBOSS_TUYEN_GOIY", "XBOSS_TUYEN_GAN", "XBOSS_TUYEN_DOTHI", "XBOSS_HOANTHIEN",
                "XBOSS_VE_CHIADOT", "XBOSS_VE_GIADO", "XBOSS_VE_LOCHO", "XBOSS_VE_TAG",
                "XBOSS_VE_MATCAT", "XBOSS_VE_THONGKE", "XBOSS_VE_NGATNET", "XBOSS_VE_TRANGIN",
                "XBOSS_VE_REV", "XBOSS_VE_REV_CHOT", "XBOSS_VE_REV_HIENTHI", "XBOSS_VE_BAOCAO",
                "XBOSS_VE_THUVIEN", "XBOSS_VE_DEXUAT", "XBOSS_VE_DEXUAT_LO", "XBOSS_VE_NGATNET_XOA",
                "XBOSS_TUYEN_GOIY_XOA",
            ],
            ve);
    }

    // ===== FR8 — suy trạng thái từng bước (M106 PR2) =====
    //
    // Mỗi giai đoạn có: ca Xong, ca Chưa, và ca lý do (nút mờ kèm câu tiếng Việt). Bộ ca này là
    // thứ duy nhất kẹp được trình dẫn: palette không có test tự động (không build được trên CI).

    /// <summary>Bản vẽ đã đi trọn 6 bước — nền của mọi ca "thiếu đúng một dấu hiệu" bên dưới.</summary>
    private static DauHieuQuyTrinh DaXongHet() => new()
    {
        CoTokenThietBi = true,
        CoRulePack = true,
        CoBanVe = true,
        SoLoiKiemTra = 0,
        CoTuyen = true,
        CoChiaDot = true,
        CoGiaDo = true,
        CoTag = true,
        CoBangThongKe = true,
        CoTrangIn = true,
        CoDauBoc = true,
        CoSidecarBocKl = true,
    };

    private static TinhTrangBuoc Tinh(BuocQuyTrinh buoc, DauHieuQuyTrinh dauHieu) =>
        QuyTrinh.TinhTrang(buoc, dauHieu);

    [Fact]
    public void Ban_ve_mo_lai_tu_phien_truoc_van_tinh_la_da_xong_khong_bat_lam_lai()
    {
        // Ca thật hay gặp nhất: sáng hôm sau mở lại bản vẽ đã chuẩn hóa/vẽ/bóc từ hôm trước.
        // Dấu hiệu đều SỐNG trong bản vẽ (XData) và tệp cạnh nó (sidecar) nên trình dẫn phải nhận
        // ra ngay — bắt kỹ sư làm lại từ bước 1 là hỏng cả tính năng.
        var tinhTrang = QuyTrinh.TinhTrangTatCa(DaXongHet());

        Assert.Equal(6, tinhTrang.Count);
        Assert.Equal(QuyTrinh.CacGiaiDoan.Select(g => g.Buoc), tinhTrang.Select(t => t.Buoc));
        Assert.All(tinhTrang, t => Assert.Equal(TrangThaiBuoc.Xong, t.TrangThai));
        Assert.All(tinhTrang, t => Assert.Null(t.LyDo)); // không nút nào bị làm mờ
    }

    [Fact]
    public void Phien_moi_toanh_thi_buoc_1_chua_lam_va_buoc_2_den_6_khong_ap_dung()
    {
        var tinhTrang = QuyTrinh.TinhTrangTatCa(new DauHieuQuyTrinh());

        Assert.Equal(TrangThaiBuoc.Chua, tinhTrang[0].TrangThai);
        Assert.Null(tinhTrang[0].LyDo); // bước 1 luôn vào được, không có gì để làm mờ
        foreach (var t in tinhTrang.Skip(1))
        {
            Assert.Equal(TrangThaiBuoc.KhongApDung, t.TrangThai);
            Assert.Contains("Chưa mở bản vẽ", t.LyDo);
        }
    }

    // ── Bước 1: Kết nối ──

    [Fact]
    public void Buoc1_xong_khi_co_ca_token_lan_rule_pack()
    {
        Assert.Equal(TrangThaiBuoc.Xong, Tinh(BuocQuyTrinh.KetNoi, DaXongHet()).TrangThai);

        Assert.Equal(
            TrangThaiBuoc.Chua,
            Tinh(BuocQuyTrinh.KetNoi, DaXongHet() with { CoTokenThietBi = false }).TrangThai);
        Assert.Equal(
            TrangThaiBuoc.Chua,
            Tinh(BuocQuyTrinh.KetNoi, DaXongHet() with { CoRulePack = false }).TrangThai);
    }

    // ── Bước 2: Chuẩn hóa nền ──

    [Fact]
    public void Buoc2_xong_khi_sidecar_kiem_tra_bao_0_loi()
    {
        Assert.Equal(TrangThaiBuoc.Xong, Tinh(BuocQuyTrinh.ChuanHoaNen, DaXongHet()).TrangThai);
        Assert.Equal(
            TrangThaiBuoc.Chua,
            Tinh(BuocQuyTrinh.ChuanHoaNen, DaXongHet() with { SoLoiKiemTra = 3 }).TrangThai);
    }

    [Fact]
    public void Buoc2_chua_kiem_bao_gio_thi_chua_xong_chu_khong_doan_la_sach()
    {
        Assert.Equal(
            TrangThaiBuoc.Chua,
            Tinh(BuocQuyTrinh.ChuanHoaNen, DaXongHet() with { SoLoiKiemTra = null }).TrangThai);
    }

    [Fact]
    public void Buoc2_thieu_rule_pack_thi_co_ly_do_lam_mo_nut()
    {
        var tinhTrang = Tinh(BuocQuyTrinh.ChuanHoaNen, DaXongHet() with { CoRulePack = false });

        Assert.Contains("Chưa nạp rule pack", tinhTrang.LyDo);
        Assert.Contains("XBOSS_RULEPACK", tinhTrang.LyDo);
    }

    // ── Bước 3: Vẽ shop drawing ──

    [Fact]
    public void Buoc3_xong_khi_ban_ve_co_tuyen()
    {
        Assert.Equal(TrangThaiBuoc.Xong, Tinh(BuocQuyTrinh.VeShopDrawing, DaXongHet()).TrangThai);
        Assert.Equal(
            TrangThaiBuoc.Chua,
            Tinh(BuocQuyTrinh.VeShopDrawing, DaXongHet() with { CoTuyen = false }).TrangThai);
    }

    [Fact]
    public void Buoc3_nen_con_loi_thi_bao_ly_do_nhung_van_tinh_xong_neu_da_ve()
    {
        var tinhTrang = Tinh(BuocQuyTrinh.VeShopDrawing, DaXongHet() with { SoLoiKiemTra = 2 });

        Assert.Contains("XBOSS_KIEMTRA", tinhTrang.LyDo);
        // Lý do là điều kiện VÀO bước; đã vẽ rồi thì vẫn là đã vẽ — hai chuyện khác nhau.
        Assert.Equal(TrangThaiBuoc.Xong, tinhTrang.TrangThai);
    }

    // ── Bước 4: Chi tiết chế tạo ──

    [Theory]
    [InlineData(true, false, false)]
    [InlineData(false, true, false)]
    [InlineData(false, false, true)]
    public void Buoc4_xong_khi_co_MOT_trong_ba_dau_chia_dot_gia_do_tag(bool chiaDot, bool giaDo, bool tag)
    {
        var dauHieu = DaXongHet() with { CoChiaDot = chiaDot, CoGiaDo = giaDo, CoTag = tag };

        Assert.Equal(TrangThaiBuoc.Xong, Tinh(BuocQuyTrinh.ChiTietCheTao, dauHieu).TrangThai);
    }

    [Fact]
    public void Buoc4_khong_co_dau_nao_thi_chua_xong()
    {
        var dauHieu = DaXongHet() with { CoChiaDot = false, CoGiaDo = false, CoTag = false };

        Assert.Equal(TrangThaiBuoc.Chua, Tinh(BuocQuyTrinh.ChiTietCheTao, dauHieu).TrangThai);
    }

    [Fact]
    public void Buoc4_chua_co_tuyen_thi_bao_ly_do_ve_tuyen_truoc()
    {
        var tinhTrang = Tinh(BuocQuyTrinh.ChiTietCheTao, DaXongHet() with { CoTuyen = false });

        Assert.Contains("chưa có tuyến nào", tinhTrang.LyDo);
        Assert.Contains("XBOSS_VE", tinhTrang.LyDo);
    }

    // ── Bước 5: Hồ sơ bản vẽ ──

    [Fact]
    public void Buoc5_can_CA_trang_in_lan_bang_thong_ke()
    {
        Assert.Equal(TrangThaiBuoc.Xong, Tinh(BuocQuyTrinh.HoSoBanVe, DaXongHet()).TrangThai);
        Assert.Equal(
            TrangThaiBuoc.Chua,
            Tinh(BuocQuyTrinh.HoSoBanVe, DaXongHet() with { CoTrangIn = false }).TrangThai);
        Assert.Equal(
            TrangThaiBuoc.Chua,
            Tinh(BuocQuyTrinh.HoSoBanVe, DaXongHet() with { CoBangThongKe = false }).TrangThai);
    }

    [Fact]
    public void Buoc5_chua_co_tuyen_thi_bao_ly_do()
    {
        Assert.Contains(
            "chưa có tuyến nào",
            Tinh(BuocQuyTrinh.HoSoBanVe, DaXongHet() with { CoTuyen = false }).LyDo);
    }

    // ── Bước 6: Bóc & nộp ──

    [Fact]
    public void Buoc6_can_ca_dau_boc_tren_ban_ve_lan_sidecar_takeoff()
    {
        Assert.Equal(TrangThaiBuoc.Xong, Tinh(BuocQuyTrinh.BocVaNop, DaXongHet()).TrangThai);
        Assert.Equal(
            TrangThaiBuoc.Chua,
            Tinh(BuocQuyTrinh.BocVaNop, DaXongHet() with { CoDauBoc = false }).TrangThai);
        Assert.Equal(
            TrangThaiBuoc.Chua,
            Tinh(BuocQuyTrinh.BocVaNop, DaXongHet() with { CoSidecarBocKl = false }).TrangThai);
    }

    [Fact]
    public void Buoc6_nen_chua_sach_loi_thi_bao_ly_do_theo_dung_dieu_kien_vao_buoc()
    {
        Assert.Contains(
            "XBOSS_KIEMTRA",
            Tinh(BuocQuyTrinh.BocVaNop, DaXongHet() with { SoLoiKiemTra = 5 }).LyDo);
    }

    [Fact]
    public void Lenh_phu_tro_khong_nam_trong_dong_chay_sau_buoc()
    {
        var tinhTrang = Tinh(BuocQuyTrinh.PhuTro, DaXongHet());

        Assert.Equal(TrangThaiBuoc.KhongApDung, tinhTrang.TrangThai);
        Assert.Contains("Lệnh phụ trợ", tinhTrang.LyDo);
    }

    [Fact]
    public void Moi_ly_do_deu_la_cau_tieng_Viet_hoan_chinh()
    {
        // Trình dẫn in nguyên văn lý do cạnh nút bị làm mờ — không được là mã lỗi/chuỗi rỗng.
        var thieuHet = new DauHieuQuyTrinh { CoBanVe = true };
        foreach (var t in QuyTrinh.TinhTrangTatCa(thieuHet).Where(t => t.LyDo is not null))
        {
            Assert.True(t.LyDo!.Length > 20, $"{t.Buoc}: lý do quá cụt — \"{t.LyDo}\"");
            Assert.EndsWith(".", t.LyDo);
        }
    }

    [Fact]
    public void Buoc_va_nhom_Ribbon_la_hai_truc_khac_nhau()
    {
        // XBOSS_UPLOAD nằm panel "Kết nối" (gom theo kỹ thuật) nhưng thuộc bước 6 "Bóc & nộp"
        // (trình tự dùng thật) — nếu ai đó gộp hai trục làm một thì ca này đỏ.
        var upload = LenhCatalog.TatCa.Single(l => l.Ten == "XBOSS_UPLOAD");
        Assert.Equal(NhomLenh.KetNoi, upload.Nhom);
        Assert.Equal(BuocQuyTrinh.BocVaNop, upload.Buoc);
    }
}
