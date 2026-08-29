using System.Globalization;
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

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeNhanTangCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_NHANTANG</c> — nhân bản tầng điển hình (M111 FR1–FR12): chép hệ MEPF của một tầng
/// sang N tầng khác **kèm ánh xạ lại toàn bộ liên kết dữ liệu**, việc mà lệnh <c>COPY</c> của
/// AutoCAD không làm được (bản copy giữ nguyên handle của bản gốc ⇒ mọi lệnh sau sửa nhầm sang
/// tầng nguồn).
///
/// <para><b>Đây là lệnh rủi ro cao nhất của bộ plugin</b> — nhân bản sai là sai hàng loạt trên N
/// tầng. Năm bất biến của M111 §2 được ép ngay trong mã dưới đây:</para>
/// <list type="number">
/// <item><b>Không đụng tầng nguồn.</b> Lệnh chỉ ĐỌC đối tượng nguồn (kể cả lúc ghi: mọi
/// <c>OpenMode.ForWrite</c> đều nhắm vào BẢN CHÉP). Vị trí đặt do
/// <see cref="FloorReplicator.ViTriDatTang"/> tính, ô số 0 dành cho chính tầng nguồn nên bản chép
/// không bao giờ dời 0.</item>
/// <item><b>Không sinh handle mồ côi.</b> XData của bản chép KHÔNG bao giờ được chép nguyên si rồi
/// sửa dần: sau <c>DeepCloneObjects</c>, lệnh <b>ghi đè toàn bộ</b> XData <c>XBOSS_VE</c> của bản
/// chép bằng đúng kết quả <see cref="FloorReplicator.AnhXaXData"/> (handle trong bảng
/// <c>IdMapping</c> thì thay, ngoài tập chọn thì GỠ). Quyết định này cố ý KHÔNG dựa vào giả định
/// "<c>DeepCloneObjects</c> có chép XData cho mọi loại thực thể" (M111 §10, chưa xác minh được
/// trên AutoCAD thật): dù clone có chép hay không, kết quả cuối cùng vẫn là bảng XData do Core
/// tính ra, nên không có đường nào để handle của tầng nguồn lọt vào bản chép.</item>
/// <item><b>Không tag trùng.</b> Tag của bản chép đổi <c>{floor}</c> qua
/// <see cref="TagSchedule"/>; tag không khớp mẫu thì GIỮ NGUYÊN + nêu tên (không đoán bừa), và
/// lệnh kiểm trùng tag trên toàn bản vẽ rồi báo ngay trong tóm tắt.</item>
/// <item><b>Xem trước bắt buộc.</b> Cả đường hộp thoại lẫn đường dòng lệnh đều phải hiện bảng
/// "chép gì, sang tầng nào, tag thành gì" và chờ xác nhận — hai đường dùng CHUNG
/// <see cref="NhanTangDialogViewModel"/> nên không thể lệch nhau.</item>
/// <item><b>1 lệnh = 1 nhóm UNDO cho toàn bộ N tầng.</b> Xem ghi chú
/// <see cref="ChepCacTang"/> về lựa chọn "một transaction cho tất cả các tầng".</item>
/// </list>
///
/// <para>Tầng nguồn đang đỏ <c>XBOSS_KIEMTRA</c> chỉ bị <b>CẢNH BÁO, KHÔNG chặn</b> (chốt
/// 2026-08-29): bản vẽ của người khác gần như luôn có lỗi tồn đọng, chặn là khóa kỹ sư khỏi chính
/// tính năng họ cần — xem trước bắt buộc + tính nguyên tử đã là chốt an toàn.</para>
/// </summary>
public sealed class VeNhanTangCommands
{
    /// <summary>Từ khóa chọn tất cả tầng trong danh mục (đường hỏi đáp dòng lệnh).</summary>
    private const string TuKhoaTatCa = "TATCA";

    /// <summary>Một đối tượng nguồn đã đọc xong khỏi bản vẽ (transaction CHỈ ĐỌC).</summary>
    private sealed record UngVien(
        ObjectId Id,
        string Handle,
        string Layer,
        VeXDataInfo XData,
        string? Tag,
        bool DaBoc,
        string MauTruocKhiBoc,
        string VungBoc,
        double DaiMm);

    /// <summary>Khung bao của tập nguồn (đơn vị bản vẽ) — chỉ dùng cho nút "zoom tới" của FR3.</summary>
    private sealed record KhungNhin(double MinX, double MinY, double MaxX, double MaxY);

    /// <summary>Toàn bộ thứ đọc được khỏi bản vẽ trước khi hỏi kỹ sư (không giữ transaction nào).</summary>
    private sealed record NguonDaDoc(
        List<UngVien> UngVien,
        TomTatChonNhanTang TomTat,
        Dictionary<string, List<ObjectId>> BanChepTheoTang,
        List<string> VungDaCo,
        List<string> TagDaCo,
        int SoLoiKiemTra,
        string? TangNguonGoiY,
        KhungNhin? Khung);

    /// <summary>Kết quả một lần chạy, để in tóm tắt FR10.</summary>
    private sealed class TongKetChep
    {
        internal int SoTang { get; set; }
        internal int SoDoiTuong { get; set; }
        internal int SoHandleGo { get; set; }
        internal int SoTagDoi { get; set; }
        internal int SoAttTuDoi { get; set; }
        internal int SoGoDauBoc { get; set; }
        internal int SoXoaBanChepCu { get; set; }
        internal List<string> TagKhongDoiDuoc { get; } = [];
        internal List<string> CanhBao { get; } = [];
    }

    [CommandMethod("XBOSS_VE_NHANTANG")]
    public void NhanTang()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;

