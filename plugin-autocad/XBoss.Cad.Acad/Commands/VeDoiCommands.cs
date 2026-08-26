using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Ui.ViewModels;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeDoiCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_DOI</c> — đổi hệ/loại tuyến/size của các đoạn tim ĐÃ VẼ (M100 §6.2, FR8, AC6).
///
/// Một lần chạy làm trọn bộ cho mỗi tuyến chọn: đổi layer → cập nhật XData → <b>xóa và dựng lại
/// nét biên</b> theo bề rộng mới (<see cref="EdgeOffset"/> của Core) → cập nhật nhãn liên kết →
/// gỡ đánh dấu bóc khối lượng của đúng các đoạn đó kèm cảnh báo "đổi xong phải bóc lại".
///
/// Vì sao phải gỡ đánh dấu: XData <c>XBOSS_BOCKL</c> trên tuyến nói "đoạn này đã bóc vào item X"
/// — đổi hệ/size xong thì item/khối lượng cũ SAI, nhưng <c>XBOSS_BOCKL</c> lại bỏ qua mọi đối
/// tượng đã đánh dấu, nên nếu không gỡ thì đoạn vừa đổi lặng lẽ không bao giờ được bóc lại. Dùng
/// đúng <see cref="MarkService"/> của <c>XBOSS_BOCKL_XOA</c> (một luật gỡ dấu duy nhất: trả lại
/// đúng màu trước khi bóc + xóa XData của appname đó).
///
/// Mọi hỏi đáp nằm NGOÀI transaction; toàn bộ thay đổi nằm trong MỘT transaction ⇒ một lần UNDO
/// trả bản vẽ về nguyên trạng (FR10). Không đụng appname <c>XBOSS_VE</c> của đối tượng khác.
/// </summary>
public sealed class VeDoiCommands
{
    /// <summary>Một tuyến tim đã chọn, đọc xong ở transaction chỉ-đọc (chưa đụng bản vẽ).</summary>
    private sealed record TuyenChon(
        ObjectId Id,
        string Handle,
        string LayerCu,
        VeXDataInfo XData,
        List<DinhPolyline> Dinh,
        bool Kin,
        bool DaBoc,
        int SoKhoiBam);

    [CommandMethod("XBOSS_VE_DOI")]
    public void DoiTuyen()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;

        // ===== (1) Chọn tuyến (ngoài transaction — ESC là bản vẽ nguyên trạng) =====

        ed.WriteMessage(
            "\n[XBoss] Chọn các đoạn TIM cần đổi hệ/loại/size " +
            "(quét cả vùng cũng được — nét biên, nhãn và đối tượng khác tự bỏ qua).\n");
        var chon = ed.GetSelection();
        if (chon.Status != PromptStatus.OK)
        {
            ed.WriteMessage("\n[XBoss] Chưa chọn tuyến nào — bản vẽ không thay đổi.\n");
            return;
        }

