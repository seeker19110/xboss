using System.Globalization;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>Phạm vi chia đốt (M105 §6) — dùng chung cho hộp thoại và đường hỏi đáp dòng lệnh.</summary>
public enum PhamViChiaDot
{
    /// <summary>Kỹ sư tự chọn các tuyến cần chia trên bản vẽ (sau khi đóng hộp thoại).</summary>
    ChonTay,

    /// <summary>Quét mọi tuyến của một hệ trong bản vẽ.</summary>
    CaHe,
}

/// <summary>
/// Một tuyến ứng viên chia đốt, đã đọc xong khỏi bản vẽ — dạng THUẦN để Core tính xem trước mà
/// không cần AutoCAD. Adapter dựng danh sách này trong transaction CHỈ ĐỌC rồi mới mở hộp thoại.
/// </summary>
public sealed record TuyenChiaDot(
    string Handle,
    string HeId,
    string ItemId,
    string TenLoaiTuyen,
    string Size,
    bool SizeTuNhap,
    string SizeKind,
    int RunIndex,
    JointRules Rules,
    IReadOnlyList<DoanTim> Doan);

/// <summary>Một mục trong combo kiểu nối; <see cref="JointType"/> null = để rule pack tự chọn theo cỡ.</summary>
public sealed record MucKieuNoi(string? JointType, string Nhan);

/// <summary>Một hệ có tuyến trong bản vẽ (mục combo khi chọn phạm vi "cả hệ").</summary>
public sealed record MucHeChiaDot(string Id, string Nhan, int SoTuyen);

/// <summary>Tham số một lần chạy <c>XBOSS_VE_CHIADOT</c>.</summary>
public sealed record KetQuaHoiChiaDot(PhamViChiaDot PhamVi, string? HeId, string? KieuNoi);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_CHIADOT</c> (M106 §7.2, AC4): phạm vi + kiểu nối + <b>xem trước
/// số đốt và chiều dài từng đốt</b> trước khi bấm OK.
///
/// Xem trước gọi THẲNG <see cref="JointSegmenter.ChiaTuyen"/> trên chiều dài tuyến Adapter đã đọc —
/// đúng engine mà lệnh dùng để vẽ, nên con số trên hộp thoại và con số vẽ ra bản vẽ không thể lệch
/// nhau. Đổi kiểu nối là tính lại ngay (FR6).
///
/// Giữ nguyên luật M105 AC10: tuyến mà rule pack không khai <c>jointRules</c> KHÔNG có mặt trong
/// danh sách ứng viên (Adapter lọc trước), và tuyến chia lỗi (cỡ lạ / bảng selection không phủ) chỉ
/// làm hiện LÝ DO, không làm hỏng cả hộp thoại.
/// </summary>
public sealed class ChiaDotDialogViewModel : DialogViewModelBase
{
    /// <summary>Số dòng xem trước hiện tối đa — dài hơn thì gộp phần đuôi thành một dòng đếm.</summary>
    private const int SoDongXemTruocToiDa = 12;

    private readonly IReadOnlyList<TuyenChiaDot> _tatCaTuyen;
    private readonly IReadOnlyList<DrawSystem> _he;
    private readonly IReadOnlyList<MucHeChiaDot> _cacHe;

    private PhamViChiaDot _phamVi;
    private string? _heId;
    private string? _kieuNoi;

    // Danh mục combo giữ trong TRƯỜNG, không dựng lại mỗi lần getter được gọi: ComboBox của WPF so
    // sánh SelectedItem theo tham chiếu danh sách nguồn, dựng lại liên tục là mất lựa chọn.
    private IReadOnlyList<TuyenChiaDot> _tuyenTrongPhamVi = [];
    private IReadOnlyList<MucKieuNoi> _cacKieuNoi = [];

    private IReadOnlyList<string> _dongXemTruoc = [];
    private IReadOnlyList<string> _lyDoBoQua = [];
    private IReadOnlyList<string> _canhBaoNghiepVu = [];
    private int _tongDot;
    private int _tongMoiNoi;

    /// <param name="tuyenTrongBanVe">Mọi tuyến chia đốt được trong bản vẽ (Adapter đọc trước).</param>
    /// <param name="he">Danh mục hệ của rule pack — chỉ để lấy tên tiếng Việt cho combo.</param>
    public ChiaDotDialogViewModel(
        IReadOnlyList<TuyenChiaDot> tuyenTrongBanVe, IReadOnlyList<DrawSystem> he)
    {
        _tatCaTuyen = tuyenTrongBanVe;
        _he = he;
        _cacHe = tuyenTrongBanVe
            .GroupBy(t => t.HeId, StringComparer.Ordinal)
            .Select(g => new MucHeChiaDot(g.Key, $"{TenHe(g.Key)} — {g.Count()} tuyến", g.Count()))
            .OrderBy(m => m.Id, StringComparer.Ordinal)
            .ToList();
        _heId = _cacHe.FirstOrDefault()?.Id;
        TinhLai();
    }

