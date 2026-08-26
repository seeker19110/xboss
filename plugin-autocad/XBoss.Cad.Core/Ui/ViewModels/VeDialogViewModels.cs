using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Ui.ViewModels;

// ===================================================================================
// XBOSS_VE_NEN
// ===================================================================================

/// <summary>Tham số <c>XBOSS_VE_NEN</c> — đúng câu hỏi duy nhất của dòng lệnh: hệ sắp vẽ.</summary>
public sealed record KetQuaVeNen(DrawSystem He);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_NEN</c> (M106 §7.2).
///
/// <b>Lệch có chủ đích với bảng §7.2</b>: bảng ghi "mức làm mờ nền, có khóa layer nền không".
/// Lệnh THẬT không hỏi hai thứ đó: mức làm mờ lấy từ <c>drawTools.baseFadePct</c> của rule pack, và
/// khóa layer nền là bắt buộc (không khóa thì vẽ đè lên nền là chuyện thường). Cho sửa hai giá trị
/// này là mở bậc tự do mà đường dòng lệnh không có (§2.4) — hiện CHỈ ĐỌC theo FR6.
/// </summary>
public sealed class VeNenDialogViewModel : DialogViewModelBase
{
    private readonly IReadOnlyList<DrawSystem> _cacHe;
    private readonly int _fadePct;
    private DrawSystem? _he;

    /// <param name="cacHe">Danh mục hệ của rule pack.</param>
    /// <param name="fadePct">Mức làm mờ nền theo rule pack (chỉ hiển thị).</param>
    /// <param name="heId">Hệ đang vẽ của phiên; null = lấy hệ đầu danh mục.</param>
    public VeNenDialogViewModel(IReadOnlyList<DrawSystem> cacHe, int fadePct, string? heId = null)
    {
        _cacHe = cacHe;
        _fadePct = fadePct;
        _he = cacHe.FirstOrDefault(s => string.Equals(s.Id, heId, StringComparison.Ordinal)) ?? cacHe.FirstOrDefault();
        KiemLai();
    }

    public override string TieuDe => "XBOSS_VE_NEN — Chuẩn bị nền để vẽ";

    public override string MoTa =>
        "Chọn hệ sắp vẽ; lệnh sẽ khóa + làm mờ nền và tạo sẵn layer đích của hệ đó.";

    public IReadOnlyList<DrawSystem> CacHe => _cacHe;

    public DrawSystem? He
    {
        get => _he;
        set
        {
            if (!Dat(ref _he, value)) return;
            Bao(nameof(MoTaViecSeLam));
            KiemLai();
        }
    }

    /// <summary>Việc lệnh sẽ làm với hệ đang chọn — CHỈ ĐỌC (FR6).</summary>
    public string MoTaViecSeLam =>
        _he is not { } he
            ? "Chưa chọn hệ."
            : $"Khóa + làm mờ {_fadePct}% mọi layer nền (đối tượng nền KHÔNG bị sửa) và tạo sẵn " +
              $"{he.Lines.Count} layer đích của hệ {he.Name}. Chạy lại lệnh để hoàn nguyên.";

    public KetQuaVeNen? KetQua() => CoTheOk && _he is { } he ? new KetQuaVeNen(he) : null;

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_cacHe.Count == 0)
            loi.Add("Rule pack không khai hệ nào (drawTools.systems rỗng) — nạp lại rule pack có khối drawTools.");
        else if (_he is null) loi.Add("Chưa chọn hệ.");
        return loi;
    }
}

// ===================================================================================
// XBOSS_VE_NHAN
// ===================================================================================

