using System.ComponentModel;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>Vì sao một đối tượng trong vùng chọn KHÔNG được xét ngắt nét (M109 FR1).</summary>
public enum LyDoBoQuaNgatNet
{
    /// <summary>Không mang XData <c>XBOSS_VE</c> — nền kiến trúc, đối tượng vẽ tay (M109 §3 non-goals).</summary>
    KhongCoXData,

    /// <summary>Có XData nhưng vai trò khác <c>Tim</c> (nét biên, nhãn, vạch chia, chính đối tượng ngắt nét).</summary>
    VaiTroKhac,

    /// <summary>Thuộc xref — plugin không đụng bản vẽ tham chiếu (AC9).</summary>
    ThuocXref,
}

/// <summary>
/// Vùng chọn của <c>XBOSS_VE_NGATNET</c> sau khi lọc (M109 FR1) — bản ghi THUẦN, cùng khuôn
/// <see cref="TomTatChonNhanTuyen"/> của M107: Adapter đọc bản vẽ rồi đếm, hộp thoại và tóm tắt
/// cuối lệnh dùng chung đúng bộ số này nên hai đường (hộp thoại / dòng lệnh) không báo lệch nhau.
/// </summary>
public sealed record TomTatChonNgatNet(
    int SoTim = 0,
    int SoKhongCoXData = 0,
    int SoVaiTroKhac = 0,
    int SoThuocXref = 0)
{
    /// <summary>Tổng số tuyến tim đưa vào xét giao cắt.</summary>
    public int TongTim => SoTim;

    /// <summary>Tổng số đối tượng bị bỏ qua kèm lý do.</summary>
    public int TongBoQua => SoKhongCoXData + SoVaiTroKhac + SoThuocXref;

    /// <summary>Nhãn tiếng Việt của một lý do bỏ qua (dùng chung cho hộp thoại và dòng lệnh).</summary>
    public static string Nhan(LyDoBoQuaNgatNet lyDo) => lyDo switch
    {
        LyDoBoQuaNgatNet.KhongCoXData =>
            "không mang dữ liệu XBoss (nền kiến trúc, đối tượng vẽ tay — lệnh chỉ xét tuyến do XBoss quản)",
        LyDoBoQuaNgatNet.VaiTroKhac =>
            "là nét biên/nhãn/vạch chia/đối tượng ngắt nét của XBoss (đi theo tim, không xét riêng)",
        LyDoBoQuaNgatNet.ThuocXref =>
            "thuộc xref (plugin không sửa bản vẽ tham chiếu — bind/detach xref rồi chạy lại nếu cần)",
        _ => lyDo.ToString(),
    };

    /// <summary>Mỗi lý do bỏ qua một dòng "n đối tượng: lý do" (bỏ dòng có số 0) — FR9.</summary>
    public IReadOnlyList<string> DongBoQua
    {
        get
        {
            var ra = new List<string>();
            void Them(int so, LyDoBoQuaNgatNet lyDo)
            {
                if (so > 0) ra.Add($"{so} đối tượng: {Nhan(lyDo)}.");
            }
            Them(SoKhongCoXData, LyDoBoQuaNgatNet.KhongCoXData);
            Them(SoVaiTroKhac, LyDoBoQuaNgatNet.VaiTroKhac);
            Them(SoThuocXref, LyDoBoQuaNgatNet.ThuocXref);
            return ra;
        }
    }

    /// <summary>Một dòng mô tả phạm vi sẽ xét (chỉ đọc).</summary>
    public string MoTaSeXet =>
        SoTim == 0
            ? "Không có tuyến tim XBoss nào trong vùng chọn."
            : $"Xét giao cắt giữa {SoTim} tuyến tim XBoss.";
}

/// <summary>
/// Một tuyến tim đã đọc xong khỏi bản vẽ — dạng THUẦN để Core quyết định trên–dưới mà không cần
/// AutoCAD (Adapter đọc trong transaction CHỈ ĐỌC rồi truyền vào).
/// </summary>
/// <param name="BeRongVe">
/// Bề rộng tuyến theo ĐƠN VỊ BẢN VẼ (đọc từ size qua <see cref="DrawSize"/>); null = không đọc
/// được cỡ ⇒ không dựng được vùng che, cặp giao đó bị bỏ qua kèm lý do.
/// </param>
public sealed record TuyenNgatNet(
    string Handle,
    string HeId,
    string ItemId,
    string Size,
    string Layer,
    string EdgeStyle,
    double? BeRongVe);

