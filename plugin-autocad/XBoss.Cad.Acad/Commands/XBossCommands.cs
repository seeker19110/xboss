using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Excel;
using XBoss.Cad.Core.Inspection;
using XBoss.Cad.Core.Reporting;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Takeoff;
using AcadApp = Autodesk.AutoCAD.ApplicationServices.Application;

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// Bộ lệnh XBOSS_* (M99 §6). Mỗi lệnh = một nhóm UNDO (mọi thay đổi nằm trong một
/// transaction của một lệnh — FR7). Toàn bộ thông báo tiếng Việt (NFR2).
/// </summary>
public sealed class XBossCommands
{
    // ===== Hạ tầng chung =====

    private static (Document Doc, Editor Ed)? SanSang()
    {
        var doc = AcadApp.DocumentManager.MdiActiveDocument;
        if (doc is null) return null;
        if (!PluginExtension.DungDoiAutoCad)
        {
            doc.Editor.WriteMessage("\n[XBoss] Plugin chỉ hỗ trợ AutoCAD 2026 — lệnh bị từ chối.\n");
            return null;
        }
        return (doc, doc.Editor);
    }

    /// <summary>Rule pack hiện hành; null (kèm thông báo) khi chưa nạp — AC14.</summary>
    private static CadRulePack? CanRulePack(Editor ed)
    {
        var (pack, loi) = RulePackStore.HienHanh();
        if (pack is null) ed.WriteMessage($"\n[XBoss] {loi}\n");
        return pack;
    }

    private static string HomNayIso() => DateTime.Now.ToString("yyyy-MM-dd");

    // ===== XBOSS_RULEPACK =====

    [CommandMethod("XBOSS_RULEPACK")]
    public void NapRulePack()
    {
        if (SanSang() is not (var doc, var ed)) return;
        _ = doc;
        var dlg = new Autodesk.AutoCAD.Windows.OpenFileDialog(
            "Chọn tệp rule pack JSON (tải từ trang XBoss /engineering/chuan-hoa-ban-ve)",
            "", "json", "XBossRulePack",
            Autodesk.AutoCAD.Windows.OpenFileDialog.OpenFileDialogFlags.DefaultIsFolder);
        if (dlg.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;
        try
        {
            var pack = RulePackStore.Import(dlg.Filename);
            ed.WriteMessage(
                $"\n[XBoss] Đã nạp rule pack {pack.Version} ({pack.Takeoff.Items.Count} quy tắc bóc tách," +
                $" {pack.LayerMap.Groups.Count} nhóm layer). Cache: {RulePackStore.CachePath}\n");
        }
        catch (RulePackException e)
        {
            ed.WriteMessage($"\n[XBoss] Rule pack KHÔNG hợp lệ — không nạp: {e.Message}\n");
        }
        catch (IOException e)
        {
            ed.WriteMessage($"\n[XBoss] Không đọc được tệp: {e.Message}\n");
        }
    }

    // ===== XBOSS_KIEMTRA =====

    [CommandMethod("XBOSS_KIEMTRA")]
    public void KiemTra()
    {
        if (SanSang() is not (var doc, var ed)) return;
        if (CanRulePack(ed) is not { } pack) return;

        var db = doc.Database;
        using var khoa = doc.LockDocument();
        InspectionReport baoCao;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            // Marker của phiên trước không được lọt vào snapshot.
            KiemTraMarker.DonSach(db, tr);
            var snapshot = DrawingSnapshotBuilder.Build(db, tr);
            baoCao = new Inspector(pack).Run(snapshot);

            // Highlight: marker vòng tròn trên layer tạm cho mọi nhóm có handle (M99 §6.4).
            var handleLoi = baoCao.Findings.SelectMany(f => f.Handles).Distinct().ToList();
            if (handleLoi.Count > 0) KiemTraMarker.Ve(db, tr, handleLoi, pack.Takeoff.MarkColorAci);
            tr.Commit(); // chỉ chứa marker — 1 UNDO xoá sạch, bản vẽ gốc không đổi (AC4)
        }

        ed.WriteMessage($"\n[XBoss] ===== KIỂM TRA (chỉ kiểm, không sửa) — rule pack {baoCao.RulePackVersion} =====\n");
        foreach (var c in baoCao.CanhBao) ed.WriteMessage($"[XBoss] ⚠ {c}\n");
        if (baoCao.Findings.Count == 0)
        {
            ed.WriteMessage("[XBoss] ✔ Không phát hiện lệch chuẩn nào.\n");
            return;
        }
        foreach (var f in baoCao.Findings)
        {
            ed.WriteMessage($"[XBoss] • {f.Ten}: {Math.Max(f.Handles.Count, f.ChiTiet.Count)}\n");
            foreach (var ct in f.ChiTiet.Take(20)) ed.WriteMessage($"[XBoss]     {ct}\n");
            if (f.Handles.Count > 0)
                ed.WriteMessage($"[XBoss]     handle: {string.Join(", ", f.Handles.Take(20))}{(f.Handles.Count > 20 ? "…" : "")}\n");
        }
        ed.WriteMessage($"[XBoss] Vị trí lỗi được khoanh tròn trên layer {KiemTraMarker.TenLayer} (không in, tự dọn khi chạy lại/chuẩn hóa).\n");
        ed.WriteMessage("[XBoss] Chạy XBOSS_CHUANHOA để sửa theo rule pack.\n");

        // Báo cáo JSON có cấu trúc (FR8/FR12) — cùng cơ chế với XBOSS_CHUANHOA, PR5 gửi kèm upload.
        if (!string.IsNullOrEmpty(db.Filename))
        {
            var duongDan = db.Filename + ".xboss-kiemtra.json";
            try
            {
                File.WriteAllText(duongDan, baoCao.DongDau(Path.GetFileName(db.Filename), HomNayIso()).ToJson());
                ed.WriteMessage($"[XBoss] Báo cáo JSON: {duongDan}\n");
            }
            catch (IOException e)
            {
                ed.WriteMessage($"[XBoss] ⚠ Không ghi được báo cáo JSON: {e.Message}\n");
            }
        }
    }

