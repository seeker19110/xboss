using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.Ui.ViewModels;
using XBoss.Cad.Core.Excel;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Inspection;
using XBoss.Cad.Core.Reporting;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Takeoff;
using XBoss.Cad.Core.Zoning;
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

    // ===== Mở khóa TẠM để ghi lên thực thể (đường bóc khối lượng) =====
    //
    // Bản vẽ MEP thật luôn có layer khóa (nền kiến trúc, hệ khác, layer của công ty), mà đánh dấu
    // hay gỡ dấu đều phải mở thực thể ForWrite ⇒ AutoCAD ném eOnLockedLayer và cả lệnh rollback.
    // Người dùng đã chốt (2026-08-26): plugin ĐƯỢC PHÉP tự mở khóa để ghi, miễn trả nguyên trạng.
    // Dùng đúng cặp VeLayerService.MoKhoaTam/KhoaLai của pipeline chuẩn hóa — không cơ chế thứ hai.

    /// <summary>
    /// Tập layer đang giữ những thực thể sắp ghi — để <c>MoKhoaTam</c> mở khóa ĐÚNG chừng đó thay
    /// vì mở toang cả bản vẽ. Mở ForRead: layer khóa vẫn đọc được bình thường.
    /// </summary>
    private static HashSet<ObjectId> LayerCua(Transaction tr, IEnumerable<ObjectId> ids)
    {
        var layer = new HashSet<ObjectId>();
        foreach (var id in ids)
            if (tr.GetObject(id, OpenMode.ForRead) is Entity ent) layer.Add(ent.LayerId);
        return layer;
    }

    /// <summary>
    /// Thực thể còn nằm trên layer khóa sau khi đã mở khóa tạm? (layer bị AEC/ứng dụng thứ ba giữ).
    /// Hỏi TRƯỚC khi ghi thay vì để AutoCAD ném eOnLockedLayer — một layer khó tính không được phép
    /// giết cả lệnh; caller đếm số bỏ qua và báo cho kỹ sư.
    /// </summary>
    private static bool ConKhoa(Transaction tr, Entity ent) =>
        tr.GetObject(ent.LayerId, OpenMode.ForRead) is LayerTableRecord ltr && ltr.IsLocked;

    /// <summary>Báo cho kỹ sư đúng những gì lệnh đã đụng vào cờ khóa layer — không im lặng.</summary>
    private static void InTinhTrangKhoaLayer(
        Editor ed, string viec, int soMoKhoa, IReadOnlyList<string> khongMoDuoc,
        IReadOnlyList<string> khoaLaiHut, int soBoQua)
    {
        if (soMoKhoa > 0)
            ed.WriteMessage($"[XBoss] Đã tạm mở khóa {soMoKhoa} layer để {viec} và khóa lại như cũ.\n");
        if (khongMoDuoc.Count > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {khongMoDuoc.Count} layer đang KHÓA mà không mở khóa được: " +
                $"{string.Join(", ", khongMoDuoc)} — bỏ qua {soBoQua} đối tượng trên các layer đó.\n");
        }
        if (khoaLaiHut.Count > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ Không khóa lại được {khoaLaiHut.Count} layer đã mở tạm: " +
                $"{string.Join(", ", khoaLaiHut)} — khóa tay lại (lệnh LAYER) trước khi lưu.\n");
        }
    }

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
            // Cache theo phạm vi (M101 PR4): tệp tải kèm ?project= mang dấu projectId nên nằm ở ô
            // cache của dự án đó, tệp toàn cục nằm ở rule-pack.json — in ĐÚNG đường dẫn đã ghi.
            ed.WriteMessage(
                $"\n[XBoss] Đã nạp rule pack {pack.Version} ({pack.Takeoff.Items.Count} quy tắc bóc tách," +
                $" {pack.LayerMap.Groups.Count} nhóm layer). Cache: {RulePackStore.DuongDanCua(pack)}\n");
            if (RulePackStore.DuongDanCua(pack) != RulePackStore.DuongDanHienHanh)
            {
                // Chỉ xảy ra khi nạp tay bản TOÀN CỤC trong lúc máy đang nhớ một dự án có cache
                // riêng — nói thẳng bản nào đang có hiệu lực thay vì để kỹ sư tưởng đã đổi.
                ed.WriteMessage(
                    "[XBoss] ⚠ Bản vừa nạp KHÔNG phải bản các lệnh đang dùng " +
                    $"({RulePackStore.DuongDanHienHanh}) — chạy XBOSS_LOGIN để lấy bản của dự án đang làm.\n");
            }
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
        var dongXemTruoc = truoc.Findings
            .Select(f => $"{f.Ten}: {Math.Max(f.Handles.Count, f.ChiTiet.Count)}")
            .ToList();
        foreach (var d in dongXemTruoc) ed.WriteMessage($"[XBoss] • {d}\n");

        // Xác nhận: hộp thoại hiện luôn diff xem trước (M106 §7.2), rơi về câu hỏi keyword cũ khi
        // UI không dựng được hoặc bị tắt bằng XBOSS_UI_DIALOG=0 (FR9).
        if (!XacNhanChuanHoa(ed, pack.Version, dongXemTruoc))
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return;
        }

        // ----- Thực thi: 1 transaction = 1 nhóm UNDO (FR7) -----
        var pipeline = new StandardizePipeline(pack);
        // AUDIT chạy trước, ngoài transaction (là lệnh AutoCAD, không phải API Database).
        pipeline.Buoc1Audit(ed);
        using (var khoa = doc.LockDocument())
        {
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
            // Phần bind xref (bước 9) + dọn layout (bước 11) dùng API cấp TÀI LIỆU nên không chạy
            // được trong transaction — làm ngay sau khi commit, vẫn trong cùng lệnh này nên UNDO
            // một lần vẫn trả bản vẽ về nguyên trạng (đúng cơ chế của bước 1 AUDIT).
            try
            {
                pipeline.ApDungCapTaiLieu(db, coTaiLieu: true);
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                ed.WriteMessage($"\n[XBoss] ⚠ Bước 9/11 (bind xref, dọn layout) lỗi: {e.Message} — các bước trước đã áp xong.\n");
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

        // Phạm vi (M99 §6.5.1) + bóc theo vùng (M101 §6.3) gộp vào MỘT hộp thoại (M106 §7.2);
        // UI hỏng / XBOSS_UI_DIALOG=0 → đúng hai câu hỏi keyword cũ (FR9).
        if (HoiThamSoBocKl(ed, pack.Version) is not { } ts) return;

        using var khoa = doc.LockDocument();
        TakeoffResult ketQua;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            IEnumerable<ObjectId> ids;
            if (ts.PhamVi == PhamViBoc.ChonVung)
            {
                var chon = ed.GetSelection();
                if (chon.Status != PromptStatus.OK) return;
                ids = chon.Value.GetObjectIds();
            }
            else
            {
                ids = TakeoffScanner.ModelSpaceIds(db, tr).ToList();
            }

            var chonVung = ts.ChiaVung
                ? VungChonService.Hoi(ed, tr)
                : new VungChonService.KetQuaChonVung([], []);
            var boiCanh = TakeoffScanner.XayBoiCanh(db, tr, pack, chonVung);

            var (doiTuong, xrefSkipped) = TakeoffScanner.Scan(tr, ids, pack.Takeoff.XdataAppName, boiCanh);
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
            $"\n[XBoss] Đánh dấu {SoDoiTuongDaBoc(ketQua)} đối tượng đã bóc (tô màu ACI {pack.Takeoff.MarkColorAci} + XData)?")
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
        var soMoKhoa = 0;
        var soBoQuaKhoa = 0;
        var khongMoDuoc = new List<string>();
        var khoaLaiHut = new List<string>();
        using (var tr = db.TransactionManager.StartTransaction())
        {
            MarkService.EnsureRegApp(db, tr, pack.Takeoff.XdataAppName);
            var ngay = HomNayIso();
            // Tên vùng ghi kèm XData (M101 §6.3) để XBOSS_BOCKL_XUAT dựng lại bảng theo vùng.
            var vungTheoHandle = TakeoffZoning.VungTheoHandle(ketQua);

            // Gom danh sách sẽ đánh dấu TRƯỚC (chỉ đọc) để biết cần mở khóa những layer nào. Không
            // đụng gì tới số liệu: khối lượng đã tính xong ở transaction trên, đây chỉ là bước ghi
            // dấu lên đúng những handle mà TakeoffScanner đã chọn (khối xref vốn đã bị loại từ M99).
            var canDanhDau = new List<(ObjectId Id, string ItemId, string Vung)>();
            foreach (var line in ketQua.Lines)
            {
                if (line.LaDanXuat) continue; // dòng cách nhiệt được TÍNH RA, không có đối tượng riêng để đánh dấu
                foreach (var handle in line.Handles)
                {
                    if (!db.TryGetObjectId(new Handle(Convert.ToInt64(handle, 16)), out var id)) continue;
                    canDanhDau.Add((id, line.Item.Id, vungTheoHandle.GetValueOrDefault(handle, "")));
                }
            }

            var daMoKhoa = VeLayerService.MoKhoaTam(
                db, tr, khongMoDuoc, LayerCua(tr, canDanhDau.Select(x => x.Id)));
            soMoKhoa = daMoKhoa.Count;
            try
            {
                foreach (var (id, itemId, vung) in canDanhDau)
                {
                    if (tr.GetObject(id, OpenMode.ForRead) is not Entity entDoc) continue;
                    if (ConKhoa(tr, entDoc)) { soBoQuaKhoa++; continue; }
                    // Mở lại ForWrite (không UpgradeOpen): một handle lọt vào hai dòng kết quả thì
                    // UpgradeOpen lần hai ném eWasOpenForWrite, còn GetObject ForWrite thì không.
                    if (tr.GetObject(id, OpenMode.ForWrite) is not Entity ent) continue;
                    MarkService.Mark(
                        ent, pack.Takeoff.XdataAppName, itemId, pack.Version, ngay,
                        pack.Takeoff.MarkColorAci, vung);
                }
            }
            finally
            {
                // Khóa lại kể cả khi ghi ném giữa chừng — bản vẽ của kỹ sư phải rời lệnh với đúng
                // cờ khóa như lúc vào (lối thất bại còn rollback theo Transaction.Abort).
                VeLayerService.KhoaLai(tr, daMoKhoa, khoaLaiHut);
            }
            tr.Commit();
        }
        ed.WriteMessage("\n[XBoss] Đã đánh dấu vùng bóc. Xuất Excel: XBOSS_BOCKL_XUAT · Gỡ đánh dấu: XBOSS_BOCKL_XOA · Hoàn tác: UNDO.\n");
        InTinhTrangKhoaLayer(ed, "đánh dấu", soMoKhoa, khongMoDuoc, khoaLaiHut, soBoQuaKhoa);
    }

    // ===== XBOSS_BOCKL_XOA =====

    [CommandMethod("XBOSS_BOCKL_XOA")]
    public void GoDanhDau()
    {
        if (SanSang() is not (var doc, var ed)) return;
        if (CanRulePack(ed) is not { } pack) return;
        var db = doc.Database;

        // Hộp thoại một câu (M106 §7.2); UI hỏng / XBOSS_UI_DIALOG=0 → câu hỏi keyword cũ (FR9).
        if (HoiPhamViGoDau(ed) is not { } phamVi) return;

        using var khoa = doc.LockDocument();
        var soGo = 0;
        var soMoKhoa = 0;
        var soBoQuaKhoa = 0;
        var khongMoDuoc = new List<string>();
        var khoaLaiHut = new List<string>();
        using (var tr = db.TransactionManager.StartTransaction())
        {
            IEnumerable<ObjectId> ids;
            if (phamVi == PhamViBoc.ChonVung)
            {
                var chon = ed.GetSelection();
                if (chon.Status != PromptStatus.OK) return;
                ids = chon.Value.GetObjectIds();
            }
            else
            {
                ids = TakeoffScanner.ModelSpaceIds(db, tr).ToList();
            }

            // Lọc trước (chỉ đọc) những thực thể thật sự có dấu bóc, rồi mở khóa TẠM đúng layer của
            // chúng: gỡ dấu là GHI (trả màu cũ + xoá XData) nên layer khóa là eOnLockedLayer.
            var canGo = new List<ObjectId>();
            foreach (var id in ids)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
                if (MarkService.ReadMark(ent, pack.Takeoff.XdataAppName) is null) continue;
                canGo.Add(id);
            }

            var daMoKhoa = VeLayerService.MoKhoaTam(db, tr, khongMoDuoc, LayerCua(tr, canGo));
            soMoKhoa = daMoKhoa.Count;
            try
            {
                foreach (var id in canGo)
                {
                    if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
                    if (ConKhoa(tr, ent)) { soBoQuaKhoa++; continue; }
                    ent.UpgradeOpen();
                    if (MarkService.Unmark(ent, pack.Takeoff.XdataAppName)) soGo++;
                }
            }
            finally
            {
                VeLayerService.KhoaLai(tr, daMoKhoa, khoaLaiHut);
            }
            tr.Commit();
        }
        ed.WriteMessage($"\n[XBoss] Đã gỡ đánh dấu {soGo} đối tượng (trả đúng màu trước khi bóc). Hoàn tác: UNDO.\n");
        InTinhTrangKhoaLayer(ed, "gỡ dấu", soMoKhoa, khongMoDuoc, khoaLaiHut, soBoQuaKhoa);
    }

    // ===== XBOSS_BOCKL_XUAT =====

    [CommandMethod("XBOSS_BOCKL_XUAT")]
    public void XuatExcel()
    {
        if (SanSang() is not (var doc, var ed)) return;
        if (CanRulePack(ed) is not { } pack) return;
        var db = doc.Database;

        // FR16: dựng lại kết quả từ XData đang sống trong DWG — không phụ thuộc RAM phiên trước.
        // Đọc TẠI CHỖ (không qua TakeoffScanner.DocDaGan) vì ở đây còn cần lấy TÊN VÙNG ghi trong
        // XData lúc bóc — DocDaGan chỉ trả đối tượng + itemId, dùng cho XBOSS_VE_THONGKE.
        var daGan = new List<(MeasuredObject DoiTuong, string ItemId)>();
        using (var tr = db.TransactionManager.StartTransaction())
        {
            var (doiTuong, _) = TakeoffScanner.Scan(
                tr, TakeoffScanner.ModelSpaceIds(db, tr).ToList(), pack.Takeoff.XdataAppName,
                TakeoffScanner.XayBoiCanh(db, tr, pack, new VungChonService.KetQuaChonVung([], [])));
            var theoHandle = doiTuong.Where(o => o.AlreadyMarked).ToDictionary(o => o.Handle);
            var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
            foreach (ObjectId id in ms)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
                if (MarkService.ReadMark(ent, pack.Takeoff.XdataAppName) is not { } mark) continue;
                if (theoHandle.TryGetValue(ent.Handle.ToString(), out var obj))
                {
                    // Vùng lấy lại từ XData lúc bóc (ranh giới có thể đã bị xoá khỏi bản vẽ).
                    daGan.Add((obj with { Vung = mark.Vung }, mark.ItemId));
                }
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

        // Meta đầu trang + tùy chọn đối chiếu BOQ: hộp thoại một form (M106 §7.2), rơi về 3 câu hỏi
        // dòng lệnh cũ khi UI không dựng được hoặc bị tắt (FR9). Nhớ tên dự án/gói thầu giữa các lần.
        var luu = ExcelMetaStore.Doc();
        if (HoiThamSoXuat(ed, luu) is not { } ts) return;
        var (tenDuAn, goiThau) = (ts.TenDuAn, ts.GoiThau);

        // M101 PR4 — kéo KL BOQ hợp đồng từ máy chủ để dựng sheet phụ "Doi-chieu". Mặc định KHÔNG
        // kéo: hành vi y hệt trước PR4. Mọi trục trặc (chưa LOGIN, mất mạng, token hết hạn, máy chủ
        // lỗi) chỉ CẢNH BÁO rồi xuất Excel như thường — không bao giờ chặn việc xuất bảng bóc.
        var duAnId = luu.DuAnId;
        var doiChieu = ts.DoiChieuBoq ? TaiDoiChieuBoq(ed, ref duAnId) : null;
        ExcelMetaStore.Ghi(new ExcelMetaStore.MetaLuu(tenDuAn, goiThau, duAnId));

        // Mã BOQ ở cột A đến từ RULE PACK, không phải từ KL đối chiếu: rule pack đang dùng thuộc
        // dự án khác (hoặc là bản toàn cục) thì cột mã không khớp dự án vừa chọn. Chỉ CẢNH BÁO —
        // Excel vẫn xuất bình thường, kỹ sư chạy XBOSS_LOGIN là khớp lại (M101 PR4).
        if (duAnId is { } duAnDoiChieu && pack.ProjectId != duAnDoiChieu)
        {
            var dangDung = pack.ProjectId is { } idPack ? $"thuộc dự án #{idPack}" : "là bản toàn cục";
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Rule pack đang dùng {dangDung} — cột mã BOQ có thể chưa khớp dự án " +
                $"#{duAnDoiChieu}. Chạy XBOSS_LOGIN để tải rule pack của dự án này.\n");
        }

        var tenBanVe = Path.GetFileName(db.Filename);
        var goiY = Path.ChangeExtension(tenBanVe, null) + "-boc-khoi-luong.xlsx";
        var dlg = new Autodesk.AutoCAD.Windows.SaveFileDialog(
            "Lưu bảng bóc khối lượng (mẫu công ty)", goiY, "xlsx", "XBossBocKL",
            // Enum cờ của hộp thoại lưu tệp KHÔNG có thành viên tên "không cờ nào"
            // (cả `Default` lẫn `NoFlags` đều không tồn tại trong ObjectARX 2026 — đã thử khi
            // build thật). Giá trị 0 = không bật cờ đặc biệt nào, đúng thứ ta cần.
            default(Autodesk.AutoCAD.Windows.SaveFileDialog.SaveFileDialogFlags));
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
            BoqExcelWriter.Write(ketQua, meta, f, doiChieu);
        }
        catch (IOException e)
        {
            ed.WriteMessage($"\n[XBoss] Không ghi được tệp Excel: {e.Message}\n");
            return;
        }
        ed.WriteMessage($"\n[XBoss] Đã xuất Excel đúng mẫu công ty: {dlg.Filename}\n");
        ed.WriteMessage("[XBoss] Cột G = khối lượng bóc từ bản vẽ; QS điền cột F (KL BOQ hợp đồng) — cột H/J/K tự tính.\n");
        if (doiChieu is { Dong.Count: > 0 })
            ed.WriteMessage(
                $"[XBoss] Sheet \"{BoqExcelWriter.SheetDoiChieu}\": {doiChieu.Dong.Count} hạng mục có KL BOQ hợp đồng " +
                $"(dự án #{doiChieu.ProjectId}, chụp lúc {doiChieu.ChupLuc}) — chênh lệch là công thức sống.\n");

        // Sidecar JSON máy-đọc-được cạnh tệp Excel — kiểm chéo được với Excel bằng mắt/công cụ khác.
        var jsonNoiDung = TakeoffJsonReport.TuKetQua(ketQua, meta).ToJson();
        var duongDanJson = Path.ChangeExtension(dlg.Filename, ".json");
        try
        {
            File.WriteAllText(duongDanJson, jsonNoiDung);
            ed.WriteMessage($"[XBoss] Sidecar JSON: {duongDanJson}\n");
        }
        catch (IOException e)
        {
            ed.WriteMessage($"[XBoss] ⚠ Không ghi được sidecar JSON: {e.Message}\n");
        }

        // M101 §6.4 (PR5): CÙNG NỘI DUNG ghi thêm cạnh chính DWG với tên cố định — XBOSS_UPLOAD
        // tự tìm theo tên này (Excel có thể lưu ở bất kỳ đâu do kỹ sư chọn, không đoán được).
        try
        {
            File.WriteAllText(db.Filename + TenSidecarBocKL, jsonNoiDung);
        }
        catch (IOException e)
        {
            ed.WriteMessage($"[XBoss] ⚠ Không ghi được sidecar KL cạnh DWG (XBOSS_UPLOAD sẽ không gửi kèm): {e.Message}\n");
        }
    }

    /// <summary>Tên hậu tố sidecar KL cạnh DWG (M101 §6.4) — XBOSS_UPLOAD đọc theo tên cố định
    /// này, độc lập với nơi kỹ sư lưu Excel/JSON qua hộp thoại của XBOSS_BOCKL_XUAT.</summary>
    internal const string TenSidecarBocKL = ".xboss-takeoff.json";

    // ===== XBOSS_BATCH =====

    [CommandMethod("XBOSS_BATCH")]
    public void XuLyHangLoat()
    {
        if (SanSang() is not (var doc, var ed)) return;
        if (CanRulePack(ed) is not { } pack) return;

        // Chọn chế độ bằng hộp thoại (M106 §7.2); UI hỏng / XBOSS_UI_DIALOG=0 → keyword cũ (FR9).
        // Phần tiến trình chạy nền giữ nguyên như cũ (M106 §5 để ngoài phạm vi).
        if (HoiCheDoBatch(ed, pack.Version) is not { } cheDo) return;
        var chuanHoa = cheDo == CheDoBatch.ChuanHoa;
        var bocKl = cheDo == CheDoBatch.BocKL;

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

        if (bocKl)
        {
            XuLyBocTachHangLoat(ed, pack, thuMuc);
            return;
        }

        ed.WriteMessage($"\n[XBoss] ===== BATCH {(chuanHoa ? "CHUẨN HÓA" : "KIỂM TRA")} — rule pack {pack.Version} — {thuMuc} =====\n");
        if (chuanHoa)
            ed.WriteMessage($"[XBoss] Bản gốc GIỮ NGUYÊN — kết quả lưu vào thư mục con \"{BatchProcessor.ThuMucKetQua}\".\n");

        var ketQua = BatchProcessor.Chay(thuMuc, pack, chuanHoa, HomNayIso(),
            ten => ed.WriteMessage($"[XBoss] … {ten}\n"));

        foreach (var t in ketQua.Tep)
            ed.WriteMessage($"[XBoss] {(t.ThanhCong ? "✔" : "✘")} {t.TenTep}: {t.TomTat}\n");
        ed.WriteMessage($"[XBoss] Xong: {ketQua.Tep.Count} tệp — {ketQua.SoThanhCong} thành công, {ketQua.SoLoi} lỗi. Nhật ký: {ketQua.DuongDanNhatKy}\n");
    }

    /// <summary>Chế độ <c>BocKL</c> của XBOSS_BATCH (M101 §6.4): bóc cả thư mục qua side database,
    /// gộp 1 Excel tổng (khuôn <see cref="BatchProcessor"/> — bản gốc giữ nguyên, tệp lỗi bỏ qua).</summary>
    private void XuLyBocTachHangLoat(Editor ed, CadRulePack pack, string thuMuc)
    {
        // Meta đầu trang Excel dùng chung với XBOSS_BOCKL_XUAT — nhớ giữa các lần xuất.
        var luu = ExcelMetaStore.Doc();
        var tenDuAn = HoiChuoi(ed, "Tên dự án", luu.TenDuAn);
        if (tenDuAn is null) return;
        var goiThau = HoiChuoi(ed, "Gói thầu", luu.GoiThau);
        if (goiThau is null) return;
        ExcelMetaStore.Ghi(new ExcelMetaStore.MetaLuu(tenDuAn, goiThau));

        ed.WriteMessage($"\n[XBoss] ===== BATCH BÓC KHỐI LƯỢNG — rule pack {pack.Version} — {thuMuc} =====\n");
        ed.WriteMessage("[XBoss] Bản gốc GIỮ NGUYÊN — chỉ đọc XData đã đánh dấu bóc (XBOSS_BOCKL) trong từng tệp.\n");

        var ketQua = BatchProcessor.ChayBocTach(thuMuc, pack, tenDuAn, goiThau, Environment.UserName, HomNayIso(),
            ten => ed.WriteMessage($"[XBoss] … {ten}\n"));

        foreach (var t in ketQua.Tep)
            ed.WriteMessage($"[XBoss] {(t.ThanhCong ? "✔" : "✘")} {t.TenTep}: {t.TomTat}\n");
        ed.WriteMessage($"[XBoss] Xong: {ketQua.Tep.Count} tệp. Nhật ký: {ketQua.DuongDanNhatKy}\n");
        ed.WriteMessage(ketQua.DuongDanExcel is null
            ? "[XBoss] Không có bản vẽ nào đã đánh dấu bóc trong thư mục — chưa xuất được Excel tổng.\n"
            : $"[XBoss] ✔ Đã xuất Excel tổng ({ketQua.TongDongBoc} dòng): {ketQua.DuongDanExcel}\n");
    }

    // ===== Thu tham số: hộp thoại (mặc định) hoặc dòng lệnh (M106 FR9) =====

    /// <summary>Xác nhận chuẩn hóa — true = thực thi. Hủy ở hộp thoại = dừng lệnh (không hỏi lại).</summary>
    private static bool XacNhanChuanHoa(Editor ed, string rulePackVersion, IReadOnlyList<string> dongXemTruoc)
    {
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new ChuanHoaDialogViewModel(rulePackVersion, dongXemTruoc);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi) return kq is not null;

        var hoi = new PromptKeywordOptions("\n[XBoss] Thực thi chuẩn hóa? Toàn bộ hoàn tác được bằng 1 lần UNDO")
        {
            AllowNone = false,
        };
        hoi.Keywords.Add("DongY", "DongY", "Đồng ý");
        hoi.Keywords.Add("Huy", "Huy", "Hủy");
        hoi.Keywords.Default = "Huy";
        var traLoi = ed.GetKeywords(hoi);
        return traLoi.Status == PromptStatus.OK && traLoi.StringResult == "DongY";
    }

    /// <summary>Phạm vi + chia vùng của <c>XBOSS_BOCKL</c>; null = kỹ sư hủy.</summary>
    private static KetQuaBocKl? HoiThamSoBocKl(Editor ed, string rulePackVersion)
    {
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new BocKlDialogViewModel(rulePackVersion);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi) return kq;

        var hoi = new PromptKeywordOptions("\n[XBoss] Bóc khối lượng phạm vi nào?") { AllowNone = false };
        hoi.Keywords.Add("ToanBo", "ToanBo", "Toàn bộ model space");
        hoi.Keywords.Add("ChonVung", "ChonVung", "Chọn vùng");
        hoi.Keywords.Default = "ToanBo";
        var traLoi = ed.GetKeywords(hoi);
        if (traLoi.Status != PromptStatus.OK) return null;

        // M101 §6.3: tùy chọn bóc theo vùng (tầng/zone) — mặc định KHÔNG, giữ nguyên thói quen M99.
        var hoiVung = new PromptKeywordOptions("\n[XBoss] Bóc theo vùng (tầng/zone)?") { AllowNone = false };
        hoiVung.Keywords.Add("Khong", "Khong", "Không chia vùng");
        hoiVung.Keywords.Add("ChonRanhGioi", "ChonRanhGioi", "Chọn polyline ranh giới rồi đặt tên vùng");
        hoiVung.Keywords.Default = "Khong";
        var traLoiVung = ed.GetKeywords(hoiVung);
        if (traLoiVung.Status != PromptStatus.OK) return null;

        return new KetQuaBocKl(
            traLoi.StringResult == "ChonVung" ? PhamViBoc.ChonVung : PhamViBoc.ToanBo,
            traLoiVung.StringResult == "ChonRanhGioi");
    }

    /// <summary>Phạm vi gỡ dấu bóc của <c>XBOSS_BOCKL_XOA</c>; null = kỹ sư hủy.</summary>
    private static PhamViBoc? HoiPhamViGoDau(Editor ed)
    {
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new BocKlXoaDialogViewModel();
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi) return kq?.PhamVi;

        var hoi = new PromptKeywordOptions("\n[XBoss] Gỡ đánh dấu bóc tách ở phạm vi nào?") { AllowNone = false };
        hoi.Keywords.Add("ToanBo", "ToanBo", "Toàn bộ");
        hoi.Keywords.Add("ChonVung", "ChonVung", "Chọn vùng");
        hoi.Keywords.Default = "ToanBo";
        var traLoi = ed.GetKeywords(hoi);
        if (traLoi.Status != PromptStatus.OK) return null;
        return traLoi.StringResult == "ChonVung" ? PhamViBoc.ChonVung : PhamViBoc.ToanBo;
    }

    /// <summary>Meta đầu trang Excel + có đối chiếu BOQ không; null = kỹ sư hủy.</summary>
    private static KetQuaBocKlXuat? HoiThamSoXuat(Editor ed, ExcelMetaStore.MetaLuu luu)
    {
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var baseUrl = XBossLoginCommand.DocServerUrl();
            var daGhep = baseUrl is not null && CredentialStore.DocToken(baseUrl) is not null;
            var vm = new BocKlXuatDialogViewModel(luu.TenDuAn, luu.GoiThau, daGhep);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi) return kq;

        var tenDuAn = HoiChuoi(ed, "Tên dự án", luu.TenDuAn);
        if (tenDuAn is null) return null;
        var goiThau = HoiChuoi(ed, "Gói thầu", luu.GoiThau);
        if (goiThau is null) return null;

        var hoi = new PromptKeywordOptions(
            "\n[XBoss] Kéo KL BOQ hợp đồng từ máy chủ để dựng sheet \"Doi-chieu\"?")
        { AllowNone = false };
        hoi.Keywords.Add("Khong", "Khong", "Không (chỉ bảng bóc như cũ)");
        hoi.Keywords.Add("Co", "Co", "Có (cần mạng + đã chạy XBOSS_LOGIN)");
        hoi.Keywords.Default = "Khong";
        var traLoi = ed.GetKeywords(hoi);
        if (traLoi.Status != PromptStatus.OK) return null;
        return new KetQuaBocKlXuat(tenDuAn, goiThau, traLoi.StringResult == "Co");
    }

    /// <summary>Chế độ của <c>XBOSS_BATCH</c>; null = kỹ sư hủy.</summary>
    private static CheDoBatch? HoiCheDoBatch(Editor ed, string rulePackVersion)
    {
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new BatchDialogViewModel(rulePackVersion);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi) return kq?.CheDo;

        var hoi = new PromptKeywordOptions("\n[XBoss] Xử lý hàng loạt cả thư mục — chế độ nào?") { AllowNone = false };
        hoi.Keywords.Add("KiemTra", "KiemTra", "Chỉ kiểm (an toàn, không sửa)");
        hoi.Keywords.Add("ChuanHoa", "ChuanHoa", "Chuẩn hóa (bản gốc giữ nguyên, kết quả vào thư mục con)");
        hoi.Keywords.Add("BocKL", "BocKL", "Bóc khối lượng hàng loạt (1 Excel tổng, bản gốc giữ nguyên)");
        hoi.Keywords.Default = "KiemTra";
        var traLoi = ed.GetKeywords(hoi);
        if (traLoi.Status != PromptStatus.OK) return null;
        return traLoi.StringResult switch
        {
            "ChuanHoa" => CheDoBatch.ChuanHoa,
            "BocKL" => CheDoBatch.BocKL,
            _ => CheDoBatch.KiemTra,
        };
    }

    // ===== Trợ giúp hiển thị =====

    /// <summary>Số đối tượng THẬT đã bóc: một tuyến cắt qua nhiều vùng nằm ở nhiều dòng nhưng chỉ
    /// là một đối tượng; dòng dẫn xuất (cách nhiệt) không có đối tượng riêng.</summary>
    private static int SoDoiTuongDaBoc(TakeoffResult kq) =>
        kq.Lines.Where(l => !l.LaDanXuat).SelectMany(l => l.Handles).Distinct(StringComparer.Ordinal).Count();

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

    /// <summary>
    /// Bối cảnh bóc nâng cao (M101 §6.3): vùng đã chọn + nhãn text quanh tuyến. Nhãn CHỈ quét khi
    /// rule pack có item bật <c>sizeFromNearbyText</c> — bản vẽ lớn khỏi tốn thời gian vô ích.
    /// </summary>
    private static TakeoffScanner.BoiCanhBoc BoiCanhBoc(
        Database db, Transaction tr, CadRulePack pack, VungChonService.KetQuaChonVung chonVung)
    {
        var nguongMm = TakeoffZoning.NguongNhanLonNhatMm(pack.Takeoff);
        if (nguongMm <= 0)
            return new TakeoffScanner.BoiCanhBoc(chonVung.Vung, [], 0, chonVung.HandleRanhGioi);
        var (toMm, _, _) = DrawingUnits.TuInsUnits((int)db.Insunits);
        return new TakeoffScanner.BoiCanhBoc(
            chonVung.Vung, TakeoffScanner.QuetNhan(db, tr), nguongMm / toMm, chonVung.HandleRanhGioi);
    }

    // ===== Đối chiếu BOQ (M101 PR4) =====

    /// <summary>
    /// Hỏi có kéo KL BOQ hợp đồng từ máy chủ không, rồi tải về (chỉ ĐỌC). Trả null = không dựng
    /// sheet <c>Doi-chieu</c> — dùng cho cả "kỹ sư chọn Không" lẫn mọi trục trặc mạng/token: lệnh
    /// vẫn xuất Excel bình thường (M101 §6.3 — không mạng thì bỏ qua kèm thông báo, KHÔNG chặn).
    /// <paramref name="duAnId"/> vào là dự án đã chọn lần trước, ra là dự án thực sự dùng (nhớ cho
    /// lần sau).
    /// </summary>
    private static BoqSnapshot? TaiDoiChieuBoq(Editor ed, ref long? duAnId)
    {
        var baseUrl = XBossLoginCommand.DocServerUrl();
        if (baseUrl is null)
        {
            ed.WriteMessage("\n[XBoss] ⚠ Chưa cấu hình server XBoss — bỏ qua sheet đối chiếu (chạy XBOSS_LOGIN nếu cần).\n");
            return null;
        }
        if (CredentialStore.DocToken(baseUrl) is not { } token)
        {
            ed.WriteMessage($"\n[XBoss] ⚠ Máy chưa ghép thiết bị với {baseUrl} — bỏ qua sheet đối chiếu (chạy XBOSS_LOGIN).\n");
            return null;
        }

        var client = new XBossApiClient(baseUrl);
        ed.WriteMessage($"\n[XBoss] Đang lấy KL BOQ hợp đồng từ {baseUrl}…\n");
        try
        {
            try
            {
                return TaiSnapshotBoq(client, token, duAnId);
            }
            catch (XBossCanChonDuAnException e)
            {
                // Người dùng thuộc nhiều dự án: hỏi bằng ĐÚNG lối chung với XBOSS_LOGIN
                // (ChonDuAn — danh sách do MÁY CHỦ cấp, chọn xong nhớ một chỗ duy nhất) để dự án
                // của KL đối chiếu và của rule pack không thể trôi khỏi nhau.
                if (ChonDuAn.Hoi(ed, e.Message, e.DuAn) is not { } chon)
                {
                    ed.WriteMessage("[XBoss] ⚠ Chưa chọn dự án — bỏ qua sheet đối chiếu.\n");
                    return null;
                }
                duAnId = chon;
                return TaiSnapshotBoq(client, token, duAnId);
            }
        }
        catch (XBossApiException e)
        {
            ed.WriteMessage($"[XBoss] ⚠ {e.Message} — bỏ qua sheet đối chiếu, vẫn xuất bảng bóc.\n");
        }
        catch (HttpRequestException e)
        {
            ed.WriteMessage($"[XBoss] ⚠ Không nối được máy chủ ({e.Message}) — bỏ qua sheet đối chiếu.\n");
        }
        catch (TaskCanceledException)
        {
            ed.WriteMessage("[XBoss] ⚠ Máy chủ không trả lời kịp — bỏ qua sheet đối chiếu.\n");
        }
        return null;
    }

    /// <summary>
    /// Gọi API bất đồng bộ từ một lệnh AutoCAD ĐỒNG BỘ. Bọc <c>Task.Run</c> rồi chờ để không
    /// deadlock nếu ngữ cảnh lệnh có SynchronizationContext; giới hạn 20 giây để mạng công trường
    /// chập chờn không treo AutoCAD (HttpClient còn timeout 30s của riêng nó).
    /// </summary>
    private static BoqSnapshot TaiSnapshotBoq(XBossApiClient client, string token, long? duAnId)
    {
        using var huy = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        return Task.Run(() => client.FetchBoqSnapshotAsync(token, duAnId, huy.Token), huy.Token)
            .GetAwaiter().GetResult();
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
