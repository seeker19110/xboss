using System.Globalization;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>Tham số một lần chạy <c>XBOSS_VE</c> — đúng những gì 5 câu hỏi dòng lệnh thu được.</summary>
public sealed record KetQuaVeTuyen(
    DrawSystem He,
    DrawLine Tuyen,
    string Size,
    bool SizeTuNhap,
    string? DoDoc);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE</c> (M106 §7.2, AC3): gộp 5 câu hỏi nối tiếp của dòng lệnh
/// (hệ → loại tuyến → size → độ dốc → bề rộng biên) vào MỘT form sửa qua lại tự do.
///
/// Thuần .NET, không chạm AutoCAD ⇒ test trên CI Linux. Ba luật giữ cho hộp thoại không lệch khỏi
/// đường hỏi đáp dòng lệnh:
/// <list type="number">
/// <item>Danh mục hiện ĐÚNG những gì rule pack khai (FR5); ô size/độ dốc cho gõ tay vì
/// <c>VeContext.HoiDanhMuc(choTuNhap: true)</c> cũng cho — gõ ngoài danh mục thì bật cảnh báo vàng
/// <c>custom</c> ngay tại đây thay vì đợi lệnh chạy xong mới báo.</item>
/// <item>Bề rộng nét biên là số SUY RA từ size bằng <see cref="DrawSize.PhanTich"/> — CHỈ hiển thị,
/// không cho sửa: lệnh tính bề rộng từ size, cho sửa tay là hộp thoại vẽ ra thứ khác đường dòng
/// lệnh (vi phạm guardrail "không đổi kết quả vẽ" của M106 §2).</item>
/// <item>Rule pack khai thiếu (hệ rỗng / loại tuyến rỗng / size rỗng) phải cho LÝ DO rõ chứ không
/// văng lỗi (AC9) — hộp thoại là nơi kỹ sư đọc được vì sao không vẽ được.</item>
/// </list>
/// </summary>
public sealed class VeTuyenDialogViewModel : DialogViewModelBase
{
    private readonly DrawToolsPack _pack;
    private readonly double _toMm;

    private DrawSystem? _he;
    private DrawLine? _tuyen;
    private string _size = "";
    private string _doDoc = "";

    /// <param name="pack">Rule pack v4+ đang nạp (khối <c>drawTools</c>/<c>sheetSetup</c>).</param>
    /// <param name="toMm">1 đơn vị bản vẽ = bao nhiêu mm (<c>DrawingUnits.TuInsUnits</c>).</param>
    /// <param name="heId">Hệ đang vẽ của phiên (<c>VeContext.He</c>); null = lấy hệ đầu danh mục.</param>
    /// <param name="itemId">Loại tuyến của phiên; null = lấy loại đầu của hệ.</param>
    /// <param name="size">Size lần trước; null/không còn trong danh mục thì lấy size đầu.</param>
    /// <param name="doDoc">Độ dốc lần trước.</param>
    public VeTuyenDialogViewModel(
        DrawToolsPack pack,
        double toMm,
        string? heId = null,
        string? itemId = null,
        string? size = null,
        string? doDoc = null)
    {
        _pack = pack;
        // Đơn vị bản vẽ lạ (INSUNITS = 0) không được làm hộp thoại chia cho 0 — quy về 1:1 như
        // DrawingUnits vẫn làm, phần cảnh báo đơn vị do lệnh in ra.
        _toMm = toMm > 0 ? toMm : 1;

        _he = CacHe.FirstOrDefault(s => string.Equals(s.Id, heId, StringComparison.Ordinal))
              ?? CacHe.FirstOrDefault();
        _tuyen = CacLoaiTuyen.FirstOrDefault(l => string.Equals(l.ItemId, itemId, StringComparison.Ordinal))
                 ?? CacLoaiTuyen.FirstOrDefault();
        // Lựa chọn của phiên trước được GIỮ NGUYÊN kể cả khi ngoài danh mục — đúng như dòng lệnh
        // lấy VeContext.Size làm mặc định; chỉ khi chưa có gì mới lấy mục đầu danh mục.
        _size = GiuHoacDau(CacSize, size);
        _doDoc = CanDoDoc ? GiuHoacDau(CacDoDoc, doDoc) : "";
        KiemLai();
    }

