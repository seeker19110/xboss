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

        // Panel "Quy trình" đứng ĐẦU tab (M106 FR10): lối vào trình dẫn — kỹ sư mới nhìn Ribbon
        // phải thấy ngay "bắt đầu từ đâu" trước khi thấy 26 lệnh. Nhóm BangDieuKhien chỉ có đúng
        // lệnh XBOSS_BANG nên nó hiện Ở ĐÂY thay vì có panel riêng: không bao giờ hai nút Ribbon
        // cùng chạy một lệnh.
        tab.Panels.Add(Panel("Quy trình", LenhCatalog.TatCa.Where(l => l.Nhom == NhomLenh.BangDieuKhien)));

        foreach (var nhom in LenhCatalog.TheoNhom())
        {
            if (nhom.Key == NhomLenh.BangDieuKhien) continue;
            tab.Panels.Add(Panel(LenhCatalog.TenNhom(nhom.Key), nhom));
        }
        ribbon.Tabs.Add(tab);
    }

    /// <summary>
    /// Một panel Ribbon. Nút xếp theo TRÌNH TỰ DÙNG THẬT (M106 FR10/AC7): bước quy trình trước,
    /// rồi <c>ThuTuTrongBuoc</c> trong bước đó — nên panel "Vẽ shop drawing" chạy đúng dòng chảy
    /// nền → tuyến → nhãn → phụ kiện → thiết bị, rồi mới tới nhóm chi tiết chế tạo, hồ sơ, phụ trợ.
    /// Sắp theo mỗi <c>ThuTuTrongBuoc</c> thì các bước khác nhau sẽ đan xen nhau (mỗi bước đều
    /// đánh số từ 1) — <c>Buoc</c> phải là khóa sắp đầu tiên.
    /// </summary>
    private static RibbonPanel Panel(string tieuDe, IEnumerable<LenhInfo> cacLenh)
    {
        var nguon = new RibbonPanelSource { Title = tieuDe };
        foreach (var lenh in cacLenh.OrderBy(l => l.Buoc).ThenBy(l => l.ThuTuTrongBuoc))
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
        return new RibbonPanel { Source = nguon };
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
