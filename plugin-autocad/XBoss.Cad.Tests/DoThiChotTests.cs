using XBoss.Cad.Core.Graph;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M115 §6 bước 4 — bản chốt đồ thị cất trong bản vẽ (Xrecord ở NOD) phải đọc lại được NGUYÊN VẸN:
/// đây là input duy nhất của <c>XBOSS_HOANTHIEN</c>, mất một trường là mất một quyết định của kỹ sư.
/// </summary>
public class DoThiChotTests
{
    private static DoThiChot Mau() => new(
        "2026-08-30", "v16",
        1234.5, -678.25,
        [
            new TuyenChot("2A1", "HVAC", "300x200", 3000, "tdc"),
            new TuyenChot("2A2", null, null, null, null),
        ],
        [
            new NutChot(0, 0, 0, LoaiNut.Nguon, 1, 0, "HVAC", "300x200"),
            new NutChot(1, 4000, 0, LoaiNut.Te, 3, 90, "HVAC", "300x200"),
            new NutChot(2, 10000, 0, LoaiNut.DoiHuong, 2, 90, null, null),
        ],
        [
            new CanhChot(0, 0, 1, "2A1", 4000),
            new CanhChot(1, 1, 2, "2A1", 6000),
        ],
        [new ThietBiChot(2, "3B7", "HVAC", "FCU-01")],
        [
            new PhuKienChot(1, TrangThaiPhuKien.DaChon, "te", "duct-tee", "fitting", "Tê ống gió", false, false),
            new PhuKienChot(2, TrangThaiPhuKien.ChuaQuyet, null, null, null, null, true, true),
        ]);

    /// <summary>
    /// So khớp TỪNG danh sách: <c>record</c> C# so danh sách bằng THAM CHIẾU, nên
    /// <c>Assert.Equal(goc, doc)</c> luôn đỏ dù nội dung y hệt — so nhầm cách thì test không kiểm gì.
    /// </summary>
    private static void GiongNhau(DoThiChot mongDoi, DoThiChot? thuc)
    {
        Assert.NotNull(thuc);
        Assert.Equal(mongDoi.NgayIso, thuc!.NgayIso);
        Assert.Equal(mongDoi.RulePackVersion, thuc.RulePackVersion);
        Assert.Equal(mongDoi.NguonX, thuc.NguonX, 6);
        Assert.Equal(mongDoi.NguonY, thuc.NguonY, 6);
        Assert.Equal(mongDoi.Tuyen, thuc.Tuyen);
        Assert.Equal(mongDoi.Nut, thuc.Nut);
        Assert.Equal(mongDoi.Canh, thuc.Canh);
        Assert.Equal(mongDoi.ThietBi, thuc.ThietBi);
        Assert.Equal(mongDoi.PhuKien, thuc.PhuKien);
    }

    [Fact]
    public void Ma_hoa_roi_giai_ma_ra_dung_ban_goc()
    {
        var goc = Mau();
        GiongNhau(goc, DoThiChotCodec.GiaiMa(DoThiChotCodec.MaHoa(goc)));
    }

    [Fact]
    public void Chuoi_khong_phai_ban_chot_thi_tra_null()
    {
        Assert.Null(DoThiChotCodec.GiaiMa([]));
        Assert.Null(DoThiChotCodec.GiaiMa(["ve=1", "vaitro=tim"])); // XData của lệnh vẽ, không phải bản chốt
        Assert.Null(DoThiChotCodec.GiaiMa(["dothi=99", "ngay=2026-08-30"])); // định dạng đời sau
    }

    [Fact]
    public void Khoa_la_bi_bo_qua_chu_khong_lam_hong_ban_ghi()
    {
        var dong = DoThiChotCodec.MaHoa(Mau()).Append("khoaDoiSau=gi_do").ToList();
        GiongNhau(Mau(), DoThiChotCodec.GiaiMa(dong));
    }

    [Fact]
    public void Ten_phu_kien_chua_dau_gach_dung_khong_lam_lech_cot()
    {
        var goc = Mau() with
        {
            PhuKien =
            [
                new PhuKienChot(
                    1, TrangThaiPhuKien.DaChon, "te", "duct-tee", "fitting", "Tê | ống gió", false, false),
            ],
        };
        var doc = DoThiChotCodec.GiaiMa(DoThiChotCodec.MaHoa(goc));

        Assert.NotNull(doc);
        Assert.Single(doc!.PhuKien);
        // Dấu | được đổi thành / lúc ghi — nội dung vẫn đọc được, không nuốt mất cột phía sau.
        Assert.Equal("Tê / ống gió", doc.PhuKien[0].Ten);
        Assert.Equal("duct-tee", doc.PhuKien[0].BlockId);
        Assert.False(doc.PhuKien[0].BoQua);
    }

    [Fact]
    public void Giu_nguyen_co_sua_tay_va_bo_qua_cua_tung_nut()
    {
        var doc = DoThiChotCodec.GiaiMa(DoThiChotCodec.MaHoa(Mau()))!;
        Assert.False(doc.PhuKien[0].SuaTay);
        Assert.False(doc.PhuKien[0].BoQua);
        Assert.True(doc.PhuKien[1].SuaTay);
        Assert.True(doc.PhuKien[1].BoQua);
    }

    [Fact]
    public void Giu_nguyen_chieu_dong_cua_tung_canh()
    {
        var doc = DoThiChotCodec.GiaiMa(DoThiChotCodec.MaHoa(Mau()))!;
        Assert.Equal([(0, 1), (1, 2)], doc.Canh.Select(c => (c.Tu, c.Den)));
    }
}
