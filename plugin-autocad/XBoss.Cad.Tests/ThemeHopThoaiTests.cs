using System.Text.RegularExpressions;
using System.Xml.Linq;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// Bất biến TRÌNH BÀY của hộp thoại WPF (<c>Ui/Wpf/XBossDialog.xaml</c>), đúc kết từ sự cố thật
/// 2026-08-26 trên AutoCAD 2026: các <c>ComboBox</c> của <c>XBOSS_VE</c> hiện nền SÁNG + chữ gần
/// trắng nên đọc như đang bị khóa, trong khi phần còn lại của hộp thoại đã tối.
///
/// <para><b>Nguyên nhân:</b> ControlTemplate mặc định của WPF (theme Aero2 của Windows) vẽ chrome
/// bằng brush hard-code của hệ điều hành và KHÔNG đọc <c>Background</c> của control. Đặt
/// <c>&lt;Setter Property="Background"&gt;</c> suông là đặt vào hư không — mà
/// <c>Foreground</c> thì lại ăn, nên ra đúng cảnh chữ sáng trên nền sáng.</para>
///
/// <para><b>Vì sao phải canh bằng test đọc mã nguồn:</b> XAML không có test tự động và cổng CI
/// <c>XBoss.Cad.AcadShim</c> chỉ biên dịch phần C# (WPF chỉ có trên Windows) — markup hoàn toàn
/// nằm ngoài tầm CI. Test này không dựng được giao diện, nhưng kẹp được đúng lớp lỗi đã xảy ra:
/// style không có template, tên brush gõ sai, <c>TargetName</c> trỏ vào hư không, thiếu trạng thái
/// khóa, hardcode mã màu. Phần "trông thế nào" vẫn phải verify tay (VERIFY-VA-PHAT-HANH.md §C8b).</para>
/// </summary>
public sealed class ThemeHopThoaiTests
{
    private static readonly XNamespace Wpf = "http://schemas.microsoft.com/winfx/2006/xaml/presentation";
    private static readonly XNamespace X = "http://schemas.microsoft.com/winfx/2006/xaml";

    private static string ThuMucWpf =>
        Path.Combine(Path.GetDirectoryName(RepoPaths.DoiChungDir)!, "XBoss.Cad.Acad", "Ui", "Wpf");

    private static string DuongDanXaml => Path.Combine(ThuMucWpf, "XBossDialog.xaml");

    private static string ChuoiXaml => File.ReadAllText(DuongDanXaml);

    private static XElement GocXaml => XElement.Parse(ChuoiXaml);

    /// <summary>Control mà WPF vẽ chrome riêng (hoặc ghi đè màu ở trigger của theme) ⇒ chỉ đặt
    /// Setter màu là KHÔNG ăn, bắt buộc phải thay hẳn ControlTemplate.</summary>
    private static readonly string[] CanTemplate =
    [
        "ComboBox", "ComboBoxItem", "TextBox", "CheckBox", "RadioButton", "ScrollBar",
    ];

    /// <summary>Control cùng bệnh nhưng CHƯA dùng trong tệp — thêm vào XAML lúc nào thì phải kèm
    /// template lúc đó (test tự đỏ, không phải nhớ).</summary>
    private static readonly string[] CungBenhChuaDung =
    [
        "ListBox", "ListBoxItem", "ListView", "TabControl", "TabItem", "Expander", "Slider",
        "ProgressBar", "GroupBox", "TreeView", "TreeViewItem", "DataGrid", "PasswordBox",
        "DatePicker", "Menu", "MenuItem", "ToolBar", "Separator", "ToolTip", "Label",
    ];

    private static IEnumerable<XElement> StyleNgam(XElement goc) =>
        goc.Descendants(Wpf + "Style").Where(s => s.Attribute(X + "Key") is null);

    private static XElement? StyleCua(XElement goc, string kieu) =>
        StyleNgam(goc).FirstOrDefault(s => s.Attribute("TargetType")?.Value == kieu);

    private static XElement? StyleKhoa(XElement goc, string khoa) =>
        goc.Descendants(Wpf + "Style").FirstOrDefault(s => s.Attribute(X + "Key")?.Value == khoa);

    private static bool CoDatTemplate(XElement style) =>
        style.Elements(Wpf + "Setter").Any(s => s.Attribute("Property")?.Value == "Template");

    private static IEnumerable<XElement> TemplateTrong(XElement style) =>
        style.Descendants(Wpf + "ControlTemplate");

    // ===== 1. Markup còn đọc được =====

    [Fact]
    public void XamlPhaiConDungCuPhap()
    {
        // Cổng CI không biên dịch markup: XAML hỏng ngoặc thì mọi lệnh XBOSS_* chết lúc chạy,
        // mà build vẫn xanh. Đây là lưới an toàn rẻ nhất cho lớp lỗi đó.
        var goc = XElement.Parse(ChuoiXaml);
        Assert.Equal(Wpf + "Window", goc.Name);
    }

