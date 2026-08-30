// ============================================================================================
// WpfStub.cs — KHAI BÁO GIẢ (stub) phần WPF + phần mã do BỘ BIÊN DỊCH XAML sinh ra, CHỈ để kiểm
// biên dịch mã Adapter trên Linux. Đọc README.md cạnh tệp này trước khi sửa.
//
// Vì sao tách khỏi AcadStub.cs: đây KHÔNG phải API AutoCAD. AcadStub.cs giữ đúng một việc — khai
// giả acmgd/acdbmgd/accoremgd; tệp này khai giả PresentationFramework/PresentationCore (WPF chỉ
// chạy trên Windows nên `dotnet build` trên Linux không có sẵn) và phần `InitializeComponent`
// do MSBuild sinh từ .xaml.
//
// Cùng luật với AcadStub.cs:
//   • Chỉ khai KIỂU + CHỮ KÝ, thân hàm rỗng / trả giá trị vô nghĩa.
//   • Chữ ký phải đối chiếu tài liệu WPF thật — stub sai chữ ký thì cổng CI xanh giả.
//   • Cổng này KHÔNG kiểm được XAML (markup, binding, tên style): XAML không có test tự động,
//     phải verify tay trên máy có AutoCAD 2026 (xem plugin-autocad/VERIFY-VA-PHAT-HANH.md §C0).
#nullable disable

#pragma warning disable CS1591

using System;

namespace System.Windows
{
    /// <summary>WPF thật: <c>System.Windows.RoutedEventArgs : EventArgs</c> — đối số của Button.Click.</summary>
    public class RoutedEventArgs : EventArgs
    {
    }

    /// <summary>
    /// WPF thật: <c>Window : ContentControl</c>. Chỉ khai đúng phần mã Adapter chạm tới —
    /// <c>DataContext</c> (thừa kế từ FrameworkElement) và <c>DialogResult</c> (bool? — đặt giá
    /// trị là đóng luôn cửa sổ modal). Mọi thuộc tính hình thức khác nằm trong XAML nên không cần.
    /// </summary>
    public class Window
    {
        public object DataContext { get; set; }
        public bool? DialogResult { get; set; }
        public string Title { get; set; }
        public Window Owner { get; set; }
        public bool? ShowDialog() => null;
        public void Close() { }
    }
}

namespace System.Windows.Media
{
    /// <summary>WPF thật: <c>System.Windows.Media.Color</c> — struct ARGB 8 bit mỗi kênh.</summary>
    public struct Color
    {
        public byte A { get; set; }
        public byte R { get; set; }
        public byte G { get; set; }
        public byte B { get; set; }

        public static Color FromRgb(byte r, byte g, byte b) => new Color { A = 255, R = r, G = g, B = b };

        public static Color FromArgb(byte a, byte r, byte g, byte b) =>
            new Color { A = a, R = r, G = g, B = b };
    }

    /// <summary>WPF thật: <c>Brush : Animatable : Freezable : DependencyObject</c>.</summary>
    public abstract class Brush
    {
        /// <summary>Freezable.Freeze(): đóng băng để dùng chung giữa các luồng; ném nếu không đóng băng được.</summary>
        public void Freeze() { }

        public bool IsFrozen => false;
    }

    public sealed class SolidColorBrush : Brush
    {
        public SolidColorBrush() { }

        public SolidColorBrush(Color color) { }

        public Color Color { get; set; }
    }
}

namespace XBoss.Cad.Acad.Ui.Wpf
{
    /// <summary>
    /// Phần <c>XBossDialog</c> do bộ biên dịch XAML sinh ra khi build thật trên Windows
    /// (<c>obj\…\XBossDialog.g.cs</c>): chỉ có <c>InitializeComponent()</c>.
    ///
    /// Cửa sổ XBoss được thiết kế để code-behind KHÔNG chạm phần tử đặt tên (<c>x:Name</c>) —
    /// mọi thứ đi qua binding vào ViewModel — nên phần sinh tự động chỉ còn đúng hàm này. Nhờ vậy
    /// thêm hộp thoại mới (PR3) là thêm <c>DataTemplate</c> trong XAML, KHÔNG phải thêm stub nào.
    /// </summary>
    public sealed partial class XBossDialog
    {
        private void InitializeComponent() { }
    }
}
