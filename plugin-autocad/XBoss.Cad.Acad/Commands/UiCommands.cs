using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Ui;
using AcadApp = Autodesk.AutoCAD.ApplicationServices.Application;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.UiCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>Lệnh giao diện (M102): bật/tắt bảng điều khiển XBoss.</summary>
public sealed class UiCommands
{
    // CommandFlags.Session: palette là cửa sổ cấp ỨNG DỤNG, không gắn với 1 tài liệu;
    // vẫn mở được khi chưa có bản vẽ nào (bảng sẽ hiện "chưa mở bản vẽ").
    [CommandMethod("XBOSS_BANG", CommandFlags.Session)]
    public void BatTatBangDieuKhien()
    {
        if (!PluginExtension.DungDoiAutoCad)
        {
            AcadApp.DocumentManager.MdiActiveDocument?.Editor
                .WriteMessage("\n[XBoss] Plugin chỉ hỗ trợ AutoCAD 2026 — lệnh bị từ chối.\n");
            return;
        }
        BangDieuKhienPalette.BatTat();
    }
}
