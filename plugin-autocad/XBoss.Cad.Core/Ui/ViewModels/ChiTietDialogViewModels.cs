using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Ui.ViewModels;

// ===================================================================================
// XBOSS_VE_GIADO
// ===================================================================================

/// <summary>Tham số một lần chạy <c>XBOSS_VE_GIADO</c> — đúng bộ câu hỏi của đường dòng lệnh.</summary>
public sealed record KetQuaHoiGiaDo(DrawSystem He, BlockDef Block, CheDoChiaGiaDo CheDo, bool TaiMoiPhuKien);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_GIADO</c> (M106 §7.2): hệ + block giá đỡ + cách chia + (chỉ với
/// rule pack cũ) có đặt giá đỡ tại mọi phụ kiện không.
///
/// <b>Lệch có chủ đích với bảng §7.2</b>: bảng ghi "khoảng cách (mặc định theo rule pack)". Lệnh
/// THẬT không hỏi khoảng cách bao giờ — nó tra <c>supportSpacingMm</c> theo ĐÚNG loại tuyến và size
/// của từng tim, và rule pack chưa khai thì BỎ QUA tuyến kèm lý do ("plugin KHÔNG tự bịa khoảng
/// cách treo đỡ"). Cho gõ khoảng cách tay ở hộp thoại là phá đúng chốt an toàn đó (§2.4).
///
/// Câu hỏi "tại phụ kiện nặng" chỉ hiện với rule pack v4–v6 chưa khai
/// <c>drawTools.heavyFittingIds</c> — từ v7 danh sách phụ kiện nặng nằm trong rule pack nên lệnh
/// không hỏi nữa, hộp thoại cũng vậy.
/// </summary>
public sealed class GiaDoDialogViewModel : DialogViewModelBase
{
    private readonly string _thuVienVersion;
    private readonly string _rulePackVersion;
    private readonly IReadOnlyList<HeCoBlock> _cacHe;
    private readonly bool _coKhaiPhuKienNang;
    private readonly IReadOnlyList<string> _phuKienNang;

    private HeCoBlock? _he;
    private BlockDef? _block;
    private CheDoChiaGiaDo _cheDo = CheDoChiaGiaDo.KhongVuot;
    private bool _taiMoiPhuKien = true;

    /// <param name="cacHe">Hệ + danh mục block <c>kind=support</c> (Adapter tra sẵn từ manifest).</param>
    /// <param name="coKhaiPhuKienNang">Rule pack đã khai <c>heavyFittingIds</c> chưa (v7+).</param>
    /// <param name="phuKienNang">Danh sách id phụ kiện nặng khi rule pack đã khai.</param>
    public GiaDoDialogViewModel(
        string thuVienVersion,
        string rulePackVersion,
        IReadOnlyList<HeCoBlock> cacHe,
        bool coKhaiPhuKienNang,
        IReadOnlyList<string> phuKienNang,
        string? heId = null)
    {
        _thuVienVersion = thuVienVersion;
        _rulePackVersion = rulePackVersion;
        _cacHe = cacHe;
        _coKhaiPhuKienNang = coKhaiPhuKienNang;
        _phuKienNang = phuKienNang;

        _he = cacHe.FirstOrDefault(h => string.Equals(h.He.Id, heId, StringComparison.Ordinal))
              ?? cacHe.FirstOrDefault();
        _block = CacBlock.FirstOrDefault();
        // Rule pack v7+ tự biết phụ kiện nào nặng ⇒ lệnh KHÔNG đặt giá đỡ ở mọi phụ kiện.
        _taiMoiPhuKien = !coKhaiPhuKienNang;
        KiemLai();
    }

    public override string TieuDe => "XBOSS_VE_GIADO — Rải giá đỡ dọc tuyến";

    public override string MoTa =>
        "Chọn hệ, block giá đỡ và cách chia; bấm OK rồi chọn các tuyến TIM cần đặt giá đỡ.";

    // ===== Hệ + block =====

    public IReadOnlyList<HeCoBlock> CacHe => _cacHe;

    public HeCoBlock? He
    {
        get => _he;
        set
        {
            if (!Dat(ref _he, value)) return;
            _block = CacBlock.FirstOrDefault();
            Bao(nameof(CacBlock), nameof(Block));
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
            KiemLai();
        }
    }

    // ===== Cách chia =====

    public CheDoChiaGiaDo CheDo
    {
        get => _cheDo;
        set
        {
            if (!Dat(ref _cheDo, value)) return;
            Bao(nameof(LaKhongVuot), nameof(LaGanNhat), nameof(MoTaCheDo));
            KiemLai();
        }
    }

    public bool LaKhongVuot
    {
        get => _cheDo == CheDoChiaGiaDo.KhongVuot;
        set { if (value) CheDo = CheDoChiaGiaDo.KhongVuot; }
    }

    public bool LaGanNhat
    {
        get => _cheDo == CheDoChiaGiaDo.GanNhat;
        set { if (value) CheDo = CheDoChiaGiaDo.GanNhat; }
    }

    public string MoTaCheDo =>
        _cheDo == CheDoChiaGiaDo.KhongVuot
            ? "Bước luôn ≤ khoảng cách chuẩn của rule pack (thêm giá đỡ, an toàn tuyệt đối)."
            : "Chia đều gần khoảng cách chuẩn nhất (ít giá đỡ hơn, bước có thể vượt chuẩn vài %).";

    // ===== Giá đỡ tại phụ kiện =====

    /// <summary>Chỉ hỏi khi rule pack CHƯA khai danh sách phụ kiện nặng (v4–v6).</summary>
    public bool CanHoiTaiPhuKien => !_coKhaiPhuKienNang;

    public bool TaiMoiPhuKien
    {
        get => _taiMoiPhuKien;
        set
        {
            if (!Dat(ref _taiMoiPhuKien, value)) return;
            KiemLai();
        }
    }

    /// <summary>Nguồn của "phụ kiện nào được một giá đỡ riêng" — CHỈ ĐỌC (FR6).</summary>
    public string MoTaPhuKienNang =>
        _coKhaiPhuKienNang
            ? $"Phụ kiện NẶNG theo rule pack {_rulePackVersion} (luôn có giá đỡ tại chỗ): " +
              $"{string.Join(", ", _phuKienNang)}."
            : $"Rule pack {_rulePackVersion} chưa khai drawTools.heavyFittingIds (có từ v7) nên plugin không " +
              "biết phụ kiện nào là NẶNG — chọn ở trên cho cả lệnh.";

    /// <summary>Khoảng cách giá đỡ do rule pack quyết, không nhập tay — CHỈ ĐỌC (FR6).</summary>
    public string MoTaKhoangCach =>
        "Khoảng cách tra theo supportSpacingMm của ĐÚNG loại tuyến + size từng tim. Tuyến nào rule pack " +
        "chưa khai thì bị bỏ qua kèm lý do — plugin không tự bịa khoảng cách treo đỡ.";

    public KetQuaHoiGiaDo? KetQua() =>
        CoTheOk && _he is { } he && _block is { } block
            ? new KetQuaHoiGiaDo(he.He, block, _cheDo, CanHoiTaiPhuKien && _taiMoiPhuKien)
            : null;

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_cacHe.Count == 0)
        {
            loi.Add(
                $"Thư viện {_thuVienVersion} chưa có block giá đỡ (kind=support) cho hệ nào — phát hành lại " +
                "thư viện hoặc khai id giá đỡ vào drawTools.systems[].fittings.");
            return loi;
        }
        if (_he is null)
        {
            loi.Add("Chưa chọn hệ.");
            return loi;
        }
        if (CacBlock.Count == 0)
        {
            loi.Add($"Hệ {_he.He.Id} chưa có block giá đỡ nào trong thư viện {_thuVienVersion} — chọn hệ khác.");
            return loi;
        }
        if (_block is null) loi.Add("Chưa chọn block giá đỡ.");
        return loi;
    }
}

