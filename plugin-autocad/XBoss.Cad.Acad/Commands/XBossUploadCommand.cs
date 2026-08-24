using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Api;
using AcadApp = Autodesk.AutoCAD.ApplicationServices.Application;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.XBossUploadCommand))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// XBOSS_UPLOAD (M99 PR5 — journey §6.6/FR9): gửi DWG đã LƯU + DXF sidecar (server kiểm
/// định không cần đọc DWG — FR10) + báo cáo chuẩn hóa (nếu có, từ XBOSS_CHUANHOA) +
/// version rule pack lên server → server kiểm định lại → tạo drawing_revision 'submitted'.
/// Server từ chối (422) → hiện đủ lý do ngay trong AutoCAD (AC5).
/// Async command: mọi chờ mạng đều await — không chặn UI (NFR3).
/// </summary>
public sealed class XBossUploadCommand
{
    [CommandMethod("XBOSS_UPLOAD", CommandFlags.Session)]
    public async void TaiLen()
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

        // Bản vẽ phải đã lưu và không còn thay đổi treo — gửi đúng nội dung trên đĩa.
        if (string.IsNullOrEmpty(db.Filename) || !File.Exists(db.Filename))
        {
            ed.WriteMessage("\n[XBoss] Bản vẽ chưa từng lưu — SAVEAS trước khi tải lên.\n");
            return;
        }
        if (Convert.ToInt32(AcadApp.GetSystemVariable("DBMOD")) != 0)
        {
            ed.WriteMessage("\n[XBoss] Bản vẽ có thay đổi chưa lưu — QSAVE trước khi tải lên.\n");
            return;
        }

        // Token + server (PR2). Không có → hướng dẫn, không tải bằng đường nào khác (AC8:
        // rule pack chỉ-cache thì CẤM tải lên — token hết hạn cũng vậy).
        var baseUrl = XBossLoginCommand.DocServerUrl();
        if (baseUrl is null)
        {
            ed.WriteMessage("\n[XBoss] Chưa cấu hình server — chạy XBOSS_LOGIN trước.\n");
            return;
        }
        var token = CredentialStore.DocToken(baseUrl);
        if (token is null)
        {
            ed.WriteMessage("\n[XBoss] Máy chưa ghép thiết bị với server này — chạy XBOSS_LOGIN.\n");
            return;
        }
        var (pack, loiPack) = RulePackStore.HienHanh();
        if (pack is null)
        {
            ed.WriteMessage($"\n[XBoss] {loiPack}\n");
            return;
        }

        // Số bản vẽ trong sổ (drawings.code) + rev.
        var maBanVe = HoiChuoi(ed, "Số bản vẽ trong sổ XBoss (drawings.code, vd ACMV-SD-T05-001)");
        if (maBanVe is null or "") return;
        var rev = HoiChuoi(ed, "Rev (vd A, B, C)");
        if (rev is null or "") return;

        // DXF sidecar: DXFOUT ra tệp tạm rồi đọc bytes (server chỉ kiểm DXF — FR10).
        var tenDwg = Path.GetFileName(db.Filename);
        byte[] dxfBytes;
        var dxfTam = Path.Combine(Path.GetTempPath(), $"xboss-{Guid.NewGuid():N}.dxf");
        try
        {
            db.DxfOut(dxfTam, 16, db.OriginalFileVersion);
            dxfBytes = File.ReadAllBytes(dxfTam);
        }
        catch (Autodesk.AutoCAD.Runtime.Exception e)
        {
            ed.WriteMessage($"\n[XBoss] Không xuất được DXF sidecar: {e.Message}\n");
            return;
        }
        finally
        {
            try { File.Delete(dxfTam); } catch (IOException) { /* tệp tạm — bỏ qua */ }
        }

        // Báo cáo chuẩn hóa (nếu XBOSS_CHUANHOA đã chạy) — gửi kèm để người duyệt đối chiếu (FR8).
        string? reportJson = null;
        var duongBaoCao = db.Filename + ".xboss-report.json";
        if (File.Exists(duongBaoCao)) reportJson = File.ReadAllText(duongBaoCao);
        else ed.WriteMessage("\n[XBoss] ⚠ Chưa thấy báo cáo chuẩn hóa cạnh DWG — cân nhắc chạy XBOSS_CHUANHOA trước.\n");

        ed.WriteMessage($"\n[XBoss] Đang tải {tenDwg} ({new FileInfo(db.Filename).Length / 1024} KB) lên {baseUrl}…\n");
        try
        {
            var client = new XBossApiClient(baseUrl);
            var kq = await client.UploadAsync(
                token, maBanVe, rev, pack.Version,
                tenDwg, File.ReadAllBytes(db.Filename), dxfBytes, reportJson);

            if (!kq.DuocNhan)
            {
                ed.WriteMessage("\n[XBoss] ❌ SERVER TỪ CHỐI — bản vẽ chưa đạt kiểm định (không tạo revision):\n");
                foreach (var l in kq.LoiKiemDinh) ed.WriteMessage($"[XBoss]   • {l}\n");
                ed.WriteMessage("[XBoss] Sửa theo lỗi trên (XBOSS_KIEMTRA/XBOSS_CHUANHOA) rồi tải lại.\n");
                return;
            }

            // Server xử lý đồng bộ — poll ngắn cho chắc (job đã completed ngay sau 202).
            for (var i = 0; i < 10; i++)
            {
                var job = await client.FetchUploadJobAsync(token, kq.JobId);
                if (job.Status == "completed")
                {
                    ed.WriteMessage(job.Idempotent
                        ? $"\n[XBoss] ✔ Tệp này đã tải trước đó — revision #{job.RevisionId} (không tạo bản đôi).\n"
                        : $"\n[XBoss] ✔ Đã tạo revision #{job.RevisionId} (trạng thái submitted) cho bản vẽ {maBanVe}, rev {rev}.\n");
                    return;
                }
                if (job.Status == "failed")
                {
                    ed.WriteMessage("\n[XBoss] ❌ Server báo job thất bại:\n");
                    foreach (var l in job.Validation?.Errors ?? []) ed.WriteMessage($"[XBoss]   • {l}\n");
                    return;
                }
                await Task.Delay(TimeSpan.FromSeconds(2));
            }
            ed.WriteMessage($"\n[XBoss] Job {kq.JobId} vẫn đang xử lý — kiểm tra sau trong sổ bản vẽ trên web.\n");
        }
        catch (XBossApiException e)
        {
            ed.WriteMessage($"\n[XBoss] {e.Message}\n");
        }
        catch (HttpRequestException e)
        {
            ed.WriteMessage($"\n[XBoss] Lỗi mạng: {e.Message}\n");
        }
    }

    private static string? HoiChuoi(Editor ed, string nhan)
    {
        var kq = ed.GetString(new PromptStringOptions($"\n[XBoss] {nhan}: ") { AllowSpaces = false });
        return kq.Status == PromptStatus.OK ? kq.StringResult.Trim() : null;
    }
}
