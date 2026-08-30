using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Coordination;
using XBoss.Cad.Core.Excel;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.PhoiHopBaoCaoCommand))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_PHOIHOP_BAOCAO</c> (M116 §6 bước 5 / AC5) — quét lại phối hợp CẢ BẢN VẼ (đúng dữ liệu
/// hộp thoại <c>XBOSS_PHOIHOP</c> đang hiện, kể cả trạng thái xử lý đã đánh dấu), rồi xuất:
/// <list type="bullet">
/// <item>Excel <c>&lt;dwg&gt;.xboss-phoihop.xlsx</c> (<see cref="PhoiHopExcelWriter"/>) — bảng
/// xung đột đọc được, gửi kèm biên bản họp phối hợp;</item>
/// <item>Sidecar JSON <c>&lt;dwg&gt;.xboss-phoihop.json</c> (<see cref="PhoiHopTomTat"/>) — máy đọc
/// được, <c>XBOSS_UPLOAD</c> gắn kèm khi tải lên để trang <c>/engineering/chuan-hoa-ban-ve</c> hiện
/// số liệu khớp với Excel (AC5).</item>
/// </list>
///
/// Lệnh CHỈ ĐỌC (<see cref="PhoiHopCommands.QuetCaBanVe"/> tự commit transaction đọc, không mở
/// ForWrite thứ gì) — không cần UNDO, guardrail M116 §2 giữ nguyên (không tự sửa tuyến, không tự
/// tạo/sửa marker — việc đó là của <c>XBOSS_PHOIHOP</c>).
/// </summary>
public sealed class PhoiHopBaoCaoCommand
{
    /// <summary>Sidecar máy-đọc-được cạnh DWG (cùng khuôn <c>.xboss-takeoff.json</c>/<c>.xboss-ve.json</c>).</summary>
    internal const string TenSidecarJson = ".xboss-phoihop.json";

    internal const string TenSidecarExcel = ".xboss-phoihop.xlsx";

    [CommandMethod("XBOSS_PHOIHOP_BAOCAO")]
    public void BaoCaoPhoiHop()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        if (VeContext.CanCoordinationPolicy(ed, pack) is not { } chinhSach) return;
        var db = doc.Database;

        var dong = PhoiHopCommands.QuetCaBanVe(db, pack, chinhSach);
        if (dong.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Không phát hiện xung đột phối hợp nào trong bản vẽ — không có gì để xuất báo cáo.\n");
            return;
        }

        if (string.IsNullOrEmpty(db.Filename))
        {
            ed.WriteMessage("\n[XBoss] Bản vẽ chưa lưu — SAVEAS trước khi xuất báo cáo phối hợp.\n");
            return;
        }

        var soCung = dong.Count(d => d.XungDot.Muc == MucXungDot.Cung);
        var soMem = dong.Count(d => d.XungDot.Muc == MucXungDot.Mem);
        var soCanhBao = dong.Count(d => d.XungDot.Muc == MucXungDot.CanhBao);
        ed.WriteMessage(
            $"\n[XBoss] Phối hợp: {dong.Count} xung đột ({soCung} cứng, {soMem} mềm, {soCanhBao} cảnh báo).\n");

        var meta = new PhoiHopExcelMeta
        {
            TenBanVe = Path.GetFileName(db.Filename),
            RulePackVersion = pack.RulePack.Version,
            NguoiLap = Environment.UserName,
            NgayIso = DateTime.Now.ToString("yyyy-MM-dd"),
        };

        var duongExcel = db.Filename + TenSidecarExcel;
        try
        {
            using var f = File.Create(duongExcel);
            PhoiHopExcelWriter.Write(dong, meta, f);
            ed.WriteMessage($"[XBoss] Đã xuất Excel phối hợp: {duongExcel}\n");
        }
        catch (IOException e)
        {
            ed.WriteMessage($"[XBoss] ⚠ Không ghi được Excel phối hợp: {e.Message}\n");
        }

        var tomTat = PhoiHopTomTat.Tu(dong.Select(d => (d.XungDot, d.TrangThai)).ToList());
        var duongJson = db.Filename + TenSidecarJson;
        try
        {
            File.WriteAllText(duongJson, tomTat.ToJson());
            ed.WriteMessage(
                $"[XBoss] Sidecar JSON: {duongJson}\n" +
                "[XBoss] XBOSS_UPLOAD sẽ gửi kèm sidecar này (nếu có) để web hiện số liệu phối hợp khớp Excel.\n");
        }
        catch (IOException e)
        {
            ed.WriteMessage($"[XBoss] ⚠ Không ghi được sidecar JSON: {e.Message}\n");
        }
    }
}
