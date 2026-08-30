using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_DEXUAT</c> (M106 AC8) — bản WPF của
/// <c>DeXuatBlockDialog</c> (WinForms, M103).
///
/// <b>Giữ nguyên mọi trường và quy tắc</b>: tên block · loại (5 kind) · hệ (từ
/// <c>layerMap.groups</c>) · item bóc tách (<c>takeoff.items</c> measure=count) · khổ giấy (chỉ
/// khung tên) · ghi chú; luật bật/tắt ô và lý do khóa nút Gửi vẫn do <see cref="BlockDeXuatRules"/>
/// ở Core quyết — cùng bộ quy tắc server kiểm, nên hộp thoại không bao giờ cho gửi thứ server sẽ
/// trả 422. Khác duy nhất so với M103: trạng thái đã dời khỏi lớp Form nên CI kiểm được bằng test.
/// </summary>
public sealed class DeXuatBlockDialogViewModel : DialogViewModelBase
{
    private readonly IReadOnlyList<string> _tenBlockDaCo;

    private string _tenBlock;
    private BlockKind _loai = BlockDeXuatRules.CacLoai[0];
    private MucChon<string>? _he;
    private MucChon<string>? _item;
    private string _khoGiay = "";
    private string _ghiChu = "";

    /// <param name="tenMacDinh">Tên định nghĩa block đang chọn trong bản vẽ.</param>
    /// <param name="tenBlockDaCo">Tên block đã có trong thư viện hiện hành (chặn trùng ngay tại đây).</param>
    /// <param name="he">Danh mục hệ từ <c>layerMap.groups</c>.</param>
    /// <param name="heDoan">Hệ đoán sẵn theo layer của khối.</param>
    /// <param name="item">Danh mục item bóc tách đếm được.</param>
    /// <param name="itemDoan">Item đoán sẵn theo tên block.</param>
    /// <param name="khoGiay">Danh mục <c>sheetSetup.paperSizes</c>.</param>
    public DeXuatBlockDialogViewModel(
        string tenMacDinh,
        IReadOnlyList<string> tenBlockDaCo,
        IReadOnlyList<MucChon<string>> he,
        string? heDoan,
        IReadOnlyList<MucChon<string>> item,
        string? itemDoan,
        IReadOnlyList<string> khoGiay)
    {
        _tenBlockDaCo = tenBlockDaCo;
        _tenBlock = (tenMacDinh ?? "").Trim();
        CacHe = he;
        CacItem = item;
        CacKhoGiay = khoGiay;
        _he = he.FirstOrDefault(m => string.Equals(m.GiaTri, heDoan, StringComparison.Ordinal));
        _item = item.FirstOrDefault(m => string.Equals(m.GiaTri, itemDoan, StringComparison.Ordinal));
        KiemLai();
    }

    public override string TieuDe => "XBOSS_VE_DEXUAT — Đề xuất block vào thư viện";

    public override string MoTa =>
        "Điền metadata rồi bấm OK để đưa block vào hàng chờ duyệt (Admin/PM duyệt trên web). " +
        "Thư viện CHƯA đổi cho tới khi được duyệt.";

    // ===== Tên block =====

    public string TenBlock
    {
        get => _tenBlock;
        set
        {
            if (!Dat(ref _tenBlock, (value ?? "").Trim())) return;
            KiemLai();
        }
    }

    // ===== Loại block =====

    public IReadOnlyList<MucChon<BlockKind>> CacLoai { get; } =
        BlockDeXuatRules.CacLoai.Select(k => new MucChon<BlockKind>(k, BlockDeXuatRules.Nhan(k))).ToList();

    public MucChon<BlockKind>? MucLoaiChon
    {
        get => CacLoai.FirstOrDefault(m => m.GiaTri == _loai);
        set
        {
            if (value is null) return;
            if (!Dat(ref _loai, value.GiaTri, nameof(MucLoaiChon))) return;
            // Ô nào không còn nghĩa với loại mới thì XÓA, đúng như CapNhat() của bản WinForms —
            // để trống nửa vời là lý do khóa nút Gửi ("khung tên không thuộc hệ nào").
            if (!CanHe) _he = null;
            if (!CanItem) _item = null;
            if (!CanKhoGiay) _khoGiay = "";
            Bao(nameof(CanHe), nameof(CanItem), nameof(CanKhoGiay), nameof(MucHeChon), nameof(MucItemChon),
                nameof(KhoGiay));
            KiemLai();
        }
    }

    /// <summary>Loại block cần khai hệ không (mọi loại trừ khung tên).</summary>
    public bool CanHe => BlockDeXuatRules.CanHe(_loai);

    /// <summary>Loại block cần khai item bóc tách không.</summary>
    public bool CanItem => BlockDeXuatRules.CanItemBocTach(_loai);

    /// <summary>Khổ giấy CHỈ có nghĩa với khung tên — ẩn hẳn với loại khác.</summary>
    public bool CanKhoGiay => BlockDeXuatRules.CanKhoGiay(_loai);

    // ===== Hệ / item / khổ giấy / ghi chú =====

    public IReadOnlyList<MucChon<string>> CacHe { get; }

    public MucChon<string>? MucHeChon
    {
        get => _he;
        set
        {
            if (!Dat(ref _he, value)) return;
            KiemLai();
        }
    }

    public IReadOnlyList<MucChon<string>> CacItem { get; }

    public MucChon<string>? MucItemChon
    {
        get => _item;
        set
        {
            if (!Dat(ref _item, value)) return;
            KiemLai();
        }
    }

    public IReadOnlyList<string> CacKhoGiay { get; }

    public string KhoGiay
    {
        get => _khoGiay;
        set
        {
            if (!Dat(ref _khoGiay, (value ?? "").Trim())) return;
            KiemLai();
        }
    }

    public string GhiChu
    {
        get => _ghiChu;
        set
        {
            if (!Dat(ref _ghiChu, value ?? "")) return;
            KiemLai();
        }
    }

    /// <summary>Metadata theo đúng những gì đang hiện trên form (dùng cho cả kiểm lẫn kết quả).</summary>
    public BlockDeXuat Meta() => new()
    {
        BlockName = _tenBlock,
        Kind = _loai,
        SystemId = CanHe ? _he?.GiaTri : null,
        TakeoffItemId = CanItem ? _item?.GiaTri : null,
        PaperSize = CanKhoGiay && _khoGiay.Length > 0 ? _khoGiay : null,
        Note = _ghiChu.Trim(),
    };

    /// <summary>Metadata để lệnh gửi; null khi form chưa hợp lệ.</summary>
    public BlockDeXuat? KetQua() => CoTheOk ? Meta() : null;

    protected override IReadOnlyList<string> Kiem() => BlockDeXuatRules.Kiem(Meta(), _tenBlockDaCo);
}
