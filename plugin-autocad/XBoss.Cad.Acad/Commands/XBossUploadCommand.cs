using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Api;
using AcadApp = Autodesk.AutoCAD.ApplicationServices.Application;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.XBossUploadCommand))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// XBOSS_UPLOAD (M99 PR5 — journey §6.6): nộp bản vẽ đã chuẩn hóa lên sổ bản vẽ XBoss:
/// DWG (bản giao nộp) + DXF sidecar (AutoCAD tự xuất — server kiểm bằng ezdxf, không cần
/// đọc DWG, ADR-0006 nguyên tắc 2) + báo cáo chuẩn hóa (nếu có) + version rule pack.
/// Server trả 202 {jobId} → poll trạng thái kiểm định; fail → hiện lý do ngay trong AutoCAD.
/// </summary>
public sealed class XBossUploadCommand
{
    [CommandMethod("XBOSS_UPLOAD", CommandFlags.Session)]
    public async void NopBanVe()
    {
        var doc = AcadApp.DocumentManager.MdiActiveDocument;
        if (doc is null) return;
        var ed = doc.Editor;
        if (!PluginExtension.DungDoiAutoCad)
        {
            ed.WriteMessage("\n[XBoss] Plugin chỉ hỗ trợ AutoCAD 2026 — lệnh bị từ chối.\n");
            return;
        }
        var db = doc.Database;

        // Điều kiện tiên quyết: bản vẽ đã lưu; đã ghép thiết bị (token); đã có rule pack.
        if (string.IsNullOrEmpty(db.Filename) ||
            Convert.ToInt32(AcadApp.GetSystemVariable("DBMOD")) != 0)
        {
            ed.WriteMessage("\n[XBoss] LƯU bản vẽ (QSAVE) trước khi nộp — bản nộp phải đúng bản trên đĩa.\n");
            return;
        }
        var baseUrl = XBossLoginCommand.ServerUrlDaLuu();
        var token = baseUrl is null ? null : CredentialStore.DocToken(baseUrl);
        if (baseUrl is null || token is null)
        {
            ed.WriteMessage("\n[XBoss] Chưa ghép thiết bị — chạy XBOSS_LOGIN trước.\n");
            return;
        }
        var (pack, loiPack) = RulePackStore.HienHanh();
        if (pack is null)
        {
            ed.WriteMessage($"\n[XBoss] {loiPack}\n");
            return;
        }

        // Thông tin sổ bản vẽ (mặc định suy từ tên tệp — kỹ sư sửa được).
        var tenTep = Path.GetFileNameWithoutExtension(db.Filename);
        var code = HoiChuoi(ed, "Số bản vẽ (drawingCode)", tenTep);
        if (code is null) return;
        var ten = HoiChuoi(ed, "Tên bản vẽ", tenTep);
        if (ten is null) return;
        var heThong = HoiChuoi(ed, "Hệ (HVAC/PIPING/…)", "MEPF");
        if (heThong is null) return;
        var rev = HoiChuoi(ed, "Revision", "A");
        if (rev is null) return;

        try
        {
            // DXF sidecar: AutoCAD tự xuất (bộ ghi gốc — không tự chế, ADR-0006). Bản 2018,
            // precision 16 chữ số. Tệp tạm xoá ngay sau khi đọc.
            var dxfTmp = Path.Combine(Path.GetTempPath(), $"xboss-sidecar-{Guid.NewGuid():N}.dxf");
            string dxfContent;
            try
            {
                db.DxfOut(dxfTmp, 16, DwgVersion.Current);
                dxfContent = File.ReadAllText(dxfTmp);
            }
            finally
            {
                try { File.Delete(dxfTmp); } catch (IOException) { /* tệp tạm — bỏ qua */ }
            }

            var dwgBytes = File.ReadAllBytes(db.Filename);
            // Báo cáo chuẩn hóa ghi cạnh DWG bởi XBOSS_CHUANHOA (nếu kỹ sư đã chạy).
            var duongDanBaoCao = db.Filename + ".xboss-report.json";
            string? reportJson = File.Exists(duongDanBaoCao) ? File.ReadAllText(duongDanBaoCao) : null;
            if (reportJson is null)
                ed.WriteMessage("\n[XBoss] ⚠ Chưa thấy báo cáo chuẩn hóa cạnh DWG — nộp không kèm report (nên chạy XBOSS_CHUANHOA trước).\n");

            var client = new XBossApiClient(baseUrl);
            ed.WriteMessage($"\n[XBoss] Đang nộp {Path.GetFileName(db.Filename)} ({dwgBytes.Length / 1024 / 1024.0:0.0} MB) + DXF sidecar...\n");
            var kq = await client.UploadAsync(token, new XBossApiClient.UploadInput
            {
                DwgBytes = dwgBytes,
                DwgFileName = Path.GetFileName(db.Filename),
                DxfContent = dxfContent,
                ReportJson = reportJson,
                RulePackVersion = pack.Version,
                DrawingCode = code,
                DrawingName = ten,
                Systems = heThong,
                Rev = rev,
            });

            if (kq.Status == "duplicated")
            {
                ed.WriteMessage($"\n[XBoss] Bản vẽ NÀY đã nộp trước đó (revision #{kq.RevisionId}) — không tạo bản trùng.\n");
                return;
            }
            ed.WriteMessage($"\n[XBoss] ✔ Server đã nhận (revision #{kq.RevisionId}) — đang kiểm định ezdxf...\n");

            var job = await client.PollUploadJobAsync(
                token, kq.JobId!, TimeSpan.FromSeconds(5), TimeSpan.FromMinutes(5));
            switch (job.Status)
            {
                case "ok":
                    ed.WriteMessage($"\n[XBoss] ✔ Kiểm định ĐẠT — revision #{job.RevisionId} vào sổ bản vẽ trạng thái submitted.\n");
                    break;
                case "rejected":
                    ed.WriteMessage(
                        "\n[XBoss] ✖ Kiểm định KHÔNG đạt — revision bị từ chối. Lý do:" +
                        $"\n[XBoss] {job.Validation?.GetRawText() ?? "(xem trang sổ bản vẽ)"}" +
                        "\n[XBoss] Chuẩn hóa lại (XBOSS_CHUANHOA) rồi nộp lại với rev mới.\n");
                    break;
                case "processing":
                    ed.WriteMessage("\n[XBoss] Server còn đang kiểm định (worker bận) — kết quả xem trên web, sổ bản vẽ.\n");
                    break;
                default:
                    ed.WriteMessage($"\n[XBoss] ⚠ Kiểm định gặp lỗi hệ thống: {job.Validation?.GetRawText()}\n");
                    break;
            }
        }
        catch (XBossApiException e)
        {
            ed.WriteMessage($"\n[XBoss] {e.Message}\n");
        }
        catch (HttpRequestException e)
        {
            ed.WriteMessage($"\n[XBoss] Không kết nối được server ({e.Message}) — kiểm tra mạng.\n");
        }
        catch (IOException e)
        {
            ed.WriteMessage($"\n[XBoss] Lỗi đọc tệp: {e.Message}\n");
        }
    }

    private static string? HoiChuoi(Editor ed, string nhan, string macDinh)
    {
        var opt = new PromptStringOptions($"\n[XBoss] {nhan} <{macDinh}>: ") { AllowSpaces = true };
        var kq = ed.GetString(opt);
        if (kq.Status != PromptStatus.OK) return null;
        return kq.StringResult.Length > 0 ? kq.StringResult : macDinh;
    }
}