/// <summary>
/// Một CẶP tuyến có giao cắt, kèm mọi điểm giao giữa chúng — một dòng trong hộp thoại đảo tay
/// (M109 FR7).
///
/// <b>Vì sao đơn vị đảo tay là CẶP TUYẾN chứ không phải từng điểm giao:</b> hai tuyến cắt nhau
/// nhiều lần vẫn chỉ có MỘT quan hệ trên–dưới thật (cùng một cặp cao độ chạy suốt tuyến); cho đảo
/// riêng từng điểm là mời kỹ sư vẽ ra bản vẽ tự mâu thuẫn — chỗ này tuyến A trên B, chỗ kia B trên
/// A. Quyết định đảo vì thế lưu được gọn vào XData bằng đúng cặp handle
/// (<c>HandleTim</c> + <c>HandleTimGiao</c>), không cần thêm trường chỉ số điểm giao.
///
/// Lớp này CÓ trạng thái đổi được (<see cref="DaoTay"/>) nên hiện thực
/// <see cref="INotifyPropertyChanged"/> để checkbox trong hộp thoại bind hai chiều; phần còn lại
/// vẫn thuần .NET, không chạm WPF/AutoCAD.
/// </summary>
public sealed class DongGiaoNgatNet : INotifyPropertyChanged
{
    private readonly IReadOnlyList<string> _priority;
    private bool _daoTay;

    /// <param name="a">Tuyến thứ nhất (thứ tự A/B chỉ là thứ tự đọc, không mang ý nghĩa trên–dưới).</param>
    /// <param name="b">Tuyến thứ hai.</param>
    /// <param name="diem">Toạ độ các điểm giao giữa hai tuyến (đơn vị bản vẽ).</param>
    /// <param name="priority">Hạng trình bày <c>crossingPolicy.priority</c>.</param>
    /// <param name="daoTay">Kỹ sư đã đảo cặp này ở lần chạy trước (đọc từ XData — AC5).</param>
    public DongGiaoNgatNet(
        TuyenNgatNet a,
        TuyenNgatNet b,
        IReadOnlyList<Diem2> diem,
        IReadOnlyList<string> priority,
        bool daoTay = false)
    {
        A = a;
        B = b;
        Diem = diem;
        _priority = priority;
        _daoTay = daoTay;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public TuyenNgatNet A { get; }
    public TuyenNgatNet B { get; }

    /// <summary>Các điểm giao giữa hai tuyến (đơn vị bản vẽ).</summary>
    public IReadOnlyList<Diem2> Diem { get; }

    public int SoDiemGiao => Diem.Count;

    /// <summary>Mã điểm giao hiện trong hộp thoại/dòng lệnh — cặp handle, ổn định giữa các lần chạy.</summary>
    public string Ma => $"{A.Handle}×{B.Handle}";

    /// <summary>
    /// Kỹ sư đảo chiều trên–dưới của cặp này (FR7). Ghi vào XData nên chạy lại lệnh GIỮ NGUYÊN
    /// quyết định thay vì áp lại <c>priority</c> (AC5).
    /// </summary>
    public bool DaoTay
    {
        get => _daoTay;
        set
        {
            if (_daoTay == value) return;
            _daoTay = value;
            Bao(nameof(DaoTay), nameof(QuyetDinh), nameof(TrenLaA), nameof(HeTren), nameof(HeDuoi), nameof(MoTa));
        }
    }

    /// <summary>Cặp này có cho đảo tay không (cùng hệ / thiếu cỡ thì không ngắt nét nên không đảo).</summary>
    public bool CoTheDao => LyDoBoQua is null;

    /// <summary>
    /// Vì sao cặp này KHÔNG ngắt nét; null = xử lý được. Hai ca (FR3):
    /// cùng hệ — phải xử lý bằng phụ kiện chứ không phải ngắt nét; và không đọc được cỡ một trong
    /// hai tuyến — không có bề rộng thì không dựng được vùng che, plugin KHÔNG đoán.
    /// </summary>
    public string? LyDoBoQua
    {
        get
        {
            if (string.Equals(A.HeId, B.HeId, StringComparison.Ordinal))
            {
                return
                    $"hai tuyến cùng hệ {A.HeId} — quy ước ngắt nét chỉ nói ai đi trên giữa HAI HỆ khác nhau; " +
                    "giao trong cùng hệ phải xử lý bằng phụ kiện (tê, co, bù), không phải bằng ngắt nét";
            }
            var thieu = new List<string>();
            if (A.BeRongVe is null) thieu.Add($"{A.ItemId} \"{A.Size}\" (handle {A.Handle})");
            if (B.BeRongVe is null) thieu.Add($"{B.ItemId} \"{B.Size}\" (handle {B.Handle})");
            return thieu.Count > 0
                ? $"không đọc được bề rộng từ cỡ của {string.Join(" và ", thieu)} — không có bề rộng thì " +
                  "không dựng được vùng che, plugin không đoán"
                : null;
        }
    }

    /// <summary>Quyết định trên–dưới theo <c>priority</c> (và đảo tay nếu có); null = cùng hệ.</summary>
    public QuyetDinhTrenDuoi? QuyetDinh =>
        CrossingGeometry.ChonTrenDuoi(A.HeId, B.HeId, _priority, _daoTay);

    /// <summary>Tuyến A có đi TRÊN không; null = chưa quyết được (cùng hệ).</summary>
    public bool? TrenLaA =>
        QuyetDinh is { } qd ? string.Equals(qd.HeTren, A.HeId, StringComparison.Ordinal) : null;

    /// <summary>Tuyến đi TRÊN (vẽ liền mạch); null = cùng hệ.</summary>
    public TuyenNgatNet? TuyenTren => TrenLaA is { } tren ? (tren ? A : B) : null;

    /// <summary>Tuyến đi DƯỚI (bị ngắt nét); null = cùng hệ.</summary>
    public TuyenNgatNet? TuyenDuoi => TrenLaA is { } tren ? (tren ? B : A) : null;

    public string HeTren => TuyenTren?.HeId ?? "";
    public string HeDuoi => TuyenDuoi?.HeId ?? "";

    /// <summary>Một dòng đọc được cho hộp thoại và dòng lệnh — cùng nội dung ở cả hai đường (FR10).</summary>
    public string MoTa
    {
        get
        {
            var dau = $"{Ma}: {A.HeId}/{A.ItemId} {A.Size} × {B.HeId}/{B.ItemId} {B.Size} · " +
                      $"{SoDiemGiao} điểm giao";
            if (LyDoBoQua is { } lyDo) return $"{dau} · KHÔNG ngắt nét — {lyDo}";
            var theo = _daoTay ? "đảo tay" : "theo priority";
            return $"{dau} · {HeTren} đi TRÊN, {HeDuoi} bị ngắt nét ({theo})";
        }
    }

    private void Bao(params string[] ten)
    {
        var xuLy = PropertyChanged;
        if (xuLy is null) return;
        foreach (var t in ten) xuLy(this, new PropertyChangedEventArgs(t));
    }
}

/// <summary>Phạm vi một lần chạy <c>XBOSS_VE_NGATNET</c> (FR1).</summary>
public enum PhamViNgatNet
{
    /// <summary>Toàn bộ tuyến XBoss trong bản vẽ.</summary>
    ToanBanVe,