/// <summary>Tham số <c>XBOSS_VE_NHAN</c> — đúng câu hỏi duy nhất của dòng lệnh: tỉ lệ in 1:x.</summary>
public sealed record KetQuaVeNhan(double TiLeIn);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_NHAN</c> (M106 §7.2).
///
/// <b>Lệch có chủ đích với bảng §7.2</b>: bảng ghi "nội dung nhãn (size/độ dốc/cả hai), cao chữ,
/// phía đặt". Lệnh THẬT không hỏi thứ nào trong đó — nội dung nhãn lấy từ XData của tuyến
/// (M100 FR7: "không gõ tay"), chiều cao chữ = <c>labelStyle.textHeightMm</c> × tỉ lệ in, phía đặt
/// bám điểm bấm trên tim. Câu hỏi thật duy nhất là TỈ LỆ IN của phiên, và đây là chỗ đưa nó vào
/// hộp thoại (việc hẹn ở PR1) để lệnh vẽ đầu tiên của phiên cũng chạy trọn bằng chuột.
/// </summary>
public sealed class VeNhanDialogViewModel : DialogViewModelBase
{
    private readonly IReadOnlyList<double> _scales;
    private readonly double _caoChuMm;
    private readonly bool _daNhoTiLe;
    private string _tiLe;

    /// <param name="scales">Danh mục <c>sheetSetup.scales</c>.</param>
    /// <param name="caoChuMm">Chiều cao chữ nhãn TRÊN GIẤY (<c>labelStyle.textHeightMm</c>).</param>
    /// <param name="tiLeCuaPhien">Tỉ lệ đang dùng của phiên (<c>VeContext.TiLeIn</c>); null = chưa hỏi lần nào.</param>
    public VeNhanDialogViewModel(IReadOnlyList<double> scales, double caoChuMm, double? tiLeCuaPhien)
    {
        _scales = scales;
        _caoChuMm = caoChuMm;
        _daNhoTiLe = tiLeCuaPhien is > 0;
        _tiLe = TiLeInDialog.MacDinh(scales, tiLeCuaPhien);
        KiemLai();
    }

    public override string TieuDe => "XBOSS_VE_NHAN — Ghi nhãn tuyến";

    public override string MoTa =>
        "Nội dung nhãn lấy từ XData của tuyến; chỉ cần xác nhận tỉ lệ in để quy đổi chiều cao chữ.";

    public IReadOnlyList<string> CacTiLe => TiLeInDialog.DanhMuc(_scales);

    /// <summary>Tỉ lệ in 1:x — dùng CHUNG cho cả phiên (FR4), không tạo cơ chế nhớ thứ hai.</summary>
    public string TiLe
    {
        get => _tiLe;
        set
        {
            if (!Dat(ref _tiLe, (value ?? "").Trim())) return;
            Bao(nameof(MoTaCaoChu));
            KiemLai();
        }
    }

    /// <summary>Chiều cao chữ suy ra từ tỉ lệ — CHỈ ĐỌC (FR6).</summary>
    public string MoTaCaoChu =>
        TiLeInDialog.PhanTich(_tiLe) is { } tl
            ? $"Chữ nhãn cao {TiLeInDialog.So(_caoChuMm)}mm trên giấy ⇒ " +
              $"{TiLeInDialog.So(_caoChuMm * tl)}mm trong mô hình ở tỉ lệ 1:{TiLeInDialog.So(tl)}." +
              (_daNhoTiLe ? " Đổi ở đây là đổi cho cả phiên (trang in, mặt cắt dùng chung giá trị này)." : "")
            : "Nhập tỉ lệ để biết chiều cao chữ trong mô hình.";

    public KetQuaVeNhan? KetQua() =>
        CoTheOk && TiLeInDialog.PhanTich(_tiLe) is { } tl ? new KetQuaVeNhan(tl) : null;

    protected override IReadOnlyList<string> Kiem() =>
        TiLeInDialog.LyDo(_tiLe) is { } l ? [l] : [];

    protected override IReadOnlyList<string> KiemCanhBao() =>
        TiLeInDialog.CanhBao(_scales, _tiLe) is { } c ? [c] : [];
}

// ===================================================================================
// XBOSS_VE_DOI
// ===================================================================================

