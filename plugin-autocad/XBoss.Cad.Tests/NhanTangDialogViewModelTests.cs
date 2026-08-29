using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M111 FR2/FR3/FR9 — hộp thoại nhân bản tầng. Đây là bộ máy XEM TRƯỚC BẮT BUỘC (guardrail §2.4)
/// và cũng là bộ kiểm mà đường hỏi đáp dòng lệnh dùng lại (FR11), nên mọi bất biến "chưa đủ điều
/// kiện thì KHÔNG cho chạy" phải được canh ở đây — Adapter không có test tự động.
/// </summary>
public class NhanTangDialogViewModelTests
{
    private const string Pattern = "{type}-{floor}-{seq}";

    private static FloorPolicySection ChinhSach(string layoutMode = "offsetY", double stepMm = 30000) => new()
    {
        Enabled = true,
        Floors = ["05", "06", "07", "08"],
        LayoutMode = layoutMode,
        StepMm = stepMm,
        GridColumns = 4,
        ZoneNamePattern = "{zone}-T{floor}",
        CopyRoles = ["Tim", "Bien", "Nhan", "PhuKien", "ThietBi"],
    };

    private static readonly TomTatChonNhanTang KhongBoQuaGi = new(0, 0, 0, []);

    private static DoiTuongNhanTang Tim(string handle, double daiMm = 1000, params string[] bien) =>
        new(handle,
            new VeXDataInfo
            {
                VaiTro = VaiTroVe.Tim,
                HeId = "HVAC",
                ItemId = "duct-supp",
                Size = "300x200",
                HandleBien = bien,
            },
            DaiMm: daiMm);

    private static DoiTuongNhanTang ThietBi(string handle, string tag, bool daBoc = false, string vung = "") =>
        new(handle,
            new VeXDataInfo { VaiTro = VaiTroVe.ThietBi, HeId = "HVAC" },
            tag,
            daBoc,
            vung);

    private static NhanTangDialogViewModel Vm(
        IReadOnlyList<DoiTuongNhanTang>? nguon = null,
        TomTatChonNhanTang? tomTat = null,
        Dictionary<string, int>? banChepDaCo = null,
        IReadOnlyCollection<string>? vungDaCo = null,
        IReadOnlyCollection<string>? tagDaCo = null,
        int soLoiKiemTra = 0,
        FloorPolicySection? fp = null,
        Action? zoom = null) =>
        new(fp ?? ChinhSach(),
            Pattern,
            nguon ?? [Tim("1A"), ThietBi("2B", "FCU-05-01")],
            tomTat ?? KhongBoQuaGi,
            "05",
            banChepDaCo ?? new Dictionary<string, int>(),
            vungDaCo ?? [],
            tagDaCo ?? [],
            soLoiKiemTra,
            zoom);

    private static void Tick(NhanTangDialogViewModel vm, params string[] tang)
    {
        foreach (var t in vm.CacTangDich) t.Chon = tang.Contains(t.NhanTang);
    }

    // ===== Xem trước (FR3) =====

    [Fact]
    public void Xem_truoc_neu_ro_vi_tri_dat_va_vi_du_tag_tung_tang()
    {
        var vm = Vm();
        Tick(vm, "06", "07");

        Assert.Equal(2, vm.DongXemTruoc.Count);
        Assert.Contains("Tầng 06", vm.DongXemTruoc[0]);
        Assert.Contains("(0; 30,000)", vm.DongXemTruoc[0]); // ô 0 của tầng 06 (tầng nguồn 05 đã bị bỏ)
        Assert.Contains("FCU-05-01 → FCU-06-01", vm.DongXemTruoc[0]);
        Assert.Contains("(0; 60,000)", vm.DongXemTruoc[1]);
        Assert.Contains("FCU-07-01", vm.DongXemTruoc[1]);
        Assert.True(vm.CoTheOk, string.Join(" | ", vm.LyDoChuaHopLe));
    }

    [Fact]
    public void Vi_tri_mot_tang_khong_doi_theo_so_tang_duoc_tick_AC8()
    {
        // Chạy lại cho RIÊNG tầng 08 phải đặt nó về đúng ô cũ, không nhảy về ô của tầng 06 —
        // nếu không, bản chép sẽ chồng khít lên tầng khác.
        var day = Vm();
        Tick(day, "06", "07", "08");
        var dongTang08Khi3 = day.DongXemTruoc[2];

        var mot = Vm();
        Tick(mot, "08");

        Assert.Contains("Tầng 08", dongTang08Khi3);
        Assert.Equal(dongTang08Khi3, mot.DongXemTruoc[0]);
    }