        // ===== (0) Rule pack phải khai VÀ bật floorPolicy (AC12) =====
        if (pack.DrawTools.FloorPolicy is not { } fp)
        {
            ed.WriteMessage(
                $"\n[XBoss] Rule pack {pack.RulePack.Version} chưa khai drawTools.floorPolicy — lệnh nhân bản " +
                "tầng cần danh sách tầng, bước cao độ và quy tắc đặt tên vùng. Tải rule pack mới trên trang " +
                "/engineering/chuan-hoa-ban-ve rồi chạy XBOSS_RULEPACK.\n");
            return;
        }
        if (!fp.Enabled)
        {
            ed.WriteMessage(
                "\n[XBoss] drawTools.floorPolicy đang TẮT (enabled: false) — bản vẽ không thay đổi.\n" +
                "[XBoss] Bật trên trang /engineering/chuan-hoa-ban-ve (khối floorPolicy), phát hành rule pack " +
                "version mới rồi nạp lại bằng XBOSS_RULEPACK/XBOSS_LOGIN.\n");
            return;
        }

        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — bước dời tầng khai " +
                "bằng mm đã quy đổi theo đơn vị này, chuẩn dự án là mm.\n");
        }

        // ===== (1) Chọn nguồn (FR1) — ngoài transaction, ESC là bản vẽ nguyên trạng =====
        ed.WriteMessage(
            "\n[XBoss] Quét chọn TOÀN BỘ hệ của tầng điển hình cần nhân bản (nền kiến trúc, xref và đối " +
            "tượng không do XBoss vẽ tự bỏ qua kèm lý do).\n");
        var chon = ed.GetSelection();
        if (chon.Status != PromptStatus.OK)
        {
            ed.WriteMessage("\n[XBoss] Chưa chọn gì — bản vẽ không thay đổi.\n");
            return;
        }

        // ===== (2) Đọc bản vẽ (transaction CHỈ ĐỌC) =====
        var appBoc = pack.RulePack.Takeoff.XdataAppName;
        NguonDaDoc daDoc;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            daDoc = DocNguon(db, tr, fp, pack, chon.Value.GetObjectIds(), toMm, appBoc);
            tr.Commit();
        }

        foreach (var d in daDoc.TomTat.DongBoQua) ed.WriteMessage($"[XBoss] Bỏ qua {d}\n");
        if (daDoc.UngVien.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Vùng chọn không có đối tượng nào chép được — bản vẽ không thay đổi.\n" +
                "[XBoss] Lệnh chỉ chép đối tượng do bộ lệnh XBOSS_VE sinh ra và có vai trò nằm trong " +
                $"floorPolicy.copyRoles ({string.Join(", ", fp.CopyRoles)}).\n");
            return;
        }

        // ===== (3) Tham số + XEM TRƯỚC BẮT BUỘC (FR2/FR3/FR11 — guardrail §2.4) =====
        if (HoiThamSo(ed, pack, fp, daDoc) is not { } ts) return;

        // ===== (4) Thi hành (FR4–FR9, nguyên tử NFR2) =====
        if (ChepCacTang(doc, ed, db, pack, daDoc, ts, toMm, appBoc) is not { } tongKet) return;

        // ===== (5) Tóm tắt (FR10) =====
        BaoCao(ed, pack, daDoc, ts, tongKet);
    }

    // =============================================================================================
    // Đọc bản vẽ
    // =============================================================================================

    /// <summary>
    /// Lọc vùng chọn theo <c>copyRoles</c> (FR1 — <see cref="FloorPolicySection.DuocChep"/> là cửa
    /// lọc DUY NHẤT) và đọc thêm mọi thứ hộp thoại cần biết: bản chép đã có của từng tầng (FR9),
    /// tên vùng bóc + tag đang có trong bản vẽ (FR5/FR6), số lỗi <c>XBOSS_KIEMTRA</c> còn lại.
    /// </summary>
    private static NguonDaDoc DocNguon(
        Database db, Transaction tr, FloorPolicySection fp, DrawToolsPack pack,
        IReadOnlyList<ObjectId> daChon, double toMm, string appBoc)
    {
        var ungVien = new List<UngVien>();
        var vaiTroBoQua = new Dictionary<VaiTroVe, int>();
        var soKhongCoXData = 0;
        var soThuocXref = 0;
        var soVonLaBanChep = 0;
        double minX = double.MaxValue, minY = double.MaxValue, maxX = double.MinValue, maxY = double.MinValue;

        foreach (var id in daChon)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent)
            {
                soKhongCoXData++;
                continue;
            }
            if (ThuocXref.KhoiChen(tr, ent) || LayerCuaXref(tr, ent))
            {
                soThuocXref++;
                continue;
            }
            if (VeXDataStore.Doc(ent) is not { } xd)
            {
                soKhongCoXData++;
                continue;
            }
            if (!fp.DuocChep(xd.VaiTro))
            {
                vaiTroBoQua[xd.VaiTro] = vaiTroBoQua.GetValueOrDefault(xd.VaiTro) + 1;
                continue;
            }
            if (!string.IsNullOrWhiteSpace(xd.TangNguon)) soVonLaBanChep++;

            var mark = MarkService.ReadMark(ent, appBoc);
            ungVien.Add(new UngVien(
                id,
                ent.Handle.ToString(),
                ent.Layer,
                xd,
                ent is BlockReference br && VeXDataStore.TagCua(tr, br) is { } att ? att.TextString : null,
                mark is not null,
                mark?.MauCu ?? "",
                mark?.Vung ?? "",
                ent is Polyline pl && xd.VaiTro == VaiTroVe.Tim ? pl.Length * toMm : 0));

            CongKhung(ent, ref minX, ref minY, ref maxX, ref maxY);
        }

        // Quét toàn bản vẽ MỘT lượt cho 4 câu hỏi còn lại (bản vẽ shop có hàng nghìn đối tượng —
        // quét lại từng câu là chậm thấy rõ).
        var banChep = new Dictionary<string, List<ObjectId>>(StringComparer.Ordinal);
        var vungDaCo = new List<string>();
        var tagDaCo = new List<string>();
        var soLoiKiemTra = 0;
        foreach (var id in TakeoffScanner.ModelSpaceIds(db, tr))
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;

            if (string.Equals(ent.Layer, KiemTraMarker.TenLayer, StringComparison.OrdinalIgnoreCase))
            {
                soLoiKiemTra++;
                continue;
            }
            if (MarkService.ReadMark(ent, appBoc) is { } dauBoc &&
                dauBoc.Vung.Length > 0 &&
                !vungDaCo.Contains(dauBoc.Vung, StringComparer.OrdinalIgnoreCase))
            {
                vungDaCo.Add(dauBoc.Vung);
            }
            if (ent is BlockReference br && VeXDataStore.TagCua(tr, br) is { } att &&
                !string.IsNullOrWhiteSpace(att.TextString))
            {
                tagDaCo.Add(att.TextString);
            }

            var xd = VeXDataStore.Doc(ent);
            if (xd?.NhanTang is { Length: > 0 } nhan && !string.IsNullOrWhiteSpace(xd.TangNguon))
            {
                if (!banChep.TryGetValue(nhan, out var ds)) banChep[nhan] = ds = [];
                ds.Add(id);
            }
        }

        return new NguonDaDoc(
            ungVien,
            new TomTatChonNhanTang(
                soKhongCoXData,
                soThuocXref,
                soVonLaBanChep,
                vaiTroBoQua.Select(kv => new DemVaiTroBoQua(kv.Key, kv.Value)).ToList()),
            banChep,
            vungDaCo,
            tagDaCo,
            soLoiKiemTra,
            TangNguonSuyTuTag(pack.SheetSetup.TagPattern, ungVien),
            minX <= maxX ? new KhungNhin(minX, minY, maxX, maxY) : null);
    }

    /// <summary>
    /// Tầng nguồn suy từ tag đang có trong tập chọn (FR2 "lấy sẵn nếu suy được"): lấy nhãn tầng
    /// XUẤT HIỆN NHIỀU NHẤT. Chỉ là GỢI Ý điền sẵn — kỹ sư vẫn sửa được, plugin không tự quyết
    /// tầng nguồn từ dữ liệu có thể lem nhem.
    /// </summary>
    private static string? TangNguonSuyTuTag(string? pattern, IReadOnlyList<UngVien> ungVien)
    {
        var dem = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var u in ungVien)
        {
            if (TagSchedule.PhanTich(pattern, u.Tag) is not { Tang.Length: > 0 } pt) continue;
            dem[pt.Tang] = dem.GetValueOrDefault(pt.Tang) + 1;
        }
        return dem.Count == 0
            ? null
            : dem.OrderByDescending(kv => kv.Value).ThenBy(kv => kv.Key, StringComparer.Ordinal).First().Key;
    }

    private static void CongKhung(
        Entity ent, ref double minX, ref double minY, ref double maxX, ref double maxY)
    {
        try
        {
            var ext = ent.GeometricExtents;
            minX = Math.Min(minX, ext.MinPoint.X);
            minY = Math.Min(minY, ext.MinPoint.Y);
            maxX = Math.Max(maxX, ext.MaxPoint.X);
            maxY = Math.Max(maxY, ext.MaxPoint.Y);
        }
        catch (Autodesk.AutoCAD.Runtime.Exception)
        {
            // Thực thể không có extents (vd xline) — chỉ ảnh hưởng nút zoom, không ảnh hưởng phép chép.
        }
    }

    /// <summary>
    /// Thực thể nằm trên layer PHỤ THUỘC XREF (<c>tên-xref|LAYER</c>)? Mở ForWrite là
    /// <c>eInvalidKey</c> kéo rollback cả lệnh — chặn ở cửa, cùng lý do với <see cref="ThuocXref"/>.
    /// </summary>
    private static bool LayerCuaXref(Transaction tr, Entity ent) =>
        tr.GetObject(ent.LayerId, OpenMode.ForRead) is LayerTableRecord ltr && ltr.IsDependent;

    // =============================================================================================
    // Hỏi tham số + xem trước (FR2/FR3/FR11)
    // =============================================================================================

    /// <summary>
    /// Dựng ViewModel xem trước. Dùng CHUNG cho hộp thoại và đường dòng lệnh — một bộ máy xem
    /// trước duy nhất nên hai đường không thể cho ra hai kết quả khác nhau (FR11).
    /// </summary>
    private static NhanTangDialogViewModel TaoViewModel(
        NguonDaDoc daDoc, FloorPolicySection fp, DrawToolsPack pack, Action? zoom) =>
        new(
            fp,
            pack.SheetSetup.TagPattern,
            daDoc.UngVien
                .Select(u => new DoiTuongNhanTang(u.Handle, u.XData, u.Tag, u.DaBoc, u.VungBoc, u.DaiMm))
                .ToList(),
            daDoc.TomTat,
            daDoc.TangNguonGoiY,
            daDoc.BanChepTheoTang.ToDictionary(kv => kv.Key, kv => kv.Value.Count, StringComparer.Ordinal),
            daDoc.VungDaCo,
            daDoc.TagDaCo,
            daDoc.SoLoiKiemTra,
            zoom);

    private static KetQuaHoiNhanTang? HoiThamSo(
        Editor ed, DrawToolsPack pack, FloorPolicySection fp, NguonDaDoc daDoc)
    {
        Action? zoom = null;
        if (daDoc.Khung is { } khung) zoom = () => ZoomToi(ed, khung);

        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = TaoViewModel(daDoc, fp, pack, zoom);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi)
        {
            if (kq is null) ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return kq;
        }
        return HoiThamSoDongLenh(ed, pack, fp, daDoc);
    }

    /// <summary>
    /// Đường hỏi đáp dòng lệnh (FR11). Vẫn dựng chính ViewModel của hộp thoại rồi IN bảng xem
    /// trước ra dòng lệnh + hỏi xác nhận — guardrail §2.4 không có ngoại lệ cho chế độ không UI.
    /// </summary>
    private static KetQuaHoiNhanTang? HoiThamSoDongLenh(
        Editor ed, DrawToolsPack pack, FloorPolicySection fp, NguonDaDoc daDoc)
    {
        var vm = TaoViewModel(daDoc, fp, pack, null);

        var goiY = string.IsNullOrEmpty(vm.TangNguon) ? "" : $" <{vm.TangNguon}>";
        var hoiNguon = ed.GetString(
            new PromptStringOptions($"\n[XBoss] Tầng NGUỒN (nhãn {{floor}} của tập vừa chọn){goiY}: ")
            {
                AllowSpaces = false,
            });
        if (hoiNguon.Status != PromptStatus.OK) return null;
        if (hoiNguon.StringResult.Trim().Length > 0) vm.TangNguon = hoiNguon.StringResult.Trim();

        ed.WriteMessage("\n[XBoss] Tầng đích khai trong rule pack:\n");
        for (var i = 0; i < vm.CacTangDich.Count; i++)
            ed.WriteMessage($"[XBoss]   {i + 1}. {vm.CacTangDich[i].Nhan}\n");
        var hoiDich = ed.GetString(new PromptStringOptions(
            $"\n[XBoss] Chọn tầng đích (số thứ tự cách nhau bởi dấu phẩy, hoặc {TuKhoaTatCa}): ")
        {
            AllowSpaces = false,
        });
        if (hoiDich.Status != PromptStatus.OK) return null;
        if (!TickTangDich(ed, vm, hoiDich.StringResult)) return null;

        var hoiKieu = new PromptKeywordOptions("\n[XBoss] Kiểu dời bản chép") { AllowNone = false };
        foreach (var m in vm.CacKieuDat) hoiKieu.Keywords.Add(TuKhoaKieu(m.GiaTri), TuKhoaKieu(m.GiaTri), m.Nhan);
        hoiKieu.Keywords.Default = TuKhoaKieu(FloorReplicator.DocKieuDat(fp.LayoutMode));
        var kqKieu = ed.GetKeywords(hoiKieu);
        if (kqKieu.Status != PromptStatus.OK) return null;
        vm.MucKieuDatChon = vm.CacKieuDat.First(m => TuKhoaKieu(m.GiaTri) == kqKieu.StringResult);

        var hoiStep = ed.GetString(new PromptStringOptions(
            $"\n[XBoss] Bước dời giữa 2 tầng, mm <{vm.StepMm}>: ")
        {
            AllowSpaces = false,
        });
        if (hoiStep.Status != PromptStatus.OK) return null;
        if (hoiStep.StringResult.Trim().Length > 0) vm.StepMm = hoiStep.StringResult.Trim();

        if (vm.CoTangDaChep)
        {
            var hoiDe = new PromptKeywordOptions(
                "\n[XBoss] Tầng đích đã có bản chép của lệnh này — làm gì?") { AllowNone = false };
            hoiDe.Keywords.Add("BOQUA", "BOQUA", "Bỏ qua tầng đó (khuyến nghị)");
            hoiDe.Keywords.Add("CHEPDE", "CHEPDE", "Xóa bản chép cũ của đúng tầng đó rồi chép lại");
            hoiDe.Keywords.Default = "BOQUA";
            var kqDe = ed.GetKeywords(hoiDe);
            if (kqDe.Status != PromptStatus.OK) return null;
            vm.ChepDe = kqDe.StringResult == "CHEPDE";
        }

        // XEM TRƯỚC — bắt buộc kể cả ở chế độ không UI (FR11).
        ed.WriteMessage($"\n[XBoss] ===== XEM TRƯỚC NHÂN BẢN TẦNG =====\n[XBoss] {vm.MoTaVungChon}\n");
        foreach (var d in vm.DongXemTruoc) ed.WriteMessage($"[XBoss]   {d}\n");
        foreach (var d in vm.DongVung) ed.WriteMessage($"[XBoss]   {d}\n");
        ed.WriteMessage($"[XBoss] {vm.TomTatXemTruoc}\n");
        foreach (var c in vm.CanhBao) ed.WriteMessage($"[XBoss] ⚠ {c}\n");
        if (!vm.CoTheOk)
        {
            foreach (var l in vm.LyDoChuaHopLe) ed.WriteMessage($"[XBoss] ✘ {l}\n");
            ed.WriteMessage("[XBoss] Chưa đủ điều kiện chép — bản vẽ không thay đổi.\n");
            return null;
        }

        var xacNhan = new PromptKeywordOptions("\n[XBoss] Thực hiện nhân bản?") { AllowNone = false };
        xacNhan.Keywords.Add("KHONG", "KHONG", "Hủy, không ghi gì");
        xacNhan.Keywords.Add("CO", "CO", "Chép theo đúng bảng trên");
        xacNhan.Keywords.Default = "KHONG";
        var kqXacNhan = ed.GetKeywords(xacNhan);
        if (kqXacNhan.Status != PromptStatus.OK || kqXacNhan.StringResult != "CO")
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return null;
        }
        return vm.KetQua();
    }

    /// <summary>Đọc chuỗi "1,3,5" hoặc TATCA thành các ô tick tầng đích; false = nhập sai, dừng lệnh.</summary>
    private static bool TickTangDich(Editor ed, NhanTangDialogViewModel vm, string nhap)
    {
        var chuoi = nhap.Trim();
        if (chuoi.Length == 0)
        {
            ed.WriteMessage("\n[XBoss] Chưa chọn tầng đích nào — bản vẽ không thay đổi.\n");
            return false;
        }
        if (string.Equals(chuoi, TuKhoaTatCa, StringComparison.OrdinalIgnoreCase))
        {
            foreach (var t in vm.CacTangDich) t.Chon = true;
            return true;
        }

        foreach (var phan in chuoi.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (int.TryParse(phan, NumberStyles.Integer, CultureInfo.InvariantCulture, out var stt) &&
                stt >= 1 && stt <= vm.CacTangDich.Count)
            {
                vm.CacTangDich[stt - 1].Chon = true;
                continue;
            }
            if (vm.CacTangDich.FirstOrDefault(t => string.Equals(t.NhanTang, phan, StringComparison.Ordinal))
                is { } theoNhan)
            {
                theoNhan.Chon = true;
                continue;
            }
            ed.WriteMessage($"\n[XBoss] \"{phan}\" không phải số thứ tự hay nhãn tầng trong danh mục — dừng lệnh.\n");
            return false;
        }
        return true;
    }

    private static string TuKhoaKieu(KieuDatTang kieu) => kieu switch
    {
        KieuDatTang.OffsetX => "OFFSETX",
        KieuDatTang.Luoi => "LUOI",
        _ => "OFFSETY",
    };

    /// <summary>
    /// Nút "zoom tới vùng nguồn" của FR3. CHỈ đổi khung nhìn — không mở transaction, không đọc/ghi
    /// đối tượng nào (hộp thoại vẫn giữ guardrail M106 §2.1). Lỗi được ViewModel nuốt kèm thông
    /// báo tiếng Việt: không zoom được thì bất tiện, chứ không được làm chết lệnh.
    /// </summary>
    private static void ZoomToi(Editor ed, KhungNhin k)
    {
        using var view = ed.GetCurrentView();
        var rong = Math.Max(k.MaxX - k.MinX, 1e-6);
        var cao = Math.Max(k.MaxY - k.MinY, 1e-6);
        view.CenterPoint = new Point2d((k.MinX + k.MaxX) / 2, (k.MinY + k.MaxY) / 2);
        view.Width = rong * 1.1;
        view.Height = cao * 1.1;
        ed.SetCurrentView(view);
    }

    // =============================================================================================
    // Thi hành
    // =============================================================================================

    /// <summary>
    /// Chép toàn bộ N tầng.
    ///
    /// <para><b>Quyết định: MỘT transaction cho TẤT CẢ các tầng</b> (không phải transaction lồng có
    /// rollback thủ công). Lý do: (a) NFR2 đòi "lỗi ở tầng thứ k ⇒ không ghi tầng nào" —
    /// <c>tr.Abort()</c> (và cả việc <c>Dispose</c> không kèm <c>Commit</c>) trả bản vẽ về nguyên
    /// trạng, đúng nghĩa nguyên tử, trong khi "rollback thủ công" bằng cách xóa lại các bản chép đã
    /// ghi là một đường tự viết lấy, có thể hỏng giữa chừng lần thứ hai; (b) AC11 đòi một lần UNDO
    /// hoàn tác cả N tầng; (c) transaction lồng của AutoCAD dù sao cũng chỉ ghi thật khi
    /// transaction NGOÀI commit, nên nó không cho thêm khả năng gì mà chỉ thêm chỗ sai. Cái giá là
    /// bộ nhớ cho 20 tầng × 2000 đối tượng trong một transaction — chấp nhận được so với NFR1.</para>
    ///
    /// Trả null khi có lỗi (đã rollback + đã in thông báo).
    /// </summary>
    private static TongKetChep? ChepCacTang(
        Document doc, Editor ed, Database db, DrawToolsPack pack,
        NguonDaDoc daDoc, KetQuaHoiNhanTang ts, double toMm, string appBoc)
    {
        var tongKet = new TongKetChep();
        var trongTapChon = daDoc.UngVien.Select(u => u.Id).ToList();
        var msId = SymbolUtilityServices.GetBlockModelSpaceId(db);

        using (var khoaTaiLieu = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeXDataStore.DangKyApp(db, tr);
                // Chỉ đăng ký appname bóc khối lượng khi THỰC SỰ phải gỡ dấu bóc (FR8) — không
                // thêm bản ghi thừa vào bản vẽ chưa bóc lần nào.
                if (daDoc.UngVien.Any(u => u.DaBoc)) MarkService.EnsureRegApp(db, tr, appBoc);

                // Bản chép nằm trên CHÍNH layer của đối tượng nguồn — sau XBOSS_VE_NEN mọi layer
                // đang khóa, không mở thì AppendEntity/Erase ném lỗi kéo rollback cả lệnh.
                foreach (var ten in daDoc.UngVien
                    .Select(u => u.Layer)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList())
                {
                    VeLayerService.MoKhoaNeuCo(db, tr, ten);
                }

                // Ô cố định theo nhãn tầng — chạy lại cho riêng một tầng vẫn đặt về ĐÚNG chỗ cũ
                // (FR9/AC8), không nhảy sang ô của tầng khác chỉ vì lần này nó đứng đầu danh sách.
                foreach (var keHoach in FloorReplicator.LapKeHoachDat(ts.ChinhSach, ts.TangNguon, ts.TangDich))
                {
                    if (ts.ChepDe && daDoc.BanChepTheoTang.TryGetValue(keHoach.NhanTang, out var cu))
                        tongKet.SoXoaBanChepCu += XoaBanChepCu(db, tr, cu, trongTapChon, tongKet);

                    ChepMotTang(tr, db, pack, daDoc, ts, keHoach, msId, toMm, appBoc, tongKet);
                    tongKet.SoTang++;
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi nhân bản tầng — đã rollback, KHÔNG tầng nào được ghi, bản vẽ nguyên " +
                    $"trạng: {e.Message}\n" +
                    "[XBoss] Nếu layer đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi thử lại.\n");
                return null;
            }
            catch (System.Exception e)
            {
                // Bắt rộng CÓ CHỦ ĐÍCH ở đúng lệnh này: nguyên tử (NFR2) quan trọng hơn việc để lỗi
                // lạ nổi lên. Transaction bị Abort trước khi thoát nên bản vẽ vẫn nguyên trạng, và
                // loại + thông điệp lỗi vẫn in ra dòng lệnh chứ không nuốt im lặng.
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI không lường trước khi nhân bản tầng ({e.GetType().Name}: {e.Message}) — " +
                    "đã rollback, KHÔNG tầng nào được ghi.\n");
                return null;
            }
        }
        return tongKet;
    }

    /// <summary>
    /// Chép tập nguồn sang MỘT tầng đích: <c>DeepCloneObjects</c> → dời → ghi lại XData theo bảng
    /// ánh xạ handle → đổi tag → gỡ dấu bóc.
    /// </summary>
    private static void ChepMotTang(
        Transaction tr, Database db, DrawToolsPack pack, NguonDaDoc daDoc, KetQuaHoiNhanTang ts,
        KeHoachTang keHoach, ObjectId msId, double toMm, string appBoc, TongKetChep tongKet)
    {
        using var ids = new ObjectIdCollection();
        foreach (var u in daDoc.UngVien) ids.Add(u.Id);

        using var anhXaId = new IdMapping();
        db.DeepCloneObjects(ids, msId, anhXaId, false);

        // Bảng handle NGUỒN → handle BẢN CHÉP (FR4). Lấy MỌI cặp đã clone, không chỉ cặp "primary":
        // đối tượng con (attribute của khối) cũng có thể bị XData trỏ tới, và cặp thừa trong bảng
        // là vô hại — cặp THIẾU mới là chỗ sinh handle mồ côi.
        var anhXaHandle = new Dictionary<string, string>(StringComparer.Ordinal);
        var banChepCua = new Dictionary<string, ObjectId>(StringComparer.Ordinal);
        foreach (IdPair cap in anhXaId)
        {
            if (!cap.IsCloned || cap.Value.IsNull) continue;
            var handleNguon = cap.Key.Handle.ToString();
            anhXaHandle[handleNguon] = cap.Value.Handle.ToString();
            if (cap.IsPrimary) banChepCua[handleNguon] = cap.Value;
        }

        var doi = new Vector3d(keHoach.Doi.X / toMm, keHoach.Doi.Y / toMm, 0);
        var maTran = Matrix3d.Displacement(doi);
        var nguongDoi = (Math.Abs(keHoach.Doi.X) + Math.Abs(keHoach.Doi.Y)) / toMm / 2;

        foreach (var u in daDoc.UngVien)
        {
            if (!banChepCua.TryGetValue(u.Handle, out var idMoi))
            {
                tongKet.CanhBao.Add(
                    $"Tầng {keHoach.NhanTang}: không nhận được bản chép của handle {u.Handle} " +
                    $"({NhanTangDialogViewModel.NhanVaiTro(u.XData.VaiTro)}) từ DeepCloneObjects.");
                continue;
            }
            if (tr.GetObject(idMoi, OpenMode.ForWrite) is not Entity moi) continue;

            // (a) Dời về vị trí tầng đích. Ô số 0 của lưới là chính tầng nguồn nên vector dời luôn
            //     khác 0 — bản chép không bao giờ nằm đè lên tầng nguồn (guardrail §2.1).
            var attTruoc = ViTriAttribute(tr, moi);
            moi.TransformBy(maTran);
            tongKet.SoAttTuDoi += DoiAttributeConLai(tr, moi, attTruoc, maTran, nguongDoi);

            // (b) Dấu bóc (FR8): tầng mới chưa được bóc lần nào. Làm TRƯỚC khi ghi XData XBOSS_VE,
            //     đúng thứ tự mà XBOSS_VE_NHANTUYEN (M107 FR6) đã dùng: gán DBObject.XData chỉ thay
            //     dữ liệu của appname có trong buffer, nhưng để dữ liệu quan trọng nhất (XBOSS_VE)
            //     được ghi SAU CÙNG thì kể cả khi giả định đó sai, bản chép vẫn không mất liên kết.
            if (u.DaBoc && GoDauBoc(moi, appBoc, u.MauTruocKhiBoc)) tongKet.SoGoDauBoc++;

            // (c) XData: GHI ĐÈ bằng đúng kết quả của Core, không sửa dần trên XData chép được.
            //     Đây là chỗ bảo đảm guardrail §2.2 bất kể DeepCloneObjects có chép XData hay không.
            var ketQuaXData = FloorReplicator.AnhXaXData(
                u.XData, anhXaHandle, ts.TangNguon, keHoach.NhanTang);
            VeXDataStore.Ghi(moi, ketQuaXData.XData);
            tongKet.SoHandleGo += ketQuaXData.HandleDaGo.Count;

            // (d) Tag {floor} (FR5).
            if (!string.IsNullOrWhiteSpace(u.Tag) && moi is BlockReference brMoi)
                DoiTag(tr, brMoi, pack.SheetSetup.TagPattern, u.Tag!, keHoach.NhanTang, tongKet);

            tongKet.SoDoiTuong++;
        }
    }

    /// <summary>Vị trí các attribute của một khối TRƯỚC khi dời (rỗng khi không phải khối).</summary>
    private static List<(ObjectId Id, Point3d Vi)> ViTriAttribute(Transaction tr, Entity ent)
    {
        var ra = new List<(ObjectId, Point3d)>();
        if (ent is not BlockReference br) return ra;
        foreach (ObjectId id in br.AttributeCollection)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is AttributeReference att) ra.Add((id, att.Position));
        }
        return ra;
    }

    /// <summary>
    /// Dời nốt các attribute mà <c>BlockReference.TransformBy</c> KHÔNG kéo theo.
    ///
    /// <para>Attribute là thực thể riêng thuộc sở hữu của khối chèn, và tài liệu ObjectARX không
    /// bảo đảm chúng đi theo phép biến hình của khối. Thay vì đoán một trong hai hành vi (đoán sai
    /// chiều nào cũng ra bản vẽ sai: tag đứng lại ở tầng nguồn, hoặc tag bị dời GẤP ĐÔI), lệnh
    /// <b>tự đo</b>: so vị trí attribute trước/sau khi dời khối; dời chưa tới nửa quãng thì mới tự
    /// dời. Vector dời luôn khác 0 (ô số 0 là tầng nguồn) nên phép so này không nhập nhằng.</para>
    /// </summary>
    private static int DoiAttributeConLai(
        Transaction tr, Entity ent, IReadOnlyList<(ObjectId Id, Point3d Vi)> truoc,
        Matrix3d maTran, double nguong)
    {
        var so = 0;
        foreach (var (id, vi) in truoc)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not AttributeReference att) continue;
            var daDoi = Math.Abs(att.Position.X - vi.X) + Math.Abs(att.Position.Y - vi.Y);
            if (daDoi >= nguong) continue; // AutoCAD đã dời attribute kèm khối
            att.UpgradeOpen();
            att.TransformBy(maTran);
            so++;
        }
        return so;
    }

    /// <summary>
    /// Đổi <c>{floor}</c> trong tag của bản chép (FR5). Tag không khớp <c>tagPattern</c> thì GIỮ
    /// NGUYÊN + nêu tên — plugin không đoán bừa cấu trúc tag của hồ sơ người khác.
    ///
    /// Tag đang KHÓA (<c>TagKhoa</c>) vẫn được đổi tầng: khóa tag là để <c>XBOSS_VE_TAG</c> không
    /// đánh số lại, còn giữ nguyên nhãn tầng cũ trên bản chép là tạo tag TRÙNG — vi phạm thẳng
    /// guardrail §2.3. Cờ khóa vẫn được giữ trong XData của bản chép.
    /// </summary>
    private static void DoiTag(
        Transaction tr, BlockReference brMoi, string? pattern, string tagCu, string tangDich,
        TongKetChep tongKet)
    {
        if (FloorReplicator.DoiTagTheoTang(pattern, tagCu, tangDich) is not { } tagMoi)
        {
            if (!tongKet.TagKhongDoiDuoc.Contains(tagCu, StringComparer.Ordinal))
                tongKet.TagKhongDoiDuoc.Add(tagCu);
            return;
        }
        if (string.Equals(tagMoi, tagCu, StringComparison.Ordinal)) return;
        if (VeXDataStore.TagCua(tr, brMoi) is not { } att) return;

        att.UpgradeOpen();
        att.TextString = tagMoi;
        tongKet.SoTagDoi++;
    }

    /// <summary>
    /// Gỡ dấu bóc <c>XBOSS_BOCKL</c> trên BẢN CHÉP (FR8, cùng cách xử lý M107 FR6): trả màu trước
    /// khi bóc + xóa XData của appname đó.
    ///
    /// Đường chính là <see cref="MarkService.Unmark"/>; nếu bản chép KHÔNG mang XData dấu bóc
    /// (chưa xác minh được <c>DeepCloneObjects</c> có chép XData cho mọi loại thực thể không —
    /// M111 §10) thì màu "đã bóc" vẫn dính trên bản chép vì màu là thuộc tính, luôn được chép.
    /// Khi đó phải trả màu theo giá trị đọc được từ ĐỐI TƯỢNG NGUỒN — nếu không, tầng mới trông
    /// như đã bóc rồi mà không có dấu nào để lệnh nào phát hiện.
    /// </summary>
    private static bool GoDauBoc(Entity banChep, string appBoc, string mauTruocKhiBoc)
    {
        if (MarkService.Unmark(banChep, appBoc)) return true;
        if (mauTruocKhiBoc.Length == 0) return false;
        banChep.Color = MarkService.DecodeColor(mauTruocKhiBoc);
        return true;
    }

    /// <summary>
    /// Xóa bản chép CŨ của đúng một tầng (FR9 "chép đè" — chạy lại không nhân đôi).
    /// Đối tượng nằm trong CHÍNH tập chọn thì không bao giờ bị xóa: kỹ sư quét cả bản vẽ (gồm cả
    /// bản chép cũ) rồi chọn chép đè thì xóa nguồn là mất dữ liệu thật.
    /// </summary>
    private static int XoaBanChepCu(
        Database db, Transaction tr, IReadOnlyList<ObjectId> cu, IReadOnlyList<ObjectId> trongTapChon,
        TongKetChep tongKet)
    {
        var so = 0;
        var soTrungTapChon = 0;
        foreach (var id in cu)
        {
            if (trongTapChon.Contains(id))
            {
                soTrungTapChon++;
                continue;
            }
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity doc) continue;
            VeLayerService.MoKhoaNeuCo(db, tr, doc.Layer);
            if (tr.GetObject(id, OpenMode.ForWrite) is not Entity ghi) continue;
            ghi.Erase();
            so++;
        }
        if (soTrungTapChon > 0)
        {
            tongKet.CanhBao.Add(
                $"{soTrungTapChon} bản chép cũ đang nằm trong chính vùng chọn nguồn — KHÔNG xóa " +
                "(xóa nguồn là mất dữ liệu thật). Chọn lại đúng tầng điển hình rồi chạy lại nếu cần dọn.");
        }
        return so;
    }

    // =============================================================================================
    // Báo cáo (FR10)
    // =============================================================================================

    private static void BaoCao(
        Editor ed, DrawToolsPack pack, NguonDaDoc daDoc, KetQuaHoiNhanTang ts, TongKetChep tongKet)
    {
        ed.WriteMessage(
            $"\n[XBoss] Đã nhân bản tầng {ts.TangNguon} sang {tongKet.SoTang} tầng " +
            $"({string.Join(", ", ts.TangDich)}): {tongKet.SoDoiTuong} đối tượng mới, " +
            $"{tongKet.SoTagDoi} tag đổi theo tầng.\n");

        if (tongKet.SoXoaBanChepCu > 0)
        {
            ed.WriteMessage(
                $"[XBoss] Chép đè: đã xóa {tongKet.SoXoaBanChepCu} đối tượng của bản chép cũ trước khi " +
                "chép lại (không nhân đôi).\n");
        }
        if (tongKet.SoHandleGo > 0)
        {
            ed.WriteMessage(
                $"[XBoss] Đã GỠ {tongKet.SoHandleGo} liên kết trỏ ra ngoài vùng chọn khỏi dữ liệu bản chép — " +
                "không có liên kết nào của bản chép còn trỏ về tầng nguồn.\n");
        }
        if (tongKet.SoAttTuDoi > 0)
        {
            ed.WriteMessage(
                $"[XBoss] {tongKet.SoAttTuDoi} thẻ attribute được dời riêng theo khối (AutoCAD không kéo " +
                "theo khi biến hình khối chèn).\n");
        }
        if (tongKet.SoGoDauBoc > 0)
        {
            ed.WriteMessage(
                $"[XBoss] Đã gỡ dấu đã bóc của {tongKet.SoGoDauBoc} đối tượng bản chép — CHẠY XBOSS_BOCKL " +
                "cho các tầng mới (tầng mới chưa bóc lần nào).\n");
        }
        if (tongKet.TagKhongDoiDuoc.Count > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {tongKet.TagKhongDoiDuoc.Count} tag KHÔNG khớp mẫu {pack.SheetSetup.TagPattern} nên " +
                $"giữ nguyên: {string.Join(", ", tongKet.TagKhongDoiDuoc.Take(10))}" +
                $"{(tongKet.TagKhongDoiDuoc.Count > 10 ? "…" : "")} — sửa tay hoặc chạy XBOSS_VE_TAG.\n");
        }
        foreach (var c in tongKet.CanhBao) ed.WriteMessage($"[XBoss] ⚠ {c}\n");

        // Kiểm trùng tag trên TOÀN bản vẽ ngay sau khi chép (FR5) — dựng lại từ tag đã có + tag mới
        // sinh, không phải quét lại bản vẽ: cùng một bộ dữ liệu mà xem trước đã dùng.
        var trung = TagTrungSauChep(pack.SheetSetup.TagPattern, daDoc, ts);
        ed.WriteMessage(
            trung.Count == 0
                ? "[XBoss] ✔ Không phát hiện tag trùng sau khi chép.\n"
                : $"[XBoss] ✘ {trung.Count} tag TRÙNG sau khi chép: {string.Join(", ", trung.Take(10))}" +
                  $"{(trung.Count > 10 ? "…" : "")} — chạy XBOSS_VE_TAG để đánh lại.\n");

        if (daDoc.SoLoiKiemTra > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ Bản vẽ còn {daDoc.SoLoiKiemTra} vị trí lỗi khoanh tròn của lần XBOSS_KIEMTRA gần " +
                "nhất — các lỗi đó vừa được nhân sang các tầng mới. Chạy lại XBOSS_KIEMTRA để soát.\n");
        }
        ed.WriteMessage(
            "[XBoss] Hồ sơ/trình bày KHÔNG được chép — chạy lại XBOSS_VE_THONGKE, XBOSS_VE_MATCAT, " +
            "XBOSS_VE_NGATNET cho các tầng mới.\n");
        if (daDoc.VungDaCo.Count > 0 || daDoc.UngVien.Any(u => u.VungBoc.Length > 0))
        {
            ed.WriteMessage(
                "[XBoss] Vùng bóc: ranh giới vùng là polyline thường (không mang dữ liệu XBoss) nên KHÔNG " +
                "được chép — chép ranh giới bằng COPY rồi đặt tên vùng theo bảng xem trước khi chạy " +
                "XBOSS_BOCKL cho tầng mới.\n");
        }
        ed.WriteMessage("[XBoss] Hoàn tác toàn bộ các tầng vừa chép: UNDO 1 lần.\n");

        // Vào BÁO CÁO PHIÊN VẼ (XBOSS_VE_BAOCAO): bản vẽ tự mang được "tầng nào chép từ tầng nào"
        // (XData TangNguon/NhanTang), còn các con số của LẦN CHẠY này thì chỉ nhật ký phiên giữ.
        VeContext.NhatKyPhien.Add(
            $"XBOSS_VE_NHANTANG: tầng {ts.TangNguon} → {string.Join("/", ts.TangDich)} · " +
            $"{tongKet.SoDoiTuong} đối tượng · {tongKet.SoTagDoi} tag đổi · " +
            $"{tongKet.SoHandleGo} liên kết ngoài vùng chọn bị gỡ · " +
            $"{tongKet.TagKhongDoiDuoc.Count} tag không đổi được · {trung.Count} tag trùng còn lại" +
            (tongKet.SoXoaBanChepCu > 0 ? $" · chép đè xóa {tongKet.SoXoaBanChepCu} đối tượng cũ" : ""));
    }

    /// <summary>Tag bị trùng sau khi chép (tag đang có trong bản vẽ + tag mới sinh của mọi tầng).</summary>
    private static List<string> TagTrungSauChep(
        string? pattern, NguonDaDoc daDoc, KetQuaHoiNhanTang ts)
    {
        var tags = daDoc.UngVien
            .Where(u => !string.IsNullOrWhiteSpace(u.Tag))
            .Select(u => new TagHienCo(u.Handle, u.Tag!, "", u.XData.TagKhoa))
            .ToList();

        var tatCa = new List<string>(daDoc.TagDaCo);
        foreach (var tang in ts.TangDich)
        {
            foreach (var g in FloorReplicator.LapKeHoachDoiTag(pattern, tags, tang).Doi) tatCa.Add(g.TagMoi);
        }
        return tatCa
            .GroupBy(t => t.Trim(), StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToList();
    }
}
