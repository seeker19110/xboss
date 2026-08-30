using System.ComponentModel;
using System.Globalization;
using System.Windows.Input;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Graph;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>
/// Một lựa chọn phụ kiện trong danh sách thả xuống của bước duyệt (M115 §6 bước 4) — bọc
/// <see cref="FittingRule"/> để hiện nhãn tiếng Việt; <see cref="Luat"/> null = mục "bỏ qua nút này".
/// </summary>
public sealed class LuaChonPhuKien(FittingRule? luat)
{
    /// <summary>Mục "bỏ qua nút này" — kỹ sư quyết không chèn phụ kiện nào ở đây.</summary>
    public static LuaChonPhuKien BoQua { get; } = new(null);

    public FittingRule? Luat { get; } = luat;

    /// <summary>Đây có phải mục "bỏ qua nút này" không.</summary>
    public bool LaBoQua => Luat is null;

    public string Nhan =>
        Luat is not { } l
            ? "— Bỏ qua nút này (không chèn phụ kiện) —"
            : $"{l.Name} ({l.NodeKind}, {l.BlockId}, góc [{So(l.MinAngleDeg)}; {So(l.MaxAngleDeg)}), " +
              $"cỡ {(l.MaxSizeMm is { } m ? $"≤ {So(m)} mm" : "mọi cỡ")})";

    private static string So(double v) => v.ToString("0.#", CultureInfo.InvariantCulture);
}

/// <summary>
/// Một dòng "nút / phụ kiện suy ra" trong bảng duyệt (M115 §6 bước 4). Kỹ sư đổi được phụ kiện
/// trong danh sách hợp lệ của hệ đó, hoặc chọn bỏ qua nút — mọi thay đổi đánh dấu
/// <see cref="SuaTay"/> để bản chốt ghi lại được ai quyết cái gì.
/// </summary>
public sealed class MucNutPhuKien : INotifyPropertyChanged
{
    private readonly LuaChonPhuKien _banDau;
    private LuaChonPhuKien _dangChon;

    public MucNutPhuKien(
        PhuKienTaiNut phuKien, Diem2 viTri, IReadOnlyList<LuaChonPhuKien> luaChon)
    {
        PhuKien = phuKien;
        ViTri = viTri;
        LuaChon = luaChon;
        // Mục khớp đúng luật plugin đã suy; không suy được (hoặc luật không còn trong danh mục) thì
        // mở sẵn ở "bỏ qua" — trạng thái này KHÔNG tính là kỹ sư đã sửa tay.
        _banDau = luaChon.FirstOrDefault(l =>
                      l.Luat is { } r && string.Equals(r.BlockId, phuKien.BlockId, StringComparison.Ordinal) &&
                      string.Equals(r.NodeKind, phuKien.NodeKind, StringComparison.Ordinal))
                  ?? luaChon.FirstOrDefault(l => l.LaBoQua)
                  ?? LuaChonPhuKien.BoQua;
        _dangChon = _banDau;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    /// <summary>Kết quả suy phụ kiện của Core (chưa có bàn tay kỹ sư).</summary>
    public PhuKienTaiNut PhuKien { get; }

    /// <summary>Vị trí nút — Adapter dùng để zoom tới.</summary>
    public Diem2 ViTri { get; }

    /// <summary>Danh sách hợp lệ để đổi: mọi luật của ĐÚNG hệ tại nút + mục "bỏ qua nút này".</summary>
    public IReadOnlyList<LuaChonPhuKien> LuaChon { get; }

    public LuaChonPhuKien DangChon
    {
        get => _dangChon;
        set
        {
            var moi = value ?? LuaChonPhuKien.BoQua;
            if (ReferenceEquals(_dangChon, moi)) return;
            _dangChon = moi;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(DangChon)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(SuaTay)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Nhan)));
        }
    }

    /// <summary>Kỹ sư đã đổi khác thứ plugin suy ra.</summary>
    public bool SuaTay => !ReferenceEquals(_dangChon, _banDau);

    public string Nhan =>
        $"Nút {PhuKien.Nut.ToString(CultureInfo.InvariantCulture)} · {NhanLoaiNut(PhuKien.LoaiNut)} · " +
        $"({So(ViTri.X)}; {So(ViTri.Y)}) · {PhuKien.LyDo}" +
        (SuaTay ? " [kỹ sư đã sửa]" : "");

    /// <summary>Bản ghi để chốt vào bản vẽ (kể cả chỉnh sửa tay).</summary>
    public PhuKienChot Chot() =>
        _dangChon.Luat is { } l
            ? new PhuKienChot(
                PhuKien.Nut, TrangThaiPhuKien.DaChon, l.NodeKind, l.BlockId, l.BlockKind, l.Name,
                SuaTay, BoQua: false)
            : new PhuKienChot(
                PhuKien.Nut, PhuKien.TrangThai == TrangThaiPhuKien.KhongCan
                    ? TrangThaiPhuKien.KhongCan
                    : TrangThaiPhuKien.ChuaQuyet,
                null, null, null, null, SuaTay, BoQua: true);

    /// <summary>Nhãn tiếng Việt của loại nút (dùng chung hộp thoại và dòng lệnh).</summary>
    public static string NhanLoaiNut(LoaiNut loai) => loai switch
    {
        LoaiNut.Nguon => "điểm nguồn",
        LoaiNut.DauTuDo => "đầu tuyến tự do",
        LoaiNut.KetNoiThietBi => "kết nối thiết bị",
        LoaiNut.Te => "tê (3 nhánh)",
        LoaiNut.NgaTu => "ngã tư (≥4 nhánh)",
        LoaiNut.DoiHuong => "đổi hướng",
        LoaiNut.Giam => "giảm cỡ",
        LoaiNut.DoanLenXuong => "đoạn lên/xuống",
        _ => "đoạn thẳng",
    };

    private static string So(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);
}

