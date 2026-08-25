using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.RulePack;

using ChoChen = XBoss.Cad.Acad.Services.BlockLibraryService.KhoiChoChen;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeGiadoCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_GIADO</c> (M100 §6.7, FR9c, AC12): rải giá đỡ/treo đỡ dọc các tuyến tim đã vẽ bằng
/// <c>XBOSS_VE</c> — cách đều theo <c>supportSpacingMm</c> của loại tuyến (theo size), xoay vuông
/// góc tuyến, đúng layer hệ; đầu/cuối và phụ kiện nặng luôn có.
///
/// Chạy lại trên tuyến đã có giá đỡ chỉ BỔ SUNG đoạn thiếu: mỗi giá đỡ mang XData
/// <c>[vai trò giá đỡ, handle tim]</c>, lệnh quét lại các khối đó rồi quy về khoảng cách dọc tuyến
/// để so với vị trí cần đặt (<see cref="SupportSpacing"/> — Core, có test).
///
/// Cố ý KHÔNG ghi danh sách handle giá đỡ ngược lên tim: kỹ sư được phép dời/xóa từng cái sau khi
/// đặt (§6.7), danh sách trên tim sẽ mục nát ngay; quét block theo handle tim là nguồn duy nhất.
/// </summary>
public sealed class VeGiadoCommands
{
    [CommandMethod("XBOSS_VE_GIADO")]
    public void DatGiaDo()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        if (BlockLibraryService.CanThuVien(ed) is not { } thuVien) return;
        var db = doc.Database;

        var he = VeContext.HoiHe(ed, pack);
        if (he is null) return;

        // (1) Block giá đỡ của hệ (manifest kind = support, id khai trong drawTools.fittings).
        var danhSach = new List<BlockDef>();
        foreach (var id in he.Fittings)
        {
            var def = thuVien.TimTheoId(id);
            if (def is not null && def.KindEnum == BlockKind.Support) danhSach.Add(def);
        }
        if (danhSach.Count == 0)
        {
            ed.WriteMessage(
                $"\n[XBoss] Thư viện {thuVien.Version} chưa có block giá đỡ (kind=support) cho hệ {he.Id} — " +
                "phát hành lại thư viện hoặc khai id giá đỡ vào drawTools.systems[].fittings ở rule pack sau.\n");
            return;
        }
        var def0 = BlockLibraryService.HoiBlock(ed, $"Giá đỡ của hệ {he.Id}", danhSach, null);
        if (def0 is null) return;

        // (2) Cách chia + có đặt giá đỡ tại phụ kiện đã chèn trên tuyến không.
        var cheDo = HoiCheDoChia(ed);
        if (cheDo is null) return;
        var taiPhuKien = HoiTaiPhuKien(ed);
        if (taiPhuKien is null) return;

