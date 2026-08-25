using System.Text;
using Autodesk.AutoCAD.DatabaseServices;
using XBoss.Cad.Core.Excel;
using XBoss.Cad.Core.Inspection;
using XBoss.Cad.Core.Reporting;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Takeoff;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Xử lý hàng loạt cho XBOSS_BATCH (M99 §6 journey 7): duyệt tuần tự mọi tệp .dwg
/// trong một thư mục qua SIDE DATABASE (không mở lên editor), tệp lỗi thì bỏ qua và
/// ghi nhật ký, báo tổng kết cuối. Chế độ chuẩn hóa KHÔNG ghi đè bản gốc — kết quả
/// lưu vào thư mục con <see cref="ThuMucKetQua"/> (guardrail M99 §2: luôn giữ bản gốc).
/// </summary>
internal static class BatchProcessor
{
    internal const string ThuMucKetQua = "da-chuan-hoa";
    internal const string TenNhatKy = "xboss-batch-log.txt";

    internal sealed record KetQuaTep(string TenTep, bool ThanhCong, string TomTat);

    internal sealed record KetQuaBatch(IReadOnlyList<KetQuaTep> Tep, string DuongDanNhatKy)
    {
        public int SoThanhCong => Tep.Count(t => t.ThanhCong);
        public int SoLoi => Tep.Count(t => !t.ThanhCong);
    }

    /// <summary>Kết quả chế độ BocKL (M101 §6.4): 1 Excel tổng — null khi không tệp nào có đối
    /// tượng đã đánh dấu bóc (không phải lỗi, chỉ là chưa có gì để xuất).</summary>
    internal sealed record KetQuaBocTachBatch(
        IReadOnlyList<KetQuaTep> Tep, string? DuongDanExcel, string DuongDanNhatKy, int TongDongBoc);