    public override string TieuDe => "XBOSS_VE — Vẽ tuyến";

    public override string MoTa =>
        "Chọn hệ, loại tuyến và size rồi bấm OK để bắt điểm vẽ tuyến như PLINE.";

    // ===== Hệ =====

    public IReadOnlyList<DrawSystem> CacHe => _pack.DrawTools.Systems;

    public DrawSystem? He
    {
        get => _he;
        set
        {
            if (!Dat(ref _he, value)) return;
            // Đổi hệ ⇒ loại tuyến/size/độ dốc cũ không còn ý nghĩa (đúng như VeContext.HoiHe).
            _tuyen = CacLoaiTuyen.FirstOrDefault();
            _size = ChonMacDinh(CacSize, null);
            _doDoc = "";
            Bao(nameof(CacLoaiTuyen), nameof(Tuyen));
            TinhLai();
        }
    }

    // ===== Loại tuyến =====

    public IReadOnlyList<DrawLine> CacLoaiTuyen => _he?.Lines ?? [];

    public DrawLine? Tuyen
    {
        get => _tuyen;
        set
        {
            if (!Dat(ref _tuyen, value)) return;
            _size = ChonMacDinh(CacSize, null);
            _doDoc = CanDoDoc ? ChonMacDinh(CacDoDoc, _doDoc) : "";
            TinhLai();
        }
    }

    // ===== Size =====

    public IReadOnlyList<string> CacSize => _tuyen?.Sizes ?? [];

    /// <summary>Size đang chọn — combo cho GÕ TAY nên đây là chuỗi, không phải chỉ số danh mục.</summary>
    public string Size
    {
        get => _size;
        set
        {
            if (!Dat(ref _size, (value ?? "").Trim())) return;
            TinhLai();
        }
    }

    /// <summary>Size nằm ngoài danh mục rule pack ⇒ XData đánh dấu <c>custom</c> (M100 §4).</summary>
    public bool SizeTuNhap =>
        _size.Length > 0 && !CacSize.Any(s => string.Equals(s, _size, StringComparison.OrdinalIgnoreCase));

    // ===== Độ dốc =====

    /// <summary>Loại tuyến bắt buộc khai độ dốc (M100 FR9g).</summary>
    public bool CanDoDoc => _tuyen?.SlopeRequired == true;

    public IReadOnlyList<string> CacDoDoc => _pack.SheetSetup.Slopes;

    public string DoDoc
    {
        get => _doDoc;
        set
        {
            if (!Dat(ref _doDoc, (value ?? "").Trim())) return;
            TinhLai();
        }
    }

    // ===== Bề rộng nét biên (chỉ hiển thị — FR6) =====

    /// <summary>Loại tuyến sinh 2 nét biên thể hiện bề rộng.</summary>
    public bool CoNetBien => _tuyen?.EdgeStyle == "double";

    /// <summary>Bề rộng nét biên theo ĐƠN VỊ BẢN VẼ; null = không có biên hoặc không đọc được size.</summary>
    public double? BeRongBienVe =>
        CoNetBien && DrawSize.PhanTich(_size) is { } kt ? kt.RongMm / _toMm : null;

    /// <summary>Dòng thông tin quyết định hiện cạnh ô size (FR6).</summary>
    public string MoTaBeRongBien =>
        !CoNetBien ? "Loại tuyến này chỉ vẽ tim, không sinh nét biên."
        : BeRongBienVe is { } w
            ? $"Nét biên: 2 nét cách tim {So(w / 2)} đơn vị bản vẽ (bề rộng {So(w)})."
            : "Không đọc được bề rộng từ size đang nhập — sẽ chỉ vẽ tim.";

