using System.Globalization;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Coordination;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Routing;
using XBoss.Cad.Core.Ui.ViewModels;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.PhoiHopCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_PHOIHOP</c> + <c>XBOSS_PHOIHOP_XOA</c> (M116 §6 bước 2–4, FR1/FR2/FR4): phát hiện xung
/// đột giữa các hệ trên bản vẽ combined services rồi ĐỀ XUẤT cách xử lý — kỹ sư quyết.
///
/// <b>GUARDRAIL M116 §2 — ĐỌC TRƯỚC KHI SỬA TỆP NÀY:</b>
/// <list type="number">
/// <item><b>Plugin KHÔNG BAO GIỜ tự sửa tuyến.</b> Lệnh chỉ TẠO/XÓA marker trên layer riêng
/// <see cref="TenLayer"/>; không có một chỗ nào mở tuyến (hay bất kỳ thực thể nào khác) ở chế độ
/// ghi. Bằng chứng kiểm được bằng mắt: mọi <c>OpenMode.ForWrite</c> trong tệp này đều là model
/// space (để thêm marker), bảng layer/thứ tự vẽ, hoặc chính marker vai trò
/// <see cref="VaiTroVe.PhoiHop"/>.</item>
/// <item><b>Idempotent theo id (FR1/AC2):</b> chạy lại đối chiếu id quét được với XData marker cũ —
/// id còn tồn tại thì GIỮ NGUYÊN marker + trạng thái "bỏ qua có lý do", id đã hết thì xóa marker,
/// id mới thì thêm. Không bao giờ có hai marker cho một id.</item>
/// <item><b>Xref CHỈ ĐỌC:</b> tuyến trong xref được đọc để kiểm (FR1) nhưng không bao giờ bị mở
/// ghi; xref thiếu tệp thì liệt kê tên tệp và vẫn kiểm phần có mặt.</item>
/// <item>1 lệnh = <b>1 nhóm UNDO</b>; mọi hỏi đáp nằm NGOÀI transaction ghi.</item>
/// <item><c>coordinationPolicy.enabled = false</c> (mặc định v17) ⇒ dừng ngay ở cửa
/// <see cref="VeContext.CanCoordinationPolicy"/>, không quét, không đụng bản vẽ (AC4).</item>
/// </list>
///
/// Toàn bộ hình học/luật nằm ở Core (<see cref="QuetXungDot"/>, <see cref="DeXuatXuLy"/>,
/// <see cref="XungDotId"/>) và có test trên CI Linux; tệp này chỉ đọc bản vẽ, hỏi kỹ sư và vẽ marker.
/// </summary>
public sealed class PhoiHopCommands
{
    /// <summary>Layer riêng của marker phối hợp (FR2) — không in, xóa sạch bằng XBOSS_PHOIHOP_XOA.</summary>
    internal const string TenLayer = "XBOSS-PHOIHOP";

    /// <summary>Phạm vi một lần quét (M116 §6 bước 2).</summary>
    private enum PhamViPhoiHop
    {
        /// <summary>Cả bản vẽ (kể cả tuyến trong xref).</summary>
        CaBanVe,

        /// <summary>Vùng cửa sổ kỹ sư quét chọn.</summary>
        VungChon,

        /// <summary>Chỉ các tuyến chạy dọc trong hành lang đã khai (M114).</summary>
        TheoHanhLang,
    }

    /// <summary>Một marker phối hợp đang có trên bản vẽ (đọc ở transaction chỉ-đọc).</summary>
    private sealed record MarkerCu(ObjectId Id, string XungDotId, TrangThaiXungDot TrangThai, string LyDo);

    /// <summary>Dữ liệu đọc xong khỏi bản vẽ, trước khi gọi Core.</summary>
    private sealed record DuLieuDoc(
        List<TuyenPhoiHop> Tuyen,
        List<HanhLangDauVao> HanhLang,
        List<MarkerCu> Marker,
        List<string> XrefThieu,
        int SoThieuCaoDo,
        int SoThieuCo);

    // ==========================================================================================
    // XBOSS_PHOIHOP
    // ==========================================================================================

