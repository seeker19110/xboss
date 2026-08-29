using System.Globalization;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Routing;
using XBoss.Cad.Core.Zoning;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>
/// Một tuyến do <c>XBOSS_VE_TUYENTUDONG</c> sinh ra ĐANG có trong bản vẽ (M114 FR12/FR13).
/// </summary>
/// <param name="LechBam">
/// Băm hình học hiện tại khác băm lúc sinh ⇒ kỹ sư đã sửa tay: chạy lại phải BỎ QUA và đánh dấu
/// <c>SuaTay</c> (guardrail 4 — không đè lên công sức của người).
/// </param>
public sealed record TuyenTuDongDaCo(string Handle, string HeId, bool SuaTay, bool LechBam)
{
    /// <summary>Tuyến phải giữ nguyên khi chạy lại (đã đánh dấu, hoặc vừa phát hiện lệch băm).</summary>
    public bool PhaiGiuNguyen => SuaTay || LechBam;
}

/// <summary>Tham số một lần chạy <c>XBOSS_VE_TUYENTUDONG</c> — thu từ hộp thoại hoặc dòng lệnh.</summary>
public sealed record KetQuaTuyenTuDong(
    DrawSystem He,
    DrawLine Tuyen,
    string Size,
    bool SizeTuNhap,
    string? DoDoc,
    KetQuaKeHoach KeHoach);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_TUYENTUDONG</c> (M114 FR5 + FR10) — gộp việc chọn phạm vi và
/// BẢNG XEM TRƯỚC BẮT BUỘC vào một form: đổi hệ/loại tuyến/cỡ là kế hoạch đi tuyến được tính lại
/// ngay, kèm số thiết bị nối được, tổng chiều dài, số co, tầng/làn được cấp và danh sách không
/// giải được.
///
/// Thuần .NET, không chạm AutoCAD ⇒ toàn bộ AC1/AC2/AC4/AC5/AC7 kiểm được trên CI Linux. Việc vẽ
/// NÉT TẠM là <see cref="Action{T}"/> do LỆNH cắm vào (<c>veNetTam</c>) — hộp thoại vẫn không
/// đọc/ghi bản vẽ (guardrail M106 §2.1), y như nút zoom của M111.
///
/// Ba ranh giới cứng của M114 §3 được ép ngay tại đây:
/// <list type="number">
/// <item>Không giải được thì NÓI không giải được: mọi thiết bị ngoài bán kính, hành lang hết làn,
/// không thỏa tự chảy đều hiện thành dòng kèm lý do — hộp thoại không bao giờ giấu bớt.</item>
/// <item>Không nới <c>snapRadiusMm</c> hay hạ độ dốc: hộp thoại không có ô nào sửa được hai giá
/// trị đó, chúng đọc thẳng từ rule pack.</item>
/// <item>Một hệ một lượt: chỉ có MỘT ô chọn hệ, không có nút "chạy tất cả các hệ".</item>
/// </list>
/// </summary>
public sealed class TuyenTuDongDialogViewModel : DialogViewModelBase
{
    private readonly DrawToolsPack _pack;
    private readonly RoutingPolicySection _chinhSach;
    private readonly double _toMm;
    private readonly IReadOnlyList<HanhLangChoTuyen> _hanhLang;
    private readonly IReadOnlyList<ThietBiChoTuyen> _thietBi;
    private readonly IReadOnlyList<TuyenTuDongDaCo> _tuyenCu;
    private readonly IReadOnlyList<RanhGioiVung> _vungCam;
    private readonly Diem2 _nguon;
    private readonly bool _theoVungChon;
    private readonly Action<IReadOnlyList<NhanhVeRa>>? _veNetTam;

    private DrawSystem? _he;
    private DrawLine? _tuyen;
    private string _size = "";
    private string _doDoc = "";
    private string _caoDoThietBi = "";
    private string _caoDoXa = "";
    private bool _boQuaThietBiDaCoTuyen = true;
    private string _loiNetTam = "";

    private KetQuaKeHoach _keHoach = Trong("Chưa tính kế hoạch đi tuyến.");

