using XBoss.Cad.Core.Coordination;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M116 §6 bước 3–4 / FR4 / AC2 — ViewModel bảng xung đột của <c>XBOSS_PHOIHOP</c>: lọc theo hệ và
/// theo mức, chuyển trạng thái từng dòng (chấp nhận / bỏ qua có lý do), và luật "bỏ qua phải có lý
/// do" khóa nút OK. Thuần .NET, không cần AutoCAD.
/// </summary>
public class PhoiHopDialogViewModelTests
{
    private static CoordinationPolicySection ChinhSach() => new()
    {
        Enabled = true,
        PriorityFrom = "crossingPolicy",
        MaintenanceGapMm = 200,
    };

    private static XungDot Xd(
        string id,
        MucXungDot muc = MucXungDot.Cung,
        LopKiem lop = LopKiem.GiaoCatCaoDo,
        string heA = "HVAC",
        string heB = "ELECTRICAL",
        bool thieuCaoDo = false) =>
        new(
            id, lop, muc, [id + "-a", id + "-b"], [heA, heB],
            $"Xung đột thử {id}", new Diem2(1, 2), 100, thieuCaoDo,
            [new DeXuat(LoaiDeXuat.NhuongCaoDo, heB, "Hạ cao độ hệ " + heB, 2500)]);

    private static PhoiHopDialogViewModel Vm(params DongXungDot[] dong) => new(dong, ChinhSach());

    [Fact]
    public void MacDinhKhongLoc_HienDuMoiDong_VaOkDuoc()
    {
        var vm = Vm(new DongXungDot(Xd("xd-1")), new DongXungDot(Xd("xd-2", MucXungDot.Mem)));

        Assert.Equal(2, vm.DanhSach.Count);
        Assert.Equal(2, vm.TongSo);
        Assert.Equal(1, vm.SoCung);
        Assert.Equal(1, vm.SoMem);
        Assert.True(vm.CoTheOk);
        Assert.Equal(2, vm.KetQua()!.Count);
    }

    [Fact]
    public void LocTheoHe_ChiConDongCoHeDo()
    {
        var vm = Vm(
            new DongXungDot(Xd("xd-1", heA: "HVAC", heB: "ELECTRICAL")),
            new DongXungDot(Xd("xd-2", heA: "PIPING", heB: "FIREFIGHTING")));

        vm.HeLoc = "PIPING";

        Assert.Single(vm.DanhSach);
        Assert.Equal("xd-2", vm.DanhSach[0].Id);

        vm.HeLoc = PhoiHopDialogViewModel.TatCaHe;
        Assert.Equal(2, vm.DanhSach.Count);
    }

    [Fact]
    public void LocTheoMuc_ChiConDungMucDo()
    {
        var vm = Vm(
            new DongXungDot(Xd("xd-1")),
            new DongXungDot(Xd("xd-2", MucXungDot.Mem, LopKiem.TranhChapHanhLang)),
            new DongXungDot(Xd("xd-3", MucXungDot.CanhBao, LopKiem.KhoangCachQuyPham)));

        vm.MucLoc = vm.CacMuc.Single(m => m.Muc == MucXungDot.Mem);

        Assert.Single(vm.DanhSach);
        Assert.Equal("xd-2", vm.DanhSach[0].Id);
    }

    [Fact]
    public void KetQua_TraVeMoiDongKeCaDongDangBiLocAn()
    {
        var vm = Vm(
            new DongXungDot(Xd("xd-1", heA: "HVAC", heB: "ELECTRICAL")),
            new DongXungDot(Xd("xd-2", heA: "PIPING", heB: "FIREFIGHTING")));

        vm.HeLoc = "PIPING";
        vm.DanhSach[0].ChapNhan = true;

        var kq = vm.KetQua();
        Assert.NotNull(kq);
        Assert.Equal(2, kq!.Count); // lọc chỉ đổi hiển thị, không cắt dữ liệu trả về
        Assert.Equal(TrangThaiXungDot.ChapNhan, kq.Single(d => d.Id == "xd-2").TrangThai);
        Assert.Equal(TrangThaiXungDot.ChuaXuLy, kq.Single(d => d.Id == "xd-1").TrangThai);
    }

    [Fact]
    public void ChapNhan_RoiBoTick_QuayVeChuaXuLy()
    {
        var d = new DongXungDot(Xd("xd-1"));

        d.ChapNhan = true;
        Assert.Equal(TrangThaiXungDot.ChapNhan, d.TrangThai);

        d.ChapNhan = false;
        Assert.Equal(TrangThaiXungDot.ChuaXuLy, d.TrangThai);
        Assert.False(d.BoQua);
    }

