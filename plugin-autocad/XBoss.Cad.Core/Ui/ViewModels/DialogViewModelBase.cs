using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>Mức nghiêm trọng của dòng thông điệp dưới form — quyết định màu chữ ở XAML.</summary>
public enum MucThongDiep
{
    /// <summary>Đủ điều kiện, không có gì bất thường (xanh).</summary>
    Tot,

    /// <summary>Chạy được nhưng có điều cần biết trước, vd size ngoài danh mục (vàng).</summary>
    CanhBao,

    /// <summary>Chưa chạy được — nút OK bị khóa (vàng/đỏ, kèm lý do).</summary>
    Loi,
}

/// <summary>
/// Lớp nền của mọi ViewModel hộp thoại XBoss (M106 FR1/FR2).
///
/// <b>THUẦN .NET</b>: chỉ dùng <see cref="INotifyPropertyChanged"/> — KHÔNG tham chiếu WPF,
/// AutoCAD hay PresentationFramework. Đây là ràng buộc thiết kế chính của M106 §4:
/// <c>XBoss.Cad.Tests</c> chỉ tham chiếu Core, nên đặt toàn bộ trạng thái hộp thoại (danh mục lựa
/// chọn, giá trị đang chọn, lý do khóa OK, con số xem trước) ở đây thì <b>test được hết hành vi
/// hộp thoại mà không cần AutoCAD</b>; XAML chỉ còn là lớp vẽ mỏng bind vào ViewModel.
///
/// Cùng tinh thần với <c>BlockDeXuatRules</c> (M103): nút OK khóa kèm LÝ DO tiếng Việt, và quy tắc
/// kiểm là CÙNG một bộ mà lệnh dùng — hộp thoại không bao giờ cho bấm OK thứ mà lệnh sẽ từ chối.
/// </summary>
public abstract class DialogViewModelBase : INotifyPropertyChanged
{
    private IReadOnlyList<string> _lyDoChuaHopLe = [];
    private IReadOnlyList<string> _canhBao = [];
    private bool _dangBao;

    public event PropertyChangedEventHandler? PropertyChanged;

    /// <summary>Tiêu đề cửa sổ: tên lệnh + nhãn tiếng Việt (vd <c>XBOSS_VE — Vẽ tuyến</c>).</summary>
    public abstract string TieuDe { get; }

    /// <summary>Câu dẫn ngắn hiện trên đầu form (một dòng, nói rõ hộp thoại này thu thập gì).</summary>
    public abstract string MoTa { get; }

    /// <summary>Mọi lý do khiến chưa bấm OK được, tiếng Việt, theo thứ tự ưu tiên. Rỗng = OK được.</summary>
    public IReadOnlyList<string> LyDoChuaHopLe => _lyDoChuaHopLe;

    /// <summary>Cảnh báo KHÔNG chặn: vẫn chạy được nhưng kỹ sư cần biết trước (FR5 — size custom).</summary>
    public IReadOnlyList<string> CanhBao => _canhBao;

    /// <summary>Nút OK có bật không (FR2).</summary>
    public bool CoTheOk => _lyDoChuaHopLe.Count == 0;

    /// <summary>Dòng thông điệp hiện ngay dưới form — lý do khóa OK, hoặc cảnh báo, hoặc lời xác nhận.</summary>
    public string ThongDiep =>
        _lyDoChuaHopLe.Count > 0 ? string.Join(" ", _lyDoChuaHopLe)
        : _canhBao.Count > 0 ? string.Join(" ", _canhBao)
        : "Đủ thông tin — bấm OK để chạy lệnh.";

    /// <summary>Mức của <see cref="ThongDiep"/> (XAML đổi màu theo, không tự suy diễn lại).</summary>
    public MucThongDiep MucDo =>
        _lyDoChuaHopLe.Count > 0 ? MucThongDiep.Loi
        : _canhBao.Count > 0 ? MucThongDiep.CanhBao
        : MucThongDiep.Tot;

    /// <summary>Lý do khóa OK — cài đặt ở ViewModel con, luôn gọi lại qua <see cref="KiemLai"/>.</summary>
    protected abstract IReadOnlyList<string> Kiem();

    /// <summary>Cảnh báo không chặn; mặc định không có.</summary>
    protected virtual IReadOnlyList<string> KiemCanhBao() => [];

    /// <summary>
    /// Chạy lại bộ kiểm rồi báo cho giao diện. ViewModel con gọi hàm này ở CUỐI hàm dựng và sau mỗi
    /// lần đổi lựa chọn (thường là trong <c>TinhLai()</c> của chính nó).
    /// </summary>
    protected void KiemLai()
    {
        _lyDoChuaHopLe = Kiem();
        _canhBao = KiemCanhBao();
        Bao(nameof(LyDoChuaHopLe), nameof(CanhBao), nameof(CoTheOk), nameof(ThongDiep), nameof(MucDo));
    }

    /// <summary>
    /// Gán trường + báo đổi (chỉ khi thật sự khác) — trả true nếu có đổi.
    ///
    /// Bỏ qua mọi lần gán trong lúc <see cref="Bao"/> đang chạy: WPF re-bind một
    /// <c>ComboBox IsEditable</c> khi <c>ItemsSource</c> đổi thì **ghi ngược chuỗi rỗng** vào
    /// nguồn trước khi ta kịp đẩy giá trị mới xuống — nuốt mất size vừa đặt. Cùng cơ chế chống
    /// vòng lặp mà <c>DeXuatBlockDialog</c> (M103) dùng bằng cờ <c>_dangDungGiaoDien</c>.
    /// </summary>
    protected bool Dat<T>(ref T truong, T giaTri, [CallerMemberName] string? ten = null)
    {
        if (_dangBao) return false;
        if (EqualityComparer<T>.Default.Equals(truong, giaTri)) return false;
        truong = giaTri;
        if (ten is not null) Bao(ten);
        return true;
    }

    /// <summary>Báo cho giao diện là các thuộc tính này đã đổi (dùng cho thuộc tính suy ra).</summary>
    protected void Bao(params string[] ten)
    {
        var xuLy = PropertyChanged;
        if (xuLy is null) return;
        var cu = _dangBao;
        _dangBao = true;
        try
        {
            foreach (var t in ten) xuLy(this, new PropertyChangedEventArgs(t));
        }
        finally
        {
            _dangBao = cu;
        }
    }
}
