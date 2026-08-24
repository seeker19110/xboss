using Autodesk.AutoCAD.ApplicationServices.Core;
using Autodesk.AutoCAD.Runtime;

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
        var acadVer = Application.GetSystemVariable("ACADVER")?.ToString() ?? "";
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
            "\n[XBoss] Plugin chuẩn hóa & bóc tách khối lượng đã nạp." +
            "\n[XBoss] Lệnh: XBOSS_LOGIN, XBOSS_RULEPACK, XBOSS_KIEMTRA, XBOSS_CHUANHOA, XBOSS_BOCKL, XBOSS_BOCKL_XOA, XBOSS_BOCKL_XUAT\n");
    }

    public void Terminate()
    {
        // Không giữ tài nguyên ngoài scope document — không có gì phải dọn.
    }
}