// ===================================================================================
// XBOSS_VE_LOCHO
// ===================================================================================

/// <summary>Hai chế độ của <c>XBOSS_VE_LOCHO</c> — đúng 2 keyword của đường dòng lệnh.</summary>
public enum CheDoLoCho
{
    /// <summary>Chèn sleeve tại chỗ tuyến xuyên kết cấu.</summary>
    Chen,

    /// <summary>Xuất bảng lỗ chờ (Table trong bản vẽ + Excel).</summary>
    XuatBang,
}

/// <summary>Tham số <c>XBOSS_VE_LOCHO</c> thu được từ hộp thoại.</summary>
public sealed record KetQuaLoCho(CheDoLoCho CheDo);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_LOCHO</c> (M106 §7.2) — thay câu hỏi keyword đầu lệnh
/// (<c>CHEN</c> / <c>XUATBANG</c>).
///
/// <b>Lệch có chủ đích với bảng §7.2</b>: bảng ghi "loại sleeve, dung sai, có sinh bảng builder's
/// work không". Trong lệnh THẬT: loại sleeve chỉ chọn được SAU khi bấm tuyến (danh mục lọc theo hệ
/// của chính tuyến đó, đọc từ XData); dung sai là <c>sleeveClearanceMm</c> của rule pack, không hỏi
/// bao giờ; còn "sinh bảng" chính là chế độ <c>XUATBANG</c>. Cao độ + loại kết cấu vẫn nhập cho
/// TỪNG lỗ chờ sau khi bấm điểm — gom lên hộp thoại là gán một cao độ cho mọi lỗ, sai nghiệp vụ.
/// </summary>
public sealed class LoChoDialogViewModel : DialogViewModelBase
{
    private CheDoLoCho _cheDo = CheDoLoCho.Chen;
    private readonly int _soLoChoDaCo;

