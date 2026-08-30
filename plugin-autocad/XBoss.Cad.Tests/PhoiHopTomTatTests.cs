using XBoss.Cad.Core.Coordination;
using XBoss.Cad.Core.Draw;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M116 PR3 §6 bước 5 — <see cref="PhoiHopTomTat.Tu"/>: nguồn tổng hợp DUY NHẤT cho mục
/// <c>phoiHop</c> của <c>VeSessionReport</c>, sidecar upload và panel web — kiểm đúng con số tổng
/// cộng + chia theo lớp kiểm.
/// </summary>
public class PhoiHopTomTatTests
{
    private static XungDot Xd(
        string id, LopKiem lop, MucXungDot muc, string heA = "HVAC", string heB = "PIPING") =>
        new(id, lop, muc, [id + "-a", id + "-b"], [heA, heB], "mô tả thử", new Diem2(1, 2), 100, false, []);

    [Fact]
    public void Rong_TraTongBangKhong_KhongLop()
    {
        var kq = PhoiHopTomTat.Tu([]);
        Assert.Equal(0, kq.TongSo);
        Assert.Empty(kq.TheoLop);
    }

    [Fact]
    public void CongDungTongVaTheoLop()
    {
        var dong = new List<(XungDot, TrangThaiXungDot)>
        {
            (Xd("xd-1", LopKiem.GiaoCatCaoDo, MucXungDot.Cung), TrangThaiXungDot.ChuaXuLy),
            (Xd("xd-2", LopKiem.GiaoCatCaoDo, MucXungDot.Cung), TrangThaiXungDot.ChapNhan),
            (Xd("xd-3", LopKiem.TranhChapHanhLang, MucXungDot.Mem), TrangThaiXungDot.BoQua),
            (Xd("xd-4", LopKiem.KhoangCachQuyPham, MucXungDot.CanhBao), TrangThaiXungDot.ChuaXuLy),
        };

        var kq = PhoiHopTomTat.Tu(dong);

        Assert.Equal(4, kq.TongSo);
        Assert.Equal(2, kq.SoCung);
        Assert.Equal(1, kq.SoMem);
        Assert.Equal(1, kq.SoCanhBao);
        Assert.Equal(2, kq.SoChuaXuLy);
        Assert.Equal(1, kq.SoChapNhan);
        Assert.Equal(1, kq.SoBoQua);

        Assert.Equal(3, kq.TheoLop.Count);
        var giaoCat = kq.TheoLop.Single(l => l.Lop == LopKiem.GiaoCatCaoDo.ToString());
        Assert.Equal("giao cắt cùng cao độ", giaoCat.Nhan);
        Assert.Equal(2, giaoCat.TongSo);
        Assert.Equal(2, giaoCat.SoCung);
        Assert.Equal(1, giaoCat.SoChuaXuLy);
        Assert.Equal(1, giaoCat.SoChapNhan);

        var hanhLang = kq.TheoLop.Single(l => l.Lop == LopKiem.TranhChapHanhLang.ToString());
        Assert.Equal(1, hanhLang.SoMem);
        Assert.Equal(1, hanhLang.SoBoQua);
    }

    [Fact]
    public void ToJson_KetXuatDuocCacTruongChinh()
    {
        var kq = PhoiHopTomTat.Tu(
            [(Xd("xd-1", LopKiem.GiaoCatCaoDo, MucXungDot.Cung), TrangThaiXungDot.ChuaXuLy)]);
        var json = kq.ToJson();
        Assert.Contains("\"tongSo\": 1", json);
        Assert.Contains("\"theoLop\"", json);
        Assert.Contains("\"lop\": \"GiaoCatCaoDo\"", json);
    }
}
