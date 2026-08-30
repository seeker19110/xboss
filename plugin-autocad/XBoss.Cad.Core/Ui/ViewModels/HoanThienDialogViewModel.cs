using System.ComponentModel;
using System.Globalization;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Graph;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>
/// Một dòng giai đoạn trong hộp thoại <c>XBOSS_HOANTHIEN</c> — checkbox bật/tắt kèm nhãn tiếng Việt
/// và lệnh <c>XBOSS_VE_*</c> làm việc thật (kỹ sư phải biết mình đang ủy thác cho lệnh nào).
/// </summary>
public sealed class MucGiaiDoanHoanThien(GiaiDoanHoanThien giaiDoan, bool batSan) : INotifyPropertyChanged
{
    private bool _bat = batSan;

    public event PropertyChangedEventHandler? PropertyChanged;

    public GiaiDoanHoanThien GiaiDoan { get; } = giaiDoan;

    /// <summary>Giai đoạn này có chạy trong lần này không (mặc định lấy từ <c>stageDefaults</c>).</summary>
    public bool Bat
    {
        get => _bat;
        set
        {
            if (_bat == value) return;
            _bat = value;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Bat)));
            DoiBat?.Invoke();
        }
    }

    /// <summary>ViewModel cha gắn vào để kiểm lại nút OK khi kỹ sư tick/bỏ tick.</summary>
    public Action? DoiBat { get; set; }

    public string Nhan => $"{GiaiDoan.Nhan} — {GiaiDoan.Lenh}";

    public string GhiChu => GiaiDoan.MoTa;
}

/// <summary>Lựa chọn của kỹ sư khi bấm OK: các giai đoạn sẽ chạy, theo thứ tự 1..8.</summary>
public sealed record KetQuaHoanThien(IReadOnlyList<string> GiaiDoanBat);

/// <summary>
/// Hộp thoại <c>XBOSS_HOANTHIEN</c> (M115 §6 bước 5, FR3): chọn chạy trọn gói hay từng giai đoạn.
///
/// THUẦN như mọi ViewModel M106 — không tham chiếu WPF/AutoCAD, nên toàn bộ hành vi (mặc định lấy
/// từ <c>stageDefaults</c>, khóa OK khi không tick giai đoạn nào, kế hoạch xem trước) test được
/// trên CI Linux.
/// </summary>
public sealed class HoanThienDialogViewModel : DialogViewModelBase
{
    private readonly DoThiChot _chot;

    public HoanThienDialogViewModel(DoThiChot chot, CompletionPolicySection cp)
    {
        _chot = chot;
        CacGiaiDoan = HoanThienKeHoach.DanhMuc
            .OrderBy(g => g.SoThuTu)
            .Select(g => new MucGiaiDoanHoanThien(g, cp.BatSan(g.Ten)))
            .ToList();
        foreach (var m in CacGiaiDoan) m.DoiBat = TinhLai;
        KiemLai();
    }

    public override string TieuDe => "XBOSS_HOANTHIEN — Hoàn thiện bản vẽ từ tuyến tim";

    public override string MoTa =>
        "Chọn giai đoạn cần chạy trên cụm tuyến đã chốt đồ thị. Thứ tự chạy CỐ ĐỊNH theo số ① → ⑧, " +
        "không phụ thuộc thứ tự tick. Chạy lại an toàn: mỗi giai đoạn thay thế đúng phần của chính " +
        "nó, không đụng thứ kỹ sư vẽ/sửa tay.";

    /// <summary>8 giai đoạn theo thứ tự chạy — mỗi dòng một checkbox.</summary>
    public IReadOnlyList<MucGiaiDoanHoanThien> CacGiaiDoan { get; }

    /// <summary>Tóm tắt đồ thị đã chốt để kỹ sư biết mình đang hoàn thiện cái gì.</summary>
    public string TomTatDoThi =>
        $"Đồ thị chốt ngày {_chot.NgayIso} (rule pack {_chot.RulePackVersion}): " +
        $"{So(_chot.Tuyen.Count)} tuyến, {So(_chot.Nut.Count)} nút, {So(_chot.Canh.Count)} cạnh, " +
        $"{So(_chot.ThietBi.Count)} kết nối thiết bị.";

    /// <summary>Xem trước kế hoạch: giai đoạn nào chạy, và phần nào chủ ý KHÔNG làm.</summary>
    public string GhiChu
    {
        get
        {
            var keHoach = KeHoach();
            if (keHoach.Count == 0) return "Chưa chọn giai đoạn nào.";
            var soBoQua = keHoach.Sum(v => v.SoNutBoQua);
            var soChuaQuyet = keHoach.Sum(v => v.SoNutChuaQuyet);
            var them = soBoQua + soChuaQuyet == 0
                ? ""
                : $" · Bỏ qua {So(soBoQua)} nút kỹ sư đã tắt và {So(soChuaQuyet)} nút chưa quyết được phụ kiện.";
            return $"Sẽ chạy {So(keHoach.Count)}/8 giai đoạn: " +
                   string.Join(" → ", keHoach.Select(v => v.GiaiDoan.Nhan)) + "." + them;
        }
    }

    /// <summary>Kế hoạch tương ứng lựa chọn hiện tại (cùng hàm mà lệnh dùng — không có luật thứ hai).</summary>
    public IReadOnlyList<ViecGiaiDoan> KeHoach() =>
        HoanThienKeHoach.Lap(_chot, CacGiaiDoan.Where(m => m.Bat).Select(m => m.GiaiDoan.Ten));

    public KetQuaHoanThien KetQua() =>
        new(KeHoach().Select(v => v.GiaiDoan.Ten).ToList());

    protected override IReadOnlyList<string> Kiem() =>
        CacGiaiDoan.Any(m => m.Bat)
            ? []
            : ["Chưa tick giai đoạn nào — lệnh sẽ chạy xong mà không làm gì."];

    protected override IReadOnlyList<string> KiemCanhBao()
    {
        var ra = new List<string>();
        var chuaQuyet = _chot.PhuKien.Count(p => !p.BoQua && p.TrangThai == TrangThaiPhuKien.ChuaQuyet);
        if (chuaQuyet > 0 && CacGiaiDoan.Any(m => m is { Bat: true, GiaiDoan.Ten: "phuKienTaiNut" }))
        {
            ra.Add(
                $"{So(chuaQuyet)} nút chưa quyết được phụ kiện — giai đoạn ② sẽ BỎ QUA các nút đó " +
                "(plugin không chèn block gần đúng). Chạy lại XBOSS_TUYEN_DOTHI để chọn tay nếu cần.");
        }
        return ra;
    }

    private void TinhLai()
    {
        Bao(nameof(GhiChu));
        KiemLai();
    }

    private static string So(int v) => v.ToString(CultureInfo.InvariantCulture);
}
