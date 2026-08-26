using System.Globalization;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>Vì sao một đối tượng trong vùng chọn KHÔNG nhận được thành tuyến XBoss (M107 FR1).</summary>
public enum LyDoBoQuaNhanTuyen
{
    /// <summary>Không phải <c>Polyline</c>/<c>Line</c> (text, block, arc, spline…) — guardrail 2.</summary>
    KhongPhaiTuyen,

    /// <summary>Thuộc xref — plugin không đụng bản vẽ tham chiếu (quy tắc chốt 2026-08-26).</summary>
    ThuocXref,

    /// <summary>Nét biên/nhãn/vạch chia đốt do XBoss sinh — đi theo tim, không nhận riêng.</summary>
    PhuTroXBoss,
}

/// <summary>
/// Vùng chọn của <c>XBOSS_VE_NHANTUYEN</c> sau khi lọc (M107 FR1) — bản ghi THUẦN: Adapter đọc bản
/// vẽ rồi đếm, hộp thoại và tóm tắt cuối lệnh dùng chung đúng bộ số này nên hai đường (hộp thoại /
/// dòng lệnh) không bao giờ báo lệch nhau.
/// </summary>
/// <param name="SoPolyline">Polyline chưa mang XData — nhận mới.</param>
/// <param name="SoLine">Line — nhận mới, phải chuyển thành polyline 2 đỉnh (FR4).</param>
/// <param name="SoNhanLai">Polyline ĐÃ là tuyến XBoss — nhận lại, dựng lại nét biên (FR5).</param>
/// <param name="SoKhongPhaiTuyen">Bỏ qua: không phải polyline/line.</param>
/// <param name="SoThuocXref">Bỏ qua: thuộc xref.</param>
/// <param name="SoPhuTroXBoss">Bỏ qua: nét biên/nhãn/vạch chia của XBoss.</param>
public sealed record TomTatChonNhanTuyen(
    int SoPolyline = 0,
    int SoLine = 0,
    int SoNhanLai = 0,
    int SoKhongPhaiTuyen = 0,
    int SoThuocXref = 0,
    int SoPhuTroXBoss = 0)
{
    /// <summary>Tổng số tuyến lệnh sẽ nhận trong lần chạy này.</summary>
    public int TongNhan => SoPolyline + SoLine + SoNhanLai;

    /// <summary>Tổng số đối tượng bị bỏ qua kèm lý do.</summary>
    public int TongBoQua => SoKhongPhaiTuyen + SoThuocXref + SoPhuTroXBoss;

    /// <summary>Nhãn tiếng Việt của một lý do bỏ qua (dùng chung cho hộp thoại và dòng lệnh).</summary>
    public static string Nhan(LyDoBoQuaNhanTuyen lyDo) => lyDo switch
    {
        LyDoBoQuaNhanTuyen.KhongPhaiTuyen =>
            "không phải polyline/line (text, block, arc, spline… — lệnh chỉ nhận tuyến, không đoán hình học)",
        LyDoBoQuaNhanTuyen.ThuocXref =>
            "thuộc xref (plugin không sửa bản vẽ tham chiếu — bind/detach xref rồi chạy lại nếu cần)",
        LyDoBoQuaNhanTuyen.PhuTroXBoss =>
            "là nét biên/nhãn/vạch chia đốt do XBoss sinh (đi theo tim, không nhận riêng)",
        _ => lyDo.ToString(),
    };

    /// <summary>Mỗi lý do bỏ qua một dòng "n đối tượng: lý do" (bỏ dòng có số 0) — FR7.</summary>
    public IReadOnlyList<string> DongBoQua
    {
        get
        {
            var ra = new List<string>();
            void Them(int so, LyDoBoQuaNhanTuyen lyDo)
            {
                if (so > 0) ra.Add($"{so} đối tượng: {Nhan(lyDo)}.");
            }
            Them(SoKhongPhaiTuyen, LyDoBoQuaNhanTuyen.KhongPhaiTuyen);
            Them(SoThuocXref, LyDoBoQuaNhanTuyen.ThuocXref);
            Them(SoPhuTroXBoss, LyDoBoQuaNhanTuyen.PhuTroXBoss);
            return ra;
        }
    }

    /// <summary>Một dòng mô tả những gì sẽ nhận (chỉ đọc) — FR2.</summary>
    public string MoTaSeNhan
    {
        get
        {
            if (TongNhan == 0) return "Không có tuyến nào nhận được trong vùng chọn.";
            var phan = new List<string>();
            if (SoPolyline > 0) phan.Add($"{SoPolyline} polyline");
            if (SoLine > 0) phan.Add($"{SoLine} line (sẽ chuyển thành polyline 2 đỉnh, tọa độ giữ nguyên)");
            if (SoNhanLai > 0) phan.Add($"{SoNhanLai} tuyến XBoss nhận lại (nét biên cũ bị xóa và dựng lại)");
            return $"Sẽ nhận {TongNhan} tuyến: {string.Join(", ", phan)}.";
        }
    }
}