/// <summary>Một dòng lỗi/cảnh báo trong tab kiểm — bấm để zoom tới đối tượng liên quan.</summary>
public sealed class MucLoiDoThi(LoiTuyen loi)
{
    public LoiTuyen Loi { get; } = loi;

    public string Nhan =>
        $"{(Loi.Muc == MucLoiTuyen.Chan ? "CHẶN" : "Cảnh báo")} · {Loi.ThongDiep}" +
        (Loi.TuyenId is { Length: > 0 } t ? $" (tuyến {t})" : "");
}

/// <summary>Kết quả bấm "Chốt đồ thị" — phụ kiện tại từng nút SAU khi kỹ sư duyệt.</summary>
public sealed record KetQuaTuyenDoThi(IReadOnlyList<PhuKienChot> PhuKien);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_TUYEN_DOTHI</c> (M115 §6 bước 3–4, FR2): hai danh sách trong một
/// form — lỗi chặn/cảnh báo (bấm → zoom) và nút/phụ kiện suy ra (kỹ sư sửa từng dòng).
///
/// LUẬT CỨNG: nút "Chốt đồ thị" (nút OK của khung M106) CHỈ bật khi KHÔNG còn lỗi CHẶN nào — đúng
/// AC6. Cảnh báo không khóa nút: chúng nói kết quả sẽ thiếu, không nói kết quả sẽ sai.
///
/// THUẦN .NET, không chạm AutoCAD ⇒ test trên CI Linux; hành vi zoom do Adapter gắn.
/// </summary>
public sealed class TuyenDoThiDialogViewModel : DialogViewModelBase
{
    private readonly KetQuaKiemTuyen _kiem;
    private readonly IReadOnlyList<MucLoiDoThi> _loi;
    private readonly IReadOnlyList<MucNutPhuKien> _nut;

    /// <param name="kiem">Kết quả kiểm đồ thị (<see cref="KiemTuyen"/>).</param>
    /// <param name="phuKien">Phụ kiện plugin suy ra (<see cref="SuyPhuKien"/>) — đã lọc nút cần duyệt.</param>
    /// <param name="cp">Khối <c>completionPolicy</c> — nguồn danh sách lựa chọn hợp lệ theo hệ.</param>
    /// <param name="viTriNut">Tọa độ từng nút (chỉ số nút → vị trí), để hiện và để zoom.</param>
    /// <param name="heCuaNut">Hệ tại từng nút (chỉ số nút → hệ); null = nút chưa gán hệ.</param>
    public TuyenDoThiDialogViewModel(
        KetQuaKiemTuyen kiem,
        IReadOnlyList<PhuKienTaiNut> phuKien,
        CompletionPolicySection cp,
        IReadOnlyDictionary<int, Diem2> viTriNut,
        IReadOnlyDictionary<int, string?> heCuaNut)
    {
        _kiem = kiem;
        _loi = kiem.TatCa.Select(l => new MucLoiDoThi(l)).ToList();
        _nut = phuKien
            .Select(p => new MucNutPhuKien(
                p,
                viTriNut.TryGetValue(p.Nut, out var v) ? v : new Diem2(0, 0),
                LuaChonHopLe(cp, heCuaNut.TryGetValue(p.Nut, out var h) ? h : null)))
            .ToList();

        LenhZoomLoi = new LenhUyNhiem(m =>
        {
            if (m is MucLoiDoThi muc) ZoomToiLoi?.Invoke(muc);
        });
        LenhZoomNut = new LenhUyNhiem(m =>
        {
            if (m is MucNutPhuKien muc) ZoomToiNut?.Invoke(muc);
        });
        foreach (var n in _nut) n.PropertyChanged += (_, _) => Bao(nameof(TomTatNut));
        KiemLai();
    }