        var appBoc = pack.RulePack.Takeoff.XdataAppName;
        var danhSach = new List<TuyenChon>();
        var boQua = 0;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            var khoiTheoTim = VeThucThe.KhoiTheoTim(db, tr);
            foreach (var id in chon.Value.GetObjectIds())
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not Polyline pl)
                {
                    boQua++;
                    continue;
                }
                var xd = VeXDataStore.Doc(pl);
                if (xd is null || xd.VaiTro != VaiTroVe.Tim)
                {
                    boQua++;
                    continue;
                }
                var handle = pl.Handle.ToString();
                danhSach.Add(new TuyenChon(
                    id,
                    handle,
                    pl.Layer,
                    xd,
                    VeThucThe.DinhCua(pl),
                    pl.Closed,
                    MarkService.ReadMark(pl, appBoc) is not null,
                    khoiTheoTim.TryGetValue(handle, out var khoi) ? khoi.Count : 0));
            }
            tr.Commit();
        }

        if (boQua > 0)
        {
            ed.WriteMessage(
                $"\n[XBoss] Bỏ qua {boQua} đối tượng không phải tuyến tim của XBOSS_VE " +
                "(nét biên/nhãn đi theo tim, không đổi riêng được).\n");
        }
        if (danhSach.Count == 0)
        {
            ed.WriteMessage("\n[XBoss] Không có tuyến tim nào trong vùng chọn — bản vẽ không thay đổi.\n");
            return;
        }

        var tomTat = danhSach
            .GroupBy(t => (t.XData.HeId, t.XData.ItemId, t.XData.Size))
            .Select(n => $"{n.Key.HeId}/{n.Key.ItemId} {n.Key.Size}: {n.Count()} tuyến")
            .ToList();
        ed.WriteMessage($"\n[XBoss] {danhSach.Count} tuyến tim đang chọn:\n");
        foreach (var d in tomTat) ed.WriteMessage($"[XBoss]   {d}\n");

        // ===== (2) Hệ/loại/size/độ dốc MỚI + xác nhận =====
        // Hộp thoại một form (M106 §7.2) gộp cả 4 câu hỏi lẫn câu xác nhận DongY/Huy, và hiện hệ
        // quả (gỡ dấu bóc, xóa vạch chia đốt, block đang bám) ngay tại chỗ. UI hỏng hoặc
        // XBOSS_UI_DIALOG=0 → nguyên chuỗi hỏi đáp cũ (FR9).
        var soDaBoc = danhSach.Count(t => t.DaBoc);
        var soKhoiBam = danhSach.Sum(t => t.SoKhoiBam);
        var (daDungUi, chonUi) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new VeDoiDialogViewModel(
                pack.DrawTools.Systems, pack.SheetSetup.Slopes, tomTat,
                danhSach.Count, soDaBoc, soKhoiBam,
                danhSach[0].XData.Size, danhSach[0].XData.DoDoc ?? VeContext.DoDoc);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi && chonUi is null)
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return;
        }

        DrawSystem he;
        DrawLine tuyenMoi;
        VeContext.ChonTuDanhMuc size;
        string? doDoc = null;

        if (chonUi is { } ui)
        {
            he = ui.He;
            tuyenMoi = ui.Tuyen;
            size = new VeContext.ChonTuDanhMuc(ui.Size, ui.SizeTuNhap);
            doDoc = ui.DoDoc;
        }
        else
        {
            // Luôn hỏi lại hệ: đây là lệnh ĐỔI, giữ ngầm hệ của phiên trước là đường ngắn nhất tới
            // việc đổi nhầm cả loạt tuyến sang hệ khác.
            var heHoi = VeContext.HoiHe(ed, pack, batBuocHoiLai: true);
            if (heHoi is null) return;
            DrawLine? chonLoai = null;
            while (chonLoai is null)
            {
                var (chonTuyen, doiHe) = VeContext.HoiLoaiTuyen(ed, heHoi);
                if (doiHe)
                {
                    var heMoi = VeContext.HoiHe(ed, pack, batBuocHoiLai: true);
                    if (heMoi is null) return;
                    heHoi = heMoi;
                    continue;
                }
                if (chonTuyen is null) return;
                chonLoai = chonTuyen;
            }
            he = heHoi;
            tuyenMoi = chonLoai;

            var sizeCu = danhSach[0].XData.Size;
            var chonSize = VeContext.HoiDanhMuc(
                ed, $"Size mới cho {tuyenMoi.Name} ({tuyenMoi.SizeKind})", tuyenMoi.Sizes,
                tuyenMoi.Sizes.Contains(sizeCu) ? sizeCu : VeContext.Size, choTuNhap: true);
            if (chonSize is not { } s) return;
            size = s;

            // Độ dốc: loại tuyến mới bắt buộc thì hỏi (mặc định giữ độ dốc cũ nếu có); loại tuyến
            // mới KHÔNG có độ dốc thì bỏ hẳn — giữ "i=2%" trên tuyến cấp nước là ghi chú sai.
            if (tuyenMoi.SlopeRequired)
            {
                var chonDoc = VeContext.HoiDanhMuc(
                    ed, $"Độ dốc tuyến {tuyenMoi.Name}", pack.SheetSetup.Slopes,
                    danhSach[0].XData.DoDoc ?? VeContext.DoDoc, choTuNhap: true);
                if (chonDoc is not { } dd) return;
                doDoc = dd.GiaTri;
            }
        }

        VeContext.Size = size.GiaTri;
        VeContext.SizeTuNhap = size.TuNhap;
        if (doDoc is not null) VeContext.DoDoc = doDoc;
        if (size.TuNhap)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Size \"{size.GiaTri}\" ngoài danh mục rule pack — vẫn đổi, XData đánh dấu \"custom\".\n");
        }

        // ===== (3) Bề rộng nét biên mới =====

        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — bề rộng nét biên " +
                "đã quy đổi theo đơn vị này, chuẩn dự án là mm.\n");
        }
        double? beRong = null;
        if (tuyenMoi.EdgeStyle == "double")
        {
            if (DrawSize.PhanTich(size.GiaTri) is { } kt) beRong = kt.RongMm / toMm;
            else
                ed.WriteMessage(
                    $"\n[XBoss] ⚠ Không đọc được bề rộng từ size \"{size.GiaTri}\" — chỉ đổi tim, " +
                    "nét biên cũ vẫn bị xóa (không giữ nét biên sai size).\n");
        }

        // ===== (4) Cảnh báo trước khi làm =====
        // Hộp thoại đã hiện đủ các cảnh báo này và đóng luôn vai xác nhận ⇒ không hỏi lại.

        if (soDaBoc > 0)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ {soDaBoc} tuyến ĐÃ BÓC KHỐI LƯỢNG — đổi xong PHẢI BÓC LẠI. Lệnh sẽ gỡ đánh dấu " +
                "bóc của đúng các tuyến này (trả màu cũ) để XBOSS_BOCKL nhìn thấy chúng lần sau (M100 §6.2).\n");
        }
        if (soKhoiBam > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {soKhoiBam} block đang bám các tuyến này (phụ kiện/thiết bị/giá đỡ/lỗ chờ) — " +
                "lệnh KHÔNG tự đổi tỉ lệ/khoảng cách của chúng theo size mới. Chạy lại XBOSS_VE_GIADO / " +
                "XBOSS_VE_LOCHO và kiểm phụ kiện sau khi đổi.\n");
        }

        if (chonUi is null)
        {
            var hoiXacNhan = new PromptKeywordOptions(
                $"\n[XBoss] Đổi {danhSach.Count} tuyến sang {he.Id}/{tuyenMoi.ItemId} {size.GiaTri}" +
                $"{(doDoc is null ? "" : $" i={doDoc}")} (layer {tuyenMoi.Layer})?")
            {
                AllowNone = false,
            };
            hoiXacNhan.Keywords.Add("DongY", "DongY", "Đồng ý");
            hoiXacNhan.Keywords.Add("Huy", "Huy", "Hủy");
            hoiXacNhan.Keywords.Default = "DongY";
            var traLoi = ed.GetKeywords(hoiXacNhan);
            if (traLoi.Status != PromptStatus.OK || traLoi.StringResult != "DongY")
            {
                ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
                return;
            }
        }

        // ===== (5) Thi hành: MỘT transaction = MỘT nhóm UNDO =====

        var soTuyenDoi = 0;
        var soBienXoa = 0;
        var soBienMoi = 0;
        var soNhanCapNhat = 0;
        var soMuiTenXoa = 0;
        var soGoDauBoc = 0;
        var soChiaDotXoa = 0;
        var canhBao = new List<string>();

        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeXDataStore.DangKyApp(db, tr);
                VeLayerService.DamBaoLayer(
                    db, tr, tuyenMoi.Layer, VeLayerStyle.AciChoTim(tuyenMoi.EdgeStyle),
                    pack.RulePack.LineweightMap, out _);

                // Mở khóa cả layer NGUỒN (tim cũ + nét biên cũ) và layer nhãn: sau XBOSS_VE_NEN thì
                // mọi layer đang khóa, không mở thì lệnh chết giữa chừng ở đối tượng đầu tiên.
                foreach (var ten in danhSach
                    .SelectMany(t => new[]
                    {
                        t.LayerCu,
                        VeLayerStyle.LayerNetBien(t.LayerCu, pack.DrawTools.EdgeLayerSuffix),
                    })
                    .Append(pack.DrawTools.LabelStyle.Layer)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList())
                {
                    VeLayerService.MoKhoaNeuCo(db, tr, ten);
                }

                var tenLayerBien = VeLayerStyle.LayerNetBien(tuyenMoi.Layer, pack.DrawTools.EdgeLayerSuffix);
                BlockTableRecord? ms = null;
                if (beRong is not null)
                {
                    VeLayerService.DamBaoLayer(
                        db, tr, tenLayerBien, VeLayerStyle.AciNetBien, pack.RulePack.LineweightMap, out _);
                    ms = (BlockTableRecord)tr.GetObject(
                        SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);
                }

                // Vạch chia đốt của các tuyến sắp đổi (M105) — quét một lần cho cả lệnh.
                var chiaDotTheoTim = VeThucThe.ChiaDotTheoTim(db, tr);

                foreach (var t in danhSach)
                {
                    if (tr.GetObject(t.Id, OpenMode.ForWrite) is not Polyline tim) continue;

                    // (a) Nét biên cũ: xóa TRƯỚC khi dựng lại — biên là thứ phụ thuộc size, giữ lại
                    //     là để nét sai bề rộng nằm trên bản vẽ nộp.
                    soBienXoa += XoaNetBienCu(tr, db, t);

                    // (b) Layer mới cho tim.
                    tim.Layer = tuyenMoi.Layer;

                    // (c) Nét biên mới theo size mới.
                    var handleBien = new List<string>();
                    if (beRong is { } w && ms is not null)
                    {
                        var kq = EdgeOffset.Tinh(t.Dinh, w, t.Kin);
                        if (!kq.ThanhCong)
                        {
                            canhBao.Add($"Tuyến {t.Handle}: không dựng lại được nét biên — {kq.LyDo}");
                        }
                        else
                        {
                            foreach (var canh in new[] { kq.Trai, kq.Phai })
                            {
                                var bien = VeThucThe.TaoPolyline(canh, t.Kin);
                                VeThucThe.Them(tr, ms, bien, tenLayerBien);
                                VeXDataStore.Ghi(bien, new VeXDataInfo
                                {
                                    VaiTro = VaiTroVe.Bien,
                                    HeId = he.Id,
                                    ItemId = tuyenMoi.ItemId,
                                    Size = size.GiaTri,
                                    RulePackVersion = pack.RulePack.Version,
                                    HandleTim = t.Handle,
                                });
                                handleBien.Add(bien.Handle.ToString());
                            }
                            soBienMoi += handleBien.Count;
                        }
                    }

                    // (d) Nhãn liên kết: nội dung lấy lại từ XData mới (FR7 — không gõ tay).
                    var (handleNhan, capNhat, muiTenXoa) = CapNhatNhan(
                        tr, db, t, he.Id, tuyenMoi.ItemId, size.GiaTri, doDoc, pack.RulePack.Version);
                    soNhanCapNhat += capNhat;
                    soMuiTenXoa += muiTenXoa;

                    // (e) Vạch chia đốt cũ (M105): số đốt/kiểu nối phụ thuộc CỠ tuyến, đổi cỡ xong
                    //     thì vạch cũ là thông tin sai đưa thẳng ra xưởng — xóa kèm dấu chia đốt
                    //     trên tim, kỹ sư chạy lại XBOSS_VE_CHIADOT (cùng lý do phải gỡ dấu bóc).
                    soChiaDotXoa += VeThucThe.XoaChiaDotCua(db, tr, chiaDotTheoTim, t.Handle);

                    // (f) XData mới của tim.
                    VeXDataStore.Ghi(tim, t.XData with
                    {
                        HeId = he.Id,
                        ItemId = tuyenMoi.ItemId,
                        Size = size.GiaTri,
                        RulePackVersion = pack.RulePack.Version,
                        SizeTuNhap = size.TuNhap,
                        DoDoc = doDoc,
                        HandleBien = handleBien,
                        HandleNhan = handleNhan,
                        KieuNoi = null,
                        KieuNoiGhiDe = false,
                        SoDot = null,
                        SoMoiNoi = null,
                        TongDaiDotMm = null,
                    });

                    // (g) Gỡ đánh dấu bóc của ĐÚNG tuyến này (logic XBOSS_BOCKL_XOA theo vùng chọn).
                    if (t.DaBoc && MarkService.Unmark(tim, appBoc)) soGoDauBoc++;

                    soTuyenDoi++;
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi đổi tuyến — đã rollback, bản vẽ nguyên trạng: {e.Message}\n" +
                    "[XBoss] Nếu layer đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi thử lại.\n");
                return;
            }
        }

        // ===== (6) Báo cáo =====

        ed.WriteMessage(
            $"\n[XBoss] Đã đổi {soTuyenDoi} tuyến sang {he.Id}/{tuyenMoi.ItemId} {size.GiaTri}" +
            $"{(doDoc is null ? "" : $" i={doDoc}")} trên layer {tuyenMoi.Layer}.\n" +
            $"[XBoss] Nét biên: xóa {soBienXoa}, dựng lại {soBienMoi} (layer " +
            $"{VeLayerStyle.LayerNetBien(tuyenMoi.Layer, pack.DrawTools.EdgeLayerSuffix)}). " +
            $"Nhãn cập nhật: {soNhanCapNhat}" +
            $"{(soMuiTenXoa > 0 ? $", mũi tên hướng dốc xóa: {soMuiTenXoa}" : "")}.\n");
        if (soGoDauBoc > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ Đã gỡ đánh dấu bóc của {soGoDauBoc} tuyến — CHẠY LẠI XBOSS_BOCKL để khối lượng " +
                "khớp bản vẽ (số cũ đã sai vì hệ/size đổi).\n");
        }
        if (soChiaDotXoa > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ Đã xóa {soChiaDotXoa} vạch/tag chia đốt của các tuyến vừa đổi — CHẠY LẠI " +
                "XBOSS_VE_CHIADOT (chiều dài đốt và kiểu nối phụ thuộc cỡ tuyến).\n");
        }
        foreach (var c in canhBao) ed.WriteMessage($"[XBoss] ⚠ {c}\n");
        ed.WriteMessage("[XBoss] Hoàn tác cả lệnh: UNDO 1 lần.\n");
    }

    // ===== Trợ giúp =====

    /// <summary>
    /// Xóa các nét biên cũ của một tim. CHỈ xóa đối tượng thật sự là nét biên CỦA CHÍNH tim đó
    /// (XData vai trò <see cref="VaiTroVe.Bien"/> + handle tim khớp): handle trong XData có thể đã
    /// mục (kỹ sư xóa tay, hoặc AutoCAD cấp lại handle cho đối tượng khác) — xóa mù theo handle là
    /// cách chắc chắn nhất để mất một đối tượng vô can.
    /// </summary>
    private static int XoaNetBienCu(Transaction tr, Database db, TuyenChon t)
    {
        var soXoa = 0;
        foreach (var handle in t.XData.HandleBien)
        {
            if (VeThucThe.TimTheoHandle(db, handle) is not { } id) continue;
            if (tr.GetObject(id, OpenMode.ForWrite) is not Entity ent) continue;
            var xd = VeXDataStore.Doc(ent);
            if (xd is null || xd.VaiTro != VaiTroVe.Bien) continue;
            if (!string.Equals(xd.HandleTim, t.Handle, StringComparison.Ordinal)) continue;
            ent.Erase();
            soXoa++;
        }
        return soXoa;
    }

    /// <summary>
    /// Cập nhật mọi nhãn đang gắn với một tim: MTEXT lấy lại nội dung từ XData mới; mũi tên hướng
    /// dốc (block, M100 §6.9) giữ nguyên vị trí khi tuyến vẫn có độ dốc, và bị XÓA khi loại tuyến
    /// mới không có độ dốc (mũi tên chỉ dốc trên ống cấp nước là thông tin sai).
    /// Trả (danh sách handle nhãn còn sống, số nhãn chữ đã cập nhật, số mũi tên đã xóa).
    /// </summary>
    private static (List<string> HandleNhan, int SoNhan, int SoMuiTen) CapNhatNhan(
        Transaction tr, Database db, TuyenChon t,
        string heId, string itemId, string size, string? doDoc, string rulePackVersion)
    {
        var conLai = new List<string>();
        var soNhan = 0;
        var soMuiTen = 0;
        var noiDung = DrawSize.NhanTuyen(size, doDoc);

        foreach (var handle in t.XData.HandleNhan)
        {
            if (VeThucThe.TimTheoHandle(db, handle) is not { } id) continue;
            if (tr.GetObject(id, OpenMode.ForWrite) is not Entity ent) continue;
            var xd = VeXDataStore.Doc(ent);
            if (xd is null || xd.VaiTro != VaiTroVe.Nhan) continue;
            if (!string.Equals(xd.HandleTim, t.Handle, StringComparison.Ordinal)) continue;

            if (ent is BlockReference && doDoc is null)
            {
                ent.Erase(); // mũi tên hướng dốc trên tuyến không còn dốc
                soMuiTen++;
                continue;
            }
            if (ent is MText mt)
            {
                mt.Contents = noiDung;
                soNhan++;
            }
            VeXDataStore.Ghi(ent, xd with
            {
                HeId = heId,
                ItemId = itemId,
                Size = size,
                RulePackVersion = rulePackVersion,
                DoDoc = doDoc,
            });
            conLai.Add(handle);
        }
        return (conLai, soNhan, soMuiTen);
    }
}
