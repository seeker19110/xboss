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
            ["XBOSS_KIEMTRA", "XBOSS_CHUANHOA", "XBOSS_BATCH"],
            QuyTrinh.LenhCua(BuocQuyTrinh.ChuanHoaNen).Select(l => l.Ten));
        Assert.Equal(
            ["XBOSS_VE_NEN", "XBOSS_VE", "XBOSS_VE_NHAN", "XBOSS_VE_PHUKIEN", "XBOSS_VE_THIETBI", "XBOSS_VE_DOI"],
            QuyTrinh.LenhCua(BuocQuyTrinh.VeShopDrawing).Select(l => l.Ten));
        Assert.Equal(
            ["XBOSS_VE_CHIADOT", "XBOSS_VE_GIADO", "XBOSS_VE_LOCHO", "XBOSS_VE_TAG"],
            QuyTrinh.LenhCua(BuocQuyTrinh.ChiTietCheTao).Select(l => l.Ten));
        Assert.Equal(
            ["XBOSS_VE_MATCAT", "XBOSS_VE_THONGKE", "XBOSS_VE_TRANGIN", "XBOSS_VE_BAOCAO"],
            QuyTrinh.LenhCua(BuocQuyTrinh.HoSoBanVe).Select(l => l.Ten));
        Assert.Equal(
            ["XBOSS_BOCKL", "XBOSS_BOCKL_XUAT", "XBOSS_UPLOAD"],
            QuyTrinh.LenhCua(BuocQuyTrinh.BocVaNop).Select(l => l.Ten));
        Assert.Equal(
            ["XBOSS_BOCKL_XOA", "XBOSS_VE_THUVIEN", "XBOSS_VE_DEXUAT", "XBOSS_BANG"],
            QuyTrinh.LenhCua(BuocQuyTrinh.PhuTro).Select(l => l.Ten));
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