    /// <summary>Kỹ sư quét chọn tuyến trên bản vẽ sau khi đóng hộp thoại.</summary>
    ChonTay,
}

/// <summary>Tham số một lần chạy <c>XBOSS_VE_NGATNET</c> — đúng những gì dòng lệnh hỏi.</summary>
public sealed record KetQuaHoiNgatNet(PhamViNgatNet PhamVi, IReadOnlyList<DongGiaoNgatNet> Dong);

/// <summary>
/// Đếm điểm ĐA GIAO (M109 §11): ba tuyến trở lên cùng cắt nhau trong một chỗ. Lệnh vẫn xử lý theo
/// TỪNG CẶP (wipeout chồng nhau vẫn cho hình đúng vì mỗi vùng che chỉ che tuyến đi dưới của đúng
/// cặp đó), nhưng phải ĐẾM ĐƯỢC và nói ra: chỗ như vậy trên bản vẽ thật gần như luôn cần kỹ sư
/// nhìn lại bằng mắt.
/// </summary>
public static class NgatNetDaGiao
{
    /// <summary>
    /// Số chỗ có từ 3 tuyến trở lên giao nhau, gom theo lưới ô vuông cạnh
    /// <paramref name="dungSai"/> (đơn vị bản vẽ). Gom theo lưới cố ý thay vì gom cụm chính xác:
    /// đây là con số CẢNH BÁO cho kỹ sư, không phải dữ liệu để vẽ — sai một hai chỗ ở rìa ô không
    /// đổi kết quả vẽ, mà cách này thì tất định và tuyến tính theo số điểm giao (NFR1).
    /// </summary>
    public static int Dem(IEnumerable<DongGiaoNgatNet> dong, double dungSai)
    {
        if (dungSai <= 0) return 0;
        var tuyenTheoO = new Dictionary<(long, long), HashSet<string>>();
        foreach (var d in dong)
        {
            foreach (var p in d.Diem)
            {
                var o = ((long)Math.Floor(p.X / dungSai), (long)Math.Floor(p.Y / dungSai));
                if (!tuyenTheoO.TryGetValue(o, out var tap)) tuyenTheoO[o] = tap = new HashSet<string>(StringComparer.Ordinal);
                tap.Add(d.A.Handle);
                tap.Add(d.B.Handle);
            }
        }
        return tuyenTheoO.Values.Count(t => t.Count >= 3);
    }
}

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_NGATNET</c> (M109 FR7/FR10, khung M106): danh sách cặp tuyến
/// giao nhau, ai đi trên theo <c>crossingPolicy.priority</c>, và ô ĐẢO cho từng dòng.
///
/// Thuần .NET, không chạm AutoCAD ⇒ test trên CI Linux. Quyết định trên–dưới lấy thẳng từ
/// <see cref="CrossingGeometry.ChonTrenDuoi"/> — ĐÚNG hàm mà lệnh dùng lúc vẽ, nên thứ hiện trên
/// hộp thoại và thứ vẽ ra bản vẽ không thể lệch nhau.
/// </summary>
public sealed class NgatNetDialogViewModel : DialogViewModelBase
{
    /// <summary>Số dòng hiện tối đa — dài hơn thì gộp phần đuôi thành một dòng đếm.</summary>
    private const int SoDongToiDa = 200;

