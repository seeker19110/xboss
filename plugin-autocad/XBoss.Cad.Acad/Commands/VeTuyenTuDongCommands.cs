using System.Globalization;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Routing;
using XBoss.Cad.Core.Ui.ViewModels;
using XBoss.Cad.Core.Zoning;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeTuyenTuDongCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_TUYENTUDONG</c> — đi tuyến MỘT hệ trong một lượt theo đồ thị hành lang
/// (M114 FR5–FR16). Kỹ sư khai hệ/loại tuyến/cỡ như <c>XBOSS_VE</c>, bấm điểm nguồn, xem bảng đề
/// xuất rồi mới ghi; tuyến sinh ra là polyline tim mang XData <c>XBOSS_VE</c> ĐÚNG cấu trúc lệnh
/// vẽ tay sinh ra, nên <c>_PHUKIEN</c>/<c>_NHAN</c>/<c>_CHIADOT</c>/<c>XBOSS_BOCKL</c> dùng được
/// ngay (guardrail M114 §3.1).
///
/// <para>Bốn ranh giới cứng được ép ngay trong mã dưới đây:</para>
/// <list type="number">
/// <item><b>Không giải được thì nói không giải được</b> (guardrail 3). Thiết bị ngoài
/// <c>snapRadiusMm</c>, hành lang hết làn, không thỏa tự chảy đều vào danh sách kèm lý do đếm
/// được; lệnh KHÔNG nới bán kính, KHÔNG hạ độ dốc, KHÔNG ép hai hệ chung làn — mọi tham số đó chỉ
/// đọc từ rule pack, lệnh không có đường nào sửa chúng.</item>
/// <item><b>Không đè lên công sức của người</b> (guardrail 4). Tuyến tự động bị kỹ sư sửa hình học
/// được nhận ra bằng băm hình học (FR12, cùng cơ chế mốc M110), đánh dấu <c>SuaTay</c> rồi GIỮ
/// NGUYÊN ở mọi lần chạy sau.</item>
/// <item><b>Xem trước bắt buộc</b> (FR10). Nét tạm là ĐỒ HỌA TẠM (<see cref="NetTamXemTruoc"/>) nên
/// hủy giữa chừng là bản vẽ không đổi một thực thể nào (AC11).</item>
/// <item><b>1 lệnh = 1 nhóm UNDO</b> (AC12). Đánh dấu sửa tay + xóa tuyến cũ + ghi sổ chiếm làn +
/// sinh tuyến mới nằm trong ĐÚNG một transaction; lỗi giữa chừng thì <c>Abort</c> nên
/// <c>lanDaCap</c> không bao giờ bẩn (NFR3).</item>
/// </list>
/// </summary>
public sealed class VeTuyenTuDongCommands
{
    /// <summary>Sai số coi hai điểm là trùng khi dò "thiết bị đã có tuyến chưa" (mm).</summary>
    private const double DungSaiThietBiMm = 1;

    /// <summary>Một hành lang đã đọc xong khỏi bản vẽ (transaction CHỈ ĐỌC).</summary>
    private sealed record HanhLangDaDoc(ObjectId Id, string Layer, VeXDataInfo XData);

    /// <summary>Một tuyến TỰ ĐỘNG đang có trong bản vẽ.</summary>
    private sealed record TuyenCuDaDoc(
        ObjectId Id, string Handle, string Layer, VeXDataInfo XData, bool LechBam, bool DaBoc);

    /// <summary>Toàn bộ thứ đọc được khỏi bản vẽ trước khi hỏi kỹ sư (không giữ transaction nào).</summary>
    private sealed record BanVeDaDoc(
        List<HanhLangChoTuyen> HanhLang,
        Dictionary<string, HanhLangDaDoc> ThucTheHanhLang,
        List<ThietBiChoTuyen> ThietBi,
        List<TuyenCuDaDoc> TuyenCu,
        List<RanhGioiVung> VungCam,
        int SoVungCamBoQua);

    /// <summary>Kết quả một lần ghi, để in tóm tắt FR14.</summary>
    private sealed class TongKetTuyen
    {
        internal int SoTuyenMoi { get; set; }
        internal int SoNetBien { get; set; }
        internal int SoXoaTuyenCu { get; set; }
        internal int SoXoaNetBienCu { get; set; }
        internal int SoDanhDauSuaTay { get; set; }
        internal int SoHanhLangGhiSo { get; set; }
        internal int SoTuyenCuDaBoc { get; set; }
        internal List<string> CanhBao { get; } = [];
    }