    public override string TieuDe => "XBOSS_VE_CHIADOT — Chia đốt";

    public override string MoTa =>
        "Chọn phạm vi và kiểu nối; số đốt bên dưới là kết quả engine sẽ vẽ ra bản vẽ.";

    // ===== Phạm vi =====

    public PhamViChiaDot PhamVi
    {
        get => _phamVi;
        set
        {
            if (!Dat(ref _phamVi, value)) return;
            Bao(nameof(ChonCaHe), nameof(ChonTay));
            TinhLai();
        }
    }

    /// <summary>Radio "cả hệ" (bind hai chiều — combo hệ chỉ bật khi bật cái này).</summary>
    public bool ChonCaHe
    {
        get => _phamVi == PhamViChiaDot.CaHe;
        set
        {
            if (value) PhamVi = PhamViChiaDot.CaHe;
        }
    }

    /// <summary>Radio "chọn tay trên bản vẽ".</summary>
    public bool ChonTay
    {
        get => _phamVi == PhamViChiaDot.ChonTay;
        set
        {
            if (value) PhamVi = PhamViChiaDot.ChonTay;
        }
    }

    /// <summary>Các hệ CÓ tuyến chia đốt được trong bản vẽ (không liệt hệ rỗng cho đỡ chọn nhầm).</summary>
    public IReadOnlyList<MucHeChiaDot> CacHe => _cacHe;

    public string? HeId
    {
        get => _heId;
        set
        {
            if (!Dat(ref _heId, value)) return;
            TinhLai();
        }
    }

    /// <summary>Các tuyến sẽ được chia theo phạm vi đang chọn.</summary>
    public IReadOnlyList<TuyenChiaDot> TuyenTrongPhamVi => _tuyenTrongPhamVi;

    /// <summary>Ghi chú dưới vùng xem trước — nói thật xem trước đang tính trên tập nào.</summary>
    public string GhiChuPhamVi =>
        _phamVi == PhamViChiaDot.ChonTay
            ? $"Xem trước tính trên toàn bộ {_tatCaTuyen.Count} tuyến trong bản vẽ. Bấm OK rồi chọn " +
              "tuyến trên bản vẽ — kết quả thật chỉ gồm tuyến bạn chọn."
            : $"Xem trước tính đúng {TuyenTrongPhamVi.Count} tuyến của hệ đang chọn.";

    // ===== Kiểu nối =====

    /// <summary>
    /// Danh mục kiểu nối để ghi đè. Chỉ mở khi mọi tuyến trong phạm vi thuộc CÙNG một loại tuyến —
    /// mỗi loại tuyến khai một bảng <c>selection</c> riêng, gộp nhiều loại vào một combo là mời kỹ
    /// sư chọn kiểu không tồn tại ở tuyến kia (đúng luật của <c>HoiGhiDeKieuNoi</c> dòng lệnh).
    /// </summary>
    public IReadOnlyList<MucKieuNoi> CacKieuNoi => _cacKieuNoi;

    /// <summary>Kiểu nối kỹ sư ghi đè; null = để rule pack tự chọn theo cỡ (mặc định — M105 FR1).</summary>
    public string? KieuNoi
    {
        get => _kieuNoi;
        set
        {
            if (!Dat(ref _kieuNoi, value)) return;
            Bao(nameof(MucKieuNoiChon));
            TinhLai();
        }
    }

    /// <summary>Mục combo đang chọn (bind <c>SelectedItem</c> — an toàn hơn SelectedValue với null).</summary>
    public MucKieuNoi? MucKieuNoiChon
    {
        get => _cacKieuNoi.FirstOrDefault(m => string.Equals(m.JointType, _kieuNoi, StringComparison.Ordinal));
        set => KieuNoi = value?.JointType;
    }

    /// <summary>Mục combo hệ đang chọn (bind <c>SelectedItem</c>).</summary>
    public MucHeChiaDot? MucHeChon
    {
        get => _cacHe.FirstOrDefault(m => string.Equals(m.Id, _heId, StringComparison.Ordinal));
        set => HeId = value?.Id;
    }

    /// <summary>Combo kiểu nối có bật được không (phạm vi đang gồm nhiều loại tuyến thì không).</summary>
    public bool ChoGhiDeKieuNoi => MotLoaiTuyen is not null;

    /// <summary>Kiểu nối engine TỰ CHỌN cho phạm vi hiện tại; null = nhiều kiểu khác nhau/không đọc được.</summary>
    public string? KieuNoiTuDong
    {
        get
        {
            var kieu = TuyenTrongPhamVi
                .Select(KieuTuDongCua)
                .Distinct(StringComparer.Ordinal)
                .ToList();
            return kieu.Count == 1 ? kieu[0] : null;
        }
    }