    /// <param name="soLoChoDaCo">Số lỗ chờ plugin đã chèn trong bản vẽ (Adapter đếm sẵn).</param>
    public LoChoDialogViewModel(int soLoChoDaCo)
    {
        _soLoChoDaCo = soLoChoDaCo;
        KiemLai();
    }

    public override string TieuDe => "XBOSS_VE_LOCHO — Lỗ chờ / sleeve";

    public override string MoTa => "Chọn việc cần làm với lỗ chờ trong bản vẽ này.";

    public CheDoLoCho CheDo
    {
        get => _cheDo;
        set
        {
            if (!Dat(ref _cheDo, value)) return;
            Bao(nameof(LaChen), nameof(LaXuatBang), nameof(MoTaCheDo));
            KiemLai();
        }
    }

    public bool LaChen
    {
        get => _cheDo == CheDoLoCho.Chen;
        set { if (value) CheDo = CheDoLoCho.Chen; }
    }

    public bool LaXuatBang
    {
        get => _cheDo == CheDoLoCho.XuatBang;
        set { if (value) CheDo = CheDoLoCho.XuatBang; }
    }

    /// <summary>Việc lệnh sẽ hỏi tiếp sau OK — CHỈ ĐỌC (FR6).</summary>
    public string MoTaCheDo =>
        _cheDo == CheDoLoCho.Chen
            ? "Sau khi bấm OK: chọn tuyến tim xuyên kết cấu → chọn block sleeve của hệ tuyến đó → bấm/dò điểm " +
              "xuyên → nhập cao độ và loại kết cấu cho TỪNG lỗ. Size lỗ = size ống + sleeveClearanceMm của rule pack."
            : $"Dựng bảng lỗ chờ từ {_soLoChoDaCo} lỗ chờ đã có trong bản vẽ (Table trong bản vẽ, cập nhật bảng " +
              "cũ tại chỗ) rồi hỏi có xuất Excel builder's work không.";

    public KetQuaLoCho? KetQua() => CoTheOk ? new KetQuaLoCho(_cheDo) : null;

    protected override IReadOnlyList<string> Kiem() =>
        _cheDo == CheDoLoCho.XuatBang && _soLoChoDaCo == 0
            ? ["Chưa có lỗ chờ nào trong bản vẽ — chạy chế độ Chèn trước rồi mới xuất bảng."]
            : [];
}

// ===================================================================================
// XBOSS_VE_TAG
// ===================================================================================

/// <summary>Bốn chế độ của <c>XBOSS_VE_TAG</c> — đúng 4 keyword của đường dòng lệnh.</summary>
public enum CheDoTag
{
    /// <summary>Quét trùng/nhảy số (chỉ báo, không sửa).</summary>
    Quet,

    /// <summary>Đánh lại tuần tự.</summary>
    DanhLai,

    /// <summary>Khóa tag đang chọn.</summary>
    Khoa,

    /// <summary>Mở khóa tag đang chọn.</summary>
    MoKhoa,
}

/// <summary>Phạm vi đánh lại tag — đúng 2 keyword <c>ToanBo</c>/<c>ChonVung</c>.</summary>
public enum PhamViTag
{
    /// <summary>Toàn bộ model space.</summary>
    ToanBo,

    /// <summary>Chọn vùng sau khi đóng hộp thoại.</summary>
    ChonVung,
}

/// <summary>Tham số <c>XBOSS_VE_TAG</c> thu được từ hộp thoại.</summary>
public sealed record KetQuaTag(CheDoTag CheDo, PhamViTag PhamVi, string Tang);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_TAG</c> (M106 §7.2): chế độ + (chỉ với "đánh lại") phạm vi và
/// TẦNG của bản vẽ — đúng ba câu hỏi của đường dòng lệnh.
///
/// <b>Lệch có chủ đích với bảng §7.2</b>: bảng ghi "tiền tố tag, số bắt đầu, phạm vi". Lệnh THẬT
/// lấy khuôn tag từ <c>sheetSetup.tagPattern</c> của rule pack (không có tiền tố nhập tay) và số
/// thứ tự do <c>TagSchedule.DanhLai</c> tính (bỏ qua số của tag đã khóa) — cho nhập số bắt đầu là
/// mở đường đánh trùng tag. Cả hai hiện dạng CHỈ ĐỌC (FR6). Tầng nhớ trong CHÍNH bản vẽ như cũ.
/// </summary>
public sealed class TagDialogViewModel : DialogViewModelBase
{
    private readonly string _mauTag;
    private readonly int _soKhoiCoTag;