    // ===== 2. Đúng bệnh đã gặp: style màu mà KHÔNG có template =====

    [Theory]
    [InlineData("ComboBox")]
    [InlineData("ComboBoxItem")]
    [InlineData("TextBox")]
    [InlineData("CheckBox")]
    [InlineData("RadioButton")]
    [InlineData("ScrollBar")]
    public void ControlVeChromeRiengPhaiCoControlTemplate(string kieu)
    {
        var style = StyleCua(GocXaml, kieu);
        Assert.True(style is not null, $"Thiếu <Style TargetType=\"{kieu}\"> trong XBossDialog.xaml.");
        Assert.True(
            CoDatTemplate(style!),
            $"<Style TargetType=\"{kieu}\"> chỉ đặt Setter màu mà không thay Template — WPF sẽ BỎ QUA "
                + "Background và giữ chrome sáng của Windows (đúng lỗi ComboBox 2026-08-26).");
    }

    [Fact]
    public void ThemControlCungBenhVaoXamlThiPhaiThemTemplate()
    {
        var goc = GocXaml;
        var dangDung = CungBenhChuaDung
            .Where(k => goc.Descendants(Wpf + k).Any())
            .Where(k => StyleCua(goc, k) is not { } s || !CoDatTemplate(s))
            .ToList();

        Assert.True(
            dangDung.Count == 0,
            "Control mới thêm vào hộp thoại nhưng chưa có ControlTemplate theo theme tối: "
                + string.Join(", ", dangDung)
                + ". Đặt Setter Background/Foreground suông là không ăn — xem ghi chú đầu XBossDialog.xaml.");
    }

    [Theory]
    [InlineData("NutPhu")]
    [InlineData("NutChinh")]
    public void NutOkVaHuyPhaiCoTemplateRieng(string khoa)
    {
        // Template mặc định của Button có đọc Background, nhưng trigger IsMouseOver/IsEnabled=False
        // của theme ghi đè bằng màu sáng ⇒ rê chuột hoặc khóa nút OK là lòi mảng sáng.
        var style = StyleKhoa(GocXaml, khoa);
        Assert.True(style is not null, $"Thiếu style nút \"{khoa}\".");
        Assert.True(CoDatTemplate(style!), $"Style nút \"{khoa}\" phải tự vẽ template (hover/pressed/disabled).");
    }

    // ===== 3. Trạng thái BỊ KHÓA phải khác hẳn trạng thái thường =====

