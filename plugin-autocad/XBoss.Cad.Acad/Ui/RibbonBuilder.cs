using System.Windows.Input;
using Autodesk.Windows;
using XBoss.Cad.Core.Ui;

namespace XBoss.Cad.Acad.Ui;

/// <summary>
/// Dựng tab Ribbon "XBoss" (M102) từ <see cref="LenhCatalog"/> — mỗi nhóm lệnh 1 panel,
/// lệnh chính là nút to, các lệnh còn lại nút chuẩn; bấm nút = gõ lệnh tương ứng.
/// Ribbon có thể chưa tồn tại lúc plugin nạp (AutoCAD khởi động, ribbon tắt) — khi đó
/// chờ qua <see cref="ComponentManager.ItemInitialized"/> rồi dựng, dựng xong thì thôi theo dõi.
/// Id tab cố định nên NETLOAD lại không tạo tab trùng (idempotent).
/// </summary>
internal static class RibbonBuilder
{
    internal static void DangKy()
    {
        if (ComponentManager.Ribbon is { } ribbon)
        {
            Dung(ribbon);
            return;
        }
        ComponentManager.ItemInitialized += ChoRibbonSanSang;
    }

    private static void ChoRibbonSanSang(object? sender, RibbonItemEventArgs e)
    {
        if (ComponentManager.Ribbon is not { } ribbon) return;
        ComponentManager.ItemInitialized -= ChoRibbonSanSang;
        Dung(ribbon);
    }

    private static void Dung(RibbonControl ribbon)
    {
        if (ribbon.FindTab(LenhCatalog.IdTab) is not null) return; // đã dựng — không nhân đôi

        var tab = new RibbonTab { Title = LenhCatalog.TenTab, Id = LenhCatalog.IdTab };
        foreach (var nhom in LenhCatalog.TheoNhom())
        {
            var nguon = new RibbonPanelSource { Title = LenhCatalog.TenNhom(nhom.Key) };
            foreach (var lenh in nhom)
            {
                nguon.Items.Add(new RibbonButton
                {
                    Text = lenh.Nhan,
                    ShowText = true,
                    ShowImage = false, // chưa có bộ icon riêng — nút chữ tiếng Việt rõ nghĩa hơn icon đoán mò
                    Size = lenh.LenhChinh ? RibbonItemSize.Large : RibbonItemSize.Standard,
                    ToolTip = $"{lenh.Ten}\n{lenh.MoTa}" +
                              (lenh.CanRulePack ? "\n(Cần nạp rule pack trước — XBOSS_LOGIN hoặc XBOSS_RULEPACK.)" : ""),
                    CommandHandler = new LenhHandler(lenh.Ten),
                });
            }
            tab.Panels.Add(new RibbonPanel { Source = nguon });
        }
        ribbon.Tabs.Add(tab);
    }

    /// <summary>Chuyển cú bấm nút thành lệnh gõ trên command line của tài liệu hiện hành.</summary>
    internal static void ThucThiLenh(string tenLenh)
    {
        var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
        // Không có tài liệu nào mở → lệnh nào cũng vô nghĩa, im lặng bỏ qua.
        doc?.SendStringToExecute(tenLenh + " ", true, false, true);
    }

    private sealed class LenhHandler(string tenLenh) : ICommand
    {
        // Nút luôn bấm được — bản thân từng lệnh tự kiểm điều kiện (đời AutoCAD, rule pack…)
        // và báo tiếng Việt rõ ràng, đúng hành vi khi gõ tay.
        public bool CanExecute(object? parameter) => true;
        public event EventHandler? CanExecuteChanged { add { } remove { } }
        public void Execute(object? parameter) => ThucThiLenh(tenLenh);
    }
}