/// <summary>Tham số <c>XBOSS_VE_DOI</c> — hệ/loại tuyến/size/độ dốc MỚI cho các tuyến đã chọn.</summary>
public sealed record KetQuaVeDoi(DrawSystem He, DrawLine Tuyen, string Size, bool SizeTuNhap, string? DoDoc);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_DOI</c> (M106 §7.2): hệ/loại tuyến/size/độ dốc mới trong một
/// form, kèm CẢNH BÁO hệ quả (gỡ dấu bóc, xóa vạch chia đốt, block đang bám) ở dạng CHỈ ĐỌC — hộp
/// thoại đóng luôn vai câu hỏi xác nhận <c>DongY/Huy</c> của đường dòng lệnh.
///
/// Tuyến đã chọn trên bản vẽ TRƯỚC khi mở hộp thoại (đúng thứ tự của lệnh), nên các con số hệ quả
/// là số thật, không phải ước lượng.
/// </summary>
public sealed class VeDoiDialogViewModel : DialogViewModelBase
{
    private readonly IReadOnlyList<DrawSystem> _cacHe;
    private readonly IReadOnlyList<string> _cacDoDocRulePack;
    private readonly int _soTuyen;
    private readonly int _soDaBoc;
    private readonly int _soKhoiBam;
    private readonly IReadOnlyList<string> _tomTatDangChon;

    private DrawSystem? _he;
    private DrawLine? _tuyen;
    private string _size = "";
    private string _doDoc = "";

    /// <param name="cacHe">Danh mục hệ của rule pack.</param>
    /// <param name="cacDoDoc">Danh mục <c>sheetSetup.slopes</c>.</param>
    /// <param name="tomTatDangChon">Mỗi dòng một nhóm "hệ/loại size: n tuyến" đang chọn (chỉ đọc).</param>
    /// <param name="soTuyen">Tổng số tuyến tim đang chọn.</param>
    /// <param name="soDaBoc">Bao nhiêu tuyến trong đó đã đánh dấu bóc khối lượng.</param>
    /// <param name="soKhoiBam">Bao nhiêu block đang bám các tuyến đó.</param>
    /// <param name="sizeCu">Size hiện tại của tuyến đầu (mặc định nếu còn trong danh mục loại mới).</param>
    /// <param name="doDocCu">Độ dốc hiện tại của tuyến đầu.</param>
    public VeDoiDialogViewModel(
        IReadOnlyList<DrawSystem> cacHe,
        IReadOnlyList<string> cacDoDoc,
        IReadOnlyList<string> tomTatDangChon,
        int soTuyen,
        int soDaBoc,
        int soKhoiBam,
        string? sizeCu = null,
        string? doDocCu = null)
    {
        _cacHe = cacHe;
        _cacDoDocRulePack = cacDoDoc;
        _tomTatDangChon = tomTatDangChon;
        _soTuyen = soTuyen;
        _soDaBoc = soDaBoc;
        _soKhoiBam = soKhoiBam;

        _he = cacHe.FirstOrDefault();
        _tuyen = CacLoaiTuyen.FirstOrDefault();
        // Giữ size cũ nếu loại tuyến mới cũng khai size đó (đúng mặc định của đường dòng lệnh).
        _size = sizeCu is { Length: > 0 } s && CacSize.Contains(s, StringComparer.OrdinalIgnoreCase)
            ? s
            : CacSize.FirstOrDefault() ?? "";
        _doDoc = CanDoDoc ? (doDocCu ?? CacDoDoc.FirstOrDefault() ?? "") : "";
        KiemLai();
    }

    public override string TieuDe => "XBOSS_VE_DOI — Đổi hệ/loại/size tuyến đã vẽ";

    public override string MoTa =>
        $"Đổi {_soTuyen} tuyến tim đang chọn sang hệ/loại/size mới. Hoàn tác cả lệnh: UNDO 1 lần.";

    /// <summary>Các tuyến đang chọn, gom nhóm — CHỈ ĐỌC.</summary>
    public IReadOnlyList<string> TomTatDangChon => _tomTatDangChon;

    // ===== Hệ / loại tuyến / size / độ dốc =====