/// <summary>Tham số một lần chạy <c>XBOSS_VE_NHANTUYEN</c> — đúng những gì dòng lệnh hỏi.</summary>
public sealed record KetQuaNhanTuyen(
    DrawSystem He,
    DrawLine Tuyen,
    string Size,
    bool SizeTuNhap,
    string? DoDoc);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_NHANTUYEN</c> (M107 FR2, khung M106): hệ → loại tuyến → size →
/// độ dốc trong MỘT form, kèm phần CHỈ ĐỌC nói rõ lệnh sắp làm gì (số tuyến nhận, layer đích, bề
/// rộng nét biên suy từ cỡ, các đối tượng bỏ qua theo lý do).
///
/// Thuần .NET, không chạm AutoCAD ⇒ test trên CI Linux. Cùng ba luật của
/// <see cref="VeTuyenDialogViewModel"/>: danh mục đúng rule pack, số suy ra chỉ hiển thị (không cho
/// sửa tay), rule pack khai thiếu thì cho LÝ DO rõ chứ không văng lỗi.
///
/// Một cỡ áp cho TOÀN BỘ vùng chọn (người dùng chốt 2026-08-26) — không có ô nào cho cỡ theo từng
/// tuyến, vì thế cũng không có đường nào để hộp thoại vẽ ra thứ khác đường dòng lệnh.
/// </summary>
public sealed class NhanTuyenDialogViewModel : DialogViewModelBase
{
    private readonly DrawToolsPack _pack;
    private readonly double _toMm;
    private readonly TomTatChonNhanTuyen _tomTat;

    private DrawSystem? _he;
    private DrawLine? _tuyen;
    private string _size = "";
    private string _doDoc = "";

    /// <param name="pack">Rule pack v4+ đang nạp.</param>
    /// <param name="toMm">1 đơn vị bản vẽ = bao nhiêu mm (<c>DrawingUnits.TuInsUnits</c>).</param>
    /// <param name="tomTat">Vùng chọn đã lọc (Adapter đếm trước khi mở hộp thoại).</param>
    /// <param name="heId">Hệ đang vẽ của phiên; null = hệ đầu danh mục.</param>
    /// <param name="itemId">Loại tuyến của phiên; null = loại đầu của hệ.</param>
    /// <param name="size">Size lần trước (giữ nguyên kể cả ngoài danh mục).</param>
    /// <param name="doDoc">Độ dốc lần trước.</param>
    public NhanTuyenDialogViewModel(
        DrawToolsPack pack,
        double toMm,
        TomTatChonNhanTuyen tomTat,
        string? heId = null,
        string? itemId = null,
        string? size = null,
        string? doDoc = null)
    {
        _pack = pack;
        // Đơn vị bản vẽ lạ (INSUNITS = 0) không được làm hộp thoại chia cho 0 — quy về 1:1 như
        // DrawingUnits vẫn làm; phần cảnh báo đơn vị do lệnh in ra.
        _toMm = toMm > 0 ? toMm : 1;
        _tomTat = tomTat;

        _he = CacHe.FirstOrDefault(s => string.Equals(s.Id, heId, StringComparison.Ordinal))
              ?? CacHe.FirstOrDefault();
        _tuyen = CacLoaiTuyen.FirstOrDefault(l => string.Equals(l.ItemId, itemId, StringComparison.Ordinal))
                 ?? CacLoaiTuyen.FirstOrDefault();
        _size = GiuHoacDau(CacSize, size);
        _doDoc = CanDoDoc ? GiuHoacDau(CacDoDoc, doDoc) : "";
        KiemLai();
    }

    public override string TieuDe => "XBOSS_VE_NHANTUYEN — Nhận tuyến có sẵn";

    public override string MoTa =>
        "Khai hệ/loại/cỡ cho các tuyến của bản vẽ gốc đang chọn. Hình học tim GIỮ NGUYÊN — lệnh chỉ " +
        "đổi layer, ghi dữ liệu XBoss và thêm nét biên.";

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

    /// <summary>Size áp cho TOÀN BỘ vùng chọn — combo cho gõ tay nên đây là chuỗi.</summary>
    public string Size
    {
        get => _size;
        set
        {
            if (!Dat(ref _size, (value ?? "").Trim())) return;
            TinhLai();
        }
    }

    /// <summary>Size ngoài danh mục rule pack ⇒ XData đánh dấu <c>custom</c> (M100 §4).</summary>
    public bool SizeTuNhap =>
        _size.Length > 0 && !CacSize.Any(s => string.Equals(s, _size, StringComparison.OrdinalIgnoreCase));

    // ===== Độ dốc =====

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

    // ===== Phần chỉ đọc (FR2) =====