    [Fact]
    public void Doi_kieu_dat_va_buoc_doi_thi_xem_truoc_tinh_lai()
    {
        var vm = Vm();
        Tick(vm, "06");
        vm.MucKieuDatChon = vm.CacKieuDat.First(m => m.GiaTri == KieuDatTang.OffsetX);
        vm.StepMm = "12000";

        Assert.Contains("(12,000; 0)", vm.DongXemTruoc[0]);
        Assert.Equal("offsetX", vm.KetQua()!.ChinhSach.LayoutMode);
        Assert.Equal(12000, vm.KetQua()!.ChinhSach.StepMm);
    }

    [Fact]
    public void Buoc_doi_khong_phai_so_duong_thi_khoa_OK()
    {
        var vm = Vm();
        Tick(vm, "06");

        vm.StepMm = "ba mươi nghìn";
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Bước dời", StringComparison.Ordinal));

        vm.StepMm = "0";
        Assert.False(vm.CoTheOk);
    }

    // ===== Bất biến "không đụng tầng nguồn" =====

    [Fact]
    public void Tang_dich_trung_tang_nguon_thi_khoa_OK()
    {
        var vm = Vm();
        Tick(vm, "05");

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("trùng tầng nguồn", StringComparison.Ordinal));
    }

    [Fact]
    public void Chua_tick_tang_hoac_chua_khai_tang_nguon_thi_khoa_OK()
    {
        var vm = Vm();
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Chưa tick tầng đích", StringComparison.Ordinal));

        Tick(vm, "06");
        vm.TangNguon = "";
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("tầng NGUỒN", StringComparison.Ordinal));
    }

    [Fact]
    public void Khong_co_doi_tuong_chep_duoc_thi_khoa_OK()
    {
        var vm = Vm(nguon: []);

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("không có đối tượng nào chép được", StringComparison.Ordinal));
    }

    // ===== Vùng bóc (FR6/AC9) =====

    [Fact]
    public void Ten_vung_dich_trung_vung_da_co_thi_khoa_OK_khong_tu_them_hau_to()
    {
        var vm = Vm(
            nguon: [ThietBi("2B", "FCU-05-01", vung: "Zone A")],
            vungDaCo: ["Zone A", "Zone A-T06"]);
        Tick(vm, "06");

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Zone A-T06", StringComparison.Ordinal));
    }

    [Fact]
    public void Ke_hoach_doi_ten_vung_hien_trong_xem_truoc()
    {
        var vm = Vm(nguon: [ThietBi("2B", "FCU-05-01", vung: "Zone A")], vungDaCo: ["Zone A"]);
        Tick(vm, "06", "07");

        Assert.True(vm.CoVung);
        Assert.Equal(2, vm.DongVung.Count);
        Assert.Contains("\"Zone A\" → \"Zone A-T06\"", vm.DongVung[0]);
        Assert.Contains("\"Zone A\" → \"Zone A-T07\"", vm.DongVung[1]);
    }

    // ===== Idempotent theo tầng (FR9/AC8) =====

    [Fact]
    public void Tang_da_co_ban_chep_mac_dinh_BO_QUA()
    {
        var vm = Vm(banChepDaCo: new Dictionary<string, int> { ["06"] = 120 });
        Tick(vm, "06", "07");

        Assert.False(vm.ChepDe);
        Assert.True(vm.CoTangDaChep);
        Assert.Equal(["07"], vm.KetQua()!.TangDich);
        Assert.Single(vm.DongXemTruoc);
    }

    [Fact]
    public void Chon_chep_de_thi_tang_do_duoc_chep_lai()
    {
        var vm = Vm(banChepDaCo: new Dictionary<string, int> { ["06"] = 120 });
        Tick(vm, "06", "07");
        vm.ChepDe = true;

        Assert.Equal(["06", "07"], vm.KetQua()!.TangDich);
        Assert.Contains("CHÉP ĐÈ", vm.DongXemTruoc[0], StringComparison.Ordinal);
    }

    [Fact]
    public void Moi_tang_tick_deu_da_chep_va_dang_bo_qua_thi_khoa_OK()
    {
        var vm = Vm(banChepDaCo: new Dictionary<string, int> { ["06"] = 120 });
        Tick(vm, "06");

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("BỎ QUA", StringComparison.Ordinal));
    }

    // ===== Cảnh báo KHÔNG chặn =====

    [Fact]
    public void Kiemtra_dang_do_thi_CANH_BAO_chu_khong_chan()
    {
        // Chốt 2026-08-29: cảnh báo, KHÔNG chặn — bản vẽ người khác luôn có lỗi tồn đọng.
        var vm = Vm(soLoiKiemTra: 7);
        Tick(vm, "06");

        Assert.True(vm.CoTheOk);
        Assert.Contains(vm.CanhBao, c => c.Contains("XBOSS_KIEMTRA", StringComparison.Ordinal));
    }

    [Fact]
    public void Tag_lech_mau_thi_giu_nguyen_kem_canh_bao()
    {
        var vm = Vm(nguon: [ThietBi("2B", "FCU cũ (đánh tay)")]);
        Tick(vm, "06");

        Assert.True(vm.CoTheOk);
        Assert.Contains(vm.CanhBao, c => c.Contains("không khớp mẫu", StringComparison.Ordinal));
    }

    [Fact]
    public void Bao_truoc_so_lien_ket_se_bi_go_vi_tro_ra_ngoai_vung_chon()
    {
        // Tim trỏ tới 2 nét biên, chỉ 1 nét nằm trong vùng chọn ⇒ 1 liên kết sẽ bị GỠ (guardrail §2.2).
        var bien = new DoiTuongNhanTang(
            "9F", new VeXDataInfo { VaiTro = VaiTroVe.Bien, HandleTim = "1A" });
        var vm = Vm(nguon: [Tim("1A", 1000, "9F", "FF"), bien]);
        Tick(vm, "06");

        Assert.True(vm.CoTheOk);
        Assert.Contains(vm.CanhBao, c => c.Contains("1 liên kết", StringComparison.Ordinal));
    }

    [Fact]
    public void Bao_truoc_tag_se_trung_sau_khi_chep()
    {
        var vm = Vm(tagDaCo: ["FCU-05-01", "FCU-06-01"]);
        Tick(vm, "06");

        Assert.True(vm.CoTheOk);
        Assert.Contains(vm.CanhBao, c => c.Contains("TRÙNG", StringComparison.Ordinal));
    }

    [Fact]
    public void Bao_truoc_viec_go_dau_boc_cua_ban_chep()
    {
        var vm = Vm(nguon: [ThietBi("2B", "FCU-05-01", daBoc: true)]);
        Tick(vm, "06");

        Assert.Contains(vm.CanhBao, c => c.Contains("gỡ dấu bóc", StringComparison.OrdinalIgnoreCase));
    }

    // ===== Lý do bỏ qua (FR1/FR7) =====

    [Fact]
    public void Neu_du_ly_do_bo_qua_dem_duoc_cho_tung_nhom()
    {
        var tomTat = new TomTatChonNhanTang(
            SoKhongCoXData: 12,
            SoThuocXref: 3,
            SoVonLaBanChep: 2,
            VaiTroBoQua: [new DemVaiTroBoQua(VaiTroVe.MatCat, 4)]);
        var vm = Vm(tomTat: tomTat);

        Assert.Equal(19, tomTat.TongBoQua);
        Assert.Equal(4, vm.DongBoQua.Count);
        Assert.Contains(vm.DongBoQua, d => d.Contains("12 đối tượng không mang dữ liệu XBoss", StringComparison.Ordinal));
        Assert.Contains(vm.DongBoQua, d => d.Contains("xref", StringComparison.Ordinal));
        Assert.Contains(vm.DongBoQua, d => d.Contains("mặt cắt", StringComparison.Ordinal));
        Assert.Contains(vm.DongBoQua, d => d.Contains("VỐN LÀ bản chép", StringComparison.Ordinal));
    }

    // ===== Nút zoom (FR3) =====

    [Fact]
    public void Nut_zoom_chi_hien_khi_adapter_cam_hanh_vi_va_khong_bao_gio_nem_loi()
    {
        Assert.False(Vm().CoNutZoom);

        var daGoi = 0;
        var vm = Vm(zoom: () => daGoi++);
        Assert.True(vm.CoNutZoom);
        vm.ZoomToiNguon();
        Assert.Equal(1, daGoi);
        Assert.Contains("Đã zoom", vm.ThongBaoZoom, StringComparison.Ordinal);

        var vmLoi = Vm(zoom: () => throw new InvalidOperationException("eNotApplicable"));
        vmLoi.ZoomToiNguon();
        Assert.Contains("Không zoom được", vmLoi.ThongBaoZoom, StringComparison.Ordinal);
    }
}