    /// <summary>Tham số để lệnh chạy; null khi form chưa hợp lệ (nút OK đang khóa).</summary>
    public KetQuaVeTuyen? KetQua() =>
        CoTheOk && _he is { } he && _tuyen is { } tuyen
            ? new KetQuaVeTuyen(he, tuyen, _size, SizeTuNhap, CanDoDoc ? _doDoc : null)
            : null;

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (CacHe.Count == 0)
        {
            loi.Add(
                $"Rule pack {_pack.RulePack.Version} không khai hệ nào để vẽ (drawTools.systems rỗng) — " +
                "nạp lại rule pack có khối drawTools.");
            return loi;
        }
        if (_he is null)
        {
            loi.Add("Chưa chọn hệ vẽ.");
            return loi;
        }
        if (CacLoaiTuyen.Count == 0)
        {
            loi.Add(
                $"Hệ {_he.Name} ({_he.Id}) không khai loại tuyến nào trong rule pack {_pack.RulePack.Version} — " +
                "chọn hệ khác hoặc bổ sung drawTools.systems[].lines.");
            return loi;
        }
        if (_tuyen is null) loi.Add("Chưa chọn loại tuyến.");
        if (_size.Length == 0)
            loi.Add("Chưa chọn size tuyến — chọn trong danh mục hoặc gõ size khác vào ô size.");
        if (CanDoDoc && _doDoc.Length == 0)
        {
            loi.Add(
                $"Tuyến {_tuyen?.Name} bắt buộc có độ dốc (rule pack khai slopeRequired) — " +
                "chọn trong danh mục hoặc nhập tay.");
        }
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao()
    {
        var canhBao = new List<string>();
        if (_tuyen is { } tuyen && CacSize.Count == 0)
        {
            canhBao.Add(
                $"Loại tuyến {tuyen.Name} không khai size nào trong rule pack — gõ size tay, " +
                "XData sẽ đánh dấu \"custom\".");
        }
        else if (SizeTuNhap)
        {
            canhBao.Add(
                $"Size \"{_size}\" ngoài danh mục rule pack — vẫn vẽ, XData đánh dấu \"custom\".");
        }
        if (CanDoDoc && CacDoDoc.Count == 0)
            canhBao.Add("Rule pack không khai sheetSetup.slopes — nhập độ dốc tay (vd 2%).");
        else if (CanDoDoc && _doDoc.Length > 0 &&
                 !CacDoDoc.Any(s => string.Equals(s, _doDoc, StringComparison.OrdinalIgnoreCase)))
        {
            canhBao.Add($"Độ dốc \"{_doDoc}\" ngoài danh mục rule pack — kiểm lại trước khi vẽ.");
        }
        if (CoNetBien && _size.Length > 0 && BeRongBienVe is null)
        {
            canhBao.Add(
                $"Không đọc được bề rộng từ size \"{_size}\" — chỉ vẽ tim, không sinh nét biên.");
        }
        return canhBao;
    }

    /// <summary>Báo lại mọi thứ suy ra từ hệ/loại tuyến/size/độ dốc rồi kiểm lại.</summary>
    private void TinhLai()
    {
        Bao(
            nameof(CacSize), nameof(Size), nameof(SizeTuNhap), nameof(CanDoDoc), nameof(DoDoc),
            nameof(CoNetBien), nameof(BeRongBienVe), nameof(MoTaBeRongBien));
        KiemLai();
    }

    /// <summary>Giá trị đầu danh mục (rỗng khi rule pack không khai gì).</summary>
    private static string ChonMacDinh(IReadOnlyList<string> danhMuc, string? cu)
    {
        var c = (cu ?? "").Trim();
        if (c.Length > 0 && danhMuc.Any(v => string.Equals(v, c, StringComparison.OrdinalIgnoreCase))) return c;
        return danhMuc.Count > 0 ? danhMuc[0] : "";
    }

    /// <summary>Giữ nguyên lựa chọn cũ (kể cả ngoài danh mục); chưa có gì thì lấy mục đầu danh mục.</summary>
    private static string GiuHoacDau(IReadOnlyList<string> danhMuc, string? cu)
    {
        var c = (cu ?? "").Trim();
        return c.Length > 0 ? c : (danhMuc.Count > 0 ? danhMuc[0] : "");
    }

    private static string So(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);
}