    private readonly IReadOnlyList<DongGiaoNgatNet> _dong;
    private readonly double _dungSaiDaGiao;
    private PhamViNgatNet _phamVi = PhamViNgatNet.ToanBanVe;

    /// <param name="dong">Mọi cặp tuyến có giao cắt trong bản vẽ (Adapter đọc trước).</param>
    /// <param name="chinhSach">Khối <c>crossingPolicy</c> đang có hiệu lực (chỉ để hiện tham số).</param>
    /// <param name="dungSaiDaGiao">Cạnh ô gom điểm đa giao, đơn vị bản vẽ (thường 1mm quy đổi).</param>
    public NgatNetDialogViewModel(
        IReadOnlyList<DongGiaoNgatNet> dong, CrossingPolicySection chinhSach, double dungSaiDaGiao)
    {
        _dong = dong;
        ChinhSach = chinhSach;
        _dungSaiDaGiao = dungSaiDaGiao;
        // Đảo một dòng phải cập nhật ngay phần cảnh báo/tóm tắt của cả form (FR7).
        foreach (var d in _dong) d.PropertyChanged += (_, _) => TinhLai();
        KiemLai();
    }

    public override string TieuDe => "XBOSS_VE_NGATNET — Ngắt nét giao chéo";

    public override string MoTa =>
        "Tuyến đi dưới bị ngắt nét tại chỗ giao. Thứ tự trên–dưới suy từ hạng ưu tiên hệ trong rule " +
        "pack — tích ô ĐẢO ở dòng nào muốn ngược lại; lựa chọn đó được ghi vào bản vẽ nên chạy lại " +
        "lệnh vẫn giữ nguyên.";

    /// <summary>Chính sách đang áp — chỉ đọc, để hộp thoại nói rõ đang vẽ theo tham số nào.</summary>
    public CrossingPolicySection ChinhSach { get; }

    // ===== Phạm vi =====

    public PhamViNgatNet PhamVi
    {
        get => _phamVi;
        set
        {
            if (!Dat(ref _phamVi, value)) return;
            Bao(nameof(ToanBanVe), nameof(ChonTay), nameof(GhiChuPhamVi));
            KiemLai();
        }
    }

    /// <summary>Radio "toàn bộ bản vẽ".</summary>
    public bool ToanBanVe
    {
        get => _phamVi == PhamViNgatNet.ToanBanVe;
        set
        {
            if (value) PhamVi = PhamViNgatNet.ToanBanVe;
        }
    }

