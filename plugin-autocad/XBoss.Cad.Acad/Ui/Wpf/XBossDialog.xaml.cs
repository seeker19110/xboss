using System.Windows;
using XBoss.Cad.Core.Ui.ViewModels;
using AcadApp = Autodesk.AutoCAD.ApplicationServices.Application;

namespace XBoss.Cad.Acad.Ui.Wpf;

/// <summary>
/// Cửa sổ nền của mọi hộp thoại XBoss (M106 FR1/FR3) — lớp vẽ MỎNG: không có quy tắc nghiệp vụ,
/// không đọc/ghi <c>Database</c>, không mở <c>Transaction</c>, không gọi mạng. Mọi trạng thái
/// (danh mục, giá trị đang chọn, lý do khóa OK, xem trước) nằm ở ViewModel thuần trong Core nên
/// test được không cần AutoCAD.
///
/// Công khai (public) vì bộ biên dịch XAML sinh mã cho lớp có <c>x:Class</c>; đặt internal sẽ kéo
/// theo <c>GeneratedInternalTypeHelper</c> — thêm một lớp sinh tự động mà cổng CI (AcadShim) phải
/// bịa stub, đổi lấy đúng con số không.
/// </summary>
public sealed partial class XBossDialog : Window
{
    private XBossDialog(DialogViewModelBase viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
    }

    /// <summary>
    /// Mở hộp thoại theo kiểu modal của AutoCAD (<c>ShowModalWindow</c>, KHÔNG dùng
    /// <c>Window.ShowDialog</c>): AutoCAD làm chủ cửa sổ cha nên hộp thoại không lạc ra sau bản vẽ,
    /// và vòng lặp lệnh dừng đúng cách trong lúc hộp thoại mở.
    /// Trả true khi kỹ sư bấm OK; false khi Hủy/đóng cửa sổ.
    /// </summary>
    public static bool Hoi(DialogViewModelBase viewModel) =>
        AcadApp.ShowModalWindow(new XBossDialog(viewModel)) == true;

    /// <summary>Nút OK — chỉ bấm được khi ViewModel báo hợp lệ (FR2), nên ở đây không kiểm lại.</summary>
    private void BamOk(object sender, RoutedEventArgs e) => DialogResult = true;

    /// <summary>
    /// Nút "zoom tới vùng nguồn" của <c>XBOSS_VE_NHANTANG</c> (M111 FR3). Hộp thoại vẫn KHÔNG
    /// đọc/ghi bản vẽ (guardrail M106 §2.1): việc đổi khung nhìn nằm trong một <see cref="Action"/>
    /// do LỆNH (Adapter) cắm vào ViewModel, ở đây chỉ chuyển tiếp cú bấm — và ViewModel tự nuốt lỗi
    /// kèm thông báo tiếng Việt để hộp thoại không bao giờ chết vì một nút phụ.
    /// </summary>
    private void BamZoomNguon(object sender, RoutedEventArgs e)
    {
        if (DataContext is NhanTangDialogViewModel vm) vm.ZoomToiNguon();
    }
}