    [Theory]
    [InlineData("ComboBox")]
    [InlineData("TextBox")]
    [InlineData("CheckBox")]
    [InlineData("RadioButton")]
    public void MoiControlPhaiVeRoTrangThaiBiKhoa(string kieu)
    {
        var template = Assert.Single(TemplateTrong(StyleCua(GocXaml, kieu)!));
        var khoa = template
            .Descendants(Wpf + "Trigger")
            .Where(t => t.Attribute("Property")?.Value == "IsEnabled" && t.Attribute("Value")?.Value == "False")
            .ToList();

        // Lỗi gốc là ô BÌNH THƯỜNG trông như bị khóa ⇒ hai trạng thái phải cách nhau thật xa,
        // và trạng thái khóa phải dùng đúng bộ tông *Khoa (xem MauBang.cs).
        var t = Assert.Single(khoa);
        Assert.Contains("Khoa", t.ToString(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("ComboBox")]
    [InlineData("TextBox")]
    public void ONhapPhaiCoPhanHoiReChuotVaFocus(string kieu)
    {
        var template = Assert.Single(TemplateTrong(StyleCua(GocXaml, kieu)!)).ToString();
        Assert.Contains("IsMouseOver", template, StringComparison.Ordinal);
        Assert.Contains("Focus", template, StringComparison.Ordinal); // IsKeyboardFocused / IsKeyboardFocusWithin
    }

    [Fact]
    public void MucDangChonVaMucDangTroChuotPhaiKhacNhau()
    {
        var template = Assert.Single(TemplateTrong(StyleCua(GocXaml, "ComboBoxItem")!)).ToString();
        Assert.Contains("IsHighlighted", template, StringComparison.Ordinal);
        Assert.Contains("IsSelected", template, StringComparison.Ordinal);
    }

    // ===== 4. ComboBox gõ tay được (ô Size của XBOSS_VE) =====

    [Fact]
    public void ComboBoxPhaiCoDuPhanBatBuocCuaWpf()
    {
        var template = Assert.Single(TemplateTrong(StyleCua(GocXaml, "ComboBox")!)).ToString();

        // Thiếu PART_EditableTextBox thì IsEditable="True" (ô Size, Độ dốc, Tỉ lệ in) không gõ được;
        // thiếu PART_Popup thì danh sách không xổ ra. WPF tìm đúng hai tên này, không có tên khác.
        Assert.Contains("PART_EditableTextBox", template, StringComparison.Ordinal);
        Assert.Contains("PART_Popup", template, StringComparison.Ordinal);
        Assert.Contains("IsEditable", template, StringComparison.Ordinal);
    }

    [Fact]
    public void DanhSachXoPhaiTuKhaiNenToi()
    {
        // Popup dựng cây visual RIÊNG, không thừa hưởng Background của Window ⇒ không tự khai thì
        // danh sách vẫn trắng dù ô combo đã tối.
        var popup = Assert.Single(GocXaml.Descendants(Wpf + "Popup"));
        var vien = Assert.Single(popup.Descendants(Wpf + "Border"));
        Assert.Contains("MauBangWpf.", vien.Attribute("Background")?.Value ?? "", StringComparison.Ordinal);
        Assert.Contains("MauBangWpf.", vien.Attribute("BorderBrush")?.Value ?? "", StringComparison.Ordinal);
    }

    // ===== 5. Một nguồn màu duy nhất =====

    [Fact]
    public void XamlKhongDuocHardcodeMaMau()
    {
        var ma = Regex.Matches(ChuoiXaml, "\"#[0-9A-Fa-f]{3,8}\"").Select(m => m.Value).ToList();
        Assert.True(ma.Count == 0, "Mã màu hardcode trong XAML (phải lấy từ MauBangWpf): " + string.Join(", ", ma));
    }

    [Fact]
    public void MoiBrushXamlGoiToiPhaiCoThatTrongMauBangWpf()
    {
        // XAML không được biên dịch ở CI: gõ sai tên brush là XamlParseException lúc mở hộp thoại
        // trên máy có AutoCAD — không có gì khác bắt được.
        var khai = Regex
            .Matches(File.ReadAllText(Path.Combine(ThuMucWpf, "MauBangWpf.cs")), @"public static readonly Brush (\w+)")
            .Select(m => m.Groups[1].Value)
            .ToHashSet(StringComparer.Ordinal);

        var thieu = Regex
            .Matches(ChuoiXaml, @"MauBangWpf\.(\w+)")
            .Select(m => m.Groups[1].Value)
            .Where(t => !khai.Contains(t))
            .Distinct()
            .ToList();

        Assert.True(thieu.Count == 0, "XAML gọi brush không tồn tại: " + string.Join(", ", thieu));
    }

    [Fact]
    public void MauBangWpfChiBocLaiMauBangChuKhongKhaiMauMoi()
    {
        // Hai bảng màu là hai bảng sẽ trôi khỏi nhau: bảng điều khiển WinForms (M102) và hộp thoại
        // WPF (M106) phải luôn cùng tông.
        var wpf = File.ReadAllText(Path.Combine(ThuMucWpf, "MauBangWpf.cs"));
        foreach (var ten in Regex.Matches(wpf, @"public static readonly Brush (\w+) = (.+?);").Cast<Match>())
        {
            Assert.Equal($"Tu(MauBang.{ten.Groups[1].Value})", ten.Groups[2].Value);
        }

        Assert.DoesNotContain("Color.FromArgb", wpf, StringComparison.Ordinal);
    }

    // ===== 6. Lỗi XAML chỉ nổ lúc chạy =====

    [Fact]
    public void MoiTargetNamePhaiTonTaiTrongChinhTemplateDo()
    {
        // TargetName trỏ vào tên không có trong template ⇒ XamlParseException khi WPF dựng cửa sổ.
        var sai = new List<string>();
        foreach (var template in GocXaml.Descendants(Wpf + "ControlTemplate"))
        {
            var ten = template
                .Descendants()
                .Select(e => e.Attribute(X + "Name")?.Value)
                .Where(t => t is not null)
                .ToHashSet(StringComparer.Ordinal);

            sai.AddRange(
                template
                    .Descendants(Wpf + "Setter")
                    .Select(s => s.Attribute("TargetName")?.Value)
                    .Where(t => t is not null && !ten.Contains(t))
                    .Select(t => $"{template.Attribute("TargetType")?.Value}→{t}"));
        }

        Assert.True(sai.Count == 0, "Setter TargetName trỏ vào phần tử không có: " + string.Join(", ", sai));
    }

    // ===== 7. Tương phản chữ =====

    [Fact]
    public void NhanCuaTruongNhapDungChuSangKhongDungChuMo()
    {
        // Nhãn trường ("Hệ vẽ", "Loại tuyến"…) là chữ CHÍNH — ChuMo dành cho câu giải thích phụ.
        var nhan = StyleKhoa(GocXaml, "Nhan");
        var mau = nhan!
            .Elements(Wpf + "Setter")
            .Single(s => s.Attribute("Property")?.Value == "Foreground")
            .Attribute("Value")!
            .Value;

        Assert.Contains("MauBangWpf.Chu}", mau, StringComparison.Ordinal);
    }
}