    /// <summary>Chạy cả thư mục. <paramref name="chuanHoa"/> false = chỉ kiểm (mặc định an toàn).</summary>
    internal static KetQuaBatch Chay(string thuMuc, CadRulePack pack, bool chuanHoa, string ngayIso,
        Action<string>? tienDo = null)
    {
        var ketQua = new List<KetQuaTep>();
        var tepDwg = Directory.GetFiles(thuMuc, "*.dwg", SearchOption.TopDirectoryOnly)
            .OrderBy(t => t, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var thuMucRa = Path.Combine(thuMuc, ThuMucKetQua);
        if (chuanHoa) Directory.CreateDirectory(thuMucRa);

        foreach (var tep in tepDwg)
        {
            var ten = Path.GetFileName(tep);
            tienDo?.Invoke(ten);
            try
            {
                ketQua.Add(chuanHoa
                    ? ChuanHoaMotTep(tep, Path.Combine(thuMucRa, ten), pack, ngayIso)
                    : KiemTraMotTep(tep, pack, ngayIso));
            }
            catch (System.Exception e) when (
                e is IOException or UnauthorizedAccessException
                    or Autodesk.AutoCAD.Runtime.Exception or InvalidOperationException)
            {
                // Tệp hỏng/đang bị khóa (đang mở trong AutoCAD?) — bỏ qua, xử lý tiếp tệp sau (journey 7).
                ketQua.Add(new KetQuaTep(ten, false, $"LỖI — bỏ qua: {e.Message}"));
            }
        }

        var duongDanNhatKy = Path.Combine(thuMuc, TenNhatKy);
        GhiNhatKy(duongDanNhatKy, ketQua, chuanHoa, ngayIso, pack.Version);
        return new KetQuaBatch(ketQua, duongDanNhatKy);
    }

    /// <summary>
    /// Chế độ BocKL (M101 §6.4): duyệt cả thư mục qua side database, dựng lại kết quả bóc từ
    /// XData ĐÃ ĐÁNH DẤU (XBOSS_BOCKL) trong từng tệp — đúng đường đọc duy nhất của
    /// XBOSS_BOCKL_XUAT (FR16), gộp thành 1 Excel tổng nhiều bản vẽ (cột "Tệp"). Bản gốc GIỮ
    /// NGUYÊN (chỉ đọc — không mở transaction ghi nào). Tệp lỗi/chưa bóc gì thì bỏ qua + ghi
    /// nhật ký, không chặn các tệp còn lại (bám khuôn <see cref="Chay"/>).
    /// </summary>
    internal static KetQuaBocTachBatch ChayBocTach(
        string thuMuc, CadRulePack pack, string tenDuAn, string goiThau, string nguoiBoc, string ngayIso,
        Action<string>? tienDo = null)
    {
        var ketQuaTep = new List<KetQuaTep>();
        var banVe = new List<BoqExcelWriter.BatchTakeoffEntry>();
        var tepDwg = Directory.GetFiles(thuMuc, "*.dwg", SearchOption.TopDirectoryOnly)
            .OrderBy(t => t, StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var tep in tepDwg)
        {
            var ten = Path.GetFileName(tep);
            tienDo?.Invoke(ten);
            try
            {
                using var db = MoSideDatabase(tep);
                using var _ = new DoiWorkingDatabase(db);
                TakeoffResult? ketQua;
                using (var tr = db.TransactionManager.StartTransaction())
                {
                    ketQua = BocMotTep(db, tr, pack);
                    tr.Commit(); // chỉ đọc — không có thay đổi nào để ghi, bản gốc giữ nguyên
                }
                if (ketQua is null || ketQua.Lines.Count == 0)
                {
                    ketQuaTep.Add(new KetQuaTep(ten, true, "chưa có đối tượng nào được đánh dấu bóc (bỏ qua) — chạy XBOSS_BOCKL trước"));
                    continue;
                }
                banVe.Add(new BoqExcelWriter.BatchTakeoffEntry(ten, ketQua));
                var soDoiTuong = ketQua.Lines.Where(l => !l.LaDanXuat)
                    .SelectMany(l => l.Handles).Distinct(StringComparer.Ordinal).Count();
                ketQuaTep.Add(new KetQuaTep(ten, true, $"đã bóc {ketQua.Lines.Count} dòng ({soDoiTuong} đối tượng)"));
            }
            catch (System.Exception e) when (
                e is IOException or UnauthorizedAccessException
                    or Autodesk.AutoCAD.Runtime.Exception or InvalidOperationException)
            {
                // Tệp hỏng/đang bị khóa (đang mở trong AutoCAD?) — bỏ qua, xử lý tiếp tệp sau (journey 7).
                ketQuaTep.Add(new KetQuaTep(ten, false, $"LỖI — bỏ qua: {e.Message}"));
            }
        }

        string? duongDanExcel = null;
        var tongDong = banVe.Sum(b => b.KetQua.Lines.Count);
        if (banVe.Count > 0)
        {
            var duCheck = Path.Combine(thuMuc, $"xboss-boc-khoi-luong-hang-loat-{ngayIso}.xlsx");
            try
            {
                var meta = new BoqExcelMeta
                {
                    TenDuAn = tenDuAn,
                    GoiThau = goiThau,
                    TenBanVe = $"Hàng loạt — {banVe.Count} bản vẽ",
                    RulePackVersion = pack.Version,
                    NguoiBoc = nguoiBoc,
                    NgayIso = ngayIso,
                };
                using var f = File.Create(duCheck);
                BoqExcelWriter.WriteBatch(banVe, meta, f);
                duongDanExcel = duCheck;
            }
            catch (IOException)
            {
                duongDanExcel = null; // ghi Excel thất bại — nhật ký từng tệp vẫn có, không chặn cả lô
            }
        }

        var duongDanNhatKy = Path.Combine(thuMuc, TenNhatKy);
        GhiNhatKyBocTach(duongDanNhatKy, ketQuaTep, ngayIso, pack.Version, duongDanExcel);
        return new KetQuaBocTachBatch(ketQuaTep, duongDanExcel, duongDanNhatKy, tongDong);
    }

    /// <summary>Dựng lại kết quả bóc của 1 tệp từ XData đang sống trong side database — cùng logic
    /// đọc với XBOSS_BOCKL_XUAT (FR16); null khi tệp chưa có đối tượng nào được đánh dấu.</summary>
    private static TakeoffResult? BocMotTep(Database db, Transaction tr, CadRulePack pack)
    {
        var daGan = new List<(MeasuredObject DoiTuong, string ItemId)>();
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
                daGan.Add((obj with { Vung = mark.Vung }, mark.ItemId));
        }
        if (daGan.Count == 0) return null;
        var may = new TakeoffCalculator(pack.Takeoff, pack.Version);
        return may.ComputeAssigned(daGan, (int)db.Insunits);
    }

