using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Ui.ViewModels;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeNhanTuyenCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_NHANTUYEN</c> — nhận tuyến CÓ SẴN của bản thiết kế người khác thành tuyến XBoss
/// (M107 FR1–FR7): đổi layer về layer chuẩn của hệ, ghi XData <c>XBOSS_VE</c> vai trò
/// <see cref="VaiTroVe.Tim"/>, sinh 2 nét biên cho loại tuyến <c>edgeStyle: "double"</c>.
///
/// Sau lệnh này, tuyến nhận vào phải KHÔNG phân biệt được với tuyến do <c>XBOSS_VE</c> vẽ — mọi
/// lệnh sau (<c>XBOSS_VE_PHUKIEN</c>, <c>XBOSS_VE_NHAN</c>, <c>XBOSS_VE_CHIADOT</c>,
/// <c>XBOSS_BOCKL</c>) dùng được ngay.
///
/// Ranh giới cứng:
/// <list type="bullet">
/// <item><b>Không đụng hình học tim</b> (§2 guardrail 1): chỉ đổi layer, gán XData và THÊM nét
/// biên. Đỉnh polyline giữ nguyên từng tọa độ — đây là bản vẽ của người khác, kỹ sư nhận tuyến để
/// dùng tiếp chứ không phải để plugin nắn lại.</item>
/// <item>Chỉ nhận <c>Polyline</c>/<c>Line</c> ngoài xref; mọi thứ khác bị BỎ QUA kèm lý do
/// (FR1).</item>
/// <item><see cref="EdgeOffset"/> thất bại → CHỈ nhận tim + cảnh báo nêu tên tuyến, tuyệt đối
/// không vẽ biên sai (luật M100 §18).</item>
/// <item>Chạy lại trên tuyến đã nhận = cập nhật tại chỗ: xóa nét biên cũ CỦA ĐÚNG tuyến đó rồi
/// dựng lại, không nhân đôi (FR5).</item>
/// <item>Mọi hỏi đáp NGOÀI transaction; toàn bộ thay đổi trong MỘT transaction = MỘT nhóm UNDO
/// (AC5).</item>
/// </list>
/// </summary>
public sealed class VeNhanTuyenCommands
{
    /// <summary>Một đối tượng nhận được, đọc xong ở transaction chỉ-đọc (chưa đụng bản vẽ).</summary>
    private sealed record UngVien(
        ObjectId Id,
        string Handle,
        bool LaLine,
        string LayerCu,
        VeXDataInfo? XDataCu,
        List<DinhPolyline> Dinh,
        bool Kin,
        bool DaBoc);

    [CommandMethod("XBOSS_VE_NHANTUYEN")]
    public void NhanTuyen()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;

