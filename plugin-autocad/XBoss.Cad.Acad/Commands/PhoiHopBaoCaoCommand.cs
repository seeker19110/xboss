using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.PhoiHopBaoCaoCommand))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_PHOIHOP_BAOCAO</c> (M116 §6 bước 5 / AC5) — xuất bảng xung đột phối hợp ra Excel và
/// đính vào báo cáo phiên để web hiện trên bảng điều khiển.
///
/// <b>PR2 mới khai lệnh, thân lệnh làm ở PR3.</b> Khai sớm là có chủ đích: danh mục lệnh
/// (<c>LenhCatalog</c>) và <c>[CommandMethod]</c> trong Adapter được test đối chiếu 1-1
/// (<c>LenhCatalogTests</c>), nên lệnh phải xuất hiện đồng thời ở cả hai chỗ. Ở đây chỉ in thông
/// báo tiếng Việt rõ ràng — KHÔNG đọc/ghi bản vẽ, không ném lỗi.
/// </summary>
public sealed class PhoiHopBaoCaoCommand
{
    [CommandMethod("XBOSS_PHOIHOP_BAOCAO")]
    public void BaoCaoPhoiHop()
    {
        if (VeContext.SanSang() is not (_, var ed)) return;

        ed.WriteMessage(
            "\n[XBoss] Xuất báo cáo phối hợp (Excel + số liệu lên web) sẽ có ở bản phát hành kế tiếp " +
            "(M116 PR3) — lệnh chưa làm gì, bản vẽ không thay đổi.\n" +
            "[XBoss] Hiện tại: chạy XBOSS_PHOIHOP để xem bảng xung đột và đánh dấu xử lý; trạng thái " +
            $"nằm trong XData marker trên layer {PhoiHopCommands.TenLayer} nên không mất đi khi đóng bản vẽ.\n");
    }
}