    private static void GhiNhatKyBocTach(
        string duongDan, IReadOnlyList<KetQuaTep> ketQua, string ngayIso, string rulePackVersion, string? duongDanExcel)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"=== XBoss batch BÓC KHỐI LƯỢNG — {ngayIso} — rule pack {rulePackVersion} ===");
        foreach (var t in ketQua) sb.AppendLine($"{(t.ThanhCong ? "OK " : "ERR")} {t.TenTep}: {t.TomTat}");
        sb.AppendLine($"Tổng: {ketQua.Count} tệp — {ketQua.Count(t => t.ThanhCong)} thành công, {ketQua.Count(t => !t.ThanhCong)} lỗi.");
        sb.AppendLine(duongDanExcel is null
            ? "Không có bản vẽ nào có đối tượng đã đánh dấu bóc — chưa xuất Excel tổng."
            : $"Excel tổng: {duongDanExcel}");
        File.AppendAllText(duongDan, sb.ToString());
    }

    private static KetQuaTep KiemTraMotTep(string tep, CadRulePack pack, string ngayIso)
    {
        using var db = MoSideDatabase(tep);
        using var _ = new DoiWorkingDatabase(db);
        InspectionReport baoCao;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            baoCao = new Inspector(pack).Run(DrawingSnapshotBuilder.Build(db, tr));
            tr.Commit(); // chỉ đọc — không có thay đổi nào để ghi
        }
        var ten = Path.GetFileName(tep);
        File.WriteAllText(tep + ".xboss-kiemtra.json", baoCao.DongDau(ten, ngayIso).ToJson());
        return new KetQuaTep(ten, true,
            baoCao.Findings.Count == 0
                ? "✔ đạt chuẩn"
                : string.Join("; ", baoCao.Findings.Select(f => $"{f.Ten}: {Math.Max(f.Handles.Count, f.ChiTiet.Count)}")));
    }

    private static KetQuaTep ChuanHoaMotTep(string tepVao, string tepRa, CadRulePack pack, string ngayIso)
    {
        using var db = MoSideDatabase(tepVao);
        using var _ = new DoiWorkingDatabase(db);
        var pipeline = new StandardizePipeline(pack);
        pipeline.Buoc1Audit(null); // side database: không có dòng lệnh → ghi cảnh báo, không AUDIT
        using (var tr = db.TransactionManager.StartTransaction())
        {
            pipeline.Run(db, tr);
            tr.Commit();
        }
        // Side database không có tài liệu mở → bỏ qua bind xref/dọn layout kèm cảnh báo trong báo cáo.
        pipeline.ApDungCapTaiLieu(db, coTaiLieu: false);
        db.SaveAs(tepRa, DwgVersion.Current);
        var ten = Path.GetFileName(tepVao);
        var baoCao = new StandardizeReport
        {
            RulePackVersion = pack.Version,
            TenBanVe = ten,
            NgayIso = ngayIso,
            CheDo = "chuan-hoa",
            Steps = pipeline.Steps,
            CanhBao = pipeline.CanhBao,
        };
        File.WriteAllText(tepRa + ".xboss-report.json", baoCao.ToJson());
        return new KetQuaTep(ten, true,
            pipeline.Steps.Count == 0
                ? "✔ đã đạt chuẩn — chép nguyên trạng"
                : $"đã sửa {pipeline.Steps.Sum(s => s.SoLuong)} hạng mục ({pipeline.Steps.Count} bước có thay đổi)");
    }

    /// <summary>Trỏ HostApplicationServices.WorkingDatabase vào side db trong lúc xử lý
    /// (Audit/Purge đòi hỏi) rồi trả lại nguyên trạng — kể cả khi có exception.</summary>
    private sealed class DoiWorkingDatabase : IDisposable
    {
        private readonly Database _truoc;

        internal DoiWorkingDatabase(Database moi)
        {
            _truoc = HostApplicationServices.WorkingDatabase;
            HostApplicationServices.WorkingDatabase = moi;
        }

        public void Dispose() => HostApplicationServices.WorkingDatabase = _truoc;
    }

    /// <summary>Mở tệp DWG vào side database (không hiện lên editor).</summary>
    private static Database MoSideDatabase(string tep)
    {
        var db = new Database(buildDefaultDrawing: false, noDocument: true);
        db.ReadDwgFile(tep, FileOpenMode.OpenForReadAndAllShare, allowCPConversion: true, password: null);
        db.CloseInput(true);
        return db;
    }

    private static void GhiNhatKy(string duongDan, IReadOnlyList<KetQuaTep> ketQua, bool chuanHoa,
        string ngayIso, string rulePackVersion)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"=== XBoss batch {(chuanHoa ? "CHUẨN HÓA" : "KIỂM TRA")} — {ngayIso} — rule pack {rulePackVersion} ===");
        foreach (var t in ketQua) sb.AppendLine($"{(t.ThanhCong ? "OK " : "ERR")} {t.TenTep}: {t.TomTat}");
        sb.AppendLine($"Tổng: {ketQua.Count} tệp — {ketQua.Count(t => t.ThanhCong)} thành công, {ketQua.Count(t => !t.ThanhCong)} lỗi.");
        File.AppendAllText(duongDan, sb.ToString());
    }
}