    public IReadOnlyList<DrawSystem> CacHe => _cacHe;

    public DrawSystem? He
    {
        get => _he;
        set
        {
            if (!Dat(ref _he, value)) return;
            _tuyen = CacLoaiTuyen.FirstOrDefault();
            _size = CacSize.FirstOrDefault() ?? "";
            _doDoc = "";
            Bao(nameof(CacLoaiTuyen), nameof(Tuyen));
            TinhLai();
        }
    }

    public IReadOnlyList<DrawLine> CacLoaiTuyen => _he?.Lines ?? [];

    public DrawLine? Tuyen
    {
        get => _tuyen;
        set
        {
            if (!Dat(ref _tuyen, value)) return;
            _size = CacSize.FirstOrDefault() ?? "";
            _doDoc = CanDoDoc ? (_doDoc.Length > 0 ? _doDoc : CacDoDoc.FirstOrDefault() ?? "") : "";
            TinhLai();
        }
    }

    public IReadOnlyList<string> CacSize => _tuyen?.Sizes ?? [];

    public string Size
    {
        get => _size;
        set
        {
            if (!Dat(ref _size, (value ?? "").Trim())) return;
            TinhLai();
        }
    }

    public bool SizeTuNhap =>
        _size.Length > 0 && !CacSize.Any(s => string.Equals(s, _size, StringComparison.OrdinalIgnoreCase));

    public bool CanDoDoc => _tuyen?.SlopeRequired == true;

    public IReadOnlyList<string> CacDoDoc => _cacDoDocRulePack;

    public string DoDoc
    {
        get => _doDoc;
        set
        {
            if (!Dat(ref _doDoc, (value ?? "").Trim())) return;
            TinhLai();
        }
    }

    /// <summary>Hệ quả của lần đổi này — CHỈ ĐỌC (FR6), chính là các cảnh báo lệnh in ra trước khi hỏi.</summary>
    public IReadOnlyList<string> HeQua
    {
        get
        {
            var ra = new List<string>();
            if (_soDaBoc > 0)
            {
                ra.Add(
                    $"{_soDaBoc} tuyến ĐÃ BÓC KHỐI LƯỢNG — lệnh sẽ gỡ dấu bóc của đúng các tuyến đó; " +
                    "đổi xong PHẢI chạy lại XBOSS_BOCKL.");
            }
            ra.Add("Vạch/tag chia đốt của các tuyến này sẽ bị XÓA (chiều dài đốt phụ thuộc cỡ) — chạy lại XBOSS_VE_CHIADOT.");
            ra.Add("Nét biên cũ bị xóa và dựng lại theo size mới; nhãn liên kết được cập nhật nội dung.");
            if (_soKhoiBam > 0)
            {
                ra.Add(
                    $"{_soKhoiBam} block đang bám các tuyến này (phụ kiện/thiết bị/giá đỡ/lỗ chờ) — lệnh KHÔNG " +
                    "tự đổi tỉ lệ/khoảng cách của chúng theo size mới.");
            }
            return ra;
        }
    }

