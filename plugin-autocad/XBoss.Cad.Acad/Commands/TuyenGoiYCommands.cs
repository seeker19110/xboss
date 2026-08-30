using System.Globalization;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Routing;
using XBoss.Cad.Core.Schematic;
using XBoss.Cad.Core.Ui.ViewModels;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.TuyenGoiYCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_TUYEN_GOIY</c> — sinh TUYẾN TIM NHÁP từ sơ đồ nguyên lý đã chốt trên web
/// (M117 §6 bước 5, FR6), và <c>XBOSS_TUYEN_GOIY_XOA</c> — dọn sạch nháp đó.
///
/// <para>Chuỗi việc: tải graph <c>da_duyet</c> (API <c>:id/plugin</c>, cache offline như M113) →
/// kỹ sư bấm ĐIỂM NGUỒN trên mặt bằng tầng đang mở → ánh xạ nút thiết bị của graph ↔ block đã đặt
/// trên mặt bằng → routing hành lang tất định M114 → polyline tim NHÁP trên layer
/// <c>XBOSS-GOIY</c> mang sẵn XData hệ/cỡ. Kỹ sư sửa nháp như tuyến vẽ tay rồi đi tiếp bằng
/// <c>XBOSS_TUYEN_DOTHI</c> (M115 bước 3) — từ đó về sau không phân biệt tuyến vẽ tay hay gợi ý.</para>
///
/// <para>Ranh giới cứng:</para>
/// <list type="bullet">
/// <item><b>Không sinh hình học ngoài routing M114.</b> Mọi tọa độ do <see cref="KeHoachDiTuyen"/>
/// tính; lệnh chỉ đổ ra polyline. Chưa có hành lang thì DỪNG SẠCH kèm câu "chạy XBOSS_VE_HANHLANG
/// trước", không tự nối thẳng hai điểm.</item>
/// <item><b>Thiếu ánh xạ không chặn lệnh</b> (M117 §6): nút không tìm được block được LIỆT KÊ, phần
/// tìm được vẫn sinh.</item>
/// <item><b>Idempotent theo id graph</b> (AC5): tuyến nháp mang XData <c>phien = goiy-&lt;id&gt;</c>
/// bị xóa rồi dựng lại; thực thể khác — kể cả nháp của graph khác — không bị đụng. Nháp đã bị kỹ sư
/// sửa hình học thì HỎI trước khi xóa.</item>
/// <item><b>Không đụng sổ chiếm làn hành lang.</b> Nháp chưa phải tuyến thật; ghi chiếm chỗ ở đây sẽ
/// khóa làn cho một thứ có thể bị xóa ngay sau đó. Làn chỉ được cấp thật khi tuyến đi qua
/// <c>XBOSS_VE_TUYENTUDONG</c>/<c>XBOSS_HOANTHIEN</c>.</item>
/// <item><b>Không đẻ khóa XData mới:</b> dùng đúng appname <c>XBOSS_VE</c> và các khóa sẵn có
/// (<c>he</c>/<c>item</c>/<c>size</c>/<c>caodomm</c>/<c>phien</c>/<c>bamhh</c>).</item>
/// <item>1 lệnh = 1 transaction = 1 nhóm UNDO; mọi hỏi đáp/chờ mạng nằm NGOÀI transaction.</item>
/// </list>
/// </summary>
public sealed class TuyenGoiYCommands
{
    /// <summary>Một tuyến NHÁP của lệnh này đang có trong bản vẽ.</summary>
    private sealed record NhapDaDoc(ObjectId Id, string Handle, string Layer, string? MaPhien, bool LechBam);

    /// <summary>Thứ đọc được khỏi bản vẽ trong transaction CHỈ ĐỌC.</summary>
    private sealed record BanVeGoiY(
        List<HanhLangChoTuyen> HanhLang,
        List<BlockMatBang> Block,
        List<NhapDaDoc> Nhap);

    // =============================================================================================
    // XBOSS_TUYEN_GOIY
    // =============================================================================================