    [CommandMethod("XBOSS_VE_TUYENTUDONG")]
    public void DiTuyenTuDong()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        if (VeContext.CanRoutingPolicy(ed, pack) is not { } chinhSach) return;
        var db = doc.Database;

        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — bán kính rẽ nhánh, " +
                "bề rộng làn và cao độ khai bằng mm đã quy đổi theo đơn vị này, chuẩn dự án là mm.\n");
        }

        // ===== (1) Hỏi đáp/bấm điểm — NGOÀI mọi transaction (M100 §6.11) =====
        var chonThietBi = ChonThietBi(ed);
        var idVungCam = ChonVungCam(ed);
        if (idVungCam is null) return; // ESC giữa chừng

        var kqNguon = ed.GetPoint(
            new PromptPointOptions("\n[XBoss] Bấm ĐIỂM NGUỒN/trục chính (điểm mọi nhánh đấu về): "));
        if (kqNguon.Status != PromptStatus.OK)
        {
            ed.WriteMessage("\n[XBoss] Chưa có điểm nguồn — bản vẽ không thay đổi.\n");
            return;
        }
        var diemNguon = kqNguon.Value.TransformBy(ed.CurrentUserCoordinateSystem);
        var nguon = new Diem2(diemNguon.X, diemNguon.Y);

        // ===== (2) Đọc bản vẽ (transaction CHỈ ĐỌC) =====
        var appBoc = pack.RulePack.Takeoff.XdataAppName;
        BanVeDaDoc daDoc;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            daDoc = DocBanVe(db, tr, chonThietBi, idVungCam, toMm, appBoc);
            tr.Commit();
        }

        if (daDoc.SoVungCamBoQua > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ Bỏ qua {daDoc.SoVungCamBoQua} ranh giới vùng cấm không dùng được (không phải " +
                "polyline KÍN) — đóng đường bằng PEDIT > Close rồi chạy lại nếu cần.\n");
        }
        if (daDoc.HanhLang.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Bản vẽ chưa có hành lang nào — chạy XBOSS_VE_HANHLANG để vẽ (hoặc NHẬN " +
                "polyline có sẵn) làm hành lang đi ống trước. Bản vẽ không thay đổi.\n");
            return;
        }
        ed.WriteMessage(
            $"[XBoss] Đọc được {daDoc.HanhLang.Count} hành lang, {daDoc.ThietBi.Count} thiết bị, " +
            $"{daDoc.TuyenCu.Count} tuyến tự động đã có.\n");

        // ===== (3) Tham số + XEM TRƯỚC BẮT BUỘC (FR5/FR10) =====
        using var netTam = new NetTamXemTruoc(ed);
        var ts = HoiThamSo(ed, pack, chinhSach, toMm, daDoc, nguon, chonThietBi.Count > 0, netTam);
        if (ts is null)
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi (nét tạm xem trước đã gỡ sạch).\n");
            return;
        }
        netTam.Xoa();

        // ===== (4) Ghi (FR11/FR13, nguyên tử NFR3) =====
        var maPhien = $"{ts.He.Id}-{DateTime.Now.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture)}";
        if (Ghi(doc, ed, db, pack, chinhSach, daDoc, ts, maPhien, toMm) is not { } tongKet) return;

        // ===== (5) Báo cáo (FR14) =====
        BaoCao(ed, ts, tongKet, maPhien);
    }

    // =============================================================================================
    // Hỏi đáp ngoài transaction
    // =============================================================================================

    /// <summary>
    /// Tập thiết bị đích (FR5): quét chọn, hoặc Enter/ESC để dùng MỌI thiết bị của hệ trong bản vẽ.
    /// Chọn trước khi biết hệ (cùng khuôn M107/M109/M111) — hệ được lọc lại ở bước sau.
    /// </summary>
    private static List<ObjectId> ChonThietBi(Editor ed)
    {
        ed.WriteMessage(
            "\n[XBoss] Quét chọn các THIẾT BỊ đích cần nối (Enter/ESC = mọi thiết bị của hệ sẽ chọn ở " +
            "bước sau). Đối tượng không phải thiết bị XBoss tự bỏ qua.\n");
        var chon = ed.GetSelection();
        if (chon.Status != PromptStatus.OK)
        {
            ed.WriteMessage("[XBoss] Không quét chọn — dùng mọi thiết bị của hệ trong bản vẽ.\n");
            return [];
        }
        return [.. chon.Value.GetObjectIds()];
    }

    /// <summary>
    /// Ranh giới VÙNG CẤM (FR7) — cạnh hành lang chạm vào bị loại khỏi đồ thị. Enter ngay = không có
    /// vùng cấm; null = kỹ sư ESC (dừng lệnh). Chỉ thu <see cref="ObjectId"/>: hình học đọc ở
    /// transaction chỉ-đọc sau đó, không hỏi đáp bên trong transaction.
    /// </summary>
    private static List<ObjectId>? ChonVungCam(Editor ed)
    {
        var ra = new List<ObjectId>();
        while (true)
        {
            var opt = new PromptEntityOptions(
                $"\n[XBoss] Chọn polyline KÍN làm vùng cấm thứ {ra.Count + 1} (Enter = không có/xong): ")
            {
                AllowNone = true,
            };
            opt.SetRejectMessage("\n[XBoss] Vùng cấm phải là POLYLINE (LWPOLYLINE) kín.\n");
            opt.AddAllowedClass(typeof(Polyline), false);

            var chon = ed.GetEntity(opt);
            if (chon.Status == PromptStatus.None) return ra;
            if (chon.Status != PromptStatus.OK)
            {
                ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
                return null;
            }
            if (!ra.Contains(chon.ObjectId)) ra.Add(chon.ObjectId);
        }
    }

    // =============================================================================================
    // Đọc bản vẽ
    // =============================================================================================

    private static BanVeDaDoc DocBanVe(
        Database db,
        Transaction tr,
        IReadOnlyList<ObjectId> chonThietBi,
        IReadOnlyList<ObjectId> idVungCam,
        double toMm,
        string appBoc)
    {
        var hanhLang = new List<HanhLangChoTuyen>();
        var thucThe = new Dictionary<string, HanhLangDaDoc>(StringComparer.Ordinal);
        var thietBi = new List<ThietBiChoTuyen>();
        var handleThietBi = new List<string>();
        var tuyenCu = new List<TuyenCuDaDoc>();
        // Tim của MỌI hệ kèm đỉnh — nguồn của phép dò "thiết bị này đã có tuyến chạy tới chưa".
        var timTheoHe = new List<(string HeId, List<Diem2> Dinh)>();
        var trongVungChon = new HashSet<ObjectId>(chonThietBi);

        foreach (var id in TakeoffScanner.ModelSpaceIds(db, tr))
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            if (ThuocXref.KhoiChen(tr, ent) || LayerCuaXref(tr, ent)) continue;
            if (VeXDataStore.Doc(ent) is not { } xd) continue;

            switch (xd.VaiTro)
            {
                case VaiTroVe.HanhLang when ent is Polyline pl:
                {
                    var handle = pl.Handle.ToString();
                    var dinh = VeThucThe.DinhCua(pl).Select(d => d.Diem).ToList();
                    // Hành lang KÍN: nối đỉnh cuối về đỉnh đầu để đồ thị có đủ cạnh vòng.
                    if (pl.Closed && dinh.Count >= 3) dinh.Add(dinh[0]);
                    if (dinh.Count < 2) continue;
                    hanhLang.Add(new HanhLangChoTuyen(
                        new HanhLangDauVao(
                            handle,
                            dinh,
                            xd.BeRongMm ?? 0,
                            xd.CotDayDamMm ?? 0,
                            xd.CotTranMm ?? 0,
                            xd.HeChoPhep),
                        xd.LanDaCap));
                    thucThe[handle] = new HanhLangDaDoc(id, pl.Layer, xd);
                    break;
                }
                case VaiTroVe.ThietBi when ent is BlockReference br:
                {
                    var tag = VeXDataStore.TagCua(tr, br)?.TextString;
                    thietBi.Add(new ThietBiChoTuyen(
                        string.IsNullOrWhiteSpace(tag) ? $"(handle {br.Handle})" : tag!.Trim(),
                        new Diem2(br.Position.X, br.Position.Y),
                        xd.HeId,
                        DaCoTuyen: false,
                        TrongVungChon: trongVungChon.Contains(id)));
                    // Handle đi kèm để tách tên khi tag TRÙNG (xem TachTenTrung ngay dưới) — bản vẽ
                    // thật có tag trùng là chuyện thường (đúng thứ phép kiểm 17 đi tìm).
                    handleThietBi.Add(br.Handle.ToString());
                    break;
                }
                case VaiTroVe.Tim when ent is Polyline pl:
                {
                    var dinh = VeThucThe.DinhCua(pl).Select(d => d.Diem).ToList();
                    timTheoHe.Add((xd.HeId, dinh));
                    if (!xd.TuDong) break;
                    // FR12: băm hình học hiện tại khác băm lúc sinh ⇒ kỹ sư đã sửa tay.
                    var lech = xd.BamHinhHoc is { Length: > 0 } bam &&
                               !string.Equals(bam, RevisionSnapshot.BamHinhHoc(dinh), StringComparison.Ordinal);
                    tuyenCu.Add(new TuyenCuDaDoc(
                        id, pl.Handle.ToString(), pl.Layer, xd, lech,
                        MarkService.ReadMark(pl, appBoc) is not null));
                    break;
                }
            }
        }

        // Vùng cấm: chỉ nhận polyline KÍN (đọc được hình học) — cái khác nêu số lượng, không đoán.
        var vungCam = new List<RanhGioiVung>();
        var boQua = 0;
        foreach (var id in idVungCam)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Polyline pl || !pl.Closed ||
                TakeoffScanner.DoanTuyenCua(pl) is not { Count: > 0 } bien)
            {
                boQua++;
                continue;
            }
            vungCam.Add(new RanhGioiVung($"Vùng cấm {vungCam.Count + 1}", bien));
        }

        // Thiết bị đã có tuyến chạy tới: có tuyến CÙNG HỆ đi qua đúng vị trí thiết bị.
        var dungSai = DungSaiThietBiMm / (toMm > 0 ? toMm : 1);
        for (var i = 0; i < thietBi.Count; i++)
        {
            var tb = thietBi[i];
            var co = timTheoHe.Any(t =>
                string.Equals(t.HeId, tb.HeId, StringComparison.Ordinal) &&
                t.Dinh.Any(d => d.KhoangCach(tb.ViTri) <= dungSai));
            if (co) thietBi[i] = tb with { DaCoTuyen = true };
        }

        TachTenTrung(thietBi, handleThietBi);
        return new BanVeDaDoc(hanhLang, thucThe, thietBi, tuyenCu, vungCam, boQua);
    }

    /// <summary>
    /// Bảo đảm mỗi thiết bị có một TÊN DUY NHẤT trong lượt chạy: tên là khóa nhận diện thiết bị
    /// suốt dây chuyền đi tuyến (điểm rẽ → nhánh → dòng "không giải được"), mà tag trong bản vẽ
    /// thật hoàn toàn có thể trùng nhau — đó chính là thứ phép kiểm 17 của <c>XBOSS_KIEMTRA</c> đi
    /// tìm. Tag trùng thì thêm handle vào tên để kỹ sư vẫn chỉ đúng được vật trên bản vẽ.
    /// </summary>
    private static void TachTenTrung(List<ThietBiChoTuyen> thietBi, IReadOnlyList<string> handle)
    {
        var dem = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var tb in thietBi) dem[tb.Ten] = dem.GetValueOrDefault(tb.Ten) + 1;

        for (var i = 0; i < thietBi.Count; i++)
        {
            if (dem[thietBi[i].Ten] <= 1) continue;
            thietBi[i] = thietBi[i] with { Ten = $"{thietBi[i].Ten} (handle {handle[i]})" };
        }
    }

    /// <summary>
    /// Thực thể nằm trên layer PHỤ THUỘC XREF (<c>tên-xref|LAYER</c>)? Mở ForWrite là
    /// <c>eInvalidKey</c> kéo rollback cả lệnh — chặn ở cửa, cùng lý do với <see cref="ThuocXref"/>.
    /// </summary>
    private static bool LayerCuaXref(Transaction tr, Entity ent) =>
        tr.GetObject(ent.LayerId, OpenMode.ForRead) is LayerTableRecord ltr && ltr.IsDependent;

    // =============================================================================================
    // Tham số + xem trước (FR5/FR10/FR15)
    // =============================================================================================

    /// <summary>
    /// Dựng ViewModel xem trước. Dùng CHUNG cho hộp thoại và đường dòng lệnh — một bộ máy tính toán
    /// duy nhất nên hai đường không thể cho ra hai kết quả khác nhau (FR15).
    /// </summary>
    private static TuyenTuDongDialogViewModel TaoViewModel(
        DrawToolsPack pack,
        RoutingPolicySection chinhSach,
        double toMm,
        BanVeDaDoc daDoc,
        Diem2 nguon,
        bool theoVungChon,
        NetTamXemTruoc netTam) =>
        new(
            pack,
            chinhSach,
            toMm,
            daDoc.HanhLang,
            daDoc.ThietBi,
            daDoc.TuyenCu
                .Select(t => new TuyenTuDongDaCo(t.Handle, t.XData.HeId, t.XData.SuaTay, t.LechBam))
                .ToList(),
            nguon,
            daDoc.VungCam,
            theoVungChon,
            VeContext.He?.Id,
            VeContext.Tuyen?.ItemId,
            VeContext.Size,
            VeContext.DoDoc,
            VeContext.TuChayCaoDoThietBiMm,
            VeContext.TuChayCaoDoXaMm,
            netTam.Ve);

    private static KetQuaTuyenTuDong? HoiThamSo(
        Editor ed,
        DrawToolsPack pack,
        RoutingPolicySection chinhSach,
        double toMm,
        BanVeDaDoc daDoc,
        Diem2 nguon,
        bool theoVungChon,
        NetTamXemTruoc netTam)
    {
        ed.WriteMessage(
            "[XBoss] Tuyến đề xuất hiện bằng NÉT MẢNH TẠM (màu tím) trên bản vẽ — nét tạm không phải " +
            "thực thể, hủy là mất sạch.\n");

        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = TaoViewModel(pack, chinhSach, toMm, daDoc, nguon, theoVungChon, netTam);
            return XBossDialog.Hoi(vm) ? GhiNhoPhien(vm.KetQua()) : null;
        });
        if (daDungUi) return kq;
        return HoiThamSoDongLenh(ed, pack, chinhSach, toMm, daDoc, nguon, theoVungChon, netTam);
    }

    /// <summary>
    /// Đường hỏi đáp dòng lệnh (FR15). Vẫn dựng chính ViewModel của hộp thoại rồi IN bảng xem trước
    /// ra dòng lệnh + hỏi xác nhận — xem trước bắt buộc không có ngoại lệ cho chế độ không UI.
    /// </summary>
    private static KetQuaTuyenTuDong? HoiThamSoDongLenh(
        Editor ed,
        DrawToolsPack pack,
        RoutingPolicySection chinhSach,
        double toMm,
        BanVeDaDoc daDoc,
        Diem2 nguon,
        bool theoVungChon,
        NetTamXemTruoc netTam)
    {
        var vm = TaoViewModel(pack, chinhSach, toMm, daDoc, nguon, theoVungChon, netTam);

        var he = VeContext.HoiHe(ed, pack, batBuocHoiLai: true);
        if (he is null) return null;
        vm.He = vm.CacHe.FirstOrDefault(s => string.Equals(s.Id, he.Id, StringComparison.Ordinal));

        var (tuyen, _) = VeContext.HoiLoaiTuyen(ed, he);
        if (tuyen is null) return null;
        vm.Tuyen = vm.CacLoaiTuyen.FirstOrDefault(l => string.Equals(l.ItemId, tuyen.ItemId, StringComparison.Ordinal));

        var chonSize = VeContext.HoiDanhMuc(
            ed, $"Cỡ {tuyen.Name} ({tuyen.SizeKind})", tuyen.Sizes, vm.Size, choTuNhap: true);
        if (chonSize is not { } size) return null;
        vm.Size = size.GiaTri;

        if (vm.CanDoDoc)
        {
            var chonDoc = VeContext.HoiDanhMuc(
                ed, $"Độ dốc tuyến {tuyen.Name}", pack.SheetSetup.Slopes, vm.DoDoc, choTuNhap: true);
            if (chonDoc is not { } dd) return null;
            vm.DoDoc = dd.GiaTri;

            if (HoiSo(ed, "Cao độ tim tuyến TẠI THIẾT BỊ (mm)", vm.CaoDoThietBi) is not { } cTb) return null;
            vm.CaoDoThietBi = cTb;
            if (HoiSo(ed, "Cao độ tim tuyến TẠI ĐIỂM XẢ (mm)", vm.CaoDoXa) is not { } cXa) return null;
            vm.CaoDoXa = cXa;
        }

        var hoiBoQua = new PromptKeywordOptions(
            "\n[XBoss] Bỏ qua thiết bị ĐÃ có tuyến chạy tới?") { AllowNone = false };
        hoiBoQua.Keywords.Add("CO", "CO", "Bỏ qua (khuyến nghị)");
        hoiBoQua.Keywords.Add("KHONG", "KHONG", "Nối lại cả thiết bị đã có tuyến");
        hoiBoQua.Keywords.Default = "CO";
        var kqBoQua = ed.GetKeywords(hoiBoQua);
        if (kqBoQua.Status != PromptStatus.OK) return null;
        vm.BoQuaThietBiDaCoTuyen = kqBoQua.StringResult == "CO";

        // XEM TRƯỚC — bắt buộc kể cả ở chế độ không UI (FR10/FR15).
        ed.WriteMessage($"\n[XBoss] ===== XEM TRƯỚC ĐI TUYẾN TỰ ĐỘNG =====\n[XBoss] {vm.MoTaPhamVi}\n");
        ed.WriteMessage($"[XBoss] {vm.TomTatXemTruoc}\n");
        foreach (var d in vm.DongCapLan) ed.WriteMessage($"[XBoss]   {d}\n");
        if (vm.DongKhongGiai.Count > 0) ed.WriteMessage("[XBoss] Không giải được:\n");
        foreach (var d in vm.DongKhongGiai) ed.WriteMessage($"[XBoss]   ✘ {d}\n");
        ed.WriteMessage($"[XBoss] {vm.MoTaTuyenCu}\n[XBoss] {vm.GhiChuChinhSach}\n");
        foreach (var c in vm.CanhBao) ed.WriteMessage($"[XBoss] ⚠ {c}\n");
        if (!vm.CoTheOk)
        {
            foreach (var l in vm.LyDoChuaHopLe) ed.WriteMessage($"[XBoss] ✘ {l}\n");
            ed.WriteMessage("[XBoss] Chưa đủ điều kiện đi tuyến — bản vẽ không thay đổi.\n");
            return null;
        }

        var xacNhan = new PromptKeywordOptions("\n[XBoss] Thực hiện đi tuyến?") { AllowNone = false };
        xacNhan.Keywords.Add("KHONG", "KHONG", "Hủy, không ghi gì");
        xacNhan.Keywords.Add("CO", "CO", "Sinh tuyến đúng bảng trên");
        xacNhan.Keywords.Default = "KHONG";
        var kqXacNhan = ed.GetKeywords(xacNhan);
        if (kqXacNhan.Status != PromptStatus.OK || kqXacNhan.StringResult != "CO") return null;
        return GhiNhoPhien(vm.KetQua());
    }

    /// <summary>Một số mm nhập tay (Enter = giữ giá trị mồi sẵn); null = kỹ sư hủy.</summary>
    private static string? HoiSo(Editor ed, string nhan, string macDinh)
    {
        while (true)
        {
            var opt = new PromptStringOptions(
                $"\n[XBoss] {nhan}{(macDinh.Length > 0 ? $" <{macDinh}>" : "")}: ")
            {
                AllowSpaces = false,
            };
            var kq = ed.GetString(opt);
            if (kq.Status != PromptStatus.OK) return null;

            var nhap = kq.StringResult.Trim();
            if (nhap.Length == 0) nhap = macDinh;
            if (double.TryParse(nhap, NumberStyles.Float, CultureInfo.InvariantCulture, out _)) return nhap;
            ed.WriteMessage("\n[XBoss] Giá trị phải là số (mm) — vd 2800.\n");
        }
    }

    /// <summary>Nhớ lựa chọn cho lần chạy sau trong phiên (M100 §6.11 / M106 FR4).</summary>
    private static KetQuaTuyenTuDong? GhiNhoPhien(KetQuaTuyenTuDong? kq)
    {
        if (kq is null) return null;
        VeContext.He = kq.He;
        VeContext.Tuyen = kq.Tuyen;
        VeContext.Size = kq.Size;
        VeContext.SizeTuNhap = kq.SizeTuNhap;
        if (kq.DoDoc is not null) VeContext.DoDoc = kq.DoDoc;
        return kq;
    }

    // =============================================================================================
    // Ghi bản vẽ (FR11/FR12/FR13) — MỘT transaction = MỘT nhóm UNDO (AC12)
    // =============================================================================================

    private static TongKetTuyen? Ghi(
        Document doc,
        Editor ed,
        Database db,
        DrawToolsPack pack,
        RoutingPolicySection chinhSach,
        BanVeDaDoc daDoc,
        KetQuaTuyenTuDong ts,
        string maPhien,
        double toMm)
    {
        var tongKet = new TongKetTuyen();
        var keHoach = ts.KeHoach;
        var layerBien = VeLayerStyle.LayerNetBien(ts.Tuyen.Layer, pack.DrawTools.EdgeLayerSuffix);
        var beRongVe = ts.Tuyen.EdgeStyle == "double" && DrawSize.PhanTich(ts.Size) is { } kt
            ? kt.RongMm / (toMm > 0 ? toMm : 1)
            : (double?)null;
        var cuCuaHe = daDoc.TuyenCu
            .Where(t => string.Equals(t.XData.HeId, ts.He.Id, StringComparison.Ordinal))
            .ToList();

        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeXDataStore.DangKyApp(db, tr);
                VeLayerService.DamBaoLayer(
                    db, tr, ts.Tuyen.Layer, VeLayerStyle.AciChoTim(ts.Tuyen.EdgeStyle),
                    pack.RulePack.LineweightMap, out _);
                if (beRongVe is not null)
                {
                    VeLayerService.DamBaoLayer(
                        db, tr, layerBien, VeLayerStyle.AciNetBien, pack.RulePack.LineweightMap, out _);
                }
                // Sau XBOSS_VE_NEN mọi layer đang khóa: không mở thì AppendEntity/Erase ném lỗi và
                // kéo rollback cả lệnh.
                foreach (var ten in cuCuaHe
                    .Select(t => t.Layer)
                    .Append(ts.Tuyen.Layer)
                    .Append(layerBien)
                    .Append(chinhSach.CorridorLayer)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList())
                {
                    VeLayerService.MoKhoaNeuCo(db, tr, ten);
                }

                var ms = (BlockTableRecord)tr.GetObject(
                    SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);

                // (a) FR12 — đánh dấu tuyến kỹ sư đã sửa tay rồi GIỮ NGUYÊN chúng.
                foreach (var t in cuCuaHe.Where(t => t.LechBam && !t.XData.SuaTay))
                {
                    if (tr.GetObject(t.Id, OpenMode.ForWrite) is not Entity ent) continue;
                    VeXDataStore.Ghi(ent, t.XData with { SuaTay = true });
                    tongKet.SoDanhDauSuaTay++;
                }

                // (b) FR13 — xóa tuyến tự động cũ CHƯA sửa tay (kèm nét biên của chính nó).
                foreach (var t in cuCuaHe.Where(t => !t.LechBam && !t.XData.SuaTay))
                {
                    tongKet.SoXoaNetBienCu += VeThucThe.XoaNetBienCua(db, tr, t.XData.HandleBien, t.Handle);
                    if (tr.GetObject(t.Id, OpenMode.ForWrite) is not Entity ent) continue;
                    ent.Erase();
                    tongKet.SoXoaTuyenCu++;
                    if (t.DaBoc) tongKet.SoTuyenCuDaBoc++;
                }

                // (c) FR9/FR13 — ghi sổ chiếm chỗ mới của từng hành lang (đã gỡ claim cũ của hệ này).
                foreach (var c in keHoach.ChiemCho)
                {
                    if (!daDoc.ThucTheHanhLang.TryGetValue(c.HanhLangId, out var hl)) continue;
                    VeLayerService.MoKhoaNeuCo(db, tr, hl.Layer);
                    if (tr.GetObject(hl.Id, OpenMode.ForWrite) is not Entity ent) continue;
                    VeXDataStore.Ghi(ent, hl.XData with { LanDaCap = c.So });
                    tongKet.SoHanhLangGhiSo++;
                }

                // (d) FR11 — sinh tuyến thật: polyline tim + XData như XBOSS_VE, cộng dấu tự động.
                foreach (var nhanh in keHoach.Nhanh)
                {
                    var dinh = nhanh.Diem.Select(d => new DinhPolyline(d.X, d.Y, 0)).ToList();
                    var tim = VeThucThe.TaoPolyline(dinh, kin: false);
                    VeThucThe.Them(tr, ms, tim, ts.Tuyen.Layer);

                    var handleBien = new List<string>();
                    if (beRongVe is { } w)
                    {
                        var kqBien = EdgeOffset.Tinh(dinh, w, false);
                        if (!kqBien.ThanhCong)
                        {
                            // Luật M100 §18: offset hỏng thì CHỈ giữ tim + nêu tên, không vẽ biên sai.
                            tongKet.CanhBao.Add(
                                $"Nhánh tới {nhanh.ThietBi}: không sinh được nét biên — {kqBien.LyDo} " +
                                "Tim vẫn đúng chuẩn và bóc được.");
                        }
                        else
                        {
                            foreach (var canh in new[] { kqBien.Trai, kqBien.Phai })
                            {
                                var bien = VeThucThe.TaoPolyline(canh, false);
                                VeThucThe.Them(tr, ms, bien, layerBien);
                                VeXDataStore.Ghi(bien, new VeXDataInfo
                                {
                                    VaiTro = VaiTroVe.Bien,
                                    HeId = ts.He.Id,
                                    ItemId = ts.Tuyen.ItemId,
                                    Size = ts.Size,
                                    RulePackVersion = pack.RulePack.Version,
                                    HandleTim = tim.Handle.ToString(),
                                });
                                handleBien.Add(bien.Handle.ToString());
                            }
                            tongKet.SoNetBien += handleBien.Count;
                        }
                    }

                    VeXDataStore.Ghi(tim, new VeXDataInfo
                    {
                        VaiTro = VaiTroVe.Tim,
                        HeId = ts.He.Id,
                        ItemId = ts.Tuyen.ItemId,
                        Size = ts.Size,
                        RulePackVersion = pack.RulePack.Version,
                        SizeTuNhap = ts.SizeTuNhap,
                        DoDoc = ts.DoDoc,
                        HandleBien = handleBien,
                        TuDong = true,
                        PhienTuyen = maPhien,
                        SuaTay = false,
                        BamHinhHoc = RevisionSnapshot.BamHinhHoc(nhanh.Diem),
                    });
                    tongKet.SoTuyenMoi++;
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi đi tuyến — đã rollback: KHÔNG tuyến nào được ghi, sổ chiếm làn của " +
                    $"hành lang nguyên trạng: {e.Message}\n" +
                    "[XBoss] Nếu layer đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi thử lại.\n");
                return null;
            }
            catch (System.Exception e)
            {
                // Bắt rộng CÓ CHỦ ĐÍCH: NFR3 (lanDaCap không bao giờ bẩn) quan trọng hơn việc để lỗi
                // lạ nổi lên; transaction đã Abort nên bản vẽ nguyên trạng, loại lỗi vẫn in ra.
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI không lường trước khi đi tuyến ({e.GetType().Name}: {e.Message}) — " +
                    "đã rollback, bản vẽ nguyên trạng.\n");
                return null;
            }
        }
        return tongKet;
    }

    // =============================================================================================
    // Báo cáo (FR14)
    // =============================================================================================

    private static void BaoCao(Editor ed, KetQuaTuyenTuDong ts, TongKetTuyen tongKet, string maPhien)
    {
        var kh = ts.KeHoach;
        ed.WriteMessage(
            $"\n[XBoss] Đã đi tuyến hệ {ts.He.Id} ({ts.Tuyen.Name} {ts.Size}) — phiên {maPhien}: " +
            $"nối {kh.SoNoiDuoc}/{kh.SoThietBiDich} thiết bị bằng {tongKet.SoTuyenMoi} nhánh trên layer " +
            $"{ts.Tuyen.Layer}.\n");
        ed.WriteMessage(
            $"[XBoss] Tổng dài {kh.TongChieuDai.ToString("#,##0.#", CultureInfo.InvariantCulture)} đơn vị " +
            $"bản vẽ · {kh.SoCo} co · dùng chung " +
            $"{(kh.TiLeDungChung * 100).ToString("0.#", CultureInfo.InvariantCulture)}% số cạnh (đo hiệu " +
            "quả gom trục γ).\n");
        if (tongKet.SoNetBien > 0)
            ed.WriteMessage($"[XBoss] Đã sinh {tongKet.SoNetBien} nét biên (không tính khối lượng).\n");
        if (tongKet.SoHanhLangGhiSo > 0)
        {
            ed.WriteMessage($"[XBoss] Sổ chiếm làn cập nhật ở {tongKet.SoHanhLangGhiSo} hành lang:\n");
            foreach (var c in kh.ChiemCho)
            {
                ed.WriteMessage(c.LanMoi is { } l
                    ? $"[XBoss]   {c.HanhLangId}: {l.TierId} · làn {So(l.LanTuMm)}–{So(l.LanDenMm)}mm · " +
                      $"cao độ {So(l.CaoDoMm)}mm\n"
                    : $"[XBoss]   {c.HanhLangId}: đã gỡ chiếm chỗ cũ của hệ này\n");
            }
        }
        if (tongKet.SoXoaTuyenCu > 0)
        {
            ed.WriteMessage(
                $"[XBoss] Chạy lại: đã xóa {tongKet.SoXoaTuyenCu} tuyến tự động cũ " +
                $"(+{tongKet.SoXoaNetBienCu} nét biên) trước khi dựng lại.\n");
        }
        if (tongKet.SoTuyenCuDaBoc > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {tongKet.SoTuyenCuDaBoc} tuyến bị dựng lại TỪNG được XBOSS_BOCKL bóc — " +
                "chạy lại XBOSS_BOCKL cho hệ này để khối lượng khớp bản vẽ.\n");
        }
        if (tongKet.SoDanhDauSuaTay > 0)
        {
            ed.WriteMessage(
                $"[XBoss] {tongKet.SoDanhDauSuaTay} tuyến vừa được đánh dấu SỬA TAY (hình học lệch so với " +
                "lúc sinh) — từ nay mọi lần chạy lại đều giữ nguyên chúng.\n");
        }
        var boQua = kh.KhongGiai.Count;
        if (boQua > 0)
        {
            ed.WriteMessage($"[XBoss] ✘ {boQua} thiết bị KHÔNG giải được:\n");
            foreach (var k in kh.KhongGiai) ed.WriteMessage($"[XBoss]   {k.ThietBi}: {k.LyDo}\n");
        }
        foreach (var c in tongKet.CanhBao) ed.WriteMessage($"[XBoss] ⚠ {c}\n");
        ed.WriteMessage(
            "[XBoss] Tuyến sinh ra dùng được ngay: XBOSS_VE_NHAN · XBOSS_VE_PHUKIEN · XBOSS_VE_CHIADOT · " +
            "XBOSS_BOCKL. Hoàn tác cả lượt: UNDO 1 lần.\n");

        // Vào BÁO CÁO PHIÊN VẼ (XBOSS_VE_BAOCAO): bản vẽ tự mang được "nhánh nào do lệnh sinh"
        // (XData TuDong/PhienTuyen), còn các con số của LẦN CHẠY này thì chỉ nhật ký phiên giữ.
        VeContext.NhatKyPhien.Add(
            $"XBOSS_VE_TUYENTUDONG: hệ {ts.He.Id} · {ts.Tuyen.ItemId} {ts.Size} · phiên {maPhien} · " +
            $"nối {kh.SoNoiDuoc}/{kh.SoThietBiDich} thiết bị · {tongKet.SoTuyenMoi} nhánh · " +
            $"tổng dài {kh.TongChieuDai.ToString("#,##0.#", CultureInfo.InvariantCulture)} đơn vị bản vẽ · " +
            $"{kh.SoCo} co · dùng chung {(kh.TiLeDungChung * 100).ToString("0.#", CultureInfo.InvariantCulture)}% cạnh · " +
            $"{boQua} không giải được · {tongKet.SoDanhDauSuaTay} tuyến mới đánh dấu sửa tay · " +
            $"{tongKet.SoXoaTuyenCu} tuyến cũ dựng lại" +
            (boQua == 0 ? "" : $" · lý do: {string.Join("; ", kh.KhongGiai.Select(k => $"{k.ThietBi} — {k.LyDo}"))}"));
    }

    private static string So(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);
}
