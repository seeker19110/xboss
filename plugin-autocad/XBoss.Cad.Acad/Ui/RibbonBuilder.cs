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

        // Thứ tự panel CỐ Ý khác thứ tự khai trong LenhCatalog.NhomLenh (đó là thứ tự nghiệp vụ
        // Kết nối→Chuẩn hóa→Bóc khối lượng→Vẽ shop drawing; đây là thứ tự MẮT kỹ sư lướt Ribbon,
        // chốt lại sau phản hồi dùng tay trên AutoCAD 2026 thật, 2026-08-30):
        //   Kết nối → Quy trình → Chuẩn hóa → Vẽ shop drawing → Bóc khối lượng.
        // "Kết nối" lên đầu vì đó luôn là việc đầu tiên của mọi phiên (đăng nhập/nạp rule pack);
        // "Quy trình" (panel chỉ có nút Bảng điều khiển — lối vào trình dẫn 6 bước) đứng ngay sau
        // để kỹ sư mới thấy "bắt đầu từ đâu" trước khi thấy hàng chục nút; "Vẽ shop drawing" đứng
        // trước "Bóc khối lượng" vì đây là khối lệnh dùng nhiều nhất trong ngày, không nên đứng
        // cuối cùng sau panel ít dùng hơn.
        var thuTuPanel = new[]
        {
            NhomLenh.KetNoi,
            NhomLenh.BangDieuKhien, // panel "Quy trình" — xem TenNhom
            NhomLenh.ChuanHoa,
            NhomLenh.VeShopDrawing,
            NhomLenh.BocKhoiLuong,
        };
        var theoNhom = LenhCatalog.TheoNhom().ToDictionary(g => g.Key, g => g);
        foreach (var nhom in thuTuPanel)
        {
            // "Quy trình" là tên hiển thị của panel chứa đúng lệnh XBOSS_BANG (nhóm BangDieuKhien)
            // — không dùng TenNhom("Bảng điều khiển") ở đây, xem M106 FR10.
            var tieuDe = nhom == NhomLenh.BangDieuKhien ? "Quy trình" : LenhCatalog.TenNhom(nhom);
            tab.Panels.Add(Panel(tieuDe, theoNhom[nhom]));
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