    // ===== XBOSS_CHUANHOA =====

    [CommandMethod("XBOSS_CHUANHOA")]
    public void ChuanHoa()
    {
        if (SanSang() is not (var doc, var ed)) return;
        if (CanRulePack(ed) is not { } pack) return;
        var db = doc.Database;

        if (Convert.ToInt32(AcadApp.GetSystemVariable("DBMOD")) != 0)
        {
            ed.WriteMessage("\n[XBoss] Bản vẽ có thay đổi chưa lưu — LƯU (QSAVE) trước khi chuẩn hóa để luôn giữ được bản gốc.\n");
            return;
        }

        // ----- Xem trước diff (dry-run trên snapshot — không đụng bản vẽ) -----
        InspectionReport truoc;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            KiemTraMarker.DonSach(db, tr);
            truoc = new Inspector(pack).Run(DrawingSnapshotBuilder.Build(db, tr));
            tr.Commit();
        }
        ed.WriteMessage($"\n[XBoss] ===== XEM TRƯỚC CHUẨN HÓA — rule pack {pack.Version} =====\n");
        if (truoc.Findings.Count == 0)
        {
            ed.WriteMessage("[XBoss] ✔ Bản vẽ đã đạt chuẩn — không có gì để sửa.\n");
            return;
        }
        foreach (var f in truoc.Findings)
            ed.WriteMessage($"[XBoss] • {f.Ten}: {Math.Max(f.Handles.Count, f.ChiTiet.Count)}\n");

