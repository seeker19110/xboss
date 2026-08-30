namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>Kết quả hộp thoại <c>XBOSS_CHUANHOA</c>: bấm OK là đồng ý thực thi (không có tham số khác).</summary>
public sealed record KetQuaChuanHoa;

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_CHUANHOA</c> (M106 §7.2) — thay câu hỏi keyword
/// <c>DongY/Huy</c> sau bước xem trước.
///
/// <b>Lệch có chủ đích với bảng §7.2</b>: bảng ghi "chọn bước chuẩn hóa sẽ chạy (checkbox), chế độ
/// chỉ-báo", nhưng lệnh THẬT không cho chọn bước — <c>StandardizePipeline</c> chạy trọn bộ bước
/// theo rule pack, và "chế độ chỉ-báo" đã là lệnh riêng <c>XBOSS_KIEMTRA</c>. Thêm checkbox từng
/// bước là mở bậc tự do mà lệnh không có (§2.4). Hộp thoại hiện DIFF xem trước ở dạng CHỈ ĐỌC
/// (FR6) rồi hỏi đúng một câu: chạy hay không.
/// </summary>
public sealed class ChuanHoaDialogViewModel : DialogViewModelBase
{
    private readonly string _rulePackVersion;

    /// <param name="rulePackVersion">Version rule pack đang nạp.</param>
    /// <param name="dongXemTruoc">Từng dòng "tên nhóm lệch chuẩn: số lượng" của bước xem trước.</param>
    public ChuanHoaDialogViewModel(string rulePackVersion, IReadOnlyList<string> dongXemTruoc)
    {
        _rulePackVersion = rulePackVersion;
        DongXemTruoc = dongXemTruoc;
        KiemLai();
    }

    public override string TieuDe => "XBOSS_CHUANHOA — Chuẩn hóa bản vẽ";

    public override string MoTa =>
        $"Xem trước theo rule pack {_rulePackVersion}. Bấm OK để thực thi — hoàn tác được bằng 1 lần UNDO.";

    /// <summary>Các nhóm lệch chuẩn sẽ được sửa — CHỈ ĐỌC (FR6).</summary>
    public IReadOnlyList<string> DongXemTruoc { get; }

    public string TomTat =>
        DongXemTruoc.Count == 0
            ? "Bản vẽ đã đạt chuẩn — không có gì để sửa."
            : $"{DongXemTruoc.Count} nhóm lệch chuẩn sẽ được sửa.";

    public KetQuaChuanHoa? KetQua() => CoTheOk ? new KetQuaChuanHoa() : null;

    protected override IReadOnlyList<string> Kiem() =>
        DongXemTruoc.Count == 0
            ? ["Không có gì để chuẩn hóa — đóng hộp thoại, bản vẽ giữ nguyên."]
            : [];

    protected override IReadOnlyList<string> KiemCanhBao() =>
        DongXemTruoc.Count == 0
            ? []
            : ["Bản vẽ sẽ bị SỬA. Bản gốc đã lưu (lệnh bắt QSAVE trước) và UNDO 1 lần trả về nguyên trạng."];
}

/// <summary>Ba chế độ của <c>XBOSS_BATCH</c> — đúng 3 keyword của đường dòng lệnh.</summary>
public enum CheDoBatch
{
    /// <summary>Chỉ kiểm, không sửa.</summary>
    KiemTra,

    /// <summary>Chuẩn hóa (bản gốc giữ nguyên, kết quả vào thư mục con).</summary>
    ChuanHoa,

    /// <summary>Bóc khối lượng hàng loạt (1 Excel tổng).</summary>
    BocKL,
}

/// <summary>Tham số <c>XBOSS_BATCH</c> thu được từ hộp thoại.</summary>
public sealed record KetQuaBatch(CheDoBatch CheDo);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_BATCH</c> (M106 §7.2) — chỉ thay câu hỏi keyword CHỌN CHẾ ĐỘ.
///
/// <b>Lệch có chủ đích với bảng §7.2</b>: bảng ghi "thư mục, mẫu tên tệp, các bước áp dụng". Lệnh
/// thật chọn thư mục bằng <c>FolderBrowserDialog</c> của Windows (đã là chuột, và là hộp thoại hệ
/// thống — không dựng lại được trong khung XBoss), KHÔNG có mẫu tên tệp (luôn quét <c>*.dwg</c>
/// ngay trong thư mục), và không cho chọn từng bước. M106 §5 cũng để "hộp thoại cho XBOSS_BATCH
/// chạy nền dài" ngoài phạm vi — phần tiến trình giữ nguyên như cũ.
/// </summary>
public sealed class BatchDialogViewModel : DialogViewModelBase
{
    private CheDoBatch _cheDo = CheDoBatch.KiemTra;

    private readonly string _rulePackVersion;

    public BatchDialogViewModel(string rulePackVersion)
    {
        _rulePackVersion = rulePackVersion;
        KiemLai();
    }

    public override string TieuDe => "XBOSS_BATCH — Xử lý hàng loạt cả thư mục";

    public override string MoTa =>
        $"Chọn chế độ (rule pack {_rulePackVersion}); bấm OK rồi chọn thư mục chứa các tệp .dwg.";

    public CheDoBatch CheDo
    {
        get => _cheDo;
        set
        {
            if (!Dat(ref _cheDo, value)) return;
            Bao(nameof(LaKiemTra), nameof(LaChuanHoa), nameof(LaBocKL), nameof(MoTaCheDo));
            KiemLai();
        }
    }

    public bool LaKiemTra
    {
        get => _cheDo == CheDoBatch.KiemTra;
        set { if (value) CheDo = CheDoBatch.KiemTra; }
    }

    public bool LaChuanHoa
    {
        get => _cheDo == CheDoBatch.ChuanHoa;
        set { if (value) CheDo = CheDoBatch.ChuanHoa; }
    }

    public bool LaBocKL
    {
        get => _cheDo == CheDoBatch.BocKL;
        set { if (value) CheDo = CheDoBatch.BocKL; }
    }

    /// <summary>Chế độ đang chọn làm gì với tệp gốc — CHỈ ĐỌC (FR6).</summary>
    public string MoTaCheDo => _cheDo switch
    {
        CheDoBatch.ChuanHoa =>
            "Bản gốc GIỮ NGUYÊN — kết quả chuẩn hóa lưu vào thư mục con. Tệp đang mở trong AutoCAD sẽ bị bỏ qua.",
        CheDoBatch.BocKL =>
            "Chỉ ĐỌC XData đã đánh dấu bóc (XBOSS_BOCKL) trong từng tệp rồi gộp 1 Excel tổng — bản gốc không đổi. " +
            "Sau khi bấm OK còn hỏi tên dự án/gói thầu cho đầu trang Excel.",
        _ => "Chỉ kiểm, không sửa tệp nào — an toàn tuyệt đối.",
    };

    public KetQuaBatch? KetQua() => CoTheOk ? new KetQuaBatch(_cheDo) : null;

    protected override IReadOnlyList<string> Kiem() => [];
}
