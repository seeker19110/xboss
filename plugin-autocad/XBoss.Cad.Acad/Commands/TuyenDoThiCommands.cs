using System.Globalization;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Graph;
using XBoss.Cad.Core.Ui.ViewModels;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.TuyenDoThiCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_TUYEN_DOTHI</c> — dựng đồ thị tuyến–thiết bị từ các tuyến tim đã gán thuộc tính ở
/// <c>XBOSS_TUYEN_GAN</c>, kiểm, rồi cho kỹ sư DUYỆT phụ kiện tại từng nút (M115 §6 bước 3–4, FR2).
///
/// Adapter ở đây chỉ làm 3 việc: (a) ĐỌC bản vẽ thành DTO thuần (<see cref="TuyenDauVao"/>,
/// <see cref="ThietBiDatSan"/>), (b) gọi Core (<see cref="TuyenGraph"/> → <see cref="NutPhanLoai"/>
/// → <see cref="KiemTuyen"/> → <see cref="SuyPhuKien"/>), (c) cất bản chốt vào Named Objects
/// Dictionary. Toàn bộ hình học/luật nằm ở Core và có test trên CI Linux.
///
/// Ranh giới cứng:
/// <list type="bullet">
/// <item><b>Lệnh CHỈ ĐỌC bản vẽ.</b> Không tạo, không sửa, không xóa một thực thể nào — thứ duy
/// nhất được ghi là bản chốt trong NOD (<see cref="TuyenDoThiStore"/>). Guardrail M115 §2a.</item>
/// <item>Còn lỗi CHẶN thì KHÔNG chốt được đồ thị (AC6) — nút "Chốt đồ thị" của hộp thoại tắt, và
/// đường dòng lệnh cũng từ chối, không có cửa sau nào.</item>
/// <item>Một transaction ghi = một nhóm UNDO; mọi hỏi đáp nằm ngoài transaction ghi.</item>
/// </list>
/// </summary>
public sealed class TuyenDoThiCommands
{
    /// <summary>Đối tượng đã đọc, giữ kèm <c>ObjectId</c>/bao hình để zoom từ hộp thoại.</summary>
    private sealed record ThucTheDaDoc(string Handle, BaoHinh? Bao);