    private CheDoTag _cheDo = CheDoTag.Quet;
    private PhamViTag _phamVi = PhamViTag.ToanBo;
    private string _tang;

    /// <param name="mauTag">Khuôn tag của rule pack (<c>sheetSetup.tagPattern</c>).</param>
    /// <param name="soKhoiCoTag">Số khối mang thẻ TAG trong bản vẽ (Adapter đếm sẵn).</param>
    /// <param name="tangDaNho">Tầng đã nhớ trong bản vẽ; rỗng = chưa nhập lần nào.</param>
    public TagDialogViewModel(string mauTag, int soKhoiCoTag, string? tangDaNho)
    {
        _mauTag = mauTag;
        _soKhoiCoTag = soKhoiCoTag;
        _tang = (tangDaNho ?? "").Trim();
        KiemLai();
    }

    public override string TieuDe => "XBOSS_VE_TAG — Đánh tag thiết bị";

    public override string MoTa =>
        $"Bản vẽ có {_soKhoiCoTag} khối mang thẻ TAG. Khuôn tag của rule pack: {_mauTag}";

    // ===== Chế độ =====

    public CheDoTag CheDo
    {
        get => _cheDo;
        set
        {
            if (!Dat(ref _cheDo, value)) return;
            Bao(
                nameof(LaQuet), nameof(LaDanhLai), nameof(LaKhoa), nameof(LaMoKhoa),
                nameof(CanTang), nameof(MoTaCheDo));
            KiemLai();
        }
    }

    public bool LaQuet
    {
        get => _cheDo == CheDoTag.Quet;
        set { if (value) CheDo = CheDoTag.Quet; }
    }

    public bool LaDanhLai
    {
        get => _cheDo == CheDoTag.DanhLai;
        set { if (value) CheDo = CheDoTag.DanhLai; }
    }

    public bool LaKhoa
    {
        get => _cheDo == CheDoTag.Khoa;
        set { if (value) CheDo = CheDoTag.Khoa; }
    }

    public bool LaMoKhoa
    {
        get => _cheDo == CheDoTag.MoKhoa;
        set { if (value) CheDo = CheDoTag.MoKhoa; }
    }

    // ===== Phạm vi + tầng (chỉ với ĐÁNH LẠI) =====

    /// <summary>Phạm vi và tầng chỉ có nghĩa với chế độ đánh lại (đúng như dòng lệnh).</summary>
    public bool CanTang => _cheDo == CheDoTag.DanhLai;

    public PhamViTag PhamVi
    {
        get => _phamVi;
        set
        {
            if (!Dat(ref _phamVi, value)) return;
            Bao(nameof(LaToanBo), nameof(LaChonVung));
            KiemLai();
        }
    }

    public bool LaToanBo
    {
        get => _phamVi == PhamViTag.ToanBo;
        set { if (value) PhamVi = PhamViTag.ToanBo; }
    }

    public bool LaChonVung
    {
        get => _phamVi == PhamViTag.ChonVung;
        set { if (value) PhamVi = PhamViTag.ChonVung; }
    }

    /// <summary>Tầng điền vào <c>{floor}</c> của khuôn tag — nhớ trong chính bản vẽ.</summary>
    public string Tang
    {
        get => _tang;
        set
        {
            if (!Dat(ref _tang, (value ?? "").Trim())) return;
            KiemLai();
        }
    }

    /// <summary>Chế độ đang chọn làm gì — CHỈ ĐỌC (FR6).</summary>
    public string MoTaCheDo => _cheDo switch
    {
        CheDoTag.DanhLai =>
            $"Đánh lại tuần tự theo khuôn {_mauTag}; số thứ tự do plugin tính (bỏ qua số của tag đã khóa). " +
            "Danh sách tag mới hiện ra để bạn xác nhận trước khi ghi.",
        CheDoTag.Khoa => "Sau khi bấm OK: chọn các thiết bị cần KHÓA tag (đánh lại sẽ không đổi tag của chúng).",
        CheDoTag.MoKhoa => "Sau khi bấm OK: chọn các thiết bị cần MỞ KHÓA tag.",
        _ => "Chỉ báo tag trùng và tag nhảy số trên toàn bản vẽ — không sửa gì.",
    };

    public KetQuaTag? KetQua() => CoTheOk ? new KetQuaTag(_cheDo, _phamVi, _tang) : null;

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_soKhoiCoTag == 0 && _cheDo is CheDoTag.Quet or CheDoTag.DanhLai)
        {
            loi.Add("Bản vẽ chưa có khối nào mang thẻ TAG — chèn thiết bị bằng XBOSS_VE_THIETBI trước.");
            return loi;
        }
        if (CanTang && _tang.Length == 0)
            loi.Add("Chưa nhập tầng của bản vẽ — thiếu thì tag sẽ thiếu phần {floor}.");
        return loi;
    }
}