        // (3) Chọn tuyến (ngoài transaction — ESC là bản vẽ nguyên trạng).
        ed.WriteMessage(
            "\n[XBoss] Chọn các đoạn TIM cần đặt giá đỡ (quét cả hệ cũng được — đối tượng khác tự bỏ qua).\n");
        var chon = ed.GetSelection();
        if (chon.Status != PromptStatus.OK)
        {
            ed.WriteMessage("\n[XBoss] Chưa chọn tuyến nào — bản vẽ không thay đổi.\n");
            return;
        }

        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — khoảng cách giá đỡ " +
                "đã quy đổi theo đơn vị này, chuẩn dự án là mm.\n");
        }

        // (4) Tính vị trí cho từng tuyến (transaction CHỈ ĐỌC).
        var muc = new List<ChoChen>();
        var soTuyen = 0;
        var soDaCo = 0;
        var boQua = 0;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            var khoiTheoTim = KhoiTheoTim(db, tr);
            foreach (var id in chon.Value.GetObjectIds())
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not Polyline pl) continue;
                var xd = VeXDataStore.Doc(pl);
                if (xd is null || xd.VaiTro != VaiTroVe.Tim)
                {
                    boQua++;
                    continue;
                }

                if (!string.Equals(xd.HeId, he.Id, StringComparison.Ordinal))
                {
                    // Block giá đỡ chọn theo hệ ⇒ không đặt nhầm sang tuyến hệ khác trong cùng vùng quét.
                    ed.WriteMessage(
                        $"\n[XBoss] ⚠ Bỏ qua tuyến hệ {xd.HeId} (handle {pl.Handle}) — đang đặt giá đỡ cho hệ " +
                        $"{he.Id}; chạy lại lệnh và chọn hệ {xd.HeId} nếu cần.\n");
                    continue;
                }

                var tuyen = TimLoaiTuyen(pack, xd);
                if (tuyen is null)
                {
                    ed.WriteMessage(
                        $"\n[XBoss] ⚠ Tuyến {xd.ItemId} (handle {pl.Handle}) không còn trong rule pack " +
                        $"{pack.RulePack.Version} — bỏ qua.\n");
                    continue;
                }
                if (tuyen.SupportSpacingMmCho(xd.Size) is not { } spacingMm)
                {
                    ed.WriteMessage(
                        $"\n[XBoss] ⚠ Rule pack chưa khai supportSpacingMm cho {tuyen.ItemId} size \"{xd.Size}\" — " +
                        "bỏ qua tuyến này (plugin KHÔNG tự bịa khoảng cách treo đỡ).\n");
                    continue;
                }

                var dinh = VeThucThe.DinhCua(pl);
                var kin = pl.Closed;
                var handleTim = pl.Handle.ToString();
                khoiTheoTim.TryGetValue(handleTim, out var khoiCu);

                var daCo = QuyVeDoc(dinh, kin, khoiCu, VaiTroVe.GiaDo);
                var phuKien = taiPhuKien.Value ? QuyVeDoc(dinh, kin, khoiCu, VaiTroVe.PhuKien) : [];

                var kq = SupportSpacing.Tinh(
                    dinh, spacingMm / toMm, kin, daCo, phuKien, cheDo.Value);
                foreach (var c in kq.CanhBao)
                    ed.WriteMessage($"\n[XBoss] ⚠ Tuyến {xd.ItemId} {xd.Size} (handle {handleTim}): {c}\n");

                soTuyen++;
                soDaCo += kq.DaCo.Count;
                var tyLe = def0.ScaleBySize && FittingPlacement.TyLeTheoSize(xd.Size, toMm) is { } t ? t : 1.0;
                foreach (var vt in kq.CanDat)
                {
                    muc.Add(new ChoChen(
                        new Point3d(vt.Diem.X, vt.Diem.Y, 0),
                        vt.GocVuongGoc,
                        tyLe,
                        pl.Layer,
                        new VeXDataInfo
                        {
                            VaiTro = VaiTroVe.GiaDo,
                            HeId = xd.HeId,
                            ItemId = xd.ItemId,
                            Size = xd.Size,
                            RulePackVersion = pack.RulePack.Version,
                            BlockId = def0.Id,
                            ThuVienVersion = thuVien.Version,
                            HandleTim = handleTim,
                        },
                        []));
                }

                ed.WriteMessage(
                    $"[XBoss]   {xd.ItemId} {xd.Size} (handle {handleTim}): dài {kq.ChieuDai * toMm:#,##0}mm, " +
                    $"bước {kq.BuocThat * toMm:#,##0}mm → đặt thêm {kq.CanDat.Count}, đã có {kq.DaCo.Count}\n");
            }
            tr.Commit();
        }

        if (boQua > 0)
        {
            ed.WriteMessage(
                $"\n[XBoss] Bỏ qua {boQua} đối tượng không phải tuyến tim của XBOSS_VE " +
                "(giá đỡ chỉ bám tuyến có XData để biết size và khoảng cách chuẩn).\n");
        }
        if (soTuyen == 0)
        {
            ed.WriteMessage("\n[XBoss] Không có tuyến nào đặt được giá đỡ — bản vẽ không thay đổi.\n");
            return;
        }
        if (muc.Count == 0)
        {
            ed.WriteMessage(
                $"\n[XBoss] {soTuyen} tuyến đã đủ giá đỡ ({soDaCo} vị trí) — không thêm cái nào.\n");
            return;
        }

        // (5) Chèn cả lô trong MỘT transaction = MỘT nhóm UNDO.
        if (!BlockLibraryService.ChenHangLoat(doc, ed, db, def0, thuVien, muc)) return;

        ed.WriteMessage(
            $"\n[XBoss] Đã đặt {muc.Count} giá đỡ {def0.Id} ({def0.BlockName}) trên {soTuyen} tuyến " +
            $"({soDaCo} vị trí đã có sẵn, không đặt trùng).\n");
        CanhBaoBocKhoiLuong(ed, pack.RulePack, def0);
        ed.WriteMessage("[XBoss] Hoàn tác cả lệnh: UNDO 1 lần.\n");
    }

    // ===== Hỏi đáp =====

    private static CheDoChiaGiaDo? HoiCheDoChia(Editor ed)
    {
        ed.WriteMessage(
            "\n[XBoss] Cách chia khi chiều dài không chia hết cho khoảng cách chuẩn:\n" +
            "[XBoss]   GANNHAT = chia đều gần khoảng cách chuẩn nhất (ít giá đỡ hơn, bước có thể vượt chuẩn vài %)\n" +
            "[XBoss]   KHONGVUOT = bước luôn ≤ khoảng cách chuẩn (thêm giá đỡ, an toàn tuyệt đối)\n");
        var hoi = new PromptKeywordOptions("\n[XBoss] Chọn cách chia") { AllowNone = false };
        hoi.Keywords.Add("GANNHAT", "GANNHAT", "GANNHAT");
        hoi.Keywords.Add("KHONGVUOT", "KHONGVUOT", "KHONGVUOT");
        hoi.Keywords.Default = "KHONGVUOT";
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return null;
        return kq.StringResult == "KHONGVUOT" ? CheDoChiaGiaDo.KhongVuot : CheDoChiaGiaDo.GanNhat;
    }

    /// <summary>
    /// Rule pack chưa có cách khai "phụ kiện nào là NẶNG" (van, thiết bị) nên plugin không tự
    /// đoán: hỏi một lần mỗi lần chạy — có thì mọi phụ kiện đã chèn trên tuyến đều được một giá đỡ.
    /// </summary>
    private static bool? HoiTaiPhuKien(Editor ed)
    {
        var hoi = new PromptKeywordOptions(
            "\n[XBoss] Đặt thêm giá đỡ tại các phụ kiện đã chèn trên tuyến (van, phụ kiện nặng)?")
        {
            AllowNone = false,
        };
        hoi.Keywords.Add("Co", "Co", "Có");
        hoi.Keywords.Add("Khong", "Khong", "Không");
        hoi.Keywords.Default = "Co";
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return null;
        return kq.StringResult == "Co";
    }

    // ===== Đọc bản vẽ =====

    /// <summary>Loại tuyến trong rule pack ứng với XData của tim (theo hệ + itemId).</summary>
    private static DrawLine? TimLoaiTuyen(DrawToolsPack pack, VeXDataInfo xd) =>
        pack.DrawTools.Systems
            .FirstOrDefault(s => string.Equals(s.Id, xd.HeId, StringComparison.Ordinal))
            ?.Lines.FirstOrDefault(l => string.Equals(l.ItemId, xd.ItemId, StringComparison.Ordinal));

    /// <summary>
    /// Mọi khối do bộ lệnh vẽ chèn, nhóm theo handle của tim mà nó bám vào (giá đỡ, phụ kiện,
    /// lỗ chờ). Quét MỘT lần cho cả lệnh — bản vẽ shop có hàng nghìn khối, quét lại theo từng
    /// tuyến là chậm thấy rõ.
    /// </summary>
    internal static Dictionary<string, List<(VaiTroVe VaiTro, Diem2 Diem)>> KhoiTheoTim(
        Database db, Transaction tr)
    {
        var ra = new Dictionary<string, List<(VaiTroVe, Diem2)>>(StringComparer.OrdinalIgnoreCase);
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not BlockReference br) continue;
            var xd = VeXDataStore.Doc(br);
            if (xd?.HandleTim is not { Length: > 0 } tim) continue;
            if (!ra.TryGetValue(tim, out var ds)) ra[tim] = ds = [];
            ds.Add((xd.VaiTro, new Diem2(br.Position.X, br.Position.Y)));
        }
        return ra;
    }

    /// <summary>Quy các khối một vai trò về khoảng cách dọc tuyến (bỏ khối chiếu hụt).</summary>
    private static List<double> QuyVeDoc(
        IReadOnlyList<DinhPolyline> dinh, bool kin,
        List<(VaiTroVe VaiTro, Diem2 Diem)>? khoi, VaiTroVe vaiTro)
    {
        var ra = new List<double>();
        if (khoi is null) return ra;
        foreach (var (vt, diem) in khoi)
        {
            if (vt != vaiTro) continue;
            if (SupportSpacing.KhoangCachDocCua(dinh, diem, kin) is { } doc) ra.Add(doc);
        }
        return ra;
    }

    /// <summary>
    /// AC12 đòi <c>XBOSS_BOCKL</c> đếm được số giá đỡ. Rule pack phải có item <c>measure=count</c>
    /// khớp tên block giá đỡ — chưa có thì báo NGAY tại chỗ (chèn vẫn xong, nhưng bóc sẽ hụt).
    /// </summary>
    private static void CanhBaoBocKhoiLuong(Editor ed, CadRulePack pack, BlockDef def)
    {
        var item = pack.Takeoff.Items.FirstOrDefault(
            i => i.MeasureKind == TakeoffMeasure.Count &&
                 i.BlockNameMatchAny is { Count: > 0 } &&
                 TokenMatcher.MatchesAny(def.BlockName, i.BlockNameMatchAny));
        if (item is not null)
        {
            ed.WriteMessage($"[XBoss] XBOSS_BOCKL sẽ đếm số giá đỡ vào item \"{item.Id}\".\n");
            return;
        }
        ed.WriteMessage(
            $"[XBoss] ⚠ Rule pack {pack.Version} chưa có item takeoff measure=count khớp block \"{def.BlockName}\" — " +
            "XBOSS_BOCKL sẽ KHÔNG đếm giá đỡ. Bổ sung item ở rule pack version sau (M100 AC12).\n");
    }
}