    /// <summary>Radio "chọn tay trên bản vẽ".</summary>
    public bool ChonTay
    {
        get => _phamVi == PhamViNgatNet.ChonTay;
        set
        {
            if (value) PhamVi = PhamViNgatNet.ChonTay;
        }
    }

    public string GhiChuPhamVi =>
        _phamVi == PhamViNgatNet.ChonTay
            ? $"Danh sách dưới đây tính trên toàn bộ {_dong.Count} cặp tuyến giao nhau trong bản vẽ. " +
              "Bấm OK rồi quét chọn — chỉ cặp có tuyến trong vùng chọn mới được vẽ."
            : "Vẽ ngắt nét cho mọi cặp tuyến giao nhau trong bản vẽ.";

    // ===== Danh sách điểm giao (FR7) =====

    /// <summary>Mọi cặp tuyến giao nhau (kể cả cặp không ngắt nét — kèm lý do, không giấu).</summary>
    public IReadOnlyList<DongGiaoNgatNet> DanhSach => _dong.Take(SoDongToiDa).ToList();

    /// <summary>Ghi chú khi danh sách bị cắt bớt cho hộp thoại đỡ dài.</summary>
    public string GhiChuDanhSach =>
        _dong.Count > SoDongToiDa
            ? $"Hiện {SoDongToiDa} cặp đầu trong tổng {_dong.Count} cặp — phần còn lại vẫn được vẽ theo priority."
            : "";

    public int SoNgatDuoc => _dong.Count(d => d.CoTheDao);
    public int SoCungHe => _dong.Count(d => !d.CoTheDao);
    public int SoDaoTay => _dong.Count(d => d.CoTheDao && d.DaoTay);
    public int SoDiemGiao => _dong.Where(d => d.CoTheDao).Sum(d => d.SoDiemGiao);

    /// <summary>Số chỗ có 3 tuyến trở lên cùng giao nhau (M109 §11 — "đa giao").</summary>
    public int SoDaGiao => NgatNetDaGiao.Dem(_dong, _dungSaiDaGiao);

    public string TomTat =>
        _dong.Count == 0
            ? "Không có cặp tuyến nào giao nhau trong bản vẽ."
            : $"{SoNgatDuoc} cặp tuyến sẽ ngắt nét ({SoDiemGiao} điểm giao)" +
              $"{(SoCungHe > 0 ? $", {SoCungHe} cặp bỏ qua" : "")}" +
              $"{(SoDaoTay > 0 ? $", {SoDaoTay} cặp đảo tay" : "")}.";

    /// <summary>Tham số để lệnh chạy; null khi form chưa hợp lệ.</summary>
    public KetQuaHoiNgatNet? KetQua() => CoTheOk ? new KetQuaHoiNgatNet(_phamVi, _dong) : null;

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_dong.Count == 0)
        {
            loi.Add(
                "Không có cặp tuyến nào giao nhau trong bản vẽ — lệnh chỉ xét tuyến tim do XBoss quản " +
                "(vẽ bằng XBOSS_VE hoặc nhận bằng XBOSS_VE_NHANTUYEN).");
            return loi;
        }
        if (SoNgatDuoc == 0)
        {
            loi.Add("Không cặp nào ngắt nét được — xem lý do từng dòng bên dưới.");
        }
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao()
    {
        var canhBao = new List<string>();
        if (SoCungHe > 0)
        {
            canhBao.Add(
                $"{SoCungHe} cặp không ngắt nét (cùng hệ hoặc không đọc được cỡ) — xem lý do trong danh sách, " +
                "các cặp này cần kỹ sư xử lý tay.");
        }
        if (SoDaoTay > 0)
        {
            canhBao.Add(
                $"{SoDaoTay} cặp đang ĐẢO TAY, không theo hạng ưu tiên của rule pack — soát lại trước khi " +
                "phát hành bản vẽ.");
        }
        if (SoDaGiao > 0)
        {
            canhBao.Add(
                $"{SoDaGiao} chỗ có từ 3 tuyến trở lên cùng giao nhau (đa giao): lệnh xử lý theo từng cặp nên " +
                "vùng che chồng nhau, hình vẫn đúng — nhưng nên nhìn lại bằng mắt chỗ đó trước khi in.");
        }
        return canhBao;
    }

    /// <summary>Một dòng đổi trạng thái đảo ⇒ tính lại toàn bộ phần suy ra + kiểm lại.</summary>
    private void TinhLai()
    {
        Bao(nameof(SoDaoTay), nameof(TomTat));
        KiemLai();
    }
}