    /// <param name="pack">Rule pack v15+ đang nạp.</param>
    /// <param name="chinhSach">Khối <c>drawTools.routingPolicy</c> (đã kiểm <c>enabled</c>).</param>
    /// <param name="toMm">1 đơn vị bản vẽ = bao nhiêu mm.</param>
    /// <param name="hanhLang">Hành lang đọc từ bản vẽ, kèm sổ chiếm chỗ.</param>
    /// <param name="thietBi">Thiết bị đọc từ bản vẽ (mọi hệ — lọc theo hệ đang chọn).</param>
    /// <param name="tuyenCu">Tuyến tự động đang có trong bản vẽ (để dựng lại / bỏ qua).</param>
    /// <param name="nguon">Điểm nguồn kỹ sư đã bấm, ĐƠN VỊ BẢN VẼ.</param>
    /// <param name="vungCam">Vùng cấm kỹ sư đã chọn (rỗng = không có).</param>
    /// <param name="theoVungChon">Kỹ sư đã quét chọn thiết bị trước khi chạy lệnh (FR5).</param>
    /// <param name="veNetTam">Vẽ lại nét tạm xem trước mỗi lần kế hoạch đổi (FR10).</param>
    public TuyenTuDongDialogViewModel(
        DrawToolsPack pack,
        RoutingPolicySection chinhSach,
        double toMm,
        IReadOnlyList<HanhLangChoTuyen> hanhLang,
        IReadOnlyList<ThietBiChoTuyen> thietBi,
        IReadOnlyList<TuyenTuDongDaCo> tuyenCu,
        Diem2 nguon,
        IReadOnlyList<RanhGioiVung>? vungCam = null,
        bool theoVungChon = false,
        string? heId = null,
        string? itemId = null,
        string? size = null,
        string? doDoc = null,
        double? caoDoThietBiMm = null,
        double? caoDoXaMm = null,
        Action<IReadOnlyList<NhanhVeRa>>? veNetTam = null)
    {
        _pack = pack;
        _chinhSach = chinhSach;
        _toMm = toMm > 0 ? toMm : 1;
        _hanhLang = hanhLang;
        _thietBi = thietBi;
        _tuyenCu = tuyenCu;
        _vungCam = vungCam ?? [];
        _nguon = nguon;
        _theoVungChon = theoVungChon;
        _veNetTam = veNetTam;

        _he = CacHe.FirstOrDefault(s => string.Equals(s.Id, heId, StringComparison.Ordinal))
              ?? CacHe.FirstOrDefault();
        _tuyen = CacLoaiTuyen.FirstOrDefault(l => string.Equals(l.ItemId, itemId, StringComparison.Ordinal))
                 ?? CacLoaiTuyen.FirstOrDefault();
        _size = (size ?? "").Trim().Length > 0 ? size!.Trim() : (CacSize.Count > 0 ? CacSize[0] : "");
        _doDoc = CanDoDoc ? ((doDoc ?? "").Trim().Length > 0 ? doDoc!.Trim() : DoDocDau()) : "";
        _caoDoThietBi = caoDoThietBiMm is { } c ? So(c) : "";
        _caoDoXa = caoDoXaMm is { } x ? So(x) : "";
        TinhLai();
    }

    public override string TieuDe => "XBOSS_VE_TUYENTUDONG — Đi tuyến tự động theo hành lang";

    public override string MoTa =>
        "Chọn hệ, loại tuyến và cỡ; lệnh đi tuyến từ từng thiết bị về điểm nguồn dọc hành lang. " +
        "Bảng dưới là ĐÚNG những gì sẽ ghi vào bản vẽ — không bấm OK thì bản vẽ không đổi một nét nào.";

    // ===== Hệ / loại tuyến / cỡ (FR5 — cùng bộ tham số với XBOSS_VE) =====

    public IReadOnlyList<DrawSystem> CacHe => _pack.DrawTools.Systems;