    public KetQuaVeDoi? KetQua() =>
        CoTheOk && _he is { } he && _tuyen is { } tuyen
            ? new KetQuaVeDoi(he, tuyen, _size, SizeTuNhap, CanDoDoc ? _doDoc : null)
            : null;

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_soTuyen == 0)
        {
            loi.Add("Không có tuyến tim nào trong vùng chọn — chọn tuyến do XBOSS_VE vẽ rồi chạy lại.");
            return loi;
        }
        if (_cacHe.Count == 0)
        {
            loi.Add("Rule pack không khai hệ nào (drawTools.systems rỗng) — nạp lại rule pack có khối drawTools.");
            return loi;
        }
        if (_he is null)
        {
            loi.Add("Chưa chọn hệ mới.");
            return loi;
        }
        if (CacLoaiTuyen.Count == 0)
        {
            loi.Add($"Hệ {_he.Name} ({_he.Id}) không khai loại tuyến nào trong rule pack — chọn hệ khác.");
            return loi;
        }
        if (_tuyen is null) loi.Add("Chưa chọn loại tuyến mới.");
        if (_size.Length == 0)
            loi.Add("Chưa chọn size mới — chọn trong danh mục hoặc gõ size khác vào ô size.");
        if (CanDoDoc && _doDoc.Length == 0)
            loi.Add($"Tuyến {_tuyen?.Name} bắt buộc có độ dốc (rule pack khai slopeRequired).");
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao()
    {
        var canhBao = new List<string>();
        if (SizeTuNhap)
            canhBao.Add($"Size \"{_size}\" ngoài danh mục rule pack — vẫn đổi, XData đánh dấu \"custom\".");
        if (CanDoDoc && _doDoc.Length > 0 &&
            !CacDoDoc.Any(s => string.Equals(s, _doDoc, StringComparison.OrdinalIgnoreCase)))
        {
            canhBao.Add($"Độ dốc \"{_doDoc}\" ngoài danh mục rule pack — kiểm lại trước khi đổi.");
        }
        if (_soDaBoc > 0)
            canhBao.Add($"{_soDaBoc} tuyến đã bóc khối lượng sẽ bị gỡ dấu — nhớ bóc lại sau khi đổi.");
        return canhBao;
    }

    private void TinhLai()
    {
        Bao(
            nameof(CacSize), nameof(Size), nameof(SizeTuNhap), nameof(CanDoDoc), nameof(DoDoc),
            nameof(HeQua));
        KiemLai();
    }
}

// ===================================================================================
// XBOSS_VE_PHUKIEN / XBOSS_VE_THIETBI
// ===================================================================================

/// <summary>
/// Một hệ kèm danh mục block dùng được của nó (Adapter tra manifest thư viện TRƯỚC khi mở hộp
/// thoại — hộp thoại không chạm tệp thư viện, guardrail M106 §2).
/// </summary>
public sealed record HeCoBlock(DrawSystem He, IReadOnlyList<BlockDef> Blocks, IReadOnlyList<string> Thieu);

/// <summary>Tham số một lần chạy <c>XBOSS_VE_PHUKIEN</c> / <c>XBOSS_VE_THIETBI</c>.</summary>
public sealed record KetQuaChonBlock(DrawSystem He, BlockDef Block);

/// <summary>
/// ViewModel dùng chung cho hộp thoại <c>XBOSS_VE_PHUKIEN</c> và <c>XBOSS_VE_THIETBI</c>
/// (M106 §7.2): hệ + block trong một form, thay hai câu hỏi keyword nối tiếp.
///
/// <b>Lệch có chủ đích với bảng §7.2</b>: bảng ghi thêm "cỡ, hướng" (phụ kiện) và "giá trị
/// attribute" (thiết bị). Lệnh THẬT suy cỡ và hướng từ chính tuyến tim được bấm (XData + tiếp
/// tuyến tại điểm bấm), còn attribute thiết bị nhập RIÊNG cho từng lần chèn ngay sau khi bấm điểm
/// — gom lên hộp thoại là gán cùng một TAG cho mọi thiết bị, sai nghiệp vụ. Hai thứ đó nằm ở phần
/// CHỈ ĐỌC (FR6).
/// </summary>
public sealed class ChonBlockDialogViewModel : DialogViewModelBase
{
    private readonly string _lenh;
    private readonly string _nhanLoai;
    private readonly string _thuVienVersion;
    private readonly string _moTaSauOk;
    private readonly IReadOnlyList<HeCoBlock> _cacHe;

    private HeCoBlock? _he;
    private BlockDef? _block;