        var hoi = new PromptKeywordOptions("\n[XBoss] Thực thi chuẩn hóa? Toàn bộ hoàn tác được bằng 1 lần UNDO")
        {
            AllowNone = false,
        };
        hoi.Keywords.Add("DongY", "DongY", "Đồng ý");
        hoi.Keywords.Add("Huy", "Huy", "Hủy");
        hoi.Keywords.Default = "Huy";
        var traLoi = doc.Editor.GetKeywords(hoi);
        if (traLoi.Status != PromptStatus.OK || traLoi.StringResult != "DongY")
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return;
        }

        // ----- Thực thi: 1 transaction = 1 nhóm UNDO (FR7) -----
        var pipeline = new StandardizePipeline(pack);
        // AUDIT chạy trước, ngoài transaction (là lệnh AutoCAD, không phải API Database).
        pipeline.Buoc1Audit(ed);
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                pipeline.Run(db, tr);
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort(); // rollback sạch — guardrail M99 §2
                ed.WriteMessage($"\n[XBoss] LỖI giữa chừng — đã rollback toàn bộ, bản vẽ nguyên trạng: {e.Message}\n");
                return;
            }
        }

        var baoCao = new StandardizeReport
        {
            RulePackVersion = pack.Version,
            TenBanVe = Path.GetFileName(db.Filename),
            NgayIso = HomNayIso(),
            CheDo = "chuan-hoa",
            Steps = pipeline.Steps,
            CanhBao = pipeline.CanhBao,
        };
        ed.WriteMessage("\n" + baoCao.ToVietnameseText());
        // Báo cáo JSON đặt cạnh DWG — PR5 sẽ gửi kèm khi upload (FR8/FR9).
        var duongDanBaoCao = db.Filename + ".xboss-report.json";
        try
        {
            File.WriteAllText(duongDanBaoCao, baoCao.ToJson());
            ed.WriteMessage($"[XBoss] Báo cáo JSON: {duongDanBaoCao}\n");
        }
        catch (IOException e)
        {
            ed.WriteMessage($"[XBoss] ⚠ Không ghi được báo cáo JSON: {e.Message}\n");
        }
        ed.WriteMessage("[XBoss] Hoàn tác toàn bộ: UNDO (1 lần). Lưu lại: QSAVE.\n");
    }

    // ===== XBOSS_BOCKL =====

    [CommandMethod("XBOSS_BOCKL")]
    public void BocKhoiLuong()
    {
        if (SanSang() is not (var doc, var ed)) return;
        if (CanRulePack(ed) is not { } pack) return;
        var db = doc.Database;

        // Phạm vi: toàn model space hoặc chọn vùng (M99 §6.5.1).
        var hoi = new PromptKeywordOptions("\n[XBoss] Bóc khối lượng phạm vi nào?") { AllowNone = false };
        hoi.Keywords.Add("ToanBo", "ToanBo", "Toàn bộ model space");
        hoi.Keywords.Add("ChonVung", "ChonVung", "Chọn vùng");
        hoi.Keywords.Default = "ToanBo";
        var traLoi = ed.GetKeywords(hoi);
        if (traLoi.Status != PromptStatus.OK) return;

        using var khoa = doc.LockDocument();
        TakeoffResult ketQua;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            IEnumerable<ObjectId> ids;
            if (traLoi.StringResult == "ChonVung")
            {
                var chon = ed.GetSelection();
                if (chon.Status != PromptStatus.OK) return;
                ids = chon.Value.GetObjectIds();
            }
            else
            {
                ids = TakeoffScanner.ModelSpaceIds(db, tr).ToList();
            }

            var (doiTuong, xrefSkipped) = TakeoffScanner.Scan(tr, ids, pack.Takeoff.XdataAppName);
            var may = new TakeoffCalculator(pack.Takeoff, pack.Version);
            ketQua = may.Compute(doiTuong, (int)db.Insunits, xrefSkipped);
            tr.Commit();
        }

        InBangKetQua(ed, ketQua);
        if (ketQua.Lines.Count == 0)
        {
            if (ketQua.SkippedMarkedCount > 0)
                ed.WriteMessage($"[XBoss] Khối lượng mới = 0 — đã bóc trước đó: {ketQua.SkippedMarkedCount} đối tượng (xem XBOSS_BOCKL_XUAT / XBOSS_BOCKL_XOA).\n");
            else
                ed.WriteMessage("[XBoss] Không có đối tượng nào khớp quy tắc bóc tách trong rule pack.\n");
            return;
        }

        var xacNhan = new PromptKeywordOptions(
            $"\n[XBoss] Đánh dấu {ketQua.Lines.Sum(l => l.ObjectCount)} đối tượng đã bóc (tô màu ACI {pack.Takeoff.MarkColorAci} + XData)?")
        { AllowNone = false };
        xacNhan.Keywords.Add("DongY", "DongY", "Đồng ý");
        xacNhan.Keywords.Add("Khong", "Khong", "Không");
        xacNhan.Keywords.Default = "DongY";
        var kq2 = ed.GetKeywords(xacNhan);
        if (kq2.Status != PromptStatus.OK || kq2.StringResult != "DongY")
        {
            ed.WriteMessage("\n[XBoss] Không đánh dấu — kết quả chỉ hiển thị, chưa ghi vào bản vẽ.\n");
            return;
        }

        // Đánh dấu trong 1 transaction = 1 nhóm UNDO (FR14).
        using (var tr = db.TransactionManager.StartTransaction())
        {
            MarkService.EnsureRegApp(db, tr, pack.Takeoff.XdataAppName);
            var ngay = HomNayIso();
            foreach (var line in ketQua.Lines)
            {
                foreach (var handle in line.Handles)
                {
                    if (!db.TryGetObjectId(new Handle(Convert.ToInt64(handle, 16)), out var id)) continue;
                    if (tr.GetObject(id, OpenMode.ForWrite) is not Entity ent) continue;
                    MarkService.Mark(ent, pack.Takeoff.XdataAppName, line.Item.Id, pack.Version, ngay, pack.Takeoff.MarkColorAci);
                }
            }
            tr.Commit();
        }
        ed.WriteMessage("\n[XBoss] Đã đánh dấu vùng bóc. Xuất Excel: XBOSS_BOCKL_XUAT · Gỡ đánh dấu: XBOSS_BOCKL_XOA · Hoàn tác: UNDO.\n");
    }

    // ===== XBOSS_BOCKL_XOA =====

    [CommandMethod("XBOSS_BOCKL_XOA")]
    public void GoDanhDau()
    {
        if (SanSang() is not (var doc, var ed)) return;
        if (CanRulePack(ed) is not { } pack) return;
        var db = doc.Database;

        var hoi = new PromptKeywordOptions("\n[XBoss] Gỡ đánh dấu bóc tách ở phạm vi nào?") { AllowNone = false };
        hoi.Keywords.Add("ToanBo", "ToanBo", "Toàn bộ");
        hoi.Keywords.Add("ChonVung", "ChonVung", "Chọn vùng");
        hoi.Keywords.Default = "ToanBo";
        var traLoi = ed.GetKeywords(hoi);
        if (traLoi.Status != PromptStatus.OK) return;

        using var khoa = doc.LockDocument();
        var soGo = 0;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            IEnumerable<ObjectId> ids;
            if (traLoi.StringResult == "ChonVung")
            {
                var chon = ed.GetSelection();
                if (chon.Status != PromptStatus.OK) return;
                ids = chon.Value.GetObjectIds();
            }
            else
            {
                ids = TakeoffScanner.ModelSpaceIds(db, tr).ToList();
            }
            foreach (var id in ids)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
                if (MarkService.ReadMark(ent, pack.Takeoff.XdataAppName) is null) continue;
                ent.UpgradeOpen();
                if (MarkService.Unmark(ent, pack.Takeoff.XdataAppName)) soGo++;
            }
            tr.Commit();
        }
        ed.WriteMessage($"\n[XBoss] Đã gỡ đánh dấu {soGo} đối tượng (trả đúng màu trước khi bóc). Hoàn tác: UNDO.\n");
    }

    // ===== XBOSS_BOCKL_XUAT =====

    [CommandMethod("XBOSS_BOCKL_XUAT")]
    public void XuatExcel()
    {
        if (SanSang() is not (var doc, var ed)) return;
        if (CanRulePack(ed) is not { } pack) return;
        var db = doc.Database;

        // FR16: dựng lại kết quả từ XData đang sống trong DWG — không phụ thuộc RAM phiên trước.
        var daGan = new List<(MeasuredObject, string)>();
        using (var tr = db.TransactionManager.StartTransaction())
        {
            var (doiTuong, _) = TakeoffScanner.Scan(
                tr, TakeoffScanner.ModelSpaceIds(db, tr).ToList(), pack.Takeoff.XdataAppName);
            var theoHandle = doiTuong.Where(o => o.AlreadyMarked).ToDictionary(o => o.Handle);
            var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
            foreach (ObjectId id in ms)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
                if (MarkService.ReadMark(ent, pack.Takeoff.XdataAppName) is not { } mark) continue;
                if (theoHandle.TryGetValue(ent.Handle.ToString(), out var obj))
                    daGan.Add((obj, mark.ItemId));
            }
            tr.Commit();
        }
        if (daGan.Count == 0)
        {
            ed.WriteMessage("\n[XBoss] Chưa có đối tượng nào được đánh dấu bóc — chạy XBOSS_BOCKL trước.\n");
            return;
        }

        var may = new TakeoffCalculator(pack.Takeoff, pack.Version);
        var ketQua = may.ComputeAssigned(daGan, (int)db.Insunits);
        InBangKetQua(ed, ketQua);

        // Meta đầu trang: nhớ tên dự án/gói thầu giữa các lần xuất.
        var luu = ExcelMetaStore.Doc();
        var tenDuAn = HoiChuoi(ed, "Tên dự án", luu.TenDuAn);
        if (tenDuAn is null) return;
        var goiThau = HoiChuoi(ed, "Gói thầu", luu.GoiThau);
        if (goiThau is null) return;
        ExcelMetaStore.Ghi(new ExcelMetaStore.MetaLuu(tenDuAn, goiThau));

        var tenBanVe = Path.GetFileName(db.Filename);
        var goiY = Path.ChangeExtension(tenBanVe, null) + "-boc-khoi-luong.xlsx";
        var dlg = new Autodesk.AutoCAD.Windows.SaveFileDialog(
            "Lưu bảng bóc khối lượng (mẫu công ty)", goiY, "xlsx", "XBossBocKL",
            Autodesk.AutoCAD.Windows.SaveFileDialog.SaveFileDialogFlags.NoFlags);
        if (dlg.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;

        var meta = new BoqExcelMeta
        {
            TenDuAn = tenDuAn,
            GoiThau = goiThau,
            TenBanVe = tenBanVe,
            RulePackVersion = pack.Version,
            NguoiBoc = Environment.UserName,
            NgayIso = HomNayIso(),
        };
        try
        {
            using var f = File.Create(dlg.Filename);
            BoqExcelWriter.Write(ketQua, meta, f);
        }
        catch (IOException e)
        {
            ed.WriteMessage($"\n[XBoss] Không ghi được tệp Excel: {e.Message}\n");
            return;
        }
        ed.WriteMessage($"\n[XBoss] Đã xuất Excel đúng mẫu công ty: {dlg.Filename}\n");
        ed.WriteMessage("[XBoss] Cột G = khối lượng bóc từ bản vẽ; QS điền cột F (KL BOQ hợp đồng) — cột H/J/K tự tính.\n");

        // Sidecar JSON máy-đọc-được cạnh tệp Excel — PR5 gửi kèm khi upload, kiểm chéo được với Excel.
        var duongDanJson = Path.ChangeExtension(dlg.Filename, ".json");
        try
        {
            File.WriteAllText(duongDanJson, TakeoffJsonReport.TuKetQua(ketQua, meta).ToJson());
            ed.WriteMessage($"[XBoss] Sidecar JSON: {duongDanJson}\n");
        }
        catch (IOException e)
        {
            ed.WriteMessage($"[XBoss] ⚠ Không ghi được sidecar JSON: {e.Message}\n");
        }
    }

    // ===== XBOSS_BATCH =====

    [CommandMethod("XBOSS_BATCH")]
    public void XuLyHangLoat()
    {
        if (SanSang() is not (var doc, var ed)) return;
        if (CanRulePack(ed) is not { } pack) return;

        var hoi = new PromptKeywordOptions("\n[XBoss] Xử lý hàng loạt cả thư mục — chế độ nào?") { AllowNone = false };
        hoi.Keywords.Add("KiemTra", "KiemTra", "Chỉ kiểm (an toàn, không sửa)");
        hoi.Keywords.Add("ChuanHoa", "ChuanHoa", "Chuẩn hóa (bản gốc giữ nguyên, kết quả vào thư mục con)");
        hoi.Keywords.Default = "KiemTra";
        var traLoi = ed.GetKeywords(hoi);
        if (traLoi.Status != PromptStatus.OK) return;
        var chuanHoa = traLoi.StringResult == "ChuanHoa";

        using var chonThuMuc = new System.Windows.Forms.FolderBrowserDialog
        {
            Description = "Chọn thư mục chứa các tệp .dwg cần xử lý",
            ShowNewFolderButton = false,
        };
        if (chonThuMuc.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;
        var thuMuc = chonThuMuc.SelectedPath;

        // Không xử lý tệp đang mở trong phiên (side database sẽ đụng khóa tệp).
        var dangMo = AcadApp.DocumentManager
            .Cast<Document>()
            .Select(d => d.Database.Filename)
            .Where(f => !string.IsNullOrEmpty(f))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var trungTepMo = Directory.GetFiles(thuMuc, "*.dwg", SearchOption.TopDirectoryOnly)
            .Count(f => dangMo.Contains(f));
        if (trungTepMo > 0)
            ed.WriteMessage($"\n[XBoss] ⚠ {trungTepMo} tệp trong thư mục đang mở trong AutoCAD — các tệp đó sẽ báo lỗi và bị bỏ qua (đóng tệp rồi chạy lại nếu cần).\n");

        ed.WriteMessage($"\n[XBoss] ===== BATCH {(chuanHoa ? "CHUẨN HÓA" : "KIỂM TRA")} — rule pack {pack.Version} — {thuMuc} =====\n");
        if (chuanHoa)
            ed.WriteMessage($"[XBoss] Bản gốc GIỮ NGUYÊN — kết quả lưu vào thư mục con \"{BatchProcessor.ThuMucKetQua}\".\n");

        var ketQua = BatchProcessor.Chay(thuMuc, pack, chuanHoa, HomNayIso(),
            ten => ed.WriteMessage($"[XBoss] … {ten}\n"));

        foreach (var t in ketQua.Tep)
            ed.WriteMessage($"[XBoss] {(t.ThanhCong ? "✔" : "✘")} {t.TenTep}: {t.TomTat}\n");
        ed.WriteMessage($"[XBoss] Xong: {ketQua.Tep.Count} tệp — {ketQua.SoThanhCong} thành công, {ketQua.SoLoi} lỗi. Nhật ký: {ketQua.DuongDanNhatKy}\n");
    }

    // ===== Trợ giúp hiển thị =====

    private static void InBangKetQua(Editor ed, TakeoffResult kq)
    {
        ed.WriteMessage($"\n[XBoss] ===== KẾT QUẢ BÓC KHỐI LƯỢNG — rule pack {kq.RulePackVersion} =====\n");
        foreach (var nhom in kq.Lines.GroupBy(l => l.Item.Group))
        {
            ed.WriteMessage($"[XBoss] {nhom.Key}\n");
            foreach (var l in nhom)
            {
                var ma = string.IsNullOrEmpty(l.Item.BoqCode) ? "(chưa gán mã)" : l.Item.BoqCode;
                ed.WriteMessage($"[XBoss]   {l.Item.Name,-28} {l.Quantity,12:#,##0.00} {l.Item.Unit,-4} ({l.ObjectCount} đối tượng, {ma})\n");
            }
        }
        foreach (var w in kq.Warnings) ed.WriteMessage($"[XBoss] ⚠ {w.ThongDiep}\n");
        if (kq.SkippedMarkedCount > 0)
            ed.WriteMessage($"[XBoss] Đã bỏ qua {kq.SkippedMarkedCount} đối tượng bóc trước đó.\n");
        if (kq.XrefSkippedCount > 0)
            ed.WriteMessage($"[XBoss] Bỏ qua {kq.XrefSkippedCount} đối tượng trong xref (không bóc xref).\n");
    }

    private static string? HoiChuoi(Editor ed, string nhan, string macDinh)
    {
        var opt = new PromptStringOptions($"\n[XBoss] {nhan}{(macDinh.Length > 0 ? $" <{macDinh}>" : "")}: ")
        {
            AllowSpaces = true,
        };
        var kq = ed.GetString(opt);
        if (kq.Status != PromptStatus.OK) return null;
        return kq.StringResult.Length > 0 ? kq.StringResult : macDinh;
    }
}