    public override string TieuDe => "XBOSS_TUYEN_DOTHI — Dựng & duyệt đồ thị tuyến";

    public override string MoTa =>
        "Soát lỗi chặn/cảnh báo và duyệt phụ kiện plugin suy ra tại từng nút. " +
        "Còn lỗi CHẶN thì không chốt được đồ thị — sửa bản vẽ rồi chạy lại lệnh.";

    /// <summary>Lỗi chặn trước, cảnh báo sau — mỗi dòng bấm được để zoom.</summary>
    public IReadOnlyList<MucLoiDoThi> CacLoi => _loi;

    /// <summary>Nút/phụ kiện suy ra — kỹ sư sửa từng dòng.</summary>
    public IReadOnlyList<MucNutPhuKien> CacNut => _nut;

    public ICommand LenhZoomLoi { get; }
    public ICommand LenhZoomNut { get; }

    public Action<MucLoiDoThi>? ZoomToiLoi { get; set; }
    public Action<MucNutPhuKien>? ZoomToiNut { get; set; }

    /// <summary>Đồ thị đạt (không lỗi chặn) — nút "Chốt đồ thị" bật theo đúng cờ này (AC6).</summary>
    public bool CoTheChot => _kiem.Dat;

    public string TomTatLoi =>
        _kiem.Dat
            ? _kiem.CanhBao.Count == 0
                ? "Không có lỗi chặn lẫn cảnh báo — chốt đồ thị được."
                : $"Không có lỗi chặn; {_kiem.CanhBao.Count} cảnh báo (chốt được, nhưng kết quả sẽ thiếu)."
            : $"{_kiem.Chan.Count} lỗi CHẶN và {_kiem.CanhBao.Count} cảnh báo — phải sửa hết lỗi chặn " +
              "trên bản vẽ rồi chạy lại lệnh.";

    public string TomTatNut
    {
        get
        {
            var daChon = _nut.Count(n => !n.Chot().BoQua);
            var suaTay = _nut.Count(n => n.SuaTay);
            return
                $"{daChon}/{_nut.Count} nút sẽ chèn phụ kiện" +
                (suaTay > 0 ? $"; {suaTay} nút kỹ sư đã sửa tay." : ".");
        }
    }

    public string GhiChu =>
        "Danh sách lựa chọn của mỗi nút là các luật fittingRules của ĐÚNG hệ tại nút đó — plugin " +
        "không đề xuất phụ kiện của hệ khác. Nút chưa quyết được để nguyên cũng không sao: bước " +
        "hoàn thiện sẽ bỏ qua nó thay vì chèn bừa.";

    /// <summary>Bản chốt (kể cả mọi chỉnh sửa tay); null khi còn lỗi chặn.</summary>
    public KetQuaTuyenDoThi? KetQua() =>
        CoTheOk ? new KetQuaTuyenDoThi(_nut.Select(n => n.Chot()).ToList()) : null;

    protected override IReadOnlyList<string> Kiem()
    {
        if (_kiem.Dat) return [];
        return
        [
            $"Còn {_kiem.Chan.Count} lỗi CHẶN — không chốt được đồ thị. Bấm từng dòng lỗi để zoom tới " +
            "đối tượng, sửa trên bản vẽ rồi chạy lại XBOSS_TUYEN_DOTHI.",
        ];
    }

    protected override IReadOnlyList<string> KiemCanhBao() =>
        _kiem.CanhBao.Count == 0
            ? []
            : [$"{_kiem.CanhBao.Count} cảnh báo — chốt được, nhưng phần tương ứng sẽ thiếu khi hoàn thiện."];

    /// <summary>
    /// Danh sách phụ kiện hợp lệ cho một nút = mọi <c>fittingRules</c> của ĐÚNG hệ đó (giữ nguyên
    /// thứ tự khai trong rule pack) + mục "bỏ qua nút này" ở cuối. Nút chưa gán hệ thì chỉ còn mục
    /// bỏ qua: không có hệ thì không có bảng luật nào để tra, không được lấy đại của hệ khác.
    /// </summary>
    public static IReadOnlyList<LuaChonPhuKien> LuaChonHopLe(CompletionPolicySection cp, string? heId)
    {
        var ra = new List<LuaChonPhuKien>();
        if (!string.IsNullOrWhiteSpace(heId))
        {
            ra.AddRange(cp.FittingRules
                .Where(r => string.Equals(r.SystemId, heId, StringComparison.Ordinal))
                .Select(r => new LuaChonPhuKien(r)));
        }
        ra.Add(LuaChonPhuKien.BoQua);
        return ra;
    }
}
