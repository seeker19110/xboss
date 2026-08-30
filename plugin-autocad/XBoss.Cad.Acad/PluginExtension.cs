using Autodesk.AutoCAD.Runtime;

// Bí danh vì `UseWindowsForms` kéo theo implicit using `System.Windows.Forms`, làm tên
// `Application` nhập nhằng với `System.Windows.Forms.Application` (xem MarkService.cs).
using AcadApp = Autodesk.AutoCAD.ApplicationServices.Core.Application;

[assembly: ExtensionApplication(typeof(XBoss.Cad.Acad.PluginExtension))]
[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.XBossCommands))]

namespace XBoss.Cad.Acad;

/// <summary>
/// Điểm nạp plugin (M99 §9.1): kiểm đời AutoCAD ngay khi nạp — không phải 2026
/// (ACADVER R25.1) thì báo tiếng Việt rõ ràng và KHÔNG đăng ký lệnh, thay vì để
/// lỗi khó hiểu giữa chừng.
/// </summary>
public sealed class PluginExtension : IExtensionApplication
{
    /// <summary>ACADVER của AutoCAD 2026. Trước bản phát hành đầu tiên phải xác minh
    /// trên máy thật (M99 §9.1 — assumption duy nhất còn lại).</summary>
    internal const string AcadVer2026 = "25.1";

    internal static bool DungDoiAutoCad { get; private set; }

    public void Initialize()
    {
        var acadVer = AcadApp.GetSystemVariable("ACADVER")?.ToString() ?? "";
        DungDoiAutoCad = acadVer.StartsWith(AcadVer2026, StringComparison.Ordinal);
        var doc = Autodesk.AutoCAD.ApplicationServices.Application.DocumentManager.MdiActiveDocument;
        if (!DungDoiAutoCad)
        {
            doc?.Editor.WriteMessage(
                $"\n[XBoss] Plugin chỉ hỗ trợ AutoCAD 2026 (ACADVER {AcadVer2026}), bản đang chạy: {acadVer}." +
                "\n[XBoss] Các lệnh XBOSS_* sẽ từ chối chạy. Dùng luồng web XBoss (tầng 3) thay thế.\n");
            return;
        }
        doc?.Editor.WriteMessage(
            "\n[XBoss] Plugin chuẩn hóa, bóc tách khối lượng & vẽ shop drawing đã nạp." +
            "\n[XBoss] Chuẩn hóa/bóc tách: XBOSS_LOGIN, XBOSS_RULEPACK, XBOSS_KIEMTRA, XBOSS_CHUANHOA, XBOSS_BOCKL, XBOSS_BOCKL_XOA, XBOSS_BOCKL_XUAT, XBOSS_BATCH, XBOSS_UPLOAD" +
            "\n[XBoss] Vẽ (cần rule pack v4): XBOSS_VE_NEN, XBOSS_VE, XBOSS_VE_NHAN, XBOSS_VE_TRANGIN, XBOSS_VE_MATCAT" +
            "\n[XBoss] Giao diện (M102): tab Ribbon \"XBoss\" + bảng điều khiển XBOSS_BANG\n");

        // Máy mới/offline vẫn có bộ phụ kiện MEPF tối thiểu. Bản tải server hoặc nạp tay đã có
        // luôn được giữ nguyên; asset đóng gói chỉ seed khi cache hoàn toàn trống.
        try
        {
            var thongDiepThuVien = Services.BlockLibraryService.KhoiTaoTuGoiCaiDat();
            if (thongDiepThuVien is not null)
                doc?.Editor.WriteMessage($"\n[XBoss] {thongDiepThuVien}\n");
        }
        catch (System.Exception e)
        {
            doc?.Editor.WriteMessage(
                $"\n[XBoss] ⚠ Không khởi tạo được thư viện MEPF đóng kèm ({e.Message}) — " +
                "chạy XBOSS_LOGIN hoặc XBOSS_VE_THUVIEN để nạp lại.\n");
        }

        // Tab Ribbon "XBoss" (M102) — chỉ dựng khi đúng đời AutoCAD; ribbon chưa sẵn sàng
        // thì RibbonBuilder tự chờ. Ribbon lỗi không được làm hỏng phần lệnh gõ tay.
        try
        {
            Ui.RibbonBuilder.DangKy();
        }
        catch (System.Exception e)
        {
            doc?.Editor.WriteMessage($"\n[XBoss] ⚠ Không dựng được tab Ribbon ({e.Message}) — mọi lệnh vẫn gõ tay được.\n");
        }
    }

    public void Terminate()
    {
        // Không giữ tài nguyên ngoài scope document — không có gì phải dọn.
    }
}
