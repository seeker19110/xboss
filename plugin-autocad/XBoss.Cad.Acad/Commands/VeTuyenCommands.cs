using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Ui.ViewModels;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeTuyenCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE</c> (vẽ tuyến tim + nét biên) và <c>XBOSS_VE_NHAN</c> (ghi nhãn size/độ dốc) —
/// M100 §6.1 bước 3 và 6, FR3/FR4/FR7/FR9g/FR10.
///
/// Nguyên tắc: tim là nguồn sự thật (đúng layer đích của hệ, mang XData
/// <c>[systemId, itemId, size, rulePackVersion, custom?, slope?]</c> để <c>XBOSS_BOCKL</c> bóc
/// đúng); nét biên chỉ để thể hiện bề rộng, nằm trên layer <c>&lt;tim&gt;+edgeLayerSuffix</c> và
/// KHÔNG bao giờ được bóc. Hình học nét biên tính ở Core (<see cref="EdgeOffset"/>) — offset
/// không được thì CHỈ vẽ tim kèm cảnh báo, tuyệt đối không vẽ biên sai (§18).
///
/// Mỗi lệnh = 1 transaction = 1 nhóm UNDO (tim + 2 biên xóa bằng đúng 1 lần UNDO — AC1);
/// mọi hỏi đáp/bấm điểm nằm NGOÀI transaction nên ESC giữa chừng không để lại gì (§6.11).
/// </summary>
public sealed class VeTuyenCommands
{
    // ===== XBOSS_VE =====

    [CommandMethod("XBOSS_VE")]
    public void VeTuyen()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;