    [CommandMethod("XBOSS_PHOIHOP")]
    public void PhoiHop()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        if (VeContext.CanCoordinationPolicy(ed, pack) is not { } chinhSach) return;
        var db = doc.Database;

        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — cao độ/bề rộng " +
                "trong XData luôn là mm, tọa độ đã quy đổi theo đơn vị này; chuẩn dự án là mm.\n");
        }
        var donViTrenMm = toMm > 0 ? 1 / toMm : 1;

        // ===== (1) Phạm vi quét (NGOÀI transaction) =====

        if (HoiPhamVi(ed) is not { } phamVi) return;
        IReadOnlyList<ObjectId> idChon = [];
        if (phamVi == PhamViPhoiHop.VungChon)
        {
            ed.WriteMessage("\n[XBoss] Quét chọn vùng cần kiểm phối hợp (chọn cả khối chèn xref cũng được).\n");
            var chon = ed.GetSelection();
            if (chon.Status != PromptStatus.OK)
            {
                ed.WriteMessage("\n[XBoss] Chưa chọn gì — bản vẽ không thay đổi.\n");
                return;
            }
            idChon = chon.Value.GetObjectIds().ToList();
        }

        // ===== (2) Đọc bản vẽ thành DTO thuần (transaction CHỈ ĐỌC) =====

        DuLieuDoc doc2;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            doc2 = Doc(db, tr, phamVi, idChon);
            tr.Commit();
        }

        foreach (var tep in doc2.XrefThieu)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ Xref KHÔNG nạp được: {tep} — phần tuyến trong tệp đó không được kiểm, " +
                "các phần còn lại vẫn kiểm bình thường.\n");
        }

        var tuyen = doc2.Tuyen;
        if (phamVi == PhamViPhoiHop.TheoHanhLang)
        {
            var truoc = tuyen.Count;
            tuyen = tuyen.Where(t => TrongHanhLang(t, doc2.HanhLang, donViTrenMm)).ToList();
            ed.WriteMessage(
                $"[XBoss] Phạm vi theo hành lang: {tuyen.Count}/{truoc} tuyến chạy dọc trong " +
                $"{doc2.HanhLang.Count} hành lang đã khai.\n");
        }

        if (tuyen.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Không có tuyến nào mang dữ liệu XBoss trong phạm vi — chưa kiểm được phối hợp.\n" +
                "[XBoss] Gán hệ/cỡ/cao độ cho tuyến bằng XBOSS_TUYEN_GAN, rồi dựng đồ thị bằng " +
                "XBOSS_TUYEN_DOTHI trước khi chạy lại lệnh này.\n");
            return;
        }

        ed.WriteMessage(
            $"[XBoss] Đọc được {tuyen.Count} tuyến ({tuyen.Count(t => t.Nguon.Length > 0)} tuyến từ xref) " +
            $"và {doc2.HanhLang.Count} hành lang trong phạm vi.\n");
        if (doc2.SoThieuCaoDo > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {doc2.SoThieuCaoDo} tuyến thiếu cao độ/bề cao — chỉ kiểm được giao cắt trên " +
                "MẶT BẰNG (M116 §11), plugin không đoán cao độ hộ.\n");
        }
        if (doc2.SoThieuCo > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {doc2.SoThieuCo} tuyến không đọc được cỡ nên bề rộng/bề cao = 0 — lớp tranh " +
                "chấp hành lang và khoảng cách quy phạm sẽ thiếu các tuyến đó.\n");
        }

        // ===== (3) Quét 3 lớp kiểm (Core thuần — chưa đụng bản vẽ) =====

        var xungDot = QuetXungDot.Quet(
            tuyen,
            chinhSach,
            chinhSach.HangUuTien(pack.DrawTools.CrossingPolicy),
            donViTrenMm,
            doc2.HanhLang);

        // ===== (4) Đối chiếu với marker cũ — idempotent theo id (FR1/AC2) =====

        var markerTheoId = new Dictionary<string, MarkerCu>(StringComparer.Ordinal);
        foreach (var m in doc2.Marker) markerTheoId.TryAdd(m.XungDotId, m);

        var dong = xungDot
            .Select(x => markerTheoId.TryGetValue(x.Id, out var cu)
                ? new DongXungDot(x, cu.TrangThai, cu.LyDo, daCoMarker: true)
                : new DongXungDot(x))
            .ToList();

        // Marker của xung đột KHÔNG CÒN tồn tại: chỉ dọn khi quét CẢ BẢN VẼ — quét một vùng nhỏ mà
        // xóa marker của cả bản vẽ là làm mất kết quả phối hợp của các khu khác.
        var idConLai = xungDot.Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
        var markerHet = phamVi == PhamViPhoiHop.CaBanVe
            ? doc2.Marker.Where(m => !idConLai.Contains(m.XungDotId)).ToList()
            : [];

        if (dong.Count == 0 && markerHet.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Không phát hiện xung đột nào trong phạm vi — bản vẽ không thay đổi.\n");
            return;
        }

        // ===== (5) Kỹ sư đánh dấu: hộp thoại (mặc định) hoặc dòng lệnh (M106 FR9) =====

        var banKinh = BanKinhMarker(db);
        var daDanhDau = Duyet(ed, dong, chinhSach, banKinh);
        if (daDanhDau is null) return;

        // ===== (6) Ghi marker: MỘT transaction = MỘT nhóm UNDO =====

        var soThem = 0;
        var soCapNhat = 0;
        var soXoa = 0;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeXDataStore.DangKyApp(db, tr);
                VeLayerService.DamBaoLayer(
                    db, tr, TenLayer, pack.RulePack.Takeoff.MarkColorAci, pack.RulePack.LineweightMap,
                    out var vuaTao);
                VeLayerService.MoKhoaNeuCo(db, tr, TenLayer);
                if (vuaTao) KhongIn(db, tr);

                var ms = (BlockTableRecord)tr.GetObject(
                    SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);

                // (a) Dọn marker của xung đột đã hết tồn tại.
                foreach (var m in markerHet)
                {
                    if (tr.GetObject(m.Id, OpenMode.ForWrite) is not Entity ent) continue;
                    ent.Erase();
                    soXoa++;
                }

                // (b) Cập nhật marker đã có / thêm marker cho id mới — không bao giờ tạo trùng.
                var moi = new List<ObjectId>();
                foreach (var d in daDanhDau)
                {
                    var xd = XDataMarker(pack, d);
                    if (markerTheoId.TryGetValue(d.Id, out var cu))
                    {
                        if (tr.GetObject(cu.Id, OpenMode.ForWrite) is not Entity ent) continue;
                        VeXDataStore.Ghi(ent, xd);
                        soCapNhat++;
                        continue;
                    }

                    var vong = new Circle(
                        new Point3d(d.XungDot.ViTri.X, d.XungDot.ViTri.Y, 0), Vector3d.ZAxis, banKinh);
                    VeThucThe.Them(tr, ms, vong, TenLayer);
                    VeXDataStore.Ghi(vong, xd);
                    moi.Add(vong.ObjectId);
                    soThem++;
                }

                // Marker phải nổi TRÊN vùng che của XBOSS_VE_NGATNET, nếu không thì khoanh xong
                // không nhìn thấy ở đúng những chỗ giao chéo — chỗ hay có xung đột nhất.
                VeThucThe.DayLenTrenCung(tr, ms, moi);
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi ghi marker phối hợp — đã rollback, bản vẽ nguyên trạng: {e.Message}\n" +
                    "[XBoss] Nếu layer đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi thử lại.\n");
                return;
            }
        }

        BaoCao(ed, daDanhDau, chinhSach, soThem, soCapNhat, soXoa, phamVi);
    }

    // ==========================================================================================
    // XBOSS_PHOIHOP_XOA (FR2/AC3)
    // ==========================================================================================

    /// <summary>
    /// Gỡ sạch marker phối hợp, trả bản vẽ về đúng trạng thái trước <c>XBOSS_PHOIHOP</c> (AC3):
    /// chỉ xóa thực thể trên layer <see cref="TenLayer"/>, KHÔNG đụng tuyến hay bất cứ thứ gì khác.
    /// CỐ Ý không đòi rule pack — đây là đường lui, phải chạy được cả khi rule pack chưa nạp/hỏng.
    /// </summary>
    [CommandMethod("XBOSS_PHOIHOP_XOA")]
    public void XoaPhoiHop()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        var db = doc.Database;

        List<ObjectId> canXoa;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            canXoa = MarkerTrongBanVe(db, tr).Select(m => m.Id).ToList();
            tr.Commit();
        }
        if (canXoa.Count == 0)
        {
            ed.WriteMessage(
                $"\n[XBoss] Bản vẽ không có marker phối hợp nào trên layer {TenLayer} — không có gì để xóa.\n");
            return;
        }

        var soXoa = 0;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeLayerService.MoKhoaNeuCo(db, tr, TenLayer);
                foreach (var id in canXoa)
                {
                    if (tr.GetObject(id, OpenMode.ForWrite) is not Entity ent) continue;
                    ent.Erase();
                    soXoa++;
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi xóa marker phối hợp — đã rollback, bản vẽ nguyên trạng: {e.Message}\n");
                return;
            }
        }

        ed.WriteMessage(
            $"\n[XBoss] Đã xóa {soXoa} marker phối hợp trên layer {TenLayer}.\n" +
            "[XBoss] Tuyến và mọi đối tượng khác KHÔNG bị đụng tới — trạng thái xử lý xung đột nằm " +
            "trong marker nên cũng mất theo; chạy lại XBOSS_PHOIHOP sẽ quét lại từ đầu. " +
            "Hoàn tác cả lệnh: UNDO 1 lần.\n");
    }

    // ==========================================================================================
    // Đọc bản vẽ (transaction CHỈ ĐỌC)
    // ==========================================================================================

    /// <summary>
    /// Đọc tuyến (bản vẽ chủ + xref), hành lang M114 và marker phối hợp cũ.
    /// <paramref name="idChon"/> chỉ có nghĩa với phạm vi vùng chọn.
    /// </summary>
    private static DuLieuDoc Doc(
        Database db, Transaction tr, PhamViPhoiHop phamVi, IReadOnlyList<ObjectId> idChon)
    {
        var tuyen = new List<TuyenPhoiHop>();
        var hanhLang = new List<HanhLangDauVao>();
        var marker = new List<MarkerCu>();
        var xrefThieu = new List<string>();
        var soThieuCaoDo = 0;
        var soThieuCo = 0;

        // Marker cũ LUÔN quét cả bản vẽ (không phụ thuộc phạm vi): chạy lại trong một vùng nhỏ vẫn
        // phải nhận ra marker cũ của đúng id đó, nếu không thì marker bị nhân đôi (AC2).
        marker.AddRange(MarkerTrongBanVe(db, tr));

        var idQuet = phamVi == PhamViPhoiHop.VungChon
            ? idChon
            : TakeoffScanner.ModelSpaceIds(db, tr).ToList();

        foreach (var id in idQuet)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;

            // Khối chèn xref: đọc XUYÊN vào định nghĩa, CHỈ ĐỌC (FR1).
            if (ThuocXref.KhoiChen(tr, ent))
            {
                if (ent is BlockReference br) DocXref(tr, br, tuyen, xrefThieu, ref soThieuCaoDo, ref soThieuCo);
                continue;
            }

            var xd = VeXDataStore.Doc(ent);
            if (xd is null) continue;

            switch (xd.VaiTro)
            {
                case VaiTroVe.Tim:
                {
                    var dinh = DinhCua(ent);
                    if (dinh.Count < 2) continue;
                    var t = DungTuyen(ent.Handle.ToString(), dinh, xd, "");
                    if (!t.CoCaoDo) soThieuCaoDo++;
                    if (t.BeRongMm <= 0) soThieuCo++;
                    tuyen.Add(t);
                    break;
                }
                case VaiTroVe.HanhLang when ent is Polyline pl:
                {
                    var dinh = VeThucThe.DinhCua(pl).Select(d => d.Diem).ToList();
                    if (pl.Closed && dinh.Count >= 3) dinh.Add(dinh[0]);
                    if (dinh.Count < 2) continue;
                    hanhLang.Add(new HanhLangDauVao(
                        pl.Handle.ToString(), dinh,
                        xd.BeRongMm ?? 0, xd.CotDayDamMm ?? 0, xd.CotTranMm ?? 0, xd.HeChoPhep));
                    break;
                }
            }
        }

        return new DuLieuDoc(tuyen, hanhLang, marker, xrefThieu, soThieuCaoDo, soThieuCo);
    }

    /// <summary>
    /// Tuyến nằm TRONG một xref (FR1). Đọc định nghĩa block xref ở chế độ CHỈ ĐỌC và quy đổi tọa
    /// độ đỉnh về hệ tọa độ bản vẽ chủ bằng <c>BlockReference.BlockTransform</c> — không sửa gì
    /// trong xref, kể cả XData.
    ///
    /// Xref chưa nạp được (tệp thiếu/đường dẫn sai) ⇒ ghi tên tệp vào <paramref name="xrefThieu"/>
    /// rồi đi tiếp: §6 đòi "liệt kê tệp thiếu, vẫn kiểm phần có mặt", không được ném lỗi.
    /// </summary>
    private static void DocXref(
        Transaction tr,
        BlockReference br,
        List<TuyenPhoiHop> tuyen,
        List<string> xrefThieu,
        ref int soThieuCaoDo,
        ref int soThieuCo)
    {
        if (tr.GetObject(br.DynamicBlockTableRecord, OpenMode.ForRead) is not BlockTableRecord btr) return;

        var ten = string.IsNullOrWhiteSpace(btr.PathName) ? btr.Name : btr.PathName;
        if (btr.XrefStatus != XrefStatus.Resolved)
        {
            if (!xrefThieu.Contains(ten, StringComparer.OrdinalIgnoreCase)) xrefThieu.Add(ten);
            return;
        }

        var bien = br.BlockTransform;
        foreach (ObjectId id in btr)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity con) continue;
            if (VeXDataStore.Doc(con) is not { VaiTro: VaiTroVe.Tim } xd) continue;

            var dinh = DinhCua(con)
                .Select(d => new Point3d(d.X, d.Y, 0).TransformBy(bien))
                .Select(p => new Diem2(p.X, p.Y))
                .ToList();
            if (dinh.Count < 2) continue;

            // Handle của đối tượng trong xref chỉ duy nhất TRONG tệp xref — gắn thêm tên xref để id
            // xung đột không đụng nhau giữa hai tệp tham chiếu khác nhau.
            var t = DungTuyen($"{btr.Name}|{con.Handle}", dinh, xd, btr.Name);
            if (!t.CoCaoDo) soThieuCaoDo++;
            if (t.BeRongMm <= 0) soThieuCo++;
            tuyen.Add(t);
        }
    }

    /// <summary>
    /// Dựng DTO Core từ XData M115 + cỡ rule pack. Bề rộng/bề cao lấy từ chuỗi cỡ
    /// (<see cref="DrawSize"/>): ống chữ nhật <c>800x400</c> cho cả hai chiều, ống tròn
    /// <c>DN50</c> thì đường kính dùng cho cả hai. Cách nhiệt cộng thêm 2× chiều dày khi
    /// <see cref="VeXDataInfo.CachNhiet"/> đọc ra được một SỐ mm; chuỗi không phải số (vd tên vật
    /// liệu) thì bỏ qua — M116 §11: thiếu dữ liệu thì không đoán.
    /// </summary>
    private static TuyenPhoiHop DungTuyen(
        string id, IReadOnlyList<Diem2> dinh, VeXDataInfo xd, string nguon)
    {
        var kt = DrawSize.PhanTich(xd.Size);
        var themMm = 2 * (SoMm(xd.CachNhiet) ?? 0);
        var rong = kt is null ? 0 : kt.RongMm + themMm;
        var cao = kt is null ? 0 : (kt.CaoMm ?? kt.RongMm) + themMm;

        // Tọa độ giữ nguyên ĐƠN VỊ BẢN VẼ (hợp đồng TuyenPhoiHop); cao độ/bề rộng luôn là mm — Core
        // tự quy đổi qua tham số donViTrenMm, Adapter không nhân chia thêm lần nữa.
        return new TuyenPhoiHop(id, dinh, xd.HeId, xd.CaoDoMm, cao, rong, xd.Size, nguon);
    }

    /// <summary>
    /// Chiều dày cách nhiệt (mm) đọc từ chuỗi tự do của XData: chỉ nhận dạng <c>25</c> / <c>25mm</c>
    /// / <c>25 mm</c>. Mọi chuỗi khác (tên vật liệu, ghi chú) trả null — CỐ Ý không moi số ra khỏi
    /// chuỗi bất kỳ: "PE 2 lớp" mà hiểu thành 2 mm là đoán bừa, đúng thứ M116 §11 cấm.
    /// </summary>
    private static double? SoMm(string? chuoi)
    {
        if (string.IsNullOrWhiteSpace(chuoi)) return null;
        var s = chuoi.Trim().Replace(" ", "");
        if (s.EndsWith("mm", StringComparison.OrdinalIgnoreCase)) s = s[..^2];
        return double.TryParse(s.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out var v)
               && v > 0
            ? v
            : null;
    }

    /// <summary>Chuỗi đỉnh của một tuyến theo đơn vị bản vẽ (cùng cách đọc của XBOSS_TUYEN_DOTHI).</summary>
    private static List<Diem2> DinhCua(Entity ent) => ent switch
    {
        Polyline pl => VeThucThe.DinhCua(pl).Select(d => d.Diem).ToList(),
        Line line => [new Diem2(line.StartPoint.X, line.StartPoint.Y), new Diem2(line.EndPoint.X, line.EndPoint.Y)],
        _ => [],
    };

    /// <summary>Mọi marker phối hợp đang có trong model space (theo XData vai trò, không theo tên layer).</summary>
    private static List<MarkerCu> MarkerTrongBanVe(Database db, Transaction tr)
    {
        var ra = new List<MarkerCu>();
        foreach (var id in TakeoffScanner.ModelSpaceIds(db, tr))
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            if (VeXDataStore.Doc(ent) is not { VaiTro: VaiTroVe.PhoiHop } xd) continue;
            if (xd.XungDotId is not { Length: > 0 } xungDotId) continue;
            ra.Add(new MarkerCu(
                id, xungDotId, MaTrangThaiXungDot.Doc(xd.TrangThaiXungDot), xd.LyDoXungDot ?? ""));
        }
        return ra;
    }

    /// <summary>XData ghi lên marker: id xung đột + trạng thái xử lý + lý do bỏ qua (FR2/FR4).</summary>
    private static VeXDataInfo XDataMarker(DrawToolsPack pack, DongXungDot d) => new()
    {
        VaiTro = VaiTroVe.PhoiHop,
        RulePackVersion = pack.RulePack.Version,
        HeId = d.XungDot.HeLienQuan.Count > 0 ? d.XungDot.HeLienQuan[0] : "",
        XungDotId = d.Id,
        TrangThaiXungDot = MaTrangThaiXungDot.Ma(d.TrangThai),
        // XData là chuỗi ASCII giới hạn 255 ký tự/dòng — cắt bớt lý do quá dài thay vì để AutoCAD
        // từ chối cả ResultBuffer giữa transaction ghi.
        LyDoXungDot = d.TrangThai == TrangThaiXungDot.BoQua && d.LyDo.Length > 0
            ? (d.LyDo.Length > 200 ? d.LyDo[..200] : d.LyDo)
            : null,
    };

    /// <summary>Layer marker không bao giờ được in (cùng quy ước layer marker của XBOSS_KIEMTRA).</summary>
    private static void KhongIn(Database db, Transaction tr)
    {
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        if (!lt.Has(TenLayer)) return;
        if (tr.GetObject(lt[TenLayer], OpenMode.ForWrite) is LayerTableRecord ltr) ltr.IsPlottable = false;
    }

    /// <summary>Bán kính marker ~1% khổ hình — cùng cách tính của marker XBOSS_KIEMTRA.</summary>
    private static double BanKinhMarker(Database db)
    {
        var kho = Math.Max(db.Extmax.X - db.Extmin.X, db.Extmax.Y - db.Extmin.Y);
        return kho > 0 && !double.IsInfinity(kho) ? kho / 100.0 : 100.0;
    }

    /// <summary>
    /// Tuyến có chạy dọc trong hành lang nào không — dùng lại phép "nằm trong dải song song"
    /// (<see cref="Segment2D.ChongLanSongSong"/>) mà chính lớp kiểm 2 của Core dùng, để phạm vi
    /// "theo hành lang" và lớp kiểm hành lang không nói hai kiểu về cùng một tuyến.
    /// </summary>
    private static bool TrongHanhLang(
        TuyenPhoiHop t, IReadOnlyList<HanhLangDauVao> hanhLang, double donViTrenMm)
    {
        foreach (var hl in hanhLang.Where(h => h.Dinh.Count >= 2 && h.BeRongMm > 0))
        {
            var nuaDai = hl.BeRongMm / 2 * donViTrenMm;
            for (var h = 0; h + 1 < hl.Dinh.Count; h++)
            {
                for (var d = 0; d + 1 < t.Dinh.Count; d++)
                {
                    var chong = Segment2D.ChongLanSongSong(
                        (hl.Dinh[h].X, hl.Dinh[h].Y), (hl.Dinh[h + 1].X, hl.Dinh[h + 1].Y),
                        (t.Dinh[d].X, t.Dinh[d].Y), (t.Dinh[d + 1].X, t.Dinh[d + 1].Y),
                        nuaDai);
                    if (chong > 0) return true;
                }
            }
        }
        return false;
    }

    // ==========================================================================================
    // Hỏi đáp (NGOÀI transaction)
    // ==========================================================================================

    private static PhamViPhoiHop? HoiPhamVi(Editor ed)
    {
        ed.WriteMessage(
            "\n[XBoss] Phạm vi kiểm phối hợp:\n" +
            "[XBoss]   CABANVE  = cả bản vẽ (kể cả tuyến trong xref các hệ khác)\n" +
            "[XBoss]   VUNGCHON = chỉ vùng cửa sổ bạn quét chọn\n" +
            "[XBoss]   HANHLANG = chỉ tuyến chạy dọc trong hành lang đã khai (XBOSS_VE_HANHLANG)\n");
        var hoi = new PromptKeywordOptions("\n[XBoss] Chọn phạm vi") { AllowNone = false };
        hoi.Keywords.Add("CABANVE", "CABANVE", "CABANVE");
        hoi.Keywords.Add("VUNGCHON", "VUNGCHON", "VUNGCHON");
        hoi.Keywords.Add("HANHLANG", "HANHLANG", "HANHLANG");
        hoi.Keywords.Default = "CABANVE";
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return null;
        return kq.StringResult switch
        {
            "VUNGCHON" => PhamViPhoiHop.VungChon,
            "HANHLANG" => PhamViPhoiHop.TheoHanhLang,
            _ => PhamViPhoiHop.CaBanVe,
        };
    }

    /// <summary>
    /// Cho kỹ sư đánh dấu từng xung đột. Thử hộp thoại trước; UI không dựng được hoặc bị tắt bằng
    /// <c>XBOSS_UI_DIALOG=0</c> thì rơi về dòng lệnh (M106 FR9). Hủy ở hộp thoại = dừng lệnh,
    /// KHÔNG hỏi lại bằng dòng lệnh; null = dừng, bản vẽ không thay đổi.
    /// </summary>
    private static IReadOnlyList<DongXungDot>? Duyet(
        Editor ed, IReadOnlyList<DongXungDot> dong, CoordinationPolicySection chinhSach, double banKinh)
    {
        var cuaSoZoom = Math.Max(banKinh, 1e-6) * 20;
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new PhoiHopDialogViewModel(dong, chinhSach)
            {
                ZoomToi = d => ZoomView.ToiDiem(ed, d.XungDot.ViTri.X, d.XungDot.ViTri.Y, cuaSoZoom),
            };
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi)
        {
            if (kq is null) ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return kq;
        }
        return DuyetDongLenh(ed, dong);
    }

    /// <summary>
    /// Đường dòng lệnh: liệt kê xung đột + đề xuất rồi hỏi CÓ/KHÔNG đánh dấu lên bản vẽ. Không sửa
    /// được từng dòng (không có bảng để bấm) — trạng thái cũ đọc từ marker GIỮ NGUYÊN, đúng AC2.
    /// </summary>
    private static IReadOnlyList<DongXungDot>? DuyetDongLenh(Editor ed, IReadOnlyList<DongXungDot> dong)
    {
        ed.WriteMessage($"\n[XBoss] Xung đột phát hiện được ({dong.Count}):\n");
        foreach (var d in dong)
        {
            ed.WriteMessage($"[XBoss]   {d.Nhan}\n");
            foreach (var dx in d.XungDot.DeXuat) ed.WriteMessage($"[XBoss]     → {dx.MoTa}\n");
        }
        ed.WriteMessage(
            "[XBoss] Đường dòng lệnh không đánh dấu được từng dòng — bật lại hộp thoại " +
            "(XBOSS_UI_DIALOG=1) nếu cần ghi 'chấp nhận' / 'bỏ qua có lý do'.\n");

        var opt = new PromptKeywordOptions("\n[XBoss] Đánh dấu các xung đột trên bản vẽ? ");
        opt.Keywords.Add("Co", "Co", "Co");
        opt.Keywords.Add("Khong", "Khong", "Khong");
        opt.Keywords.Default = "Co";
        var kq = ed.GetKeywords(opt);
        if (kq.Status != PromptStatus.OK || kq.StringResult != "Co")
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return null;
        }
        return dong;
    }

    // ==========================================================================================
    // Báo cáo
    // ==========================================================================================

    private static void BaoCao(
        Editor ed,
        IReadOnlyList<DongXungDot> dong,
        CoordinationPolicySection chinhSach,
        int soThem,
        int soCapNhat,
        int soXoa,
        PhamViPhoiHop phamVi)
    {
        var soCung = dong.Count(d => d.XungDot.Muc == MucXungDot.Cung);
        var soMem = dong.Count(d => d.XungDot.Muc == MucXungDot.Mem);
        var soCanhBao = dong.Count(d => d.XungDot.Muc == MucXungDot.CanhBao);
        var soBoQua = dong.Count(d => d.TrangThai == TrangThaiXungDot.BoQua);
        var soChapNhan = dong.Count(d => d.TrangThai == TrangThaiXungDot.ChapNhan);

        ed.WriteMessage(
            $"\n[XBoss] Phối hợp: {dong.Count} xung đột ({soCung} cứng, {soMem} mềm, {soCanhBao} cảnh báo) — " +
            $"thêm {soThem} marker, cập nhật {soCapNhat}, dọn {soXoa} marker của xung đột đã hết.\n");
        ed.WriteMessage(
            $"[XBoss] Kỹ sư đã đánh dấu: {soChapNhan} chấp nhận (tự sửa tay), {soBoQua} bỏ qua có lý do, " +
            $"còn {dong.Count - soChapNhan - soBoQua} chưa xử lý.\n");
        ed.WriteMessage(
            $"[XBoss] Tham số rule pack: khoảng bảo trì {So(chinhSach.MaintenanceGapMm)} mm · " +
            $"{chinhSach.MinClearancePairsMm.Count} cặp hệ khai khoảng cách tối thiểu · ưu tiên nhường " +
            "lấy từ crossingPolicy.priority.\n");
        if (phamVi != PhamViPhoiHop.CaBanVe)
        {
            ed.WriteMessage(
                "[XBoss] Quét theo phạm vi hẹp nên marker NGOÀI phạm vi được giữ nguyên — chạy lại với " +
                "phạm vi CABANVE để dọn marker của các xung đột đã hết ở nơi khác.\n");
        }
        ed.WriteMessage(
            $"[XBoss] Marker nằm trên layer riêng {TenLayer} (không in). Plugin KHÔNG sửa tuyến: sửa cao " +
            "độ bằng XBOSS_TUYEN_GAN rồi chạy lại XBOSS_HOANTHIEN và XBOSS_PHOIHOP. " +
            "Gỡ sạch marker: XBOSS_PHOIHOP_XOA · Hoàn tác cả lệnh: UNDO 1 lần.\n");
    }

    private static string So(double v) => v.ToString("#,##0.##", CultureInfo.InvariantCulture);
}
