using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Ui.ViewModels;

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

        // (1)+(2) Hệ + block giá đỡ + cách chia + (chỉ rule pack v4–v6) giá đỡ tại mọi phụ kiện:
        //         MỘT hộp thoại (M106 §7.2), rơi về nguyên chuỗi hỏi đáp cũ khi UI hỏng (FR9).
        //         Rule pack từ v7 khai thẳng danh sách phụ kiện NẶNG (drawTools.heavyFittingIds) nên
        //         không phải hỏi nữa, và chỉ van/damper mới được một giá đỡ riêng — hỏi kiểu cũ thì
        //         trả lời "Có" là đặt cả ở co/tê nhẹ, sai chuẩn treo đỡ.
        if (HoiThamSo(ed, pack, thuVien) is not { } ts) return;
        var (he, def0, cheDo, taiMoiPhuKien) = (ts.He, ts.Block, ts.CheDo, ts.TaiMoiPhuKien);
        if (pack.DrawTools.CoKhaiPhuKienNang)
        {
            ed.WriteMessage(
                $"\n[XBoss] Phụ kiện NẶNG theo rule pack {pack.RulePack.Version} (luôn có giá đỡ tại chỗ): " +
                $"{string.Join(", ", pack.DrawTools.HeavyFittingIds)}.\n");
        }

        // (3) Chọn tuyến (ngoài transaction — ESC là bản vẽ nguyên trạng).
        ed.WriteMessage(
            "\n[XBoss] Chọn các đoạn TIM cần đặt giá đỡ (quét cả hệ cũng được — đối tượng khác tự bỏ qua).\n");
        var chon = ed.GetSelection();
        if (chon.Status != PromptStatus.OK)
        {
            ed.WriteMessage("\n[XBoss] Chưa chọn tuyến nào — bản vẽ không thay đổi.\n");
            return;
        }

        ChayGiaDo(doc, ed, pack, thuVien, he, def0, cheDo, taiMoiPhuKien, chon.Value.GetObjectIds());
    }

    /// <summary>
    /// Thân thật của <c>XBOSS_VE_GIADO</c> — tính vị trí giá đỡ trên các tim đã chọn rồi chèn cả lô.
    /// Tách nguyên vẹn khỏi <see cref="DatGiaDo"/> để <c>XBOSS_HOANTHIEN</c> (M115 giai đoạn ④) gọi
    /// lại đúng logic này; mọi hỏi đáp vẫn nằm ở lệnh gốc nên hành vi lệnh gốc không đổi.
    /// </summary>
    internal static void ChayGiaDo(
        Autodesk.AutoCAD.ApplicationServices.Document doc, Editor ed, DrawToolsPack pack,
        BlockManifest thuVien, DrawSystem he, BlockDef def0, CheDoChiaGiaDo cheDo, bool taiMoiPhuKien,
        IReadOnlyList<ObjectId> idTim, string? giaiDoanM115 = null)
    {
        var db = doc.Database;
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
            var khoiTheoTim = VeThucThe.KhoiTheoTim(db, tr);
            foreach (var id in idTim)
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

                var daCo = QuyVeDoc(dinh, kin, khoiCu, k => k.VaiTro == VaiTroVe.GiaDo);
                var phuKien = QuyVeDoc(
                    dinh, kin, khoiCu,
                    k => k.VaiTro == VaiTroVe.PhuKien &&
                         (taiMoiPhuKien || pack.DrawTools.LaPhuKienNang(k.BlockId)));

                var kq = SupportSpacing.Tinh(
                    dinh, spacingMm / toMm, kin, daCo, phuKien, cheDo);
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
                            NguonHoanThien = giaiDoanM115 is null ? null : HoanThienKeHoach.NguonM115,
                            GiaiDoanHoanThien = giaiDoanM115,
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
        BlockLibraryService.BaoItemDem(ed, pack.RulePack, def0, "giá đỡ");
        ed.WriteMessage("[XBoss] Hoàn tác cả lệnh: UNDO 1 lần.\n");
    }

    // ===== Hỏi đáp =====

    /// <summary>
    /// Hệ + block giá đỡ + cách chia + (rule pack cũ) giá đỡ tại mọi phụ kiện. Danh mục block của
    /// MỌI hệ tra sẵn ở đây rồi mới mở hộp thoại — hộp thoại không chạm tệp thư viện (M106 §2).
    /// Null = kỹ sư hủy hoặc không hệ nào có block giá đỡ.
    /// </summary>
    private static KetQuaHoiGiaDo? HoiThamSo(Editor ed, DrawToolsPack pack, BlockManifest thuVien)
    {
        var cacHe = new List<HeCoBlock>();
        foreach (var sys in pack.DrawTools.Systems)
        {
            var dung = sys.Fittings
                .Select(thuVien.TimTheoId)
                .Where(d => d is not null && d.KindEnum == BlockKind.Support)
                .Select(d => d!)
                .ToList();
            if (dung.Count > 0) cacHe.Add(new HeCoBlock(sys, dung, []));
        }

        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new GiaDoDialogViewModel(
                thuVien.Version, pack.RulePack.Version, cacHe,
                pack.DrawTools.CoKhaiPhuKienNang, pack.DrawTools.HeavyFittingIds, VeContext.He?.Id);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi)
        {
            if (kq is not null) VeContext.He = kq.He; // ghi nhớ hệ của phiên (FR4)
            return kq;
        }

        // ----- Đường hỏi đáp dòng lệnh cũ (FR9) -----
        var he = VeContext.HoiHe(ed, pack);
        if (he is null) return null;
        var muc = cacHe.FirstOrDefault(h => string.Equals(h.He.Id, he.Id, StringComparison.Ordinal));
        if (muc is null)
        {
            ed.WriteMessage(
                $"\n[XBoss] Thư viện {thuVien.Version} chưa có block giá đỡ (kind=support) cho hệ {he.Id} — " +
                "phát hành lại thư viện hoặc khai id giá đỡ vào drawTools.systems[].fittings ở rule pack sau.\n");
            return null;
        }
        var def0 = BlockLibraryService.HoiBlock(ed, $"Giá đỡ của hệ {he.Id}", muc.Blocks, null);
        if (def0 is null) return null;

        var cheDo = HoiCheDoChia(ed);
        if (cheDo is null) return null;

        var taiMoiPhuKien = false;
        if (!pack.DrawTools.CoKhaiPhuKienNang)
        {
            var hoiTaiPhuKien = HoiTaiPhuKien(ed, pack.RulePack.Version);
            if (hoiTaiPhuKien is null) return null;
            taiMoiPhuKien = hoiTaiPhuKien.Value;
        }
        return new KetQuaHoiGiaDo(he, def0, cheDo.Value, taiMoiPhuKien);
    }

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
    /// Đường DỰ PHÒNG cho rule pack cũ (v4–v6) chưa khai <c>drawTools.heavyFittingIds</c>: plugin
    /// không tự đoán phụ kiện nào nặng nên hỏi kỹ sư — trả lời Có thì MỌI phụ kiện trên tuyến đều
    /// được một giá đỡ. Nâng rule pack lên v7 là hết phải hỏi (và chỉ van/damper mới có giá đỡ riêng).
    /// </summary>
    private static bool? HoiTaiPhuKien(Editor ed, string rulePackVersion)
    {
        ed.WriteMessage(
            $"\n[XBoss] Rule pack {rulePackVersion} chưa khai drawTools.heavyFittingIds (có từ v7) nên " +
            "plugin không biết phụ kiện nào là NẶNG — hỏi kỹ sư một lần cho cả lệnh.\n");
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

    /// <summary>Quy các khối thỏa <paramref name="loc"/> về khoảng cách dọc tuyến (bỏ khối chiếu hụt).</summary>
    private static List<double> QuyVeDoc(
        IReadOnlyList<DinhPolyline> dinh, bool kin,
        List<VeThucThe.KhoiBamTim>? khoi, Func<VeThucThe.KhoiBamTim, bool> loc)
    {
        var ra = new List<double>();
        if (khoi is null) return ra;
        foreach (var k in khoi)
        {
            if (!loc(k)) continue;
            if (SupportSpacing.KhoangCachDocCua(dinh, k.Diem, kin) is { } doc) ra.Add(doc);
        }
        return ra;
    }

}