    [CommandMethod("XBOSS_TUYEN_DOTHI")]
    public void DungDoThi()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        if (VeContext.CanCompletionPolicy(ed, pack) is not { } cp) return;
        var db = doc.Database;

        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — dung sai gộp nút " +
                "và bán kính chạm thiết bị đã quy đổi theo đơn vị này, chuẩn dự án là mm.\n");
        }

        // ===== (1) Phạm vi quét (ngoài transaction) =====

        var idPhamVi = HoiPhamVi(ed);
        if (idPhamVi is null) return;

        // ===== (2) Đọc bản vẽ thành DTO thuần (transaction CHỈ ĐỌC) =====

        var thuVien = BlockLibraryService.HienHanh().Manifest;
        var tuyen = new List<TuyenDauVao>();
        var thietBi = new List<ThietBiDatSan>();
        var viTri = new Dictionary<string, ThucTheDaDoc>(StringComparer.Ordinal);
        var soBoQuaCaoDo = 0;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            foreach (var id in IdCanQuet(db, tr, idPhamVi))
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
                if (ThuocXref.KhoiChen(tr, ent)) continue;
                var xd = VeXDataStore.Doc(ent);

                if (xd is { VaiTro: VaiTroVe.Tim })
                {
                    var dinh = DinhCua(ent);
                    if (dinh.Count < 2) continue;
                    if (xd.CaoDoMm is null) soBoQuaCaoDo++;
                    var handle = ent.Handle.ToString();
                    tuyen.Add(new TuyenDauVao(
                        handle, dinh,
                        string.IsNullOrWhiteSpace(xd.HeId) ? null : xd.HeId,
                        string.IsNullOrWhiteSpace(xd.Size) ? null : xd.Size,
                        xd.CaoDoMm,
                        xd.KieuNoi));
                    viTri[handle] = new ThucTheDaDoc(handle, RevisionStore.BaoHinhCua(ent));
                    continue;
                }

                if (ent is BlockReference br && DocThietBi(tr, br, xd, thuVien) is { } tb)
                {
                    thietBi.Add(tb);
                    viTri[tb.Id] = new ThucTheDaDoc(tb.Id, RevisionStore.BaoHinhCua(br));
                }
            }
            tr.Commit();
        }

        if (tuyen.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Không tìm thấy tuyến tim nào đã gán thuộc tính trong phạm vi — " +
                "chạy XBOSS_TUYEN_GAN cho các line/pline tuyến tim trước.\n");
            return;
        }
        ed.WriteMessage(
            $"[XBoss] Đọc được {tuyen.Count} tuyến tim và {thietBi.Count} block thiết bị trong phạm vi.\n");
        if (soBoQuaCaoDo > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {soBoQuaCaoDo} tuyến chưa có cao độ — không phân biệt được đoạn lên/xuống " +
                "với chỗ rẽ nhánh tại nút đó (gán lại bằng XBOSS_TUYEN_GAN).\n");
        }

        // ===== (3) Điểm nguồn — gốc của chiều dòng (M115 §6 bước 3) =====

        var kqNguon = ed.GetPoint(new PromptPointOptions(
            "\n[XBoss] Bấm ĐIỂM NGUỒN của cụm tuyến (gốc của chiều dòng — ESC để hủy): "));
        if (kqNguon.Status != PromptStatus.OK) return;
        var pNguon = kqNguon.Value.TransformBy(ed.CurrentUserCoordinateSystem);
        var diemNguon = new Diem2(pNguon.X, pNguon.Y);

        // ===== (4) Dựng đồ thị + kiểm + suy phụ kiện (Core thuần, chưa đụng bản vẽ) =====

        // completionPolicy khai ngưỡng theo mm; Core làm việc theo ĐƠN VỊ BẢN VẼ, nên hệ số quy đổi
        // là "bao nhiêu đơn vị bản vẽ ứng với 1 mm" = 1 / toMm (toMm = mm trên 1 đơn vị bản vẽ).
        var thamSo = ThamSoDoThi.Tu(cp, toMm > 0 ? 1 / toMm : 1);
        var g = TuyenGraph.Dung(tuyen, thietBi, diemNguon, thamSo);
        var phanLoai = NutPhanLoai.PhanLoai(g);
        var kiem = KiemTuyen.Kiem(g, phanLoai);
        var phuKien = SuyPhuKien.Suy(phanLoai, cp)
            .Where(p => p.TrangThai != TrangThaiPhuKien.KhongCan)
            .ToList();

        ed.WriteMessage(
            $"[XBoss] Đồ thị: {g.Nut.Count} nút, {g.Canh.Count} cạnh, {g.ThietBi.Count} kết nối thiết bị · " +
            $"{kiem.Chan.Count} lỗi CHẶN, {kiem.CanhBao.Count} cảnh báo · " +
            $"{phuKien.Count} nút cần duyệt phụ kiện.\n");
        foreach (var l in kiem.TatCa)
            ed.WriteMessage($"[XBoss] {(l.Muc == MucLoiTuyen.Chan ? "CHẶN" : "⚠")} {l.ThongDiep}\n");

        // ===== (5) Duyệt: hộp thoại, rơi về dòng lệnh khi UI hỏng (M106 FR9) =====

        var duyet = Duyet(ed, g, kiem, phuKien, cp, phanLoai, viTri, toMm);
        if (duyet is null) return;

        // ===== (6) Chốt đồ thị vào bản vẽ: MỘT transaction = MỘT nhóm UNDO =====

        var chot = new DoThiChot(
            DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            pack.RulePack.Version,
            diemNguon.X,
            diemNguon.Y,
            g.TuyenGoc.Select(t => new TuyenChot(t.Id, t.HeId, t.Size, t.CaoDoMm, t.KieuNoi)).ToList(),
            phanLoai
                .Select(n => new NutChot(
                    n.Nut, g.Nut[n.Nut].ViTri.X, g.Nut[n.Nut].ViTri.Y, n.Loai, n.SoNhanh,
                    n.GocDoiHuongDeg, n.HeId, n.Size))
                .ToList(),
            g.Canh.Select(c => new CanhChot(c.ChiSo, c.Tu, c.Den, c.TuyenId, c.ChieuDai)).ToList(),
            g.ThietBi.Select(t => new ThietBiChot(t.Nut, t.ThietBiId, t.HeId, t.Tag)).ToList(),
            duyet.PhuKien);

        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                TuyenDoThiStore.Ghi(db, tr, chot);
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi chốt đồ thị — đã rollback, bản vẽ nguyên trạng: {e.Message}\n");
                return;
            }
        }

        var soChen = duyet.PhuKien.Count(p => !p.BoQua);
        var soSuaTay = duyet.PhuKien.Count(p => p.SuaTay);
        ed.WriteMessage(
            $"\n[XBoss] Đã chốt đồ thị vào bản vẽ ({chot.Nut.Count} nút, {chot.Canh.Count} cạnh; " +
            $"{soChen}/{duyet.PhuKien.Count} nút sẽ chèn phụ kiện" +
            $"{(soSuaTay > 0 ? $", {soSuaTay} nút kỹ sư đã sửa tay" : "")}).\n");
        ed.WriteMessage(
            "[XBoss] Bản chốt sống trong chính tệp DWG — mở lại bản vẽ vẫn còn. Bước tiếp theo: " +
            "XBOSS_HOANTHIEN · Hoàn tác cả lệnh: UNDO 1 lần.\n");
    }

    // ===== Duyệt: hộp thoại (mặc định) hoặc dòng lệnh (M106 FR9) =====

    /// <summary>
    /// Cho kỹ sư duyệt danh sách nút/phụ kiện. Trả null khi kỹ sư hủy HOẶC khi còn lỗi chặn —
    /// hai đường (hộp thoại / dòng lệnh) dùng CHUNG một luật chốt: <c>KetQuaKiemTuyen.Dat</c>.
    /// Đường dòng lệnh không sửa được từng nút (không có bảng để bấm), chỉ xác nhận nguyên trạng —
    /// muốn sửa tay thì bật lại hộp thoại.
    /// </summary>
    private static KetQuaTuyenDoThi? Duyet(
        Editor ed,
        TuyenGraph g,
        KetQuaKiemTuyen kiem,
        IReadOnlyList<PhuKienTaiNut> phuKien,
        CompletionPolicySection cp,
        IReadOnlyList<PhanLoaiNut> phanLoai,
        IReadOnlyDictionary<string, ThucTheDaDoc> viTri,
        double toMm)
    {
        var viTriNut = phanLoai.ToDictionary(n => n.Nut, n => g.Nut[n.Nut].ViTri);
        var heCuaNut = phanLoai.ToDictionary(n => n.Nut, n => n.HeId);
        var cuaSoZoom = Math.Max(cp.EquipmentSnapMm * (toMm > 0 ? 1 / toMm : 1), 1e-6) * 20;

        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new TuyenDoThiDialogViewModel(kiem, phuKien, cp, viTriNut, heCuaNut)
            {
                ZoomToiLoi = muc => ZoomToiLoi(ed, muc.Loi, viTri, cuaSoZoom),
                ZoomToiNut = muc => ZoomView.ToiDiem(ed, muc.ViTri.X, muc.ViTri.Y, cuaSoZoom),
            };
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi)
        {
            if (kq is null)
            {
                ed.WriteMessage(
                    kiem.Dat
                        ? "\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n"
                        : "\n[XBoss] Còn lỗi CHẶN nên không chốt được đồ thị — sửa bản vẽ rồi chạy lại " +
                          "XBOSS_TUYEN_DOTHI (AC6).\n");
            }
            return kq;
        }
        return DuyetDongLenh(ed, kiem, phuKien, cp, heCuaNut);
    }

    /// <summary>Đường dòng lệnh: liệt kê rồi hỏi CÓ/KHÔNG chốt, giữ nguyên phụ kiện plugin suy ra.</summary>
    private static KetQuaTuyenDoThi? DuyetDongLenh(
        Editor ed,
        KetQuaKiemTuyen kiem,
        IReadOnlyList<PhuKienTaiNut> phuKien,
        CompletionPolicySection cp,
        IReadOnlyDictionary<int, string?> heCuaNut)
    {
        if (!kiem.Dat)
        {
            ed.WriteMessage(
                $"\n[XBoss] Còn {kiem.Chan.Count} lỗi CHẶN — không chốt được đồ thị. Sửa bản vẽ rồi " +
                "chạy lại lệnh (AC6).\n");
            return null;
        }

        ed.WriteMessage("\n[XBoss] Phụ kiện suy ra tại nút:\n");
        foreach (var p in phuKien)
        {
            ed.WriteMessage(
                $"[XBoss]   Nút {p.Nut.ToString(CultureInfo.InvariantCulture)} · " +
                $"{MucNutPhuKien.NhanLoaiNut(p.LoaiNut)} · {p.LyDo}\n");
        }
        ed.WriteMessage(
            "[XBoss] Đường dòng lệnh không sửa được từng nút — bật lại hộp thoại (XBOSS_UI_DIALOG=1) " +
            "nếu cần đổi phụ kiện hoặc bỏ qua nút.\n");

        var opt = new PromptKeywordOptions("\n[XBoss] Chốt đồ thị theo đúng đề xuất trên? ");
        opt.Keywords.Add("Co", "Co", "Co");
        opt.Keywords.Add("Khong", "Khong", "Khong");
        opt.Keywords.Default = "Co";
        var kq = ed.GetKeywords(opt);
        if (kq.Status != PromptStatus.OK || kq.StringResult != "Co")
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return null;
        }

        // Dùng CHÍNH ViewModel để dựng bản chốt: một luật duy nhất chuyển "suy ra" → "đã duyệt",
        // hai đường không thể ghi ra hai thứ khác nhau.
        var vm = new TuyenDoThiDialogViewModel(
            kiem, phuKien, cp,
            phuKien.ToDictionary(p => p.Nut, _ => new Diem2(0, 0)),
            heCuaNut);
        return vm.KetQua();
    }

    // ===== Đọc bản vẽ =====

    /// <summary>
    /// Phạm vi quét (M115 §6 bước 3): null = kỹ sư ESC; danh sách rỗng = CẢ BẢN VẼ (quét model
    /// space trong transaction đọc — bắt được cả đối tượng trên layer đang tắt/đóng băng, thứ mà
    /// một vùng chọn bằng chuột bỏ sót).
    /// </summary>
    private static IReadOnlyList<ObjectId>? HoiPhamVi(Editor ed)
    {
        var opt = new PromptKeywordOptions("\n[XBoss] Phạm vi dựng đồ thị ");
        opt.Keywords.Add("CaBanVe", "CaBanVe", "CaBanVe");
        opt.Keywords.Add("VungChon", "VungChon", "VungChon");
        opt.Keywords.Default = "CaBanVe";
        var kq = ed.GetKeywords(opt);
        if (kq.Status != PromptStatus.OK) return null;
        if (kq.StringResult != "VungChon") return [];

        ed.WriteMessage("\n[XBoss] Chọn vùng chứa tuyến tim + block thiết bị cần dựng đồ thị.\n");
        var chon = ed.GetSelection();
        if (chon.Status != PromptStatus.OK)
        {
            ed.WriteMessage("\n[XBoss] Chưa chọn gì — bản vẽ không thay đổi.\n");
            return null;
        }
        return chon.Value.GetObjectIds().ToList();
    }

    /// <summary>ObjectId cần quét: đúng vùng chọn, hoặc toàn bộ model space khi phạm vi rỗng.</summary>
    private static IEnumerable<ObjectId> IdCanQuet(
        Database db, Transaction tr, IReadOnlyList<ObjectId> phamVi)
    {
        if (phamVi.Count > 0) return phamVi;
        var ms = (BlockTableRecord)tr.GetObject(
            SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        return ms.Cast<ObjectId>().ToList();
    }

    /// <summary>
    /// Chuỗi đỉnh của một tuyến tim theo ĐƠN VỊ BẢN VẼ. Polyline lấy đúng từng đỉnh (không nắn,
    /// không lấy mẫu cung — Core làm việc trên đoạn thẳng, cung được xấp xỉ bằng dây cung của
    /// chính hai đỉnh gốc); Line lấy 2 đầu mút.
    /// </summary>
    private static List<Diem2> DinhCua(Entity ent) => ent switch
    {
        Polyline pl => VeThucThe.DinhCua(pl).Select(d => new Diem2(d.X, d.Y)).ToList(),
        Line line => [new Diem2(line.StartPoint.X, line.StartPoint.Y), new Diem2(line.EndPoint.X, line.EndPoint.Y)],
        _ => [],
    };

    /// <summary>
    /// Một block chèn thành <see cref="ThietBiDatSan"/>; null = block không tra được trong thư viện
    /// (không đoán bừa: block lạ không phải thiết bị của hệ nào).
    ///
    /// Hệ ưu tiên lấy từ XData của chính khối (khối do <c>XBOSS_VE_THIETBI</c> đặt biết hệ của nó),
    /// sau đó mới tới <c>system</c> khai trong manifest thư viện (M108/M113).
    /// </summary>
    private static ThietBiDatSan? DocThietBi(
        Transaction tr, BlockReference br, VeXDataInfo? xd, BlockManifest? thuVien)
    {
        BlockDef? def = null;
        if (thuVien is not null)
        {
            if (xd?.BlockId is { Length: > 0 } blockId) def = thuVien.TimTheoId(blockId);
            if (def is null && tr.GetObject(br.DynamicBlockTableRecord, OpenMode.ForRead) is BlockTableRecord btr)
            {
                def = thuVien.Blocks.FirstOrDefault(b =>
                    string.Equals(b.BlockName, btr.Name, StringComparison.OrdinalIgnoreCase));
            }
        }
        if (def is null) return null;

        var tag = VeXDataStore.TagCua(tr, br)?.TextString;
        return new ThietBiDatSan(
            br.Handle.ToString(),
            new Diem2(br.Position.X, br.Position.Y),
            def.Kind,
            string.IsNullOrWhiteSpace(xd?.HeId) ? def.System : xd!.HeId,
            string.IsNullOrWhiteSpace(tag) ? null : tag);
    }

    /// <summary>Zoom tới đối tượng/vị trí của một dòng lỗi (M115 §6 — lỗi bấm-tới-đối-tượng).</summary>
    private static void ZoomToiLoi(
        Editor ed, LoiTuyen loi, IReadOnlyDictionary<string, ThucTheDaDoc> viTri, double cuaSo)
    {
        // Ưu tiên bao hình của đúng đối tượng (tuyến/thiết bị), rồi mới tới tọa độ nút.
        foreach (var khoa in new[] { loi.ThietBiId, loi.TuyenId })
        {
            if (khoa is { Length: > 0 } k && viTri.TryGetValue(k, out var dt) && dt.Bao is { } bao)
            {
                ZoomView.ToiBao(ed, bao, Math.Max(bao.Rong, bao.Cao) * 0.2);
                return;
            }
        }
        if (loi.ViTri is { } p) ZoomView.ToiDiem(ed, p.X, p.Y, cuaSo);
    }
}