        // ===== (1) Đơn vị bản vẽ — đọc TRƯỚC khi hỏi (hộp thoại hiện bề rộng nét biên theo nó) =====

        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — bề rộng nét biên " +
                "đã quy đổi theo đơn vị này, chuẩn dự án là mm.\n");
        }

        // ===== (2) Vùng chọn (ngoài transaction — ESC là bản vẽ nguyên trạng) =====

        ed.WriteMessage(
            "\n[XBoss] Chọn các tuyến CÓ SẴN cần nhận (quét cả vùng cũng được — text/block/arc và " +
            "đối tượng thuộc xref tự bỏ qua).\n");
        var chon = ed.GetSelection();
        if (chon.Status != PromptStatus.OK)
        {
            ed.WriteMessage("\n[XBoss] Chưa chọn gì — bản vẽ không thay đổi.\n");
            return;
        }

        var appBoc = pack.RulePack.Takeoff.XdataAppName;
        var ungVien = new List<UngVien>();
        var soKhongPhaiTuyen = 0;
        var soThuocXref = 0;
        var soPhuTro = 0;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            foreach (var id in chon.Value.GetObjectIds())
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent)
                {
                    soKhongPhaiTuyen++;
                    continue;
                }
                if (ThuocXref.KhoiChen(tr, ent) || LayerCuaXref(tr, ent))
                {
                    soThuocXref++;
                    continue;
                }

                var xd = VeXDataStore.Doc(ent);
                if (xd is not null && xd.VaiTro != VaiTroVe.Tim)
                {
                    // Nét biên/nhãn/vạch chia của chính XBoss: đi theo tim, không nhận riêng.
                    soPhuTro++;
                    continue;
                }

                switch (ent)
                {
                    case Polyline pl:
                        ungVien.Add(new UngVien(
                            id, pl.Handle.ToString(), false, pl.Layer, xd,
                            VeThucThe.DinhCua(pl), pl.Closed,
                            MarkService.ReadMark(pl, appBoc) is not null));
                        break;
                    case Line line:
                        // FR4 — mọi lệnh sau đều giả định tim là polyline; chuyển kiểu ở bước ghi,
                        // 2 đỉnh CÙNG TỌA ĐỘ với line gốc (hình học không đổi).
                        ungVien.Add(new UngVien(
                            id, line.Handle.ToString(), true, line.Layer, xd,
                            [
                                new DinhPolyline(line.StartPoint.X, line.StartPoint.Y, 0),
                                new DinhPolyline(line.EndPoint.X, line.EndPoint.Y, 0),
                            ],
                            false,
                            MarkService.ReadMark(line, appBoc) is not null));
                        break;
                    default:
                        soKhongPhaiTuyen++;
                        break;
                }
            }
            tr.Commit();
        }

        var tomTat = new TomTatChonNhanTuyen(
            SoPolyline: ungVien.Count(u => !u.LaLine && u.XDataCu is null),
            SoLine: ungVien.Count(u => u.LaLine),
            SoNhanLai: ungVien.Count(u => u.XDataCu is not null),
            SoKhongPhaiTuyen: soKhongPhaiTuyen,
            SoThuocXref: soThuocXref,
            SoPhuTroXBoss: soPhuTro);

        foreach (var d in tomTat.DongBoQua) ed.WriteMessage($"[XBoss] Bỏ qua {d}\n");
        if (tomTat.TongNhan == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Không có tuyến nào nhận được trong vùng chọn — bản vẽ không thay đổi.\n" +
                "[XBoss] Lệnh chỉ nhận polyline/line KHÔNG thuộc xref.\n");
            return;
        }
        ed.WriteMessage($"[XBoss] {tomTat.MoTaSeNhan}\n");

        // ===== (3) Hệ + loại tuyến + size + độ dốc: hộp thoại, rơi về dòng lệnh khi UI hỏng =====

        if (HoiThamSo(ed, pack, toMm, tomTat) is not { } ts) return;
        var (he, tuyen, doDoc) = (ts.He, ts.Tuyen, ts.DoDoc);
        if (ts.SizeTuNhap)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Size \"{ts.Size}\" ngoài danh mục rule pack — vẫn nhận, XData đánh dấu \"custom\".\n");
        }

        // ===== (4) Bề rộng nét biên (đơn vị bản vẽ) — chỉ với loại tuyến edgeStyle=double =====

        double? beRong = null;
        if (tuyen.EdgeStyle == "double")
        {
            if (DrawSize.PhanTich(ts.Size) is { } kt) beRong = kt.RongMm / toMm;
            else
                ed.WriteMessage(
                    $"\n[XBoss] ⚠ Không đọc được bề rộng từ size \"{ts.Size}\" — chỉ nhận tim, không sinh nét biên.\n");
        }

        // ===== (5) Thi hành: MỘT transaction = MỘT nhóm UNDO (AC5) =====

        var soNhan = 0;
        var soChuyenKieu = 0;
        var soBienMoi = 0;
        var soBienXoa = 0;
        var soGoDauBoc = 0;
        var soChiaDotXoa = 0;
        var soCoNhan = 0;
        var canhBao = new List<string>();
        var tenLayerBien = VeLayerStyle.LayerNetBien(tuyen.Layer, pack.DrawTools.EdgeLayerSuffix);

        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeXDataStore.DangKyApp(db, tr);
                VeLayerService.DamBaoLayer(
                    db, tr, tuyen.Layer, VeLayerStyle.AciChoTim(tuyen.EdgeStyle),
                    pack.RulePack.LineweightMap, out _);
                if (beRong is not null)
                {
                    VeLayerService.DamBaoLayer(
                        db, tr, tenLayerBien, VeLayerStyle.AciNetBien, pack.RulePack.LineweightMap, out _);
                }

                // Mở khóa layer NGUỒN của các tuyến đang nhận (bản vẽ người khác thường khóa sẵn,
                // và sau XBOSS_VE_NEN thì mọi layer đang khóa) — cùng cách XBOSS_VE_DOI làm.
                foreach (var ten in ungVien
                    .Select(u => u.LayerCu)
                    .Append(tuyen.Layer)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList())
                {
                    VeLayerService.MoKhoaNeuCo(db, tr, ten);
                }

                var ms = (BlockTableRecord)tr.GetObject(
                    SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);
                var chiaDotTheoTim = VeThucThe.ChiaDotTheoTim(db, tr);

                foreach (var u in ungVien)
                {
                    // (a) Tim: line → polyline 2 đỉnh CÙNG TỌA ĐỘ (FR4); polyline thì giữ nguyên
                    //     hình học, chỉ đổi layer (AC6 — so tọa độ từng đỉnh trước/sau phải trùng).
                    Entity tim;
                    if (u.LaLine)
                    {
                        var moi = VeThucThe.TaoPolyline(u.Dinh, false);
                        VeThucThe.Them(tr, ms, moi, tuyen.Layer);
                        if (tr.GetObject(u.Id, OpenMode.ForWrite) is Entity cu) cu.Erase();
                        tim = moi;
                        soChuyenKieu++;
                    }
                    else
                    {
                        if (tr.GetObject(u.Id, OpenMode.ForWrite) is not Polyline pl) continue;
                        pl.Layer = tuyen.Layer;
                        tim = pl;
                    }
                    var handleTim = tim.Handle.ToString();

                    // (b) Nhận LẠI (FR5/FR6): nét biên cũ, vạch chia đốt và dấu bóc của ĐÚNG tuyến
                    //     đó đều theo cỡ cũ ⇒ dọn trước khi dựng lại, không để biên chồng biên.
                    if (u.XDataCu is { } cuXd)
                    {
                        soBienXoa += VeThucThe.XoaNetBienCua(db, tr, cuXd.HandleBien, u.Handle);
                        soChiaDotXoa += VeThucThe.XoaChiaDotCua(db, tr, chiaDotTheoTim, u.Handle);
                        soCoNhan += cuXd.HandleNhan.Count;
                    }
                    if (u.DaBoc && MarkService.Unmark(tim, appBoc)) soGoDauBoc++;

                    // (c) Nét biên theo cỡ vừa khai — offset hỏng thì CHỈ nhận tim (M100 §18).
                    var handleBien = new List<string>();
                    if (beRong is { } w)
                    {
                        var kq = EdgeOffset.Tinh(u.Dinh, w, u.Kin);
                        if (!kq.ThanhCong)
                        {
                            canhBao.Add($"Tuyến handle {u.Handle}: không sinh được nét biên — {kq.LyDo}");
                        }
                        else
                        {
                            foreach (var canh in new[] { kq.Trai, kq.Phai })
                            {
                                var bien = VeThucThe.TaoPolyline(canh, u.Kin);
                                VeThucThe.Them(tr, ms, bien, tenLayerBien);
                                VeXDataStore.Ghi(bien, new VeXDataInfo
                                {
                                    VaiTro = VaiTroVe.Bien,
                                    HeId = he.Id,
                                    ItemId = tuyen.ItemId,
                                    Size = ts.Size,
                                    RulePackVersion = pack.RulePack.Version,
                                    HandleTim = handleTim,
                                });
                                handleBien.Add(bien.Handle.ToString());
                            }
                            soBienMoi += handleBien.Count;
                        }
                    }

                    // (d) XData tim — CÙNG cấu trúc với tuyến do XBOSS_VE vẽ (FR3.2). Dấu chia đốt
                    //     xóa theo vạch vừa dọn; nhãn cũ (nếu nhận lại) vẫn giữ liên kết.
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
                        HandleNhan = u.XDataCu?.HandleNhan ?? [],
                    });
                    soNhan++;
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi nhận tuyến — đã rollback, bản vẽ nguyên trạng: {e.Message}\n" +
                    "[XBoss] Nếu layer đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi thử lại.\n");
                return;
            }
        }

        // ===== (6) Tóm tắt (FR7) =====

        ed.WriteMessage(
            $"\n[XBoss] Đã nhận {soNhan} tuyến thành {he.Id}/{tuyen.ItemId} {ts.Size}" +
            $"{(doDoc is null ? "" : $" i={doDoc}")} trên layer {tuyen.Layer} " +
            "(hình học tim giữ nguyên từng tọa độ đỉnh).\n");
        if (soChuyenKieu > 0)
        {
            ed.WriteMessage(
                $"[XBoss] {soChuyenKieu} đối tượng LINE đã chuyển thành polyline 2 đỉnh cùng tọa độ " +
                "(mọi lệnh XBoss sau đều giả định tim là polyline).\n");
        }
        ed.WriteMessage(
            soBienMoi > 0 || soBienXoa > 0
                ? $"[XBoss] Nét biên: sinh {soBienMoi}" +
                  $"{(soBienXoa > 0 ? $", xóa {soBienXoa} nét biên của lần nhận trước" : "")} " +
                  $"trên layer {tenLayerBien} (không tính khối lượng).\n"
                : "[XBoss] Loại tuyến này không sinh nét biên — chỉ tim.\n");
        if (tomTat.TongBoQua > 0)
            ed.WriteMessage($"[XBoss] Bỏ qua {tomTat.TongBoQua} đối tượng (lý do in ở trên).\n");
        if (soGoDauBoc > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ Đã gỡ đánh dấu bóc của {soGoDauBoc} tuyến — CHẠY LẠI XBOSS_BOCKL " +
                "(khối lượng cũ đã sai vì hệ/cỡ vừa khai lại).\n");
        }
        if (soChiaDotXoa > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ Đã xóa {soChiaDotXoa} vạch/tag chia đốt của các tuyến nhận lại — CHẠY LẠI " +
                "XBOSS_VE_CHIADOT (chiều dài đốt và kiểu nối phụ thuộc cỡ tuyến).\n");
        }
        if (soCoNhan > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {soCoNhan} nhãn đang gắn với các tuyến nhận lại KHÔNG tự cập nhật nội dung — " +
                "đổi cỡ tuyến đã nhận thì dùng XBOSS_VE_DOI.\n");
        }
        if (ts.SizeTuNhap)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ Cỡ \"{ts.Size}\" ngoài danh mục rule pack {pack.RulePack.Version} — XData đánh dấu " +
                "\"custom\", soát lại trước khi bóc khối lượng.\n");
        }
        foreach (var c in canhBao) ed.WriteMessage($"[XBoss] ⚠ {c}\n");
        ed.WriteMessage(
            "[XBoss] Các tuyến này nay dùng được mọi lệnh XBoss (phụ kiện, nhãn, chia đốt, giá đỡ, bóc " +
            "khối lượng) · Hoàn tác cả lệnh: UNDO 1 lần.\n");
    }

    // ===== Thu tham số: hộp thoại (mặc định) hoặc dòng lệnh (M106 FR9 / M107 AC7) =====

    /// <summary>
    /// Hệ/loại tuyến/size/độ dốc cho lần nhận này. Thử hộp thoại trước; UI không dựng được hoặc bị
    /// tắt bằng <c>XBOSS_UI_DIALOG=0</c> thì rơi về chuỗi hỏi đáp dòng lệnh cho ĐÚNG cùng bộ tham
    /// số (AC7). Hủy ở hộp thoại = dừng lệnh, KHÔNG hỏi lại bằng dòng lệnh.
    /// Cả hai đường ghi nhớ lựa chọn vào <see cref="VeContext"/> — một cơ chế nhớ duy nhất.
    /// </summary>
    private static KetQuaNhanTuyen? HoiThamSo(
        Editor ed, DrawToolsPack pack, double toMm, TomTatChonNhanTuyen tomTat)
    {
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new NhanTuyenDialogViewModel(
                pack, toMm, tomTat, VeContext.He?.Id, VeContext.Tuyen?.ItemId, VeContext.Size, VeContext.DoDoc);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi)
        {
            if (kq is null) ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            else GhiNhoPhien(kq);
            return kq;
        }
        return HoiThamSoDongLenh(ed, pack);
    }

    /// <summary>Chuỗi hỏi đáp keyword — giữ đúng thứ tự và cách hỏi của các lệnh vẽ khác.</summary>
    private static KetQuaNhanTuyen? HoiThamSoDongLenh(Editor ed, DrawToolsPack pack)
    {
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

        var chonSize = VeContext.HoiDanhMuc(
            ed, $"Size {tuyen.Name} ({tuyen.SizeKind})", tuyen.Sizes, VeContext.Size, choTuNhap: true);
        if (chonSize is not { } size) return null;

        string? doDoc = null;
        if (tuyen.SlopeRequired)
        {
            var chonDoc = VeContext.HoiDanhMuc(
                ed, $"Độ dốc tuyến {tuyen.Name}", pack.SheetSetup.Slopes, VeContext.DoDoc, choTuNhap: true);
            if (chonDoc is not { } dd) return null;
            doDoc = dd.GiaTri;
        }

        var kq = new KetQuaNhanTuyen(he, tuyen, size.GiaTri, size.TuNhap, doDoc);
        GhiNhoPhien(kq);
        return kq;
    }

    /// <summary>Nhớ lựa chọn cho lần vẽ/nhận sau trong phiên (M100 §6.11 / M106 FR4).</summary>
    private static void GhiNhoPhien(KetQuaNhanTuyen kq)
    {
        VeContext.He = kq.He;
        VeContext.Tuyen = kq.Tuyen;
        VeContext.Size = kq.Size;
        VeContext.SizeTuNhap = kq.SizeTuNhap;
        if (kq.DoDoc is not null) VeContext.DoDoc = kq.DoDoc;
    }

    /// <summary>
    /// Thực thể nằm trên layer PHỤ THUỘC XREF (<c>tên-xref|LAYER</c>)? Bản vẽ chủ không bao giờ có
    /// đối tượng như vậy, nhưng chọn lọt thì mở ForWrite là <c>eInvalidKey</c> kéo rollback cả
    /// lệnh — chặn ở cửa cùng lý do với <see cref="ThuocXref"/>.
    /// </summary>
    private static bool LayerCuaXref(Transaction tr, Entity ent) =>
        tr.GetObject(ent.LayerId, OpenMode.ForRead) is LayerTableRecord ltr && ltr.IsDependent;
}