    [CommandMethod("XBOSS_TUYEN_GOIY", CommandFlags.Session)]
    public async void SinhTuyenGoiY()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        if (VeContext.CanRoutingPolicy(ed, pack) is not { } chinhSach) return;
        var db = doc.Database;

        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — bán kính rẽ nhánh " +
                "và bề rộng làn khai bằng mm đã quy đổi theo đơn vị này, chuẩn dự án là mm.\n");
        }

        // ===== (1) Sơ đồ nguyên lý (hỏi + chờ mạng — NGOÀI mọi transaction) =====

        if (HoiId(ed, "Mã sơ đồ nguyên lý đã chốt trên web (số)") is not { } idGraph) return;
        ed.WriteMessage($"\n[XBoss] Đang tải sơ đồ nguyên lý #{idGraph}…\n");
        var (ban, nguonGraph, loiTai) = await SchematicStore.TaiAsync(idGraph);
        if (ban is null)
        {
            ed.WriteMessage($"\n[XBoss] {loiTai}\n[XBoss] Bản vẽ không thay đổi.\n");
            return;
        }
        if (nguonGraph == SchematicStore.NguonGraph.Cache)
        {
            ed.WriteMessage(
                "[XBoss] ⚠ Đang dùng BẢN CACHE trên máy (không gọi được máy chủ) — có mạng thì chạy lại " +
                "để chắc chắn dùng bản mới nhất.\n");
        }
        if (!ban.DaDuyet)
        {
            ed.WriteMessage(
                $"\n[XBoss] Sơ đồ #{ban.Id} đang ở trạng thái \"{ban.TrangThai}\" — vào tab Sơ đồ nguyên " +
                "lý trên web, duyệt rồi bấm \"Chốt graph\" trước. Bản vẽ không thay đổi.\n");
            return;
        }
        ed.WriteMessage(
            $"[XBoss] Sơ đồ #{ban.Id} · hệ {ban.SystemId} · {ban.Graph.Nodes.Count} nút / " +
            $"{ban.Graph.Edges.Count} cạnh · chốt lúc {ban.DuyetLuc ?? "?"}.\n");

        // ===== (2) Tham số vẽ + điểm nguồn (dòng lệnh — cùng bộ tham số với XBOSS_VE) =====

        if (HoiThamSo(ed, pack, ban) is not { } ts) return;

        var kqNguon = ed.GetPoint(new PromptPointOptions(
            "\n[XBoss] Bấm ĐIỂM NGUỒN trên mặt bằng (điểm mọi nhánh đấu về): "));
        if (kqNguon.Status != PromptStatus.OK)
        {
            ed.WriteMessage("\n[XBoss] Chưa có điểm nguồn — bản vẽ không thay đổi.\n");
            return;
        }
        var diem = kqNguon.Value.TransformBy(ed.CurrentUserCoordinateSystem);
        var nguon = new Diem2(diem.X, diem.Y);

        // ===== (3) Đọc bản vẽ (transaction CHỈ ĐỌC) =====

        BanVeGoiY daDoc;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            daDoc = DocBanVe(db, tr);
            tr.Commit();
        }
        ed.WriteMessage(
            $"[XBoss] Đọc được {daDoc.HanhLang.Count} hành lang, {daDoc.Block.Count} block thiết bị, " +
            $"{daDoc.Nhap.Count} tuyến nháp gợi ý đã có.\n");

        // ===== (4) Lập kế hoạch (THUẦN — Core) rồi xem trước =====

        var kt = DrawSize.PhanTich(ts.Size);
        if (kt is null)
        {
            ed.WriteMessage(
                $"\n[XBoss] Không đọc được kích thước từ cỡ \"{ts.Size}\" nên không cấp được làn trong " +
                "hành lang — dùng đúng định dạng rule pack (300x200 hoặc DN50). Bản vẽ không thay đổi.\n");
            return;
        }

        var keHoach = KeHoachGoiY.Lap(
            ban,
            daDoc.Block,
            daDoc.HanhLang,
            daDoc.Nhap.Select(n => new NhapCuGoiY(n.Handle, n.MaPhien, n.LechBam)).ToList(),
            chinhSach,
            nguon,
            chinhSach.SnapRadiusMm / (toMm > 0 ? toMm : 1),
            new ThamSoDinhTuyen(
                chinhSach.Cost.ElbowMm / (toMm > 0 ? toMm : 1),
                chinhSach.Cost.CongestionMm / 1000,
                chinhSach.Cost.ReuseFactor),
            kt.RongMm,
            kt.CaoMm ?? kt.RongMm);

        InAnhXa(ed, keHoach);
        if (keHoach.LoiChan is { } chan)
        {
            ed.WriteMessage($"\n[XBoss] ✘ {chan}\n[XBoss] Bản vẽ không thay đổi.\n");
            return;
        }
        if (keHoach.Nhanh.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Không lập được nhánh nào — xem lý do ở trên. Bản vẽ không thay đổi.\n");
            return;
        }

        ed.WriteMessage(
            $"\n[XBoss] ===== XEM TRƯỚC TUYẾN NHÁP =====\n" +
            $"[XBoss] {keHoach.Nhanh.Count} polyline nháp trên layer {KeHoachGoiY.LayerNhap} · " +
            $"nối {keHoach.KeHoach.SoNoiDuoc}/{keHoach.KeHoach.SoThietBiDich} thiết bị ánh xạ được · " +
            $"tổng dài {So(keHoach.KeHoach.TongChieuDai)} đơn vị bản vẽ · {keHoach.KeHoach.SoCo} co.\n");
        foreach (var k in keHoach.KeHoach.KhongGiai)
            ed.WriteMessage($"[XBoss]   ✘ {k.ThietBi}: {k.LyDo}\n");
        if (keHoach.XoaHandle.Count > 0)
        {
            ed.WriteMessage(
                $"[XBoss] Chạy lại: {keHoach.XoaHandle.Count} tuyến nháp cũ của sơ đồ #{ban.Id} sẽ bị XÓA " +
                "rồi dựng lại (không nhân đôi).\n");
        }
        if (keHoach.HandleDaSuaTay.Count > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {keHoach.HandleDaSuaTay.Count} tuyến nháp trong số đó ĐÃ BỊ SỬA HÌNH HỌC " +
                $"(handle {string.Join(", ", keHoach.HandleDaSuaTay.Take(8))}) — sinh lại là mất phần sửa đó.\n");
            if (!XacNhan(ed, "Vẫn xóa nháp đã sửa tay và sinh lại?"))
            {
                ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
                return;
            }
        }
        if (!XacNhan(ed, "Sinh tuyến nháp đúng bảng trên?"))
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return;
        }

        // ===== (5) Ghi: MỘT transaction = MỘT nhóm UNDO =====

        var soXoa = 0;
        var soMoi = 0;
        var theoHandle = daDoc.Nhap.ToDictionary(n => n.Handle, n => n, StringComparer.Ordinal);
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeXDataStore.DangKyApp(db, tr);
                VeLayerService.DamBaoLayer(
                    db, tr, KeHoachGoiY.LayerNhap, VeLayerStyle.AciTimTran, pack.RulePack.LineweightMap, out _);
                foreach (var ten in keHoach.XoaHandle
                             .Select(h => theoHandle.TryGetValue(h, out var n) ? n.Layer : KeHoachGoiY.LayerNhap)
                             .Append(KeHoachGoiY.LayerNhap)
                             .Distinct(StringComparer.OrdinalIgnoreCase)
                             .ToList())
                {
                    VeLayerService.MoKhoaNeuCo(db, tr, ten);
                }

                var ms = (BlockTableRecord)tr.GetObject(
                    SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);

                // (a) Xóa đúng nháp CŨ CỦA SƠ ĐỒ NÀY (AC5).
                foreach (var h in keHoach.XoaHandle)
                {
                    if (!theoHandle.TryGetValue(h, out var cu)) continue;
                    if (tr.GetObject(cu.Id, OpenMode.ForWrite) is not Entity ent) continue;
                    ent.Erase();
                    soXoa++;
                }

                // (b) Sinh nháp mới — chỉ TIM, không nét biên (nháp chưa phải bản vẽ thi công).
                foreach (var nhanh in keHoach.Nhanh)
                {
                    var dinh = nhanh.Diem.Select(d => new DinhPolyline(d.X, d.Y, 0)).ToList();
                    var tim = VeThucThe.TaoPolyline(dinh, kin: false);
                    VeThucThe.Them(tr, ms, tim, KeHoachGoiY.LayerNhap);
                    VeXDataStore.Ghi(tim, new VeXDataInfo
                    {
                        VaiTro = VaiTroVe.Tim,
                        HeId = ts.He.Id,
                        ItemId = ts.Tuyen.ItemId,
                        // Cỡ điền sẵn TỪ GRAPH khi sơ đồ có ghi; không có thì dùng cỡ kỹ sư khai.
                        Size = nhanh.Size ?? ts.Size,
                        RulePackVersion = pack.RulePack.Version,
                        SizeTuNhap = nhanh.Size is null && ts.SizeTuNhap,
                        CaoDoMm = ts.CaoDoMm,
                        PhienTuyen = keHoach.MaPhien,
                        BamHinhHoc = RevisionSnapshot.BamHinhHoc(nhanh.Diem),
                    });
                    soMoi++;
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi sinh tuyến nháp — đã rollback, bản vẽ nguyên trạng: {e.Message}\n" +
                    "[XBoss] Nếu layer đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi thử lại.\n");
                return;
            }
        }

        // ===== (6) Báo cáo =====

        ed.WriteMessage(
            $"\n[XBoss] Đã sinh {soMoi} tuyến tim NHÁP của sơ đồ #{ban.Id} (hệ {ts.He.Id}, " +
            $"{ts.Tuyen.Name}) trên layer {KeHoachGoiY.LayerNhap}" +
            (soXoa > 0 ? $"; xóa {soXoa} nháp cũ của chính sơ đồ này" : "") + ".\n");
        if (keHoach.AnhXa.Thieu.Count > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {keHoach.AnhXa.Thieu.Count} thiết bị của sơ đồ KHÔNG có block tương ứng trên " +
                "mặt bằng — phần còn lại vẫn đã sinh (danh sách ở trên).\n");
        }
        ed.WriteMessage(
            "[XBoss] Nháp là polyline tim bình thường: sửa/kéo thoải mái, rồi chạy XBOSS_TUYEN_GAN (bổ " +
            "sung cao độ/kiểu nối) và XBOSS_TUYEN_DOTHI để đi tiếp quy trình hoàn thiện M115.\n" +
            $"[XBoss] Dọn sạch nháp: XBOSS_TUYEN_GOIY_XOA · Hoàn tác cả lệnh: UNDO 1 lần.\n");

        VeContext.NhatKyPhien.Add(
            $"XBOSS_TUYEN_GOIY: sơ đồ #{ban.Id} · hệ {ts.He.Id} · {soMoi} tuyến nháp · {soXoa} nháp cũ " +
            $"dựng lại · {keHoach.AnhXa.Cap.Count}/{keHoach.AnhXa.TongThietBi} thiết bị ánh xạ được · " +
            $"{keHoach.KeHoach.KhongGiai.Count} nhánh không giải được");
    }

    // =============================================================================================
    // XBOSS_TUYEN_GOIY_XOA
    // =============================================================================================

    /// <summary>
    /// Dọn tuyến nháp gợi ý: của MỘT sơ đồ (gõ mã) hoặc của mọi sơ đồ (Enter). Chỉ đụng polyline
    /// mang XData <c>phien = goiy-*</c> — tuyến kỹ sư vẽ tay và tuyến của các lệnh khác không có
    /// dấu này nên không bao giờ bị xóa (cùng khuôn <c>XBOSS_VE_NGATNET_XOA</c>).
    /// </summary>
    [CommandMethod("XBOSS_TUYEN_GOIY_XOA")]
    public void XoaTuyenGoiY()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        var db = doc.Database;

        var kqId = ed.GetString(new PromptStringOptions(
            "\n[XBoss] Xóa nháp của sơ đồ nào? (mã số, Enter = MỌI sơ đồ): ") { AllowSpaces = false });
        if (kqId.Status != PromptStatus.OK && kqId.Status != PromptStatus.None)
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return;
        }
        var nhap = (kqId.StringResult ?? "").Trim();
        long? idGraph = null;
        if (nhap.Length > 0)
        {
            if (!long.TryParse(nhap, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id) || id <= 0)
            {
                ed.WriteMessage("\n[XBoss] Mã sơ đồ phải là số nguyên dương — bản vẽ không thay đổi.\n");
                return;
            }
            idGraph = id;
        }

        List<NhapDaDoc> ungVien;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            ungVien = DocBanVe(db, tr).Nhap;
            tr.Commit();
        }
        if (idGraph is { } chon)
        {
            var ma = BanGoiY.MaPhienCua(chon);
            ungVien = ungVien.Where(n => string.Equals(n.MaPhien, ma, StringComparison.Ordinal)).ToList();
        }
        if (ungVien.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Không có tuyến nháp gợi ý nào khớp — bản vẽ không thay đổi.\n");
            return;
        }

        var soSua = ungVien.Count(n => n.LechBam);
        ed.WriteMessage(
            $"\n[XBoss] Sẽ xóa {ungVien.Count} tuyến nháp" +
            (idGraph is { } g ? $" của sơ đồ #{g}" : " của mọi sơ đồ") +
            (soSua > 0 ? $", trong đó {soSua} tuyến ĐÃ bị sửa hình học" : "") + ".\n");
        if (!XacNhan(ed, "Xóa?"))
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return;
        }

        var soXoa = 0;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                foreach (var ten in ungVien
                             .Select(n => n.Layer)
                             .Distinct(StringComparer.OrdinalIgnoreCase)
                             .ToList())
                {
                    VeLayerService.MoKhoaNeuCo(db, tr, ten);
                }
                foreach (var n in ungVien)
                {
                    if (tr.GetObject(n.Id, OpenMode.ForWrite) is not Entity ent) continue;
                    ent.Erase();
                    soXoa++;
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi xóa nháp — đã rollback, bản vẽ nguyên trạng: {e.Message}\n");
                return;
            }
        }
        ed.WriteMessage($"\n[XBoss] Đã xóa {soXoa} tuyến nháp gợi ý. Hoàn tác: UNDO 1 lần.\n");
    }

    // =============================================================================================
    // Đọc bản vẽ / hỏi đáp
    // =============================================================================================

    private static BanVeGoiY DocBanVe(Database db, Transaction tr)
    {
        var hanhLang = new List<HanhLangChoTuyen>();
        var block = new List<BlockMatBang>();
        var nhap = new List<NhapDaDoc>();

        foreach (var id in TakeoffScanner.ModelSpaceIds(db, tr))
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            if (ThuocXref.KhoiChen(tr, ent) || LayerCuaXref(tr, ent)) continue;
            if (VeXDataStore.Doc(ent) is not { } xd) continue;

            switch (xd.VaiTro)
            {
                case VaiTroVe.HanhLang when ent is Polyline pl:
                {
                    var dinh = VeThucThe.DinhCua(pl).Select(d => d.Diem).ToList();
                    if (pl.Closed && dinh.Count >= 3) dinh.Add(dinh[0]);
                    if (dinh.Count < 2) continue;
                    hanhLang.Add(new HanhLangChoTuyen(
                        new HanhLangDauVao(
                            pl.Handle.ToString(), dinh, xd.BeRongMm ?? 0, xd.CotDayDamMm ?? 0,
                            xd.CotTranMm ?? 0, xd.HeChoPhep),
                        xd.LanDaCap));
                    break;
                }
                case VaiTroVe.ThietBi when ent is BlockReference br:
                {
                    var tag = VeXDataStore.TagCua(tr, br)?.TextString;
                    block.Add(new BlockMatBang(
                        br.Handle.ToString(),
                        string.IsNullOrWhiteSpace(tag) ? null : tag!.Trim(),
                        TenBlock(tr, br),
                        // Kind của block trên mặt bằng không sống trong XData (thư viện mới giữ) —
                        // ánh xạ vì thế chạy bằng tag/tên block, không đoán kind.
                        null,
                        xd.HeId,
                        new Diem2(br.Position.X, br.Position.Y)));
                    break;
                }
                case VaiTroVe.Tim when ent is Polyline pl && BanGoiY.IdTuMaPhien(xd.PhienTuyen) is not null:
                {
                    var dinh = VeThucThe.DinhCua(pl).Select(d => d.Diem).ToList();
                    var lech = xd.BamHinhHoc is { Length: > 0 } bam &&
                               !string.Equals(bam, RevisionSnapshot.BamHinhHoc(dinh), StringComparison.Ordinal);
                    nhap.Add(new NhapDaDoc(id, pl.Handle.ToString(), pl.Layer, xd.PhienTuyen, lech));
                    break;
                }
            }
        }
        return new BanVeGoiY(hanhLang, block, nhap);
    }

    /// <summary>
    /// Tên ĐỊNH NGHĨA GỐC của khối: khối dynamic có tên bản ghi ẩn (<c>*U12</c>) nên luôn đi qua
    /// <c>DynamicBlockTableRecord</c> — với khối thường nó chính là bản ghi định nghĩa (cùng cách
    /// <c>TakeoffScanner</c> và <c>BlockUngVienBuilder</c> làm).
    /// </summary>
    private static string? TenBlock(Transaction tr, BlockReference br) =>
        tr.GetObject(br.DynamicBlockTableRecord, OpenMode.ForRead) is BlockTableRecord btr ? btr.Name : null;

    /// <summary>Hệ/loại tuyến/cỡ/cao độ cho lần sinh nháp này (đường dòng lệnh — M106 FR9).</summary>
    private static KetQuaTuyenGan? HoiThamSo(Editor ed, DrawToolsPack pack, BanGoiY ban)
    {
        // Hệ của sơ đồ là GỢI Ý mặc định; vẫn hỏi để kỹ sư xác nhận (schematic và mặt bằng có thể
        // khai hệ bằng id khác nhau giữa hai rule pack).
        if (pack.DrawTools.Systems.Any(s => string.Equals(s.Id, ban.SystemId, StringComparison.Ordinal)))
        {
            ed.WriteMessage($"\n[XBoss] Sơ đồ khai hệ \"{ban.SystemId}\" — gợi ý chọn hệ này.\n");
            VeContext.He = pack.DrawTools.Systems.First(
                s => string.Equals(s.Id, ban.SystemId, StringComparison.Ordinal));
        }
        else
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Hệ \"{ban.SystemId}\" của sơ đồ không có trong rule pack {pack.RulePack.Version} " +
                "— chọn hệ tương ứng bên dưới; ánh xạ thiết bị chạy theo hệ của SƠ ĐỒ.\n");
        }

        var he = VeContext.HoiHe(ed, pack, batBuocHoiLai: true);
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
            ed, $"Cỡ mặc định {tuyen.Name} ({tuyen.SizeKind}) — dùng khi sơ đồ không ghi cỡ",
            tuyen.Sizes, VeContext.Size, choTuNhap: true);
        if (chonSize is not { } size) return null;

        if (HoiSo(ed, "Cao độ tim tuyến của tầng đang vẽ (mm)", VeContext.TuyenGanCaoDoMm) is not { } caoDo)
            return null;

        var kq = new KetQuaTuyenGan(he, tuyen, size.GiaTri, size.TuNhap, caoDo, null, null, null);
        VeContext.He = kq.He;
        VeContext.Tuyen = kq.Tuyen;
        VeContext.Size = kq.Size;
        VeContext.SizeTuNhap = kq.SizeTuNhap;
        VeContext.TuyenGanCaoDoMm = kq.CaoDoMm;
        return kq;
    }

    private static void InAnhXa(Editor ed, KetQuaGoiY keHoach)
    {
        var ax = keHoach.AnhXa;
        ed.WriteMessage(
            $"[XBoss] Ánh xạ thiết bị: {ax.Cap.Count}/{ax.TongThietBi} nút tìm được block trên mặt bằng.\n");
        foreach (var c in ax.Cap.Take(20))
            ed.WriteMessage($"[XBoss]   ✔ {c.Nut.Nhan} → handle {c.Block.Handle} ({c.CachKhop})\n");
        if (ax.Cap.Count > 20) ed.WriteMessage($"[XBoss]   … và {ax.Cap.Count - 20} nút nữa\n");
        foreach (var t in ax.Thieu)
            ed.WriteMessage($"[XBoss]   ✘ {t.Nut.Nhan}: {t.LyDo}\n");
    }

    /// <summary>Một mã số nguyên dương; null = kỹ sư hủy hoặc gõ sai.</summary>
    private static long? HoiId(Editor ed, string nhan)
    {
        var kq = ed.GetString(new PromptStringOptions($"\n[XBoss] {nhan}: ") { AllowSpaces = false });
        if (kq.Status != PromptStatus.OK)
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return null;
        }
        var nhap = kq.StringResult.Trim();
        if (long.TryParse(nhap, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id) && id > 0)
            return id;
        ed.WriteMessage(
            "\n[XBoss] Mã sơ đồ phải là số nguyên dương — xem cột \"Mã\" ở tab Sơ đồ nguyên lý trên web.\n");
        return null;
    }

    /// <summary>Hỏi một số thực (ESC = hủy); Enter giữ giá trị lần trước nếu có.</summary>
    private static double? HoiSo(Editor ed, string nhan, double? macDinh)
    {
        while (true)
        {
            var goiY = macDinh is { } m ? $" <{So(m)}>" : "";
            var kq = ed.GetString(
                new PromptStringOptions($"\n[XBoss] {nhan}{goiY}: ") { AllowSpaces = false });
            if (kq.Status != PromptStatus.OK) return null;
            var nhap = kq.StringResult.Trim();
            if (nhap.Length == 0)
            {
                if (macDinh is { } giu) return giu;
                ed.WriteMessage("\n[XBoss] Bắt buộc nhập — bản vẽ 2D không chứa cao độ, lệnh không suy hộ.\n");
                continue;
            }
            if (double.TryParse(nhap, NumberStyles.Float, CultureInfo.InvariantCulture, out var v)) return v;
            ed.WriteMessage("\n[XBoss] Không phải số — nhập số, dùng dấu chấm thập phân.\n");
        }
    }

    /// <summary>Xác nhận CÓ/KHÔNG, mặc định KHÔNG (thao tác ghi phải do người chủ động gật).</summary>
    private static bool XacNhan(Editor ed, string cauHoi)
    {
        var opt = new PromptKeywordOptions($"\n[XBoss] {cauHoi}") { AllowNone = false };
        opt.Keywords.Add("KHONG", "KHONG", "Hủy, không ghi gì");
        opt.Keywords.Add("CO", "CO", "Thực hiện");
        opt.Keywords.Default = "KHONG";
        var kq = ed.GetKeywords(opt);
        return kq.Status == PromptStatus.OK && kq.StringResult == "CO";
    }

    /// <summary>Thực thể nằm trên layer PHỤ THUỘC XREF — chặn ở cửa (cùng lý do các lệnh vẽ khác).</summary>
    private static bool LayerCuaXref(Transaction tr, Entity ent) =>
        tr.GetObject(ent.LayerId, OpenMode.ForRead) is LayerTableRecord ltr && ltr.IsDependent;

    private static string So(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);
}