    [Fact]
    public void BoQuaChuaCoLyDo_KhoaOk_VietLyDoThiMoOkLai()
    {
        var d = new DongXungDot(Xd("xd-1"));
        var vm = Vm(d);

        d.BoQua = true;
        Assert.True(d.CanLyDo);
        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains("chưa ghi lý do", string.Join(" ", vm.LyDoChuaHopLe), StringComparison.Ordinal);

        d.LyDo = "Đã thống nhất với thầu điện tại họp 30/08, giữ nguyên hiện trạng.";
        Assert.False(d.CanLyDo);
        Assert.True(vm.CoTheOk);
        Assert.Equal(1, vm.SoBoQua);
    }

    [Fact]
    public void TrangThaiDocTuMarkerCu_GiuNguyen_VaKhongKhoaOk()
    {
        // AC2 — chạy lại lệnh: dòng dựng lại từ XData marker của lần trước.
        var d = new DongXungDot(
            Xd("xd-1"), TrangThaiXungDot.BoQua, "Chờ chủ đầu tư duyệt hạ trần", daCoMarker: true);
        var vm = Vm(d);

        Assert.True(vm.CoTheOk);
        Assert.Equal(1, vm.SoBoQua);
        Assert.Equal(0, vm.SoChuaXuLy);
        Assert.True(d.DaCoMarker);
        Assert.Contains("Chờ chủ đầu tư duyệt hạ trần", d.Nhan, StringComparison.Ordinal);
    }

    [Fact]
    public void CanhBao_XungDotCungChuaXuLy_VaTuyenThieuCaoDo()
    {
        var vm = Vm(
            new DongXungDot(Xd("xd-1")),
            new DongXungDot(Xd("xd-2", MucXungDot.CanhBao, LopKiem.GiaoCatPhang, thieuCaoDo: true)));

        var canhBao = string.Join(" ", vm.CanhBao);
        Assert.Contains("CỨNG chưa xử lý", canhBao, StringComparison.Ordinal);
        Assert.Contains("MẶT BẰNG", canhBao, StringComparison.Ordinal);
        Assert.Equal(1, vm.SoCungChuaXuLy);
        Assert.Equal(1, vm.SoThieuCaoDo);

        vm.DanhSach.Single(d => d.Id == "xd-1").ChapNhan = true;
        Assert.Equal(0, vm.SoCungChuaXuLy);
        Assert.DoesNotContain("CỨNG chưa xử lý", string.Join(" ", vm.CanhBao), StringComparison.Ordinal);
    }

    [Fact]
    public void DanhSachHe_LayTuChinhKetQuaQuet_KemMucTatCa()
    {
        var vm = Vm(
            new DongXungDot(Xd("xd-1", heA: "HVAC", heB: "ELECTRICAL")),
            new DongXungDot(Xd("xd-2", heA: "HVAC", heB: "PIPING")));

        Assert.Equal(
            [PhoiHopDialogViewModel.TatCaHe, "ELECTRICAL", "HVAC", "PIPING"],
            vm.CacHe);
    }

    [Fact]
    public void MaTrangThai_GhiVaDocLai_KhongDoiNghia()
    {
        foreach (var tt in Enum.GetValues<TrangThaiXungDot>())
            Assert.Equal(tt, MaTrangThaiXungDot.Doc(MaTrangThaiXungDot.Ma(tt)));

        // Mã lạ (XData của bản plugin mới hơn) không được hiểu bừa thành "đã xử lý".
        Assert.Equal(TrangThaiXungDot.ChuaXuLy, MaTrangThaiXungDot.Doc("mot_ma_la"));
        Assert.Equal(TrangThaiXungDot.ChuaXuLy, MaTrangThaiXungDot.Doc(null));
    }

    [Fact]
    public void XDataMarker_MaHoaRoiGiaiMa_GiuNguyenIdVaTrangThai()
    {
        // FR4 — trạng thái sống trong XData marker: vòng mã hóa/giải mã không được rơi trường nào.
        var goc = new VeXDataInfo
        {
            VaiTro = VaiTroVe.PhoiHop,
            XungDotId = "xd-0123456789abcdef",
            TrangThaiXungDot = MaTrangThaiXungDot.BoQua,
            LyDoXungDot = "Đã xử lý ngoài công trường bằng ống mềm",
        };

        var lai = VeXData.GiaiMa(VeXData.MaHoa(goc));

        Assert.NotNull(lai);
        Assert.Equal(VaiTroVe.PhoiHop, lai!.VaiTro);
        Assert.Equal(goc.XungDotId, lai.XungDotId);
        Assert.Equal(goc.TrangThaiXungDot, lai.TrangThaiXungDot);
        Assert.Equal(goc.LyDoXungDot, lai.LyDoXungDot);
    }
}