    /// <param name="lenh">Tên lệnh (vd <c>XBOSS_VE_PHUKIEN</c>) — vào tiêu đề.</param>
    /// <param name="nhanLoai">Nhãn loại block tiếng Việt (vd "phụ kiện", "thiết bị").</param>
    /// <param name="thuVienVersion">Version thư viện block đang dùng.</param>
    /// <param name="moTaSauOk">Việc kỹ sư làm tiếp sau khi bấm OK (chỉ đọc).</param>
    /// <param name="cacHe">Hệ + danh mục block đã tra sẵn.</param>
    /// <param name="heId">Hệ đang vẽ của phiên; null = hệ đầu danh mục.</param>
    /// <param name="blockId">Block chọn lần trước trong phiên.</param>
    public ChonBlockDialogViewModel(
        string lenh,
        string nhanLoai,
        string thuVienVersion,
        string moTaSauOk,
        IReadOnlyList<HeCoBlock> cacHe,
        string? heId = null,
        string? blockId = null)
    {
        _lenh = lenh;
        _nhanLoai = nhanLoai;
        _thuVienVersion = thuVienVersion;
        _moTaSauOk = moTaSauOk;
        _cacHe = cacHe;

        _he = cacHe.FirstOrDefault(h => string.Equals(h.He.Id, heId, StringComparison.Ordinal))
              ?? cacHe.FirstOrDefault();
        _block = CacBlock.FirstOrDefault(b => string.Equals(b.Id, blockId, StringComparison.Ordinal))
                 ?? CacBlock.FirstOrDefault();
        KiemLai();
    }

    public override string TieuDe => $"{_lenh} — Chèn {_nhanLoai}";

    public override string MoTa => $"Chọn hệ và {_nhanLoai} từ thư viện block {_thuVienVersion}.";

    public IReadOnlyList<HeCoBlock> CacHe => _cacHe;

    public HeCoBlock? He
    {
        get => _he;
        set
        {
            if (!Dat(ref _he, value)) return;
            _block = CacBlock.FirstOrDefault();
            Bao(nameof(CacBlock), nameof(Block), nameof(MoTaBlock));
            KiemLai();
        }
    }

    public IReadOnlyList<BlockDef> CacBlock => _he?.Blocks ?? [];

    public BlockDef? Block
    {
        get => _block;
        set
        {
            if (!Dat(ref _block, value)) return;
            Bao(nameof(MoTaBlock));
            KiemLai();
        }
    }

    /// <summary>Thông tin suy ra của block đang chọn + việc làm tiếp — CHỈ ĐỌC (FR6).</summary>
    public string MoTaBlock =>
        _block is not { } b
            ? _moTaSauOk
            : $"{b.BlockName}" +
              (b.ScaleBySize ? " · tỉ lệ chèn tự suy từ size tuyến" : " · tỉ lệ chèn 1") +
              (b.RotateToPath ? " · xoay theo hướng tuyến" : "") +
              (b.Attributes.Count > 0 ? $" · thuộc tính: {string.Join(", ", b.Attributes)}" : "") +
              $". {_moTaSauOk}";

    public KetQuaChonBlock? KetQua() =>
        CoTheOk && _he is { } he && _block is { } block ? new KetQuaChonBlock(he.He, block) : null;

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_cacHe.Count == 0)
        {
            loi.Add(
                $"Không hệ nào có {_nhanLoai} dùng được trong thư viện {_thuVienVersion} — " +
                "phát hành lại thư viện hoặc khai id vào rule pack.");
            return loi;
        }
        if (_he is null)
        {
            loi.Add("Chưa chọn hệ.");
            return loi;
        }
        if (CacBlock.Count == 0)
        {
            loi.Add(
                $"Hệ {_he.He.Name} ({_he.He.Id}) chưa có {_nhanLoai} nào dùng được trong thư viện " +
                $"{_thuVienVersion} — chọn hệ khác.");
            return loi;
        }
        if (_block is null) loi.Add($"Chưa chọn {_nhanLoai}.");
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao() =>
        _he is { Thieu.Count: > 0 } he
            ? [
                $"Thư viện {_thuVienVersion} thiếu {he.Thieu.Count} id rule pack khai cho hệ " +
                $"{he.He.Id}: {string.Join(", ", he.Thieu)} — phát hành lại thư viện.",
              ]
            : [];
}
