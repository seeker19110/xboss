using System.Globalization;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>Tham số một lần chạy <c>XBOSS_VE_REV_CHOT</c> (M110 FR4).</summary>
public sealed record KetQuaHoiRevChot(int So, string NgayIso, string NoiDung, string Nguoi);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_REV_CHOT</c> (M110 FR4/FR5): ngày + nội dung sửa + người thực
/// hiện của dòng revision sắp ghi vào bảng revision khung tên, kèm <b>cảnh báo bỏ sót</b> — các
/// thay đổi phát hiện được mà chưa nằm trong cloud nào của revision đang chốt.
///
/// Hai ranh giới cứng của đặc tả nằm ngay ở đây (chứ không chỉ ở lệnh):
/// <list type="bullet">
/// <item>Vượt <c>revisionPolicy.maxRows</c> → KHÓA OK kèm lý do; tuyệt đối không ghi đè dòng cũ
/// (guardrail 2 — số revision là chuỗi tăng, không tái sử dụng).</item>
/// <item>Còn vùng chưa khoanh → chỉ CẢNH BÁO và bắt tick "vẫn chốt", plugin không chặn (FR5).</item>
/// </list>
/// </summary>
public sealed class RevChotDialogViewModel : DialogViewModelBase
{
    /// <summary>Số dòng bỏ sót hiện tối đa — dài hơn thì gộp phần đuôi thành một dòng đếm.</summary>
    private const int SoDongBoSotToiDa = 12;

    private readonly IReadOnlyList<ThayDoiRevision> _boSot;
    private readonly int _maxRows;
    private string _ngayIso;
    private string _noiDung = "";
    private string _nguoi;
    private bool _vanChot;

    /// <param name="so">Số revision sắp chốt (mốc gần nhất + 1).</param>
    /// <param name="maxRows"><c>revisionPolicy.maxRows</c> — số dòng bảng revision khung tên chứa được.</param>
    /// <param name="ngayIso">Ngày mặc định (hôm nay, <c>yyyy-MM-dd</c>) — Core không tự lấy giờ hệ thống.</param>
    /// <param name="nguoi">Người thực hiện mặc định (tên đăng nhập XBoss, có thể rỗng).</param>
    /// <param name="boSot">Thay đổi chưa nằm trong cloud nào của revision đang chốt (FR5).</param>
    public RevChotDialogViewModel(
        int so, int maxRows, string ngayIso, string nguoi, IReadOnlyList<ThayDoiRevision> boSot)
    {
        So = so;
        _maxRows = maxRows;
        _ngayIso = ngayIso;
        _nguoi = nguoi;
        _boSot = boSot;
        KiemLai();
    }

    public int So { get; }

    public override string TieuDe => "XBOSS_VE_REV_CHOT — Chốt revision";

    public override string MoTa =>
        $"Chốt R{So.ToString(CultureInfo.InvariantCulture)}: ghi dòng revision vào khung tên của MỌI " +
        "layout và lưu mốc so sánh cho lần sửa sau.";

    public string NgayIso
    {
        get => _ngayIso;
        set
        {
            if (Dat(ref _ngayIso, value)) KiemLai();
        }
    }

    public string NoiDung
    {
        get => _noiDung;
        set
        {
            if (Dat(ref _noiDung, value)) KiemLai();
        }
    }

    public string Nguoi
    {
        get => _nguoi;
        set
        {
            if (Dat(ref _nguoi, value)) KiemLai();
        }
    }

    /// <summary>Kỹ sư xác nhận vẫn chốt dù còn vùng chưa khoanh (FR5 — plugin không chặn).</summary>
    public bool VanChot
    {
        get => _vanChot;
        set
        {
            if (Dat(ref _vanChot, value)) KiemLai();
        }
    }

    /// <summary>Có phải hỏi "vẫn chốt?" không (còn vùng bỏ sót).</summary>
    public bool CoBoSot => _boSot.Count > 0;

    /// <summary>Các dòng bỏ sót, tiếng Việt (FR5) — dùng chung cho hộp thoại và dòng lệnh.</summary>
    public IReadOnlyList<string> DongBoSot => DongBoSotCua(_boSot);

    /// <summary>Danh sách dòng bỏ sót để in ra dòng lệnh (đường lui FR9 dùng đúng nội dung này).</summary>
    public static IReadOnlyList<string> DongBoSotCua(IReadOnlyList<ThayDoiRevision> boSot)
    {
        var dong = boSot
            .Take(SoDongBoSotToiDa)
            .Select(d => new MucDeXuatRevision(d).Nhan)
            .ToList();
        if (boSot.Count > SoDongBoSotToiDa)
            dong.Add($"… và {boSot.Count - SoDongBoSotToiDa} thay đổi nữa.");
        return dong;
    }

    public string TomTatBoSot =>
        _boSot.Count == 0
            ? "Mọi thay đổi phát hiện được đều đã nằm trong cloud của revision này."
            : $"{_boSot.Count} thay đổi CHƯA nằm trong cloud nào của R{So.ToString(CultureInfo.InvariantCulture)}.";

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (So > _maxRows)
        {
            loi.Add(
                $"Khung tên chỉ có {_maxRows.ToString(CultureInfo.InvariantCulture)} dòng revision " +
                $"(revisionPolicy.maxRows) mà đang chốt R{So.ToString(CultureInfo.InvariantCulture)} — " +
                "phải đổi khung tên nhiều dòng hơn hoặc gộp revision; plugin KHÔNG ghi đè dòng cũ.");
            return loi;
        }
        if (!NgayHopLe(_ngayIso)) loi.Add("Ngày phải theo định dạng yyyy-MM-dd (vd 2026-08-29).");
        if (string.IsNullOrWhiteSpace(_noiDung)) loi.Add("Chưa ghi nội dung sửa đổi của revision này.");
        if (string.IsNullOrWhiteSpace(_nguoi)) loi.Add("Chưa ghi người thực hiện.");
        if (CoBoSot && !_vanChot)
            loi.Add("Còn vùng đã đổi mà chưa khoanh — tick \"vẫn chốt\" nếu đã cân nhắc xong.");
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao() =>
        CoBoSot ? [TomTatBoSot] : [];

    /// <summary>Ngày ISO <c>yyyy-MM-dd</c> hợp lệ chưa (dùng chung với đường dòng lệnh).</summary>
    public static bool NgayHopLe(string? ngayIso) =>
        DateTime.TryParseExact(
            ngayIso, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    /// <summary>Tham số để lệnh chạy; null khi form chưa hợp lệ.</summary>
    public KetQuaHoiRevChot? KetQua() =>
        CoTheOk ? new KetQuaHoiRevChot(So, _ngayIso, _noiDung.Trim(), _nguoi.Trim()) : null;
}