    /// <summary>Vùng chọn đã lọc — chỉ đọc.</summary>
    public TomTatChonNhanTuyen TomTat => _tomTat;

    /// <summary>Dòng "sẽ nhận bao nhiêu tuyến, loại nào".</summary>
    public string MoTaSeNhan => _tomTat.MoTaSeNhan;

    /// <summary>Các đối tượng bị bỏ qua, mỗi lý do một dòng.</summary>
    public IReadOnlyList<string> DongBoQua => _tomTat.DongBoQua;

    /// <summary>Layer đích của loại tuyến đang chọn (lệnh tạo nếu chưa có).</summary>
    public string LayerDich => _tuyen?.Layer ?? "";

    /// <summary>Loại tuyến sinh 2 nét biên thể hiện bề rộng.</summary>
    public bool CoNetBien => _tuyen?.EdgeStyle == "double";

    /// <summary>Bề rộng nét biên theo ĐƠN VỊ BẢN VẼ; null = không có biên hoặc không đọc được size.</summary>
    public double? BeRongBienVe =>
        CoNetBien && DrawSize.PhanTich(_size) is { } kt ? kt.RongMm / _toMm : null;

    /// <summary>Việc lệnh sẽ làm với cỡ/loại đang chọn — CHỈ ĐỌC.</summary>
    public string MoTaViecSeLam
    {
        get
        {
            if (_tuyen is not { } tuyen) return "Chưa chọn loại tuyến.";
            var bien =
                !CoNetBien ? "Loại tuyến này chỉ có tim, không sinh nét biên."
                : BeRongBienVe is { } w
                    ? $"Nét biên: 2 nét cách tim {So(w / 2)} đơn vị bản vẽ (bề rộng {So(w)})."
                    : "Không đọc được bề rộng từ size đang nhập — chỉ nhận tim, không sinh nét biên.";
            return
                $"Đổi layer sang {tuyen.Layer}, ghi dữ liệu XBoss ({tuyen.Name} {_size}) vào từng tuyến. " +
                $"{bien} Đỉnh polyline giữ nguyên từng tọa độ.";
        }
    }

    /// <summary>Tham số để lệnh chạy; null khi form chưa hợp lệ (nút OK đang khóa).</summary>
    public KetQuaNhanTuyen? KetQua() =>
        CoTheOk && _he is { } he && _tuyen is { } tuyen
            ? new KetQuaNhanTuyen(he, tuyen, _size, SizeTuNhap, CanDoDoc ? _doDoc : null)
            : null;

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_tomTat.TongNhan == 0)
        {
            loi.Add(
                "Không có tuyến nào nhận được trong vùng chọn — chọn polyline/line của bản vẽ gốc " +
                "(không thuộc xref) rồi chạy lại.");
            return loi;
        }
        if (CacHe.Count == 0)
        {
            loi.Add(
                $"Rule pack {_pack.RulePack.Version} không khai hệ nào để vẽ (drawTools.systems rỗng) — " +
                "nạp lại rule pack có khối drawTools.");
            return loi;
        }
        if (_he is null)
        {
            loi.Add("Chưa chọn hệ.");
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
            canhBao.Add($"Size \"{_size}\" ngoài danh mục rule pack — vẫn nhận, XData đánh dấu \"custom\".");
        }
        if (CanDoDoc && CacDoDoc.Count == 0)
            canhBao.Add("Rule pack không khai sheetSetup.slopes — nhập độ dốc tay (vd 2%).");
        else if (CanDoDoc && _doDoc.Length > 0 &&
                 !CacDoDoc.Any(s => string.Equals(s, _doDoc, StringComparison.OrdinalIgnoreCase)))
        {
            canhBao.Add($"Độ dốc \"{_doDoc}\" ngoài danh mục rule pack — kiểm lại trước khi nhận.");
        }
        if (CoNetBien && _size.Length > 0 && BeRongBienVe is null)
            canhBao.Add($"Không đọc được bề rộng từ size \"{_size}\" — chỉ nhận tim, không sinh nét biên.");
        if (_tomTat.SoNhanLai > 0)
        {
            canhBao.Add(
                $"{_tomTat.SoNhanLai} tuyến đã là tuyến XBoss — nét biên cũ bị xóa và dựng lại theo cỡ mới; " +
                "dấu bóc khối lượng và vạch chia đốt của chúng bị gỡ, phải chạy lại XBOSS_BOCKL / XBOSS_VE_CHIADOT.");
        }
        return canhBao;
    }

    /// <summary>Báo lại mọi thứ suy ra từ hệ/loại tuyến/size/độ dốc rồi kiểm lại.</summary>
    private void TinhLai()
    {
        Bao(
            nameof(CacSize), nameof(Size), nameof(SizeTuNhap), nameof(CanDoDoc), nameof(DoDoc),
            nameof(CoNetBien), nameof(BeRongBienVe), nameof(LayerDich), nameof(MoTaViecSeLam));
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