    public DrawSystem? He
    {
        get => _he;
        set
        {
            if (!Dat(ref _he, value)) return;
            _tuyen = CacLoaiTuyen.FirstOrDefault();
            _size = CacSize.Count > 0 ? CacSize[0] : "";
            _doDoc = CanDoDoc ? DoDocDau() : "";
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
            _size = CacSize.Count > 0 ? CacSize[0] : "";
            _doDoc = CanDoDoc ? DoDocDau() : "";
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

    /// <summary>Cỡ ngoài danh mục rule pack ⇒ XData đánh dấu <c>custom</c> (M100 §4).</summary>
    public bool SizeTuNhap =>
        _size.Length > 0 && !CacSize.Any(s => string.Equals(s, _size, StringComparison.OrdinalIgnoreCase));

    // ===== Tự chảy (FR8) =====

    /// <summary>Loại tuyến bắt buộc có độ dốc ⇒ đi tuyến ở chế độ TỰ CHẢY.</summary>
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

    /// <summary>Cao độ tim tuyến TẠI THIẾT BỊ (mm) — hỏi, không suy (M100 §6.3).</summary>
    public string CaoDoThietBi
    {
        get => _caoDoThietBi;
        set
        {
            if (!Dat(ref _caoDoThietBi, (value ?? "").Trim())) return;
            TinhLai();
        }
    }

    /// <summary>Cao độ tim tuyến TẠI ĐIỂM XẢ/nguồn (mm) — hỏi, không suy.</summary>
    public string CaoDoXa
    {
        get => _caoDoXa;
        set
        {
            if (!Dat(ref _caoDoXa, (value ?? "").Trim())) return;
            TinhLai();
        }
    }

    // ===== Phạm vi thiết bị (FR5) =====

    /// <summary>Bỏ qua thiết bị đã có tuyến chạy tới (mặc định bật — chạy lại không nối chồng).</summary>
    public bool BoQuaThietBiDaCoTuyen
    {
        get => _boQuaThietBiDaCoTuyen;
        set
        {
            if (!Dat(ref _boQuaThietBiDaCoTuyen, value)) return;
            TinhLai();
        }
    }

    /// <summary>Kỹ sư đã quét chọn thiết bị trước khi chạy lệnh (chỉ đọc — chọn trước khi mở form).</summary>
    public bool TheoVungChon => _theoVungChon;

    public string MoTaPhamVi =>
        (_theoVungChon
            ? "Tập thiết bị: đúng vùng kỹ sư đã quét chọn"
            : "Tập thiết bị: mọi thiết bị của hệ đang chọn trong bản vẽ") +
        (_boQuaThietBiDaCoTuyen ? ", bỏ qua cái đã có tuyến." : ", kể cả cái đã có tuyến.") +
        $" Điểm nguồn: {So(_nguon.X)}, {So(_nguon.Y)}." +
        (_vungCam.Count > 0
            ? $" Vùng cấm: {_vungCam.Count} vùng (cạnh hành lang chạm vào bị loại khỏi đồ thị)."
            : " Không khai vùng cấm.");

    // ===== Xem trước (FR10) =====

    /// <summary>Kế hoạch đi tuyến của lựa chọn hiện tại — nguồn của mọi con số xem trước.</summary>
    public KetQuaKeHoach KeHoach => _keHoach;

    public string TomTatXemTruoc =>
        _keHoach.LoiChan is { } chan
            ? chan
            : $"Nối được {_keHoach.SoNoiDuoc}/{_keHoach.SoThietBiDich} thiết bị · " +
              $"{_keHoach.Nhanh.Count} polyline · tổng dài {SoDai(_keHoach.TongChieuDai * _toMm)} mm · " +
              $"{_keHoach.SoCo} co · dùng chung {(_keHoach.TiLeDungChung * 100).ToString("0.#", CultureInfo.InvariantCulture)}% số cạnh.";

    /// <summary>Tầng/làn được cấp trong từng hành lang (FR9) — mỗi hành lang một dòng.</summary>
    public IReadOnlyList<string> DongCapLan => _keHoach.ChiemCho
        .Select(c => c.LanMoi is { } l
            ? $"Hành lang {c.HanhLangId}: {l.TierId} · làn {So(l.LanTuMm)}–{So(l.LanDenMm)} mm · " +
              $"cao độ {So(l.CaoDoMm)} mm"
            : $"Hành lang {c.HanhLangId}: GỠ chiếm chỗ cũ của hệ này (tuyến mới không đi qua nữa)")
        .ToList();

    /// <summary>Thiết bị/đoạn KHÔNG giải được kèm lý do đếm được (guardrail 3).</summary>
    public IReadOnlyList<string> DongKhongGiai => _keHoach.KhongGiai
        .Select(k => $"{k.ThietBi}: {k.LyDo}")
        .ToList();

    /// <summary>Tuyến tự động đang có của hệ đang chọn: bao nhiêu dựng lại, bao nhiêu bỏ qua (FR12/FR13).</summary>
    public string MoTaTuyenCu
    {
        get
        {
            var cua = TuyenCuCuaHe();
            if (cua.Count == 0) return "Hệ này chưa có tuyến tự động nào trong bản vẽ.";
            var giu = cua.Count(t => t.PhaiGiuNguyen);
            var moi = cua.Count(t => t.LechBam && !t.SuaTay);
            return
                $"{cua.Count - giu} tuyến tự động cũ sẽ bị XÓA rồi dựng lại; {giu} tuyến GIỮ NGUYÊN vì đã " +
                $"sửa tay" + (moi > 0 ? $" (trong đó {moi} tuyến lần này mới phát hiện lệch hình học)" : "") + ".";
        }
    }

    /// <summary>Số tuyến sẽ bỏ qua vì kỹ sư đã sửa tay (FR12 — vào tóm tắt và báo cáo).</summary>
    public int SoBoQuaSuaTay => TuyenCuCuaHe().Count(t => t.PhaiGiuNguyen);

    /// <summary>Số tuyến tự động cũ sẽ bị xóa để dựng lại (FR13).</summary>
    public int SoDungLai => TuyenCuCuaHe().Count(t => !t.PhaiGiuNguyen);

    /// <summary>Thông báo khi không vẽ được nét tạm (chỉ mất tiện ích, không chặn lệnh).</summary>
    public string ThongBaoNetTam => _loiNetTam;

    public string GhiChuChinhSach =>
        $"Rule pack {_pack.RulePack.Version}: bán kính rẽ nhánh {So(_chinhSach.SnapRadiusMm)} mm · " +
        $"α co {So(_chinhSach.Cost.ElbowMm)} mm · β độ đông {So(_chinhSach.Cost.CongestionMm)} mm/m · " +
        $"γ gom trục {_chinhSach.Cost.ReuseFactor.ToString("0.##", CultureInfo.InvariantCulture)}. " +
        "Ba giá trị này CHỈ sửa được trong rule pack — lệnh không nới để cho ra kết quả.";

    /// <summary>Tham số để lệnh chạy; null khi form chưa hợp lệ.</summary>
    public KetQuaTuyenTuDong? KetQua() =>
        CoTheOk && _he is { } he && _tuyen is { } tuyen
            ? new KetQuaTuyenTuDong(he, tuyen, _size, SizeTuNhap, CanDoDoc ? _doDoc : null, _keHoach)
            : null;

    // ===== Kiểm =====

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (CacHe.Count == 0)
        {
            loi.Add(
                $"Rule pack {_pack.RulePack.Version} không khai hệ nào (drawTools.systems rỗng) — " +
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
                $"Hệ {_he.Name} ({_he.Id}) không khai loại tuyến nào trong rule pack — chọn hệ khác.");
            return loi;
        }
        if (_tuyen is null) loi.Add("Chưa chọn loại tuyến.");
        if (_size.Length == 0)
            loi.Add("Chưa chọn cỡ tuyến — chọn trong danh mục hoặc gõ cỡ khác.");
        else if (DrawSize.PhanTich(_size) is null)
        {
            loi.Add(
                $"Không đọc được kích thước từ cỡ \"{_size}\" nên KHÔNG cấp được làn trong hành lang — " +
                "dùng đúng định dạng rule pack (300x200 hoặc DN50).");
        }
        if (CanDoDoc)
        {
            if (_doDoc.Length == 0)
            {
                loi.Add(
                    $"Tuyến {_tuyen?.Name} bắt buộc có độ dốc (rule pack khai slopeRequired) — chọn trong " +
                    "danh mục hoặc nhập tay (vd 2%).");
            }
            else if (DocDoDoc(_doDoc) is null)
            {
                loi.Add($"Độ dốc \"{_doDoc}\" không đọc được — nhập dạng phần trăm, vd 2%.");
            }
            if (DocSo(_caoDoThietBi) is null)
                loi.Add("Chế độ tự chảy cần cao độ tim tuyến TẠI THIẾT BỊ (mm) — nhập tay, bản vẽ 2D không chứa cao độ.");
            if (DocSo(_caoDoXa) is null)
                loi.Add("Chế độ tự chảy cần cao độ tim tuyến TẠI ĐIỂM XẢ (mm) — nhập tay.");
        }
        if (loi.Count > 0) return loi;

        if (_keHoach.LoiChan is { } chan) loi.Add(chan);
        else if (_keHoach.SoNoiDuoc == 0)
        {
            loi.Add(
                "Không nối được thiết bị nào — xem danh sách lý do bên dưới. Lệnh KHÔNG vẽ đại một tuyến " +
                "(bổ sung hành lang, bỏ vùng cấm chắn ngang, hoặc soát lại cao độ tự chảy rồi chạy lại).");
        }
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao()
    {
        var canhBao = new List<string>();
        if (SizeTuNhap && _size.Length > 0)
            canhBao.Add($"Cỡ \"{_size}\" ngoài danh mục rule pack — vẫn vẽ, XData đánh dấu \"custom\".");
        if (_keHoach.KhongGiai.Count > 0)
        {
            canhBao.Add(
                $"{_keHoach.KhongGiai.Count} thiết bị KHÔNG nối được — danh sách lý do ở bảng dưới, " +
                "lệnh sẽ không vẽ gì cho các thiết bị đó.");
        }
        if (SoBoQuaSuaTay > 0)
        {
            canhBao.Add(
                $"{SoBoQuaSuaTay} tuyến tự động đã bị sửa tay — chạy lại GIỮ NGUYÊN chúng (không đè lên " +
                "công sức của kỹ sư).");
        }
        if (SoDungLai > 0)
        {
            canhBao.Add(
                $"{SoDungLai} tuyến tự động cũ của hệ này sẽ bị XÓA rồi dựng lại theo kết quả mới " +
                "(chiếm chỗ trong hành lang được gỡ trước khi cấp lại).");
        }
        if (CoNetBien && _size.Length > 0 && DrawSize.PhanTich(_size)?.CaoMm is null)
        {
            canhBao.Add(
                $"Cỡ \"{_size}\" không có chiều cao thiết diện — cao độ tầng tính theo đường kính, " +
                "soát lại nếu tuyến này là ống gió chữ nhật.");
        }
        if (_loiNetTam.Length > 0) canhBao.Add(_loiNetTam);
        return canhBao;
    }

    /// <summary>Loại tuyến sinh 2 nét biên thể hiện bề rộng (M100 FR4).</summary>
    public bool CoNetBien => _tuyen?.EdgeStyle == "double";

    // ===== Tính lại kế hoạch =====

    private void TinhLai()
    {
        _keHoach = Lap();
        Bao(
            nameof(CacSize), nameof(Size), nameof(SizeTuNhap), nameof(CanDoDoc), nameof(DoDoc),
            nameof(CaoDoThietBi), nameof(CaoDoXa), nameof(CoNetBien), nameof(KeHoach),
            nameof(TomTatXemTruoc), nameof(DongCapLan), nameof(DongKhongGiai), nameof(MoTaTuyenCu),
            nameof(MoTaPhamVi), nameof(SoBoQuaSuaTay), nameof(SoDungLai));
        KiemLai();

        if (_veNetTam is null) return;
        try
        {
            _veNetTam(_keHoach.Nhanh);
            if (_loiNetTam.Length == 0) return;
            _loiNetTam = "";
            KiemLai();
        }
        catch (Exception e)
        {
            // Nét tạm chỉ là tiện ích xem trước: hỏng thì báo, tuyệt đối không làm chết hộp thoại
            // (bảng xem trước bằng số vẫn đủ để quyết định — cùng cách M111 nuốt lỗi nút zoom).
            _loiNetTam = $"Không vẽ được nét tạm xem trước ({e.GetType().Name}) — bảng số vẫn đúng.";
            Bao(nameof(ThongBaoNetTam));
            KiemLai();
        }
    }

    private KetQuaKeHoach Lap()
    {
        if (_he is not { } he || _tuyen is null) return Trong("Chưa chọn hệ/loại tuyến.");
        if (DrawSize.PhanTich(_size) is not { } kt)
            return Trong($"Chưa đọc được kích thước từ cỡ \"{_size}\".");

        RangBuocTuChay? tuChay = null;
        var caoDoThietBi = 0.0;
        if (CanDoDoc)
        {
            if (DocDoDoc(_doDoc) is not { } doc ||
                DocSo(_caoDoThietBi) is not { } cTb ||
                DocSo(_caoDoXa) is not { } cXa)
            {
                return Trong("Chế độ tự chảy còn thiếu độ dốc hoặc cao độ.");
            }
            // Độ dốc là tỉ số theo chiều dài THẬT (mm); DinhTuyen đo chiều dài bằng ĐƠN VỊ BẢN VẼ
            // nên nhân toMm để hai vế cùng đơn vị.
            tuChay = new RangBuocTuChay(doc * _toMm, cXa);
            caoDoThietBi = cTb;
        }

        return KeHoachDiTuyen.Lap(
            _hanhLang,
            _thietBi,
            _chinhSach,
            he.Id,
            _nguon,
            _chinhSach.SnapRadiusMm / _toMm,
            ThamSo(),
            kt.RongMm,
            kt.CaoMm ?? kt.RongMm,
            CapPhatLanTang.HeDienDuAn,
            _vungCam,
            tuChay,
            caoDoThietBi,
            _boQuaThietBiDaCoTuyen,
            _theoVungChon);
    }

    /// <summary>
    /// 3 hệ số α/β/γ quy về ĐƠN VỊ BẢN VẼ.
    /// α: <c>elbowMm</c> là chiều dài tương đương (mm) ⇒ chia <c>toMm</c>.
    /// β: <c>congestionMm</c> là mm cộng thêm trên mỗi MÉT tuyến ⇒ hệ số trên mỗi đơn vị dài là
    /// <c>congestionMm / 1000</c> (hệ số đơn vị bản vẽ tự triệt tiêu vì cả tử lẫn mẫu cùng quy đổi).
    /// γ là tỉ số, không có đơn vị.
    /// </summary>
    private ThamSoDinhTuyen ThamSo() => new(
        _chinhSach.Cost.ElbowMm / _toMm,
        _chinhSach.Cost.CongestionMm / 1000,
        _chinhSach.Cost.ReuseFactor);

    /// <summary>Kế hoạch RỖNG kèm lý do — dùng khi form chưa đủ dữ liệu để tính.</summary>
    private static KetQuaKeHoach Trong(string lyDo) => new([], [], [], 0, 0, 0, 0, 0, 0, lyDo);

    private List<TuyenTuDongDaCo> TuyenCuCuaHe() => _he is { } he
        ? _tuyenCu.Where(t => string.Equals(t.HeId, he.Id, StringComparison.Ordinal)).ToList()
        : [];

    private string DoDocDau() => CacDoDoc.Count > 0 ? CacDoDoc[0] : "";

    /// <summary>Độ dốc dạng chuỗi rule pack (<c>2%</c>) → tỉ số 0,02; null = không đọc được.</summary>
    public static double? DocDoDoc(string? chuoi)
    {
        var s = (chuoi ?? "").Trim();
        if (s.Length == 0) return null;
        var phanTram = s.EndsWith('%');
        if (phanTram) s = s[..^1].Trim();
        if (!double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v)) return null;
        if (v < 0) return null;
        return phanTram ? v / 100 : v;
    }

    private static double? DocSo(string? s) =>
        double.TryParse((s ?? "").Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : null;

    private static string So(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);

    private static string SoDai(double v) => v.ToString("#,##0.#", CultureInfo.InvariantCulture);
}
