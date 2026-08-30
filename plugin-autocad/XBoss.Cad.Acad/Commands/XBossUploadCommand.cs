using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.Ui.ViewModels;
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

        // Bản vẽ đích: số bản vẽ trong sổ (drawings.code) hoặc mã số bản vẽ "#<id>" khi kỹ sư biết.
        // Mã bản vẽ chỉ duy nhất TRONG một dự án — hai dự án trùng mã thì chỉ #id mới trỏ đúng
        // bản ghi (route ưu tiên drawingId). Gõ như cũ thì mọi thứ chạy y như cũ.
        // Hộp thoại (M106 §7.2) hiện luôn các sidecar sẽ gửi kèm; hỏng UI thì về dòng lệnh (FR9).
        if (HoiThamSo(ed, Path.GetFileName(db.Filename), MoTaSidecar(db.Filename)) is not { } ts) return;
        var banVe = MaBanVeDich.PhanTich(ts.MaBanVe);
        if (!banVe.HopLe)
        {
            ed.WriteMessage($"\n[XBoss] {banVe.Loi}\n");
            return;
        }
        var rev = ts.Rev;

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

        // Kết quả bóc khối lượng (nếu XBOSS_BOCKL_XUAT đã chạy) — M101 §6.4 (PR5): server lưu vào
        // standardize_report khối "takeoff", KHÔNG ghi vào bảng BOQ (đường ghi sổ duy nhất giữ nguyên).
        // Thiếu sidecar → upload vẫn chạy y nguyên như trước PR5, không chặn (chỉ là "kèm thêm nếu có").
        string? takeoffJson = null;
        var duongTakeoff = db.Filename + XBossCommands.TenSidecarBocKL;
        if (File.Exists(duongTakeoff)) takeoffJson = File.ReadAllText(duongTakeoff);

        ed.WriteMessage($"\n[XBoss] Đang tải {tenDwg} ({new FileInfo(db.Filename).Length / 1024} KB) lên {baseUrl}…\n");
        try
        {
            var client = new XBossApiClient(baseUrl);
            var kq = await client.UploadAsync(
                token, banVe.Code ?? "", rev, pack.Version,
                tenDwg, File.ReadAllBytes(db.Filename), dxfBytes, reportJson,
                takeoffJson: takeoffJson, drawingId: banVe.Id);

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
                        : $"\n[XBoss] ✔ Đã tạo revision #{job.RevisionId} (trạng thái submitted) cho bản vẽ {banVe.MoTa}, rev {rev}.\n");
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

    // ===== Thu tham số: hộp thoại (mặc định) hoặc dòng lệnh (M106 FR9) =====

    /// <summary>
    /// Mã bản vẽ + rev cho lần tải này. Hộp thoại trước (M106 §7.2), rơi về ĐÚNG hai câu hỏi dòng
    /// lệnh cũ khi UI không dựng được hoặc bị tắt bằng <c>XBOSS_UI_DIALOG=0</c> (FR9).
    /// Hủy ở hộp thoại = dừng lệnh.
    /// </summary>
    private static KetQuaUpload? HoiThamSo(Editor ed, string tenDwg, IReadOnlyList<string> sidecar)
    {
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new UploadDialogViewModel(tenDwg, sidecar);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi) return kq;

        var ma = HoiChuoi(
            ed, "Số bản vẽ trong sổ XBoss (drawings.code, vd ACMV-SD-T05-001; hoặc #<mã số> khi biết)");
        if (ma is null or "") return null;
        var rev = HoiChuoi(ed, "Rev (vd A, B, C)");
        if (rev is null or "") return null;
        return new KetQuaUpload(ma, rev);
    }

    /// <summary>Các sidecar CÓ THẬT cạnh DWG — hộp thoại chỉ hiện, không đọc đĩa (guardrail M106 §2).</summary>
    private static IReadOnlyList<string> MoTaSidecar(string duongDanDwg)
    {
        var ra = new List<string>();
        if (File.Exists(duongDanDwg + ".xboss-report.json")) ra.Add("báo cáo chuẩn hóa");
        if (File.Exists(duongDanDwg + XBossCommands.TenSidecarBocKL)) ra.Add("kết quả bóc khối lượng");
        return ra;
    }

    private static string? HoiChuoi(Editor ed, string nhan)
    {
        var kq = ed.GetString(new PromptStringOptions($"\n[XBoss] {nhan}: ") { AllowSpaces = false });
        return kq.Status == PromptStatus.OK ? kq.StringResult.Trim() : null;
    }
}
