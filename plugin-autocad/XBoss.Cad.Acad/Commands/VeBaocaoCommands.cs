using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Reporting;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeBaocaoCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_BAOCAO</c> — báo cáo phiên vẽ (M100 §14): số tuyến/block theo hệ, size ngoài danh
/// mục đã dùng, các lần đụng độ định nghĩa block cùng lựa chọn của kỹ sư, version rule pack và
/// thư viện block. In ra dòng lệnh + ghi JSON cạnh DWG (<c>&lt;tệp&gt;.dwg.xboss-ve.json</c>) —
/// đúng khung báo cáo M99 (<c>.xboss-report.json</c> của CHUANHOA, <c>.xboss-kiemtra.json</c> của
/// KIEMTRA), để một ngày nào đó gửi kèm khi upload không phải đổi định dạng.
///
/// Lệnh CHỈ ĐỌC: quét XData <c>XBOSS_VE</c> đang sống trong bản vẽ, không sửa một đối tượng nào
/// (không cần UNDO). Nội dung báo cáo dựng ở Core (<see cref="VeSessionReport"/> — thuần, có test).
/// </summary>
public sealed class VeBaocaoCommands
{
    [CommandMethod("XBOSS_VE_BAOCAO")]
    public void BaoCaoPhienVe()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;

        var (thuVien, loiThuVien) = BlockLibraryService.HienHanh();
        if (thuVien is null) ed.WriteMessage($"\n[XBoss] ⚠ {loiThuVien}\n");

        var xdata = new List<VeXDataInfo>();
        using (var tr = db.TransactionManager.StartTransaction())
        {
            var ms = (BlockTableRecord)tr.GetObject(
                SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
            foreach (ObjectId id in ms)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
                if (VeXDataStore.Doc(ent) is { } xd) xdata.Add(xd);
            }

            // Định nghĩa block do plugin nhập từ thư viện nằm ở BlockTable, không ở model space
            // (M100 §6.10) — không quét chỗ này thì báo cáo thiếu hẳn phần "thư viện đã dùng".
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            foreach (ObjectId id in bt)
            {
                // xref-ok: vòng này chỉ ĐỌC XData XBOSS_VE (chỉ định nghĩa do plugin nhập mới có),
                // không mở ForWrite thứ gì — định nghĩa của xref rơi vào đây thì cũng trả null.
                if (tr.GetObject(id, OpenMode.ForRead) is not BlockTableRecord btr) continue;
                if (VeXDataStore.Doc(btr) is { } xd) xdata.Add(xd);
            }
            tr.Commit();
        }

        var baoCao = VeSessionReport.Dung(
            xdata,
            new VeSessionMeta
            {
                RulePackVersion = pack.RulePack.Version,
                ThuVienVersion = thuVien?.Version,
                TenBanVe = string.IsNullOrEmpty(db.Filename) ? "(bản vẽ chưa lưu)" : Path.GetFileName(db.Filename),
                NgayIso = DateTime.Now.ToString("yyyy-MM-dd"),
                NguoiVe = Environment.UserName,
            },
            VeContext.NhatKyPhien);

        ed.WriteMessage("\n" + baoCao.ToVietnameseText());
        if (VeContext.NhatKyPhien.Count == 0)
        {
            ed.WriteMessage(
                "[XBoss] (Nhật ký đụng độ định nghĩa block chỉ có trong PHIÊN AutoCAD hiện tại — " +
                "phần còn lại của báo cáo đọc từ chính bản vẽ nên mở lại lúc nào cũng đúng.)\n");
        }

        if (string.IsNullOrEmpty(db.Filename))
        {
            ed.WriteMessage("[XBoss] Bản vẽ chưa lưu — chỉ hiện báo cáo, chưa ghi được tệp JSON cạnh DWG.\n");
            return;
        }
        var duongDan = db.Filename + ".xboss-ve.json";
        try
        {
            File.WriteAllText(duongDan, baoCao.ToJson());
            ed.WriteMessage($"[XBoss] Báo cáo JSON: {duongDan}\n");
        }
        catch (IOException e)
        {
            ed.WriteMessage($"[XBoss] ⚠ Không ghi được báo cáo JSON: {e.Message}\n");
        }
        catch (UnauthorizedAccessException e)
        {
            ed.WriteMessage($"[XBoss] ⚠ Không có quyền ghi báo cáo JSON cạnh bản vẽ: {e.Message}\n");
        }
    }
}