        // (1) Đơn vị bản vẽ — đọc TRƯỚC khi hỏi tham số vì hộp thoại hiện bề rộng nét biên theo nó.
        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — bề rộng/chiều cao chữ " +
                "đã quy đổi theo đơn vị này, chuẩn dự án là mm.\n");
        }

        // (2) Hệ + loại tuyến + size + độ dốc: hộp thoại một form (M106 AC3), rơi về chuỗi hỏi đáp
        //     dòng lệnh cũ khi UI không dựng được (FR9). Cả hai đường trả CÙNG một bản ghi tham số.
        if (HoiThamSo(ed, pack, toMm) is not { } ts) return;
        var (he, tuyen, doDoc) = (ts.He, ts.Tuyen, ts.DoDoc);
        if (ts.SizeTuNhap)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Size \"{ts.Size}\" ngoài danh mục rule pack — vẫn vẽ, XData đánh dấu \"custom\".\n");
        }

        // (3) Bề rộng nét biên (đơn vị bản vẽ) — chỉ với loại tuyến edgeStyle=double.
        double? beRong = null;
        if (tuyen.EdgeStyle == "double")
        {
            if (DrawSize.PhanTich(ts.Size) is { } kt) beRong = kt.RongMm / toMm;
            else
                ed.WriteMessage(
                    $"\n[XBoss] ⚠ Không đọc được bề rộng từ size \"{ts.Size}\" — chỉ vẽ tim, không sinh nét biên.\n");
        }

        // (4) Bấm điểm như PLINE (ngoài transaction — ESC là không có gì được tạo).
        var duong = BatDiem(ed);
        if (duong is not { } net) return;

        // (5) Tạo tim + biên + XData trong MỘT transaction = MỘT nhóm UNDO.
        var soBien = 0;
        string? canhBaoBien = null;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeXDataStore.DangKyApp(db, tr);
                VeLayerService.DamBaoLayer(
                    db, tr, tuyen.Layer, VeLayerStyle.AciChoTim(tuyen.EdgeStyle), pack.RulePack.LineweightMap, out _);
                var ms = (BlockTableRecord)tr.GetObject(
                    SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);

                var tim = VeThucThe.TaoPolyline(net.Dinh, net.Kin);
                VeThucThe.Them(tr, ms, tim, tuyen.Layer); // layer đặt SAU khi vào database

                var handleBien = new List<string>();
                if (beRong is { } w)
                {
                    var kq = EdgeOffset.Tinh(net.Dinh, w, net.Kin);
                    if (!kq.ThanhCong)
                    {
                        canhBaoBien = kq.LyDo;
                    }
                    else
                    {
                        var tenLayerBien = VeLayerStyle.LayerNetBien(tuyen.Layer, pack.DrawTools.EdgeLayerSuffix);
                        VeLayerService.DamBaoLayer(
                            db, tr, tenLayerBien, VeLayerStyle.AciNetBien, pack.RulePack.LineweightMap, out _);
                        foreach (var canh in new[] { kq.Trai, kq.Phai })
                        {
                            var bien = VeThucThe.TaoPolyline(canh, net.Kin);
                            VeThucThe.Them(tr, ms, bien, tenLayerBien);
                            VeXDataStore.Ghi(bien, new VeXDataInfo
                            {
                                VaiTro = VaiTroVe.Bien,
                                HeId = he.Id,
                                ItemId = tuyen.ItemId,
                                Size = ts.Size,
                                RulePackVersion = pack.RulePack.Version,
                                HandleTim = tim.Handle.ToString(),
                            });
                            handleBien.Add(bien.Handle.ToString());
                        }
                        soBien = handleBien.Count;
                    }
                }

                VeXDataStore.Ghi(tim, new VeXDataInfo
                {
                    VaiTro = VaiTroVe.Tim,
                    HeId = he.Id,
                    ItemId = tuyen.ItemId,
                    Size = ts.Size,
                    RulePackVersion = pack.RulePack.Version,
                    SizeTuNhap = ts.SizeTuNhap,
                    DoDoc = doDoc,
                    HandleBien = handleBien,
                });
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi tạo tuyến — đã rollback, bản vẽ nguyên trạng: {e.Message}\n" +
                    "[XBoss] Nếu layer đích đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi vẽ lại.\n");
                return;
            }
        }

        ed.WriteMessage(
            $"\n[XBoss] Đã vẽ tuyến {tuyen.Name} {ts.Size}{(doDoc is null ? "" : $" i={doDoc}")} " +
            $"trên layer {tuyen.Layer} ({net.Dinh.Count} đỉnh{(net.Kin ? ", kín" : "")}).\n");
        if (canhBaoBien is not null)
            ed.WriteMessage($"[XBoss] ⚠ Không sinh được nét biên: {canhBaoBien} Tim vẫn đúng chuẩn và bóc được.\n");
        else if (soBien > 0)
            ed.WriteMessage(
                $"[XBoss] Đã sinh {soBien} nét biên trên layer " +
                $"{VeLayerStyle.LayerNetBien(tuyen.Layer, pack.DrawTools.EdgeLayerSuffix)} (không tính khối lượng).\n");
        ed.WriteMessage("[XBoss] Ghi nhãn: XBOSS_VE_NHAN · Hoàn tác cả tuyến (tim + biên): UNDO 1 lần.\n");
    }

    // ===== XBOSS_VE_NHAN =====

    [CommandMethod("XBOSS_VE_NHAN")]
    public void GhiNhan()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;

        var hoi = new PromptEntityOptions("\n[XBoss] Chọn tuyến tim cần ghi nhãn: ");
        hoi.SetRejectMessage("\n[XBoss] Chỉ ghi nhãn được cho tuyến do XBOSS_VE vẽ (polyline tim).\n");
        hoi.AddAllowedClass(typeof(Polyline), false); // false = nhận cả lớp dẫn xuất
        var chon = ed.GetEntity(hoi);
        if (chon.Status != PromptStatus.OK) return;

        // (1) Đọc XData + vị trí/hướng đặt nhãn (transaction chỉ đọc).
        var diemBam = chon.PickedPoint.TransformBy(ed.CurrentUserCoordinateSystem);
        VeXDataInfo? thongTin;
        Point3d viTri;
        double goc;
        double gocTuyen;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            if (tr.GetObject(chon.ObjectId, OpenMode.ForRead) is not Polyline pl)
            {
                tr.Commit();
                ed.WriteMessage("\n[XBoss] Đối tượng chọn không phải polyline tuyến.\n");
                return;
            }
            thongTin = VeXDataStore.Doc(pl);
            (viTri, goc, gocTuyen) = ViTriNhan(pl, diemBam);
            tr.Commit();
        }

        if (thongTin is null || thongTin.VaiTro != VaiTroVe.Tim)
        {
            ed.WriteMessage(
                "\n[XBoss] Đối tượng này không phải TUYẾN TIM do XBOSS_VE vẽ (nét biên và nhãn không ghi nhãn được) — " +
                "nội dung nhãn phải lấy từ XData của tuyến, không gõ tay (FR7).\n");
            return;
        }

        // (2) Tỉ lệ in để quy đổi chiều cao chữ: labelStyle.textHeightMm là mm TRÊN GIẤY.
        //     Hỏi một lần mỗi phiên, nhớ lại cho các nhãn sau — cùng cửa với XBOSS_VE_TRANGIN /
        //     XBOSS_VE_MATCAT (PR6) nên nhãn mặt bằng và tỉ lệ viewport không bao giờ lệch nhau.
        //     M106 PR3: đưa câu hỏi tỉ lệ vào hộp thoại để lệnh ghi nhãn đầu tiên của phiên cũng
        //     chạy trọn bằng chuột — vẫn NHỚ ở đúng VeContext.TiLeIn, không có cơ chế nhớ thứ hai.
        if (HoiTiLeGhiNhan(ed, pack) is not { } tiLe) return;

        var (toMm, _, _) = DrawingUnits.TuInsUnits((int)db.Insunits);
        var cao = pack.DrawTools.LabelStyle.TextHeightMm * tiLe / toMm;
        var noiDung = DrawSize.NhanTuyen(thongTin.Size, thongTin.DoDoc);

        // (3) Mũi tên hướng dốc chèn TRƯỚC nhãn chữ để cả hai handle cùng vào XData của tim trong
        //     một lần ghi (FR9g). Thiếu block trong thư viện → chỉ text, không bịa ký hiệu.
        string? handleMuiTen = null;
        if (thongTin.DoDoc is not null)
        {
            handleMuiTen = ChenMuiTenDoDoc(
                doc, ed, thongTin, chon.ObjectId.Handle.ToString(), viTri, gocTuyen, cao,
                pack.DrawTools.LabelStyle.Layer, pack.RulePack.Version);
        }

        // (4) Tạo nhãn + liên kết XData 2 chiều trong 1 transaction = 1 nhóm UNDO.
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeXDataStore.DangKyApp(db, tr);
                var tenLayer = pack.DrawTools.LabelStyle.Layer;
                VeLayerService.DamBaoLayer(
                    db, tr, tenLayer, VeLayerStyle.AciNhan, pack.RulePack.LineweightMap, out _);
                var ms = (BlockTableRecord)tr.GetObject(
                    SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);

                var nhan = new MText
                {
                    Contents = noiDung,
                    Location = viTri,
                    TextHeight = cao,
                    Rotation = goc,
                    Attachment = AttachmentPoint.BottomCenter,
                };
                ms.AppendEntity(nhan);
                tr.AddNewlyCreatedDBObject(nhan, true);
                nhan.Layer = tenLayer; // đặt SAU khi vào database
                VeXDataStore.Ghi(nhan, new VeXDataInfo
                {
                    VaiTro = VaiTroVe.Nhan,
                    HeId = thongTin.HeId,
                    ItemId = thongTin.ItemId,
                    Size = thongTin.Size,
                    RulePackVersion = pack.RulePack.Version,
                    DoDoc = thongTin.DoDoc,
                    HandleTim = chon.ObjectId.Handle.ToString(),
                });

                // Tim giữ danh sách nhãn của nó (kể cả mũi tên hướng dốc) để XBOSS_VE_DOI cập
                // nhật được (FR8).
                if (tr.GetObject(chon.ObjectId, OpenMode.ForWrite) is Entity tim)
                {
                    var handleNhan = thongTin.HandleNhan.ToList();
                    if (handleMuiTen is not null) handleNhan.Add(handleMuiTen);
                    handleNhan.Add(nhan.Handle.ToString());
                    VeXDataStore.Ghi(tim, thongTin with { HandleNhan = handleNhan });
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi ghi nhãn — đã rollback: {e.Message}\n" +
                    "[XBoss] Nếu layer tuyến/annotation đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi thử lại.\n");
                return;
            }
        }

        ed.WriteMessage(
            $"\n[XBoss] Đã ghi nhãn \"{noiDung}\" trên layer {pack.DrawTools.LabelStyle.Layer} " +
            $"(cao {pack.DrawTools.LabelStyle.TextHeightMm}mm giấy ở tỉ lệ 1:{tiLe:0.##}).\n");
    }

    // ===== Thu tham số: hộp thoại (mặc định) hoặc dòng lệnh (FR9) =====

    /// <summary>
    /// Hệ/loại tuyến/size/độ dốc cho một lần vẽ. Thử hộp thoại một form trước (M106 AC3); UI không
    /// dựng được hoặc bị tắt bằng <c>XBOSS_UI_DIALOG=0</c> thì rơi về ĐÚNG chuỗi hỏi đáp dòng lệnh
    /// cũ (FR9). Hủy ở hộp thoại = dừng lệnh, KHÔNG hỏi lại bằng dòng lệnh.
    /// Cả hai đường đều ghi nhớ lựa chọn vào <see cref="VeContext"/> (FR4 — một cơ chế nhớ duy nhất).
    /// </summary>
    private static KetQuaVeTuyen? HoiThamSo(Editor ed, DrawToolsPack pack, double toMm)
    {
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new VeTuyenDialogViewModel(
                pack, toMm, VeContext.He?.Id, VeContext.Tuyen?.ItemId, VeContext.Size, VeContext.DoDoc);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi)
        {
            if (kq is not null) GhiNhoPhien(kq);
            return kq;
        }
        return HoiThamSoDongLenh(ed, pack);
    }

    /// <summary>
    /// Tỉ lệ in cho lần ghi nhãn này (M106 §7.2 · XBOSS_VE_NHAN). Hộp thoại hiện chiều cao chữ suy
    /// ra theo tỉ lệ đang chọn (FR6); UI hỏng hoặc <c>XBOSS_UI_DIALOG=0</c> thì về đúng
    /// <see cref="VeContext.HoiTiLeIn"/> như cũ (FR9). Cả hai đường ghi vào cùng một chỗ nhớ của
    /// phiên (<see cref="VeContext.TiLeIn"/> — FR4).
    /// </summary>
    private static double? HoiTiLeGhiNhan(Editor ed, DrawToolsPack pack)
    {
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new VeNhanDialogViewModel(
                pack.SheetSetup.Scales, pack.DrawTools.LabelStyle.TextHeightMm, VeContext.TiLeIn);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (!daDungUi) return VeContext.HoiTiLeIn(ed, pack);
        if (kq is null) return null;
        VeContext.TiLeIn = kq.TiLeIn;
        return kq.TiLeIn;
    }

    /// <summary>Chuỗi 4 câu hỏi keyword của bản trước M106 — giữ nguyên cho script/batch và FR9.</summary>
    private static KetQuaVeTuyen? HoiThamSoDongLenh(Editor ed, DrawToolsPack pack)
    {
        // Hệ (giữ hệ đang vẽ; chưa có thì hỏi — §6.11 "không có trạng thái ngầm bắt buộc")
        // + loại tuyến, kèm lối DOIHE đổi hệ ngay trong lệnh.
        var he = VeContext.HoiHe(ed, pack);
        if (he is null) return null;
        DrawLine? tuyen = null;
        while (tuyen is null)
        {
            var (chon, doiHe) = VeContext.HoiLoaiTuyen(ed, he);
            if (doiHe)
            {
                var heMoi = VeContext.HoiHe(ed, pack, batBuocHoiLai: true);
                if (heMoi is null) return null;
                he = heMoi;
                continue;
            }
            if (chon is null) return null;
            tuyen = chon;
        }

        // Size từ danh mục (cho nhập ngoài danh mục kèm cờ custom — M100 §4).
        var chonSize = VeContext.HoiDanhMuc(
            ed, $"Size {tuyen.Name} ({tuyen.SizeKind})", tuyen.Sizes, VeContext.Size, choTuNhap: true);
        if (chonSize is not { } size) return null;

        // Độ dốc với tuyến bắt buộc (FR9g).
        string? doDoc = null;
        if (tuyen.SlopeRequired)
        {
            var chonDoc = VeContext.HoiDanhMuc(
                ed, $"Độ dốc tuyến {tuyen.Name}", pack.SheetSetup.Slopes, VeContext.DoDoc, choTuNhap: true);
            if (chonDoc is not { } dd) return null;
            doDoc = dd.GiaTri;
        }

        var kq = new KetQuaVeTuyen(he, tuyen, size.GiaTri, size.TuNhap, doDoc);
        GhiNhoPhien(kq);
        return kq;
    }

    /// <summary>Nhớ lựa chọn cho lần vẽ sau trong phiên (M100 §6.11 / M106 FR4).</summary>
    private static void GhiNhoPhien(KetQuaVeTuyen kq)
    {
        VeContext.He = kq.He;
        VeContext.Tuyen = kq.Tuyen;
        VeContext.Size = kq.Size;
        VeContext.SizeTuNhap = kq.SizeTuNhap;
        if (kq.DoDoc is not null) VeContext.DoDoc = kq.DoDoc;
    }

    // ===== Trợ giúp =====

    /// <summary>
    /// Bấm điểm như PLINE: mọi cơ chế nhập điểm quen tay (OSNAP, ORTHO, gõ toạ độ, nhập khoảng
    /// cách trực tiếp) đều giữ nguyên vì dùng <c>Editor.GetPoint</c>; kèm chế độ Cung nối tiếp
    /// tuyến (bulge tính ở Core), Hoàn tác, Đóng.
    /// Trả null khi kỹ sư ESC hoặc chưa đủ 2 điểm — khi đó KHÔNG có gì được tạo trong bản vẽ.
    /// </summary>
    private static (List<DinhPolyline> Dinh, bool Kin)? BatDiem(Editor ed)
    {
        // Điểm do người dùng bấm nằm trong UCS hiện hành — quy về WCS rồi ép phẳng Z=0
        // (bản vẽ shop là 2D; giữ Z=0 để XBOSS_KIEMTRA không báo lệch Z — AC2).
        var ucs = ed.CurrentUserCoordinateSystem;

        var kqDau = ed.GetPoint(new PromptPointOptions("\n[XBoss] Điểm đầu tuyến (ESC để hủy): "));
        if (kqDau.Status != PromptStatus.OK) return null;
        var diemDau = kqDau.Value.TransformBy(ucs);
        var dinh = new List<DinhPolyline> { new(diemDau.X, diemDau.Y, 0) };

        var cheDoCung = false;
        double? huongRa = null;
        var kin = false;

        while (true)
        {
            var nhac = cheDoCung
                ? "\n[XBoss] Điểm tiếp theo — CUNG [Thang/HoanTac/Dong/KetThuc] (Enter = kết thúc): "
                : "\n[XBoss] Điểm tiếp theo [Cung/HoanTac/Dong/KetThuc] (Enter = kết thúc): ";
            var opt = new PromptPointOptions(nhac)
            {
                AllowNone = true,
                UseBasePoint = true,
                BasePoint = new Point3d(dinh[^1].X, dinh[^1].Y, 0),
                UseDashedLine = true,
            };
            opt.Keywords.Add("Cung", "Cung", "Cung");
            opt.Keywords.Add("Thang", "Thang", "Thang");
            opt.Keywords.Add("HoanTac", "HoanTac", "HoanTac");
            opt.Keywords.Add("Dong", "Dong", "Dong");
            opt.Keywords.Add("KetThuc", "KetThuc", "KetThuc");

            var kq = ed.GetPoint(opt);
            if (kq.Status == PromptStatus.None) break;
            if (kq.Status == PromptStatus.Keyword)
            {
                switch (kq.StringResult)
                {
                    case "Cung":
                        if (huongRa is null)
                        {
                            ed.WriteMessage(
                                "\n[XBoss] Cần ít nhất một đoạn trước để lấy hướng tiếp tuyến — vẽ 1 đoạn thẳng rồi chọn Cung.\n");
                            break;
                        }
                        cheDoCung = true;
                        break;
                    case "Thang":
                        cheDoCung = false;
                        break;
                    case "HoanTac":
                        if (dinh.Count < 2)
                        {
                            ed.WriteMessage("\n[XBoss] Chưa có đoạn nào để hoàn tác.\n");
                            break;
                        }
                        dinh.RemoveAt(dinh.Count - 1);
                        dinh[^1] = dinh[^1] with { Bulge = 0 };
                        huongRa = dinh.Count >= 2
                            ? BulgeMath.HuongCuoiDoan(dinh[^2].Diem, dinh[^1].Diem, dinh[^2].Bulge)
                            : null;
                        break;
                    case "Dong":
                        if (dinh.Count < 3)
                        {
                            ed.WriteMessage("\n[XBoss] Cần ít nhất 3 điểm mới đóng được tuyến.\n");
                            break;
                        }
                        kin = true;
                        break;
                    default: // KetThuc
                        break;
                }
                if (kin) break;
                continue;
            }
            if (kq.Status != PromptStatus.OK) return null; // ESC → hủy sạch (§6.11)

            var diem = kq.Value.TransformBy(ucs);
            var moi = new Diem2(diem.X, diem.Y);
            var truoc = dinh[^1].Diem;
            var bulge = 0.0;
            if (cheDoCung && huongRa is { } huong)
            {
                if (BulgeMath.BulgeTiepTuyen(truoc, huong, moi) is { } b)
                {
                    bulge = b;
                }
                else
                {
                    ed.WriteMessage("\n[XBoss] ⚠ Không có cung tiếp tuyến qua điểm này — vẽ đoạn thẳng.\n");
                }
            }
            dinh[^1] = dinh[^1] with { Bulge = bulge };
            dinh.Add(new DinhPolyline(moi.X, moi.Y, 0));
            huongRa = BulgeMath.HuongCuoiDoan(truoc, moi, bulge);
        }

        if (dinh.Count < 2)
        {
            ed.WriteMessage("\n[XBoss] Tuyến cần ít nhất 2 điểm — chưa vẽ gì.\n");
            return null;
        }
        return (dinh, kin);
    }

    /// <summary>
    /// Vị trí + góc xoay của nhãn: bám điểm bấm trên tim, xoay theo hướng tuyến tại đó (chữ luôn
    /// đọc xuôi). <paramref name="GocChu"/> đã lật về nửa mặt phẳng phải để chữ đọc xuôi, còn
    /// <paramref name="GocTuyen"/> là tiếp tuyến THẬT theo chiều vẽ (mũi tên hướng dốc cần đúng
    /// chiều, lật ngược là chỉ sai hướng dốc). Không đọc được đạo hàm (điểm suy biến) → nhãn nằm
    /// ngang tại điểm bấm.
    /// </summary>
    private static (Point3d ViTri, double GocChu, double GocTuyen) ViTriNhan(Polyline pl, Point3d diemBam)
    {
        var phang = new Point3d(diemBam.X, diemBam.Y, 0);
        try
        {
            var tren = pl.GetClosestPointTo(phang, false);
            var huong = pl.GetFirstDerivative(tren);
            var gocTuyen = Math.Atan2(huong.Y, huong.X);
            var gocChu = gocTuyen;
            // Giữ chữ đọc xuôi: quay về nửa mặt phẳng phải.
            if (gocChu > Math.PI / 2) gocChu -= Math.PI;
            else if (gocChu <= -Math.PI / 2) gocChu += Math.PI;
            return (new Point3d(tren.X, tren.Y, 0), gocChu, gocTuyen);
        }
        catch (Autodesk.AutoCAD.Runtime.Exception)
        {
            return (phang, 0, 0);
        }
    }

    /// <summary>
    /// Chèn block mũi tên hướng dốc cạnh nhãn (M100 §6.9/FR9g). Thư viện chưa có block
    /// <c>slope-arrow</c> → CHỈ ghi text kèm hướng dẫn, tuyệt đối không vẽ mũi tên tự chế:
    /// ký hiệu hướng dốc là quy ước trình bày của công ty, plugin không được bịa.
    /// Trả handle mũi tên vừa chèn (null = không chèn) để tim giữ liên kết như với nhãn chữ.
    /// </summary>
    private static string? ChenMuiTenDoDoc(
        Document doc, Editor ed, VeXDataInfo thongTinTim, string handleTim,
        Point3d viTri, double gocTuyen, double coChu, string layerNhan, string rulePackVersion)
    {
        var (thuVien, loi) = BlockLibraryService.HienHanh();
        if (thuVien is null)
        {
            ed.WriteMessage($"[XBoss] Nhãn độ dốc chỉ có chữ (chưa chèn được mũi tên hướng dốc): {loi}\n");
            return null;
        }
        var def = thuVien.TimTheoId(BlockManifest.IdMuiTenDoDoc);
        if (def is null)
        {
            ed.WriteMessage(
                $"[XBoss] Thư viện block {thuVien.Version} chưa có block \"{BlockManifest.IdMuiTenDoDoc}\" — " +
                "nhãn độ dốc chỉ có chữ (plugin không tự vẽ ký hiệu thay thế).\n");
            return null;
        }

        var xdata = new VeXDataInfo
        {
            VaiTro = VaiTroVe.Nhan,
            HeId = thongTinTim.HeId,
            ItemId = thongTinTim.ItemId,
            Size = thongTinTim.Size,
            RulePackVersion = rulePackVersion,
            DoDoc = thongTinTim.DoDoc,
            HandleTim = handleTim,
            BlockId = def.Id,
            ThuVienVersion = thuVien.Version,
        };
        // Mũi tên đặt ngay trên tim tại điểm ghi nhãn, quay theo CHIỀU VẼ tuyến (đỉnh đầu → đỉnh
        // cuối) và cao bằng chữ nhãn (block thư viện vẽ theo kích thước danh nghĩa 1 đơn vị).
        var muc = new List<BlockLibraryService.KhoiChoChen>
        {
            new(viTri, gocTuyen, coChu, layerNhan, xdata,
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)),
        };
        if (!BlockLibraryService.ChenHangLoat(doc, ed, doc.Database, def, thuVien, muc)) return null;

        ed.WriteMessage(
            $"[XBoss] Đã chèn mũi tên hướng dốc ({def.BlockName}) theo CHIỀU VẼ tuyến (đỉnh đầu → đỉnh cuối) — " +
            "dốc ngược chiều vẽ thì quay 180° bằng ROTATE.\n");
        return LayHandleMuiTen(doc.Database, handleTim, def.Id);
    }

    /// <summary>
    /// Handle của mũi tên vừa chèn: quét lại các khối bám tim và lấy khối mang đúng blockId.
    /// (<see cref="BlockLibraryService.ChenHangLoat"/> chèn theo lô nên không trả handle ra ngoài;
    /// quét lại một lần ở đây rẻ hơn nhiều so với đổi chữ ký dùng chung của mọi lệnh chèn block.)
    /// </summary>
    private static string? LayHandleMuiTen(Database db, string handleTim, string blockId)
    {
        using var tr = db.TransactionManager.StartTransaction();
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        string? ra = null;
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not BlockReference br) continue;
            var xd = VeXDataStore.Doc(br);
            if (xd is null || xd.VaiTro != VaiTroVe.Nhan) continue;
            if (!string.Equals(xd.HandleTim, handleTim, StringComparison.Ordinal)) continue;
            if (!string.Equals(xd.BlockId, blockId, StringComparison.Ordinal)) continue;
            ra = br.Handle.ToString(); // lấy cái CUỐI cùng = vừa chèn
        }
        tr.Commit();
        return ra;
    }
}