    public string MoTaKieuNoi =>
        !ChoGhiDeKieuNoi
            ? $"Phạm vi đang gồm {SoLoaiTuyen} loại tuyến khác nhau — kiểu nối để engine TỰ CHỌN theo cỡ. " +
              "Muốn ghi đè tay thì chạy lệnh cho từng loại tuyến."
            : KieuNoiTuDong is { Length: > 0 } k
                ? $"Engine tự chọn: {k} (theo cỡ tuyến trong bảng selection của rule pack)."
                : "Các tuyến trong phạm vi có cỡ khác nhau nên kiểu nối tự chọn cũng khác nhau.";

    // ===== Xem trước (AC4) =====

    /// <summary>Mỗi dòng một tuyến: kiểu nối · số đốt/mối · chiều dài từng đốt.</summary>
    public IReadOnlyList<string> DongXemTruoc => _dongXemTruoc;

    public string TomTatXemTruoc =>
        _tongDot == 0
            ? "Chưa có tuyến nào chia được trong phạm vi đang chọn."
            : $"Dự kiến: {_tongDot} đốt / {_tongMoiNoi} mối nối trên {SoTuyenChiaDuoc} tuyến.";

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_tatCaTuyen.Count == 0)
        {
            loi.Add(
                "Bản vẽ không có tuyến nào chia đốt được — tuyến phải do XBOSS_VE vẽ (có XData) và " +
                "loại tuyến phải khai jointRules trong rule pack.");
            return loi;
        }
        if (_phamVi == PhamViChiaDot.CaHe)
        {
            if (string.IsNullOrWhiteSpace(_heId))
            {
                loi.Add("Chưa chọn hệ cần chia đốt.");
                return loi;
            }
            if (TuyenTrongPhamVi.Count == 0)
            {
                loi.Add($"Hệ {TenHe(_heId)} chưa có tuyến nào do XBOSS_VE vẽ trong bản vẽ này.");
                return loi;
            }
        }
        if (SoTuyenChiaDuoc == 0)
        {
            loi.Add("Không tuyến nào trong phạm vi chia được — xem lý do bên dưới.");
            loi.AddRange(_lyDoBoQua.Take(2));
        }
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao()
    {
        var canhBao = new List<string>();
        if (SoTuyenChiaDuoc > 0 && _lyDoBoQua.Count > 0)
        {
            canhBao.Add($"Bỏ qua {_lyDoBoQua.Count} tuyến: {_lyDoBoQua[0]}");
        }
        canhBao.AddRange(_canhBaoNghiepVu);
        var soTuNhap = TuyenTrongPhamVi.Count(t => t.SizeTuNhap);
        if (soTuNhap > 0)
        {
            canhBao.Add(
                $"{soTuNhap} tuyến mang size NGOÀI danh mục rule pack — vẫn chia vì đọc được cỡ, " +
                "soát lại tham số kiểu nối trước khi đặt gia công.");
        }
        return canhBao;
    }

    /// <summary>Tham số để lệnh chạy; null khi form chưa hợp lệ.</summary>
    public KetQuaHoiChiaDot? KetQua() =>
        CoTheOk
            ? new KetQuaHoiChiaDot(
                _phamVi,
                _phamVi == PhamViChiaDot.CaHe ? _heId : null,
                ChoGhiDeKieuNoi ? _kieuNoi : null)
            : null;

    // ===== Nội bộ =====

    private int SoTuyenChiaDuoc { get; set; }

    private int SoLoaiTuyen =>
        TuyenTrongPhamVi.Select(t => t.ItemId).Distinct(StringComparer.Ordinal).Count();

    /// <summary>Tuyến đại diện khi cả phạm vi chỉ có MỘT loại tuyến; null = nhiều loại/rỗng.</summary>
    private TuyenChiaDot? MotLoaiTuyen =>
        SoLoaiTuyen == 1 ? TuyenTrongPhamVi[0] : null;

    private string TenHe(string? id) =>
        _he.FirstOrDefault(s => string.Equals(s.Id, id, StringComparison.Ordinal)) is { } s
            ? $"{s.Id} — {s.Name}"
            : id ?? "";

    /// <summary>Kiểu nối engine tự chọn cho một tuyến; chuỗi rỗng khi không đọc được cỡ.</summary>
    private static string KieuTuDongCua(TuyenChiaDot t)
    {
        try
        {
            return JointSegmenter.ChonKieuNoi(
                t.Size, JointRulesConfig.DocKieuCo(t.SizeKind), t.Rules.Selection)?.JointType ?? "";
        }
        catch (RulePackException)
        {
            return "";
        }
    }

    /// <summary>Lọc phạm vi → dựng danh mục kiểu nối → tính xem trước → báo giao diện → kiểm.</summary>
    private void TinhLai()
    {
        _tuyenTrongPhamVi = _phamVi == PhamViChiaDot.CaHe
            ? _tatCaTuyen.Where(t => string.Equals(t.HeId, _heId, StringComparison.Ordinal)).ToList()
            : _tatCaTuyen;
        _cacKieuNoi = DungCacKieuNoi();

        // Ghi đè kiểu nối không còn hợp lệ sau khi đổi phạm vi (loại tuyến khác không khai kiểu đó)
        // → về TỰ ĐỘNG, thay vì để engine ném lỗi lúc vẽ.
        if (_kieuNoi is { Length: > 0 } k && _cacKieuNoi.All(m => m.JointType != k)) _kieuNoi = null;

        XemTruocLai();
        Bao(
            nameof(TuyenTrongPhamVi), nameof(GhiChuPhamVi), nameof(CacKieuNoi), nameof(KieuNoi),
            nameof(MucKieuNoiChon), nameof(MucHeChon), nameof(ChoGhiDeKieuNoi), nameof(KieuNoiTuDong),
            nameof(MoTaKieuNoi), nameof(DongXemTruoc), nameof(TomTatXemTruoc));
        KiemLai();
    }

    /// <summary>Danh mục kiểu nối cho combo: mục TỰ ĐỘNG + các kiểu loại tuyến này khai.</summary>
    private List<MucKieuNoi> DungCacKieuNoi()
    {
        var muc = new List<MucKieuNoi> { new(null, "TỰ ĐỘNG theo cỡ tuyến (khuyến nghị)") };
        if (MotLoaiTuyen is not { } mau) return muc;
        var da = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in mau.Rules.Selection)
        {
            if (!da.Add(row.JointType)) continue;
            muc.Add(new MucKieuNoi(
                row.JointType,
                $"{row.JointType} (đốt ≤ {So(row.MaxLenMm)}mm, khe {So(row.JointGapMm)}mm)"));
        }
        return muc;
    }

    /// <summary>Chạy engine chia đốt thật cho từng tuyến trong phạm vi (AC4).</summary>
    private void XemTruocLai()
    {
        var dong = new List<string>();
        var boQua = new List<string>();
        var canhBao = new List<string>();
        var tongDot = 0;
        var tongMoi = 0;
        var chiaDuoc = 0;

        foreach (var t in TuyenTrongPhamVi)
        {
            KetQuaChiaDot kq;
            try
            {
                kq = JointSegmenter.ChiaTuyen(new YeuCauChiaDot
                {
                    SystemId = t.HeId,
                    ItemId = t.ItemId,
                    Size = t.Size,
                    SizeKind = t.SizeKind,
                    RunIndex = t.RunIndex,
                    OverrideJointType = _kieuNoi,
                    Rules = t.Rules,
                    Segments = t.Doan,
                });
            }
            catch (RulePackException e)
            {
                // Cỡ không đọc được / bảng selection không phủ cỡ / ghi đè kiểu tuyến không khai —
                // bỏ qua ĐÚNG tuyến đó, các tuyến còn lại vẫn xem trước bình thường (M105 AC10).
                boQua.Add($"{t.ItemId} {t.Size} (handle {t.Handle}): {e.Message}");
                continue;
            }

            chiaDuoc += 1;
            tongDot += kq.PieceCount;
            tongMoi += kq.JointCount;
            if (dong.Count < SoDongXemTruocToiDa)
            {
                var ghiDe = kq.Overridden ? " (ghi đè tay)" : "";
                dong.Add(
                    $"{t.ItemId} {t.Size} (handle {t.Handle}): {kq.JointType}{ghiDe} · " +
                    $"{kq.PieceCount} đốt / {kq.JointCount} mối · " +
                    $"{string.Join(" / ", kq.Pieces.Select(p => So(p.LengthMm)))} mm");
            }
            foreach (var c in kq.Warnings)
            {
                var nhan = JointSegmenter.NhanCanhBao[c];
                if (!canhBao.Contains(nhan, StringComparer.Ordinal)) canhBao.Add(nhan);
            }
        }

        if (chiaDuoc > dong.Count && dong.Count == SoDongXemTruocToiDa)
            dong.Add($"… và {chiaDuoc - SoDongXemTruocToiDa} tuyến nữa.");

        _dongXemTruoc = dong;
        _lyDoBoQua = boQua;
        _canhBaoNghiepVu = canhBao;
        _tongDot = tongDot;
        _tongMoiNoi = tongMoi;
        SoTuyenChiaDuoc = chiaDuoc;
    }

    private static string So(double v) => v.ToString("#,##0.#", CultureInfo.InvariantCulture);
}
