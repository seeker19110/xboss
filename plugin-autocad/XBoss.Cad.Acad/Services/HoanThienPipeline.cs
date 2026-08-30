using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using XBoss.Cad.Acad.Commands;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Graph;
using XBoss.Cad.Core.Ui.ViewModels;

using ChoChen = XBoss.Cad.Acad.Services.BlockLibraryService.KhoiChoChen;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Điều phối 8 giai đoạn hoàn thiện bản vẽ của <c>XBOSS_HOANTHIEN</c> (M115 §6 bước 5, FR3/FR4).
///
/// <b>Ranh giới cứng — đọc trước khi sửa tệp này:</b>
/// <list type="number">
/// <item><b>KHÔNG nhân đôi logic vẽ.</b> Mỗi giai đoạn gọi lại đúng service mà lệnh
/// <c>XBOSS_VE_*</c> tương ứng dùng (<see cref="VeNenCommands.ApNen"/>,
/// <see cref="VeChiaDotCommands.ChayChiaDot"/>, <see cref="VeGiadoCommands.ChayGiaDo"/>,
/// <see cref="VeNgatNetCommands.ChayNgatNet"/>, <see cref="VeTagCommands.DanhLai"/>,
/// <see cref="VeThongkeCommands.ChayThongKe"/>). Hai giai đoạn mà lệnh gốc là vòng lặp bấm điểm
/// (phụ kiện, lỗ chờ) thì dùng lại đúng CÙNG BỘ SERVICE mà lệnh gốc dùng
/// (<see cref="FittingPlacement"/>, <see cref="SleeveSchedule"/>,
/// <see cref="BlockLibraryService.ChenHangLoat"/>) — chỗ khác nhau duy nhất là tọa độ đến từ đồ
/// thị đã duyệt thay vì từ chuột.</item>
/// <item><b>Polyline tim KHÔNG BAO GIỜ bị sửa</b> (AC2): pipeline chỉ tạo thực thể MỚI. Chỗ duy
/// nhất mở tim ở chế độ ghi nằm trong <c>XBOSS_VE_CHIADOT</c> và chỉ để ghi DẤU CHIA ĐỐT lên
/// XData — không đụng một đỉnh nào (bất biến đã có từ M105).</item>
/// <item><b>Idempotent</b> (AC3/FR4): thực thể do pipeline sinh mang XData
/// <c>nguon=M115 · tuyenGoc=&lt;handle tim&gt; · giaiDoan=&lt;tên giai đoạn&gt;</c>; chạy lại thì
/// xóa đúng bộ ba đó rồi sinh lại. Thực thể kỹ sư tự vẽ (không có dấu) và thực thể đã SỬA TAY
/// (băm hình học lệch — khuôn M114 FR12) tuyệt đối không bị đụng.</item>
/// <item><b>Một lần gọi lệnh = một nhóm UNDO.</b> AutoCAD gộp mọi transaction mở trong CÙNG một
/// lần chạy <c>[CommandMethod]</c> thành một bản ghi UNDO, nên cả 8 giai đoạn hoàn tác bằng
/// UNDO một lần — đúng như từng lệnh <c>XBOSS_VE_*</c> lẻ vẫn làm dù bên trong chúng có 2–3
/// transaction. Vì vậy pipeline KHÔNG mở transaction bao ngoài (transaction lồng nhau sẽ khóa
/// chết các service con vốn tự mở transaction ghi của chúng).</item>
/// </list>
/// </summary>
internal static class HoanThienPipeline
{
    /// <summary>
    /// Kết quả một giai đoạn để lệnh in tóm tắt và ghi báo cáo phiên.
    /// <paramref name="Loi"/> (M118 FR1/AC1): true khi giai đoạn ném exception giữa chừng —
    /// pipeline vẫn đi tiếp giai đoạn kế, không để một giai đoạn hỏng chặn 7 giai đoạn còn lại.
    /// </summary>
    internal sealed record KetQuaGiaiDoan(GiaiDoanHoanThien GiaiDoan, bool DaChay, string TomTat, bool Loi = false);

    /// <summary>Một tuyến tim trong phạm vi, đã tra được ObjectId thật trong bản vẽ.</summary>
    private sealed record TuyenTrongBanVe(
        ObjectId Id, string Handle, string Layer, VeXDataInfo XData, List<DinhPolyline> Dinh, bool Kin);

    /// <summary>
    /// Chạy các giai đoạn trong <paramref name="keHoach"/> theo ĐÚNG thứ tự của kế hoạch (đã cố
    /// định 1..8 ở <see cref="HoanThienKeHoach.Lap"/>). Giai đoạn nào không chạy được thì báo lý do
    /// và đi tiếp — một giai đoạn thiếu tham số rule pack không được phép chặn 7 giai đoạn kia.
    /// </summary>
    internal static IReadOnlyList<KetQuaGiaiDoan> Chay(
        Document doc, Editor ed, DrawToolsPack pack, BlockManifest? thuVien, DoThiChot chot,
        IReadOnlyList<ViecGiaiDoan> keHoach)
    {
        var db = doc.Database;
        var (toMm, _, _) = DrawingUnits.TuInsUnits((int)db.Insunits);

        var tuyen = DocTuyenTrongPhamVi(db, chot);

        // M118 FR1/AC1: cách ly lỗi từng giai đoạn qua helper THUẦN của Core
        // (HoanThienKeHoach.ChayCachLyLoi) — giai đoạn hỏng KHÔNG được chặn các giai đoạn sau
        // (transaction của nó đã tự abort bên trong service con, ở đây chỉ ghi nhận và đi tiếp,
        // không mở/đóng transaction bao ngoài).
        return HoanThienKeHoach.ChayCachLyLoi(
            keHoach,
            viec =>
            {
                ed.WriteMessage($"\n[XBoss] ===== {viec.GiaiDoan.Nhan} ({viec.GiaiDoan.Lenh}) =====\n");
                var kq = viec.GiaiDoan.Ten switch
                {
                    "netDoi" => NetDoi(doc, ed, pack, chot, viec),
                    "phuKienTaiNut" => PhuKienTaiNut(doc, ed, pack, thuVien, chot, viec, tuyen, toMm),
                    "chiaDot" => ChiaDot(doc, ed, pack, viec, tuyen, toMm),
                    "giaDo" => GiaDo(doc, ed, pack, thuVien, chot, viec, tuyen),
                    "loCho" => LoCho(doc, ed, pack, thuVien, viec, tuyen, toMm),
                    "ngatNet" => NgatNet(doc, ed, pack, viec, tuyen, toMm),
                    "tag" => Tag(doc, ed, pack, viec),
                    "thongKe" => ThongKe(doc, ed, pack, viec),
                    _ => new KetQuaGiaiDoan(viec.GiaiDoan, false, "Giai đoạn lạ — bỏ qua."),
                };
                ed.WriteMessage($"[XBoss] {(kq.DaChay ? "✔" : "—")} {kq.TomTat}\n");
                return kq;
            },
            (viec, ex) =>
            {
                var kq = new KetQuaGiaiDoan(viec.GiaiDoan, false, $"lỗi — {ex.Message}", Loi: true);
                ed.WriteMessage($"[XBoss] ✖ {kq.TomTat}\n");
                return kq;
            });
    }

    // ======================================================================================
    // ① Nét đôi — XBOSS_VE_NEN
    // ======================================================================================

    private static KetQuaGiaiDoan NetDoi(
        Document doc, Editor ed, DrawToolsPack pack, DoThiChot chot, ViecGiaiDoan viec)
    {
        if (VeNenCommands.TrangThaiNenHienTai(doc.Database) is { } dang)
        {
            // Gọi lại XBOSS_VE_NEN lúc này là HOÀN NGUYÊN nền — đúng thứ pipeline không được làm.
            return new KetQuaGiaiDoan(viec.GiaiDoan, false,
                $"Bản vẽ đang ở chế độ nền của hệ {dang.HeId} rồi — bỏ qua (chạy lại XBOSS_VE_NEN tay " +
                "nếu muốn hoàn nguyên).");
        }
        if (HeChinh(pack, chot) is not { } he)
        {
            return new KetQuaGiaiDoan(viec.GiaiDoan, false,
                "Không tuyến nào trong đồ thị có hệ khớp drawTools.systems — không biết dựng layer đích nào.");
        }
        return new KetQuaGiaiDoan(viec.GiaiDoan, VeNenCommands.ApNen(doc, ed, pack, he),
            $"Đã chuẩn bị nền + layer đích cho hệ {he.Id}.");
    }

    // ======================================================================================
    // ② Phụ kiện tại nút — dùng lại FittingPlacement + BlockLibraryService của XBOSS_VE_PHUKIEN
    // ======================================================================================

    private static KetQuaGiaiDoan PhuKienTaiNut(
        Document doc, Editor ed, DrawToolsPack pack, BlockManifest? thuVien, DoThiChot chot,
        ViecGiaiDoan viec, IReadOnlyList<TuyenTrongBanVe> tuyen, double toMm)
    {
        if (thuVien is null)
        {
            return new KetQuaGiaiDoan(viec.GiaiDoan, false,
                "Máy chưa có thư viện block — chạy XBOSS_VE_THUVIEN rồi chạy lại giai đoạn này.");
        }
        if (viec.Nut.Count == 0)
        {
            return new KetQuaGiaiDoan(viec.GiaiDoan, false,
                $"Không nút nào chốt được phụ kiện ({viec.SoNutBoQua} nút kỹ sư bỏ qua, " +
                $"{viec.SoNutChuaQuyet} nút chưa quyết).");
        }

        var soXoa = DonThucTheM115(doc, ed, viec);

        // Nút → tọa độ; phụ kiện đã duyệt → block. Tuyến gốc của một nút = tuyến của cạnh đầu tiên
        // chạm nút đó: XData của nó cho layer/hệ/cỡ, và chuỗi đỉnh cho GÓC chèn (đúng cách
        // XBOSS_VE_PHUKIEN lấy góc khi kỹ sư bấm chuột lên tim).
        var viTriNut = chot.Nut.ToDictionary(n => n.ChiSo, n => new Diem2(n.X, n.Y));
        var tuyenCuaNut = new Dictionary<int, string>();
        foreach (var c in chot.Canh)
        {
            tuyenCuaNut.TryAdd(c.Tu, c.TuyenId);
            tuyenCuaNut.TryAdd(c.Den, c.TuyenId);
        }
        var theoHandle = tuyen.ToDictionary(t => t.Handle, t => t, StringComparer.OrdinalIgnoreCase);

        var theoBlock = new Dictionary<string, List<ChoChen>>(StringComparer.Ordinal);
        var boQua = 0;
        foreach (var pk in chot.PhuKien.Where(p => viec.Nut.Contains(p.Nut)))
        {
            if (pk.BlockId is not { Length: > 0 } blockId || thuVien.TimTheoId(blockId) is not { } def)
            {
                boQua++;
                continue;
            }
            if (!viTriNut.TryGetValue(pk.Nut, out var diem) ||
                !tuyenCuaNut.TryGetValue(pk.Nut, out var handleTim) ||
                !theoHandle.TryGetValue(handleTim, out var t))
            {
                boQua++;
                continue;
            }

            var vt = FittingPlacement.TrenTuyen(t.Dinh, diem, t.Kin);
            if (vt is null)
            {
                boQua++;
                continue;
            }
            var tyLe = def.ScaleBySize && FittingPlacement.TyLeTheoSize(t.XData.Size, toMm) is { } tl ? tl : 1.0;

            if (!theoBlock.TryGetValue(blockId, out var lo)) theoBlock[blockId] = lo = [];
            lo.Add(new ChoChen(
                new Point3d(vt.Diem.X, vt.Diem.Y, 0),
                def.RotateToPath ? vt.Goc : 0,
                tyLe,
                t.Layer,
                new VeXDataInfo
                {
                    NguonHoanThien = HoanThienKeHoach.NguonM115,
                    GiaiDoanHoanThien = viec.GiaiDoan.Ten,
                    VaiTro = VaiTroVe.PhuKien,
                    HeId = t.XData.HeId,
                    ItemId = t.XData.ItemId,
                    Size = t.XData.Size,
                    RulePackVersion = pack.RulePack.Version,
                    BlockId = def.Id,
                    ThuVienVersion = thuVien.Version,
                    HandleTim = t.Handle,
                    // Khuôn M114 FR12: băm vị trí lúc sinh; lần chạy sau băm lại, lệch = kỹ sư đã
                    // dời tay ⇒ GIỮ NGUYÊN, không xóa sinh lại.
                    BamHinhHoc = RevisionSnapshot.BamHinhHoc([vt.Diem]),
                },
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)));
        }

        var soChen = 0;
        foreach (var (blockId, lo) in theoBlock)
        {
            if (thuVien.TimTheoId(blockId) is not { } def) continue;
            if (!BlockLibraryService.ChenHangLoat(doc, ed, doc.Database, def, thuVien, lo)) continue;
            soChen += lo.Count;
        }

        return new KetQuaGiaiDoan(viec.GiaiDoan, soChen > 0,
            $"Chèn {soChen} phụ kiện tại nút (dọn {soXoa} của lần chạy trước" +
            $"{(boQua > 0 ? $", bỏ qua {boQua} nút không tra được block/tuyến" : "")}; " +
            $"{viec.SoNutBoQua} nút kỹ sư bỏ qua, {viec.SoNutChuaQuyet} nút chưa quyết).");
    }

    // ======================================================================================
    // ③ Chia đốt — XBOSS_VE_CHIADOT
    // ======================================================================================

    private static KetQuaGiaiDoan ChiaDot(
        Document doc, Editor ed, DrawToolsPack pack, ViecGiaiDoan viec,
        IReadOnlyList<TuyenTrongBanVe> tuyen, double toMm)
    {
        if (tuyen.Count == 0)
            return new KetQuaGiaiDoan(viec.GiaiDoan, false, "Không tìm thấy tuyến nào của đồ thị trong bản vẽ.");
        if (VeContext.HoiTiLeIn(ed, pack) is not { } tiLe)
            return new KetQuaGiaiDoan(viec.GiaiDoan, false, "Chưa có tỉ lệ in — bỏ qua giai đoạn này.");

        var soGiu = VeChiaDotCommands.ChayChiaDot(
            doc, ed, pack, toMm, tuyen.Select(t => t.Id).ToList(), he: null, ghiDeKieuNoi: null,
            hoiGhiDe: false, tiLe: tiLe, giaiDoanM115: viec.GiaiDoan.Ten);
        return new KetQuaGiaiDoan(viec.GiaiDoan, true,
            $"Đã chia đốt {tuyen.Count} tuyến (kiểu nối do rule pack tự chọn theo cỡ){TomTatGiuTay(soGiu)}.");
    }

    // ======================================================================================
    // ④ Giá đỡ — XBOSS_VE_GIADO
    // ======================================================================================

    private static KetQuaGiaiDoan GiaDo(
        Document doc, Editor ed, DrawToolsPack pack, BlockManifest? thuVien, DoThiChot chot,
        ViecGiaiDoan viec, IReadOnlyList<TuyenTrongBanVe> tuyen)
    {
        if (thuVien is null)
            return new KetQuaGiaiDoan(viec.GiaiDoan, false, "Máy chưa có thư viện block — bỏ qua.");
        if (HeChinh(pack, chot) is not { } he)
            return new KetQuaGiaiDoan(viec.GiaiDoan, false, "Không xác định được hệ của cụm tuyến.");

        var def0 = he.Fittings
            .Select(thuVien.TimTheoId)
            .FirstOrDefault(d => d is not null && d.KindEnum == BlockKind.Support);
        if (def0 is null)
        {
            return new KetQuaGiaiDoan(viec.GiaiDoan, false,
                $"Thư viện {thuVien.Version} chưa có block giá đỡ (kind=support) cho hệ {he.Id}.");
        }

        var idHe = tuyen
            .Where(t => string.Equals(t.XData.HeId, he.Id, StringComparison.Ordinal))
            .Select(t => t.Id)
            .ToList();
        if (idHe.Count == 0)
            return new KetQuaGiaiDoan(viec.GiaiDoan, false, $"Không tuyến nào của hệ {he.Id} trong phạm vi.");

        // KhongVuot = bước treo đỡ luôn ≤ khoảng cách chuẩn: pipeline chạy không có người bên cạnh
        // nên chọn phía AN TOÀN, không chọn phía ít giá đỡ hơn.
        // taiMoiPhuKien = false: từ rule pack v7 chỉ phụ kiện NẶNG mới có giá đỡ riêng
        // (drawTools.heavyFittingIds), đúng mặc định của lệnh gốc trên rule pack hiện hành.
        var soGiu = VeGiadoCommands.ChayGiaDo(
            doc, ed, pack, thuVien, he, def0, CheDoChiaGiaDo.KhongVuot, taiMoiPhuKien: false,
            idHe, giaiDoanM115: viec.GiaiDoan.Ten);
        return new KetQuaGiaiDoan(viec.GiaiDoan, true,
            $"Đã rải giá đỡ {def0.Id} trên {idHe.Count} tuyến của hệ {he.Id} (bước ≤ khoảng cách chuẩn)" +
            $"{TomTatGiuTay(soGiu)}.");
    }

    // ======================================================================================
    // ⑤ Lỗ chờ tại giao tường — dùng lại SleeveSchedule + BlockLibraryService của XBOSS_VE_LOCHO
    // ======================================================================================

    private static KetQuaGiaiDoan LoCho(
        Document doc, Editor ed, DrawToolsPack pack, BlockManifest? thuVien, ViecGiaiDoan viec,
        IReadOnlyList<TuyenTrongBanVe> tuyen, double toMm)
    {
        if (thuVien is null)
            return new KetQuaGiaiDoan(viec.GiaiDoan, false, "Máy chưa có thư viện block — bỏ qua.");

        var layerKetCau = VeLochoCommands.LayerKetCau(pack);
        if (layerKetCau.Count == 0)
        {
            return new KetQuaGiaiDoan(viec.GiaiDoan, false,
                "Rule pack không khai nhóm layer kết cấu (STRUCTURAL) — không dò được chỗ xuyên tường.");
        }

        var db = doc.Database;
        var soXoa = DonThucTheM115(doc, ed, viec);

        List<MocTruc> truc;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            truc = VeLochoCommands.MocTrucTrongBanVe(db, tr, pack);
            tr.Commit();
        }

        var theoBlock = new Dictionary<string, List<ChoChen>>(StringComparer.Ordinal);
        var boQua = new List<string>();
        foreach (var t in tuyen)
        {
            var he = pack.DrawTools.Systems.FirstOrDefault(s =>
                string.Equals(s.Id, t.XData.HeId, StringComparison.Ordinal));
            var loai = he?.Lines.FirstOrDefault(l =>
                string.Equals(l.ItemId, t.XData.ItemId, StringComparison.Ordinal));
            if (he is null || loai is null) continue;
            if (loai.SleeveClearanceMm is not { } kheHo)
            {
                // Không bịa khe hở (cùng ranh giới với lệnh gốc) — nói rõ rồi bỏ qua tuyến đó.
                boQua.Add($"{t.XData.ItemId}: rule pack chưa khai sleeveClearanceMm");
                continue;
            }
            if (SleeveSchedule.KichThuoc(t.XData.Size, kheHo) is not { } sizeSleeve) continue;

            var def0 = he.Fittings
                .Select(thuVien.TimTheoId)
                .FirstOrDefault(d => d is not null && d.KindEnum == BlockKind.Sleeve);
            if (def0 is null)
            {
                boQua.Add($"hệ {he.Id}: thư viện chưa có block sleeve");
                continue;
            }

            var tyLe = def0.ScaleBySize
                ? sizeSleeve.RongMm / toMm / FittingPlacement.KichThuocDanhNghia
                : 1.0;
            foreach (var p in VeLochoCommands.GiaoVoiKetCau(db, layerKetCau, t.Id))
            {
                var vt = FittingPlacement.TrenTuyen(t.Dinh, new Diem2(p.X, p.Y), t.Kin);
                if (vt is null) continue;

                if (!theoBlock.TryGetValue(def0.Id, out var lo)) theoBlock[def0.Id] = lo = [];
                lo.Add(new ChoChen(
                    new Point3d(vt.Diem.X, vt.Diem.Y, 0),
                    def0.RotateToPath ? vt.Goc : 0,
                    tyLe,
                    t.Layer,
                    new VeXDataInfo
                    {
                        NguonHoanThien = HoanThienKeHoach.NguonM115,
                        GiaiDoanHoanThien = viec.GiaiDoan.Ten,
                        VaiTro = VaiTroVe.LoCho,
                        HeId = t.XData.HeId,
                        ItemId = t.XData.ItemId,
                        Size = t.XData.Size,
                        RulePackVersion = pack.RulePack.Version,
                        BlockId = def0.Id,
                        ThuVienVersion = thuVien.Version,
                        HandleTim = t.Handle,
                        SizeLoCho = sizeSleeve.Nhan,
                        // Giai đoạn ⑤ chỉ dò giao với layer kết cấu ở MẶT BẰNG nên kết cấu xuyên
                        // qua luôn là TƯỜNG; sàn/dầm phải bấm tay bằng XBOSS_VE_LOCHO (cần cao độ
                        // thật, thứ bản vẽ 2D không chứa).
                        KetCau = SleeveSchedule.DanhMucKetCau[0].Ten,
                        ViTriTruc = SleeveSchedule.ViTriTheoTruc(vt.Diem, truc),
                        // Cao độ lấy từ chính XData tuyến (XBOSS_TUYEN_GAN bước 2 đã hỏi), không bịa.
                        CaoDoMm = t.XData.CaoDoMm,
                        BamHinhHoc = RevisionSnapshot.BamHinhHoc([vt.Diem]),
                    },
                    []));
            }
        }

        var soChen = 0;
        foreach (var (blockId, lo) in theoBlock)
        {
            if (thuVien.TimTheoId(blockId) is not { } def) continue;
            if (!BlockLibraryService.ChenHangLoat(doc, ed, db, def, thuVien, lo)) continue;
            soChen += lo.Count;
        }
        foreach (var d in boQua) ed.WriteMessage($"[XBoss] ⚠ Bỏ qua lỗ chờ — {d}.\n");

        return new KetQuaGiaiDoan(viec.GiaiDoan, soChen > 0,
            $"Đặt {soChen} lỗ chờ tại chỗ tuyến cắt layer kết cấu (dọn {soXoa} của lần chạy trước). " +
            "Cao độ lấy từ thuộc tính tuyến; sàn/dầm vẫn phải bấm tay bằng XBOSS_VE_LOCHO.");
    }

    // ======================================================================================
    // ⑥ Ngắt nét giao chéo — XBOSS_VE_NGATNET
    // ======================================================================================

    private static KetQuaGiaiDoan NgatNet(
        Document doc, Editor ed, DrawToolsPack pack, ViecGiaiDoan viec,
        IReadOnlyList<TuyenTrongBanVe> tuyen, double toMm)
    {
        if (pack.DrawTools.CrossingPolicy is not { } chinhSach)
        {
            return new KetQuaGiaiDoan(viec.GiaiDoan, false,
                $"Rule pack {pack.RulePack.Version} chưa khai drawTools.crossingPolicy (cần từ v10).");
        }
        if (!chinhSach.Enabled)
        {
            return new KetQuaGiaiDoan(viec.GiaiDoan, false,
                "drawTools.crossingPolicy.enabled = false — quy ước ngắt nét của dự án đang tắt, không vẽ gì.");
        }

        var soGiu = VeNgatNetCommands.ChayNgatNet(
            doc, ed, pack, chinhSach, toMm, chinhSach.ClearanceMm / toMm, chinhSach.JogRadiusMm / toMm,
            hoiThamSo: false, phamViM115: tuyen.Select(t => t.Handle).ToList(),
            giaiDoanM115: viec.GiaiDoan.Ten);
        return new KetQuaGiaiDoan(viec.GiaiDoan, true,
            "Đã ngắt nét các cặp tuyến giao chéo trong phạm vi (đảo tay của kỹ sư giữ nguyên)" +
            $"{TomTatGiuTay(soGiu)}.");
    }

    // ======================================================================================
    // ⑦ Tag — XBOSS_VE_TAG
    // ======================================================================================

    private static KetQuaGiaiDoan Tag(Document doc, Editor ed, DrawToolsPack pack, ViecGiaiDoan viec)
    {
        var db = doc.Database;
        // Tầng nhớ trong chính bản vẽ (M100 §6.9); chưa khai lần nào thì hỏi ĐÚNG một câu như lệnh gốc.
        var tang = VeTagCommands.TangDaNho(db) ?? VeTagCommands.HoiTang(ed, db);
        if (tang is null)
            return new KetQuaGiaiDoan(viec.GiaiDoan, false, "Chưa khai tầng của bản vẽ — bỏ qua giai đoạn tag.");

        VeTagCommands.DanhLai(doc, ed, db, pack.SheetSetup.TagPattern, PhamViTag.ToanBo, tang);
        return new KetQuaGiaiDoan(viec.GiaiDoan, true, $"Đã đánh lại tag toàn bản vẽ (tầng {tang}).");
    }

    // ======================================================================================
    // ⑧ Bảng thống kê — XBOSS_VE_THONGKE
    // ======================================================================================

    private static KetQuaGiaiDoan ThongKe(Document doc, Editor ed, DrawToolsPack pack, ViecGiaiDoan viec)
    {
        if (VeContext.HoiTiLeIn(ed, pack) is not { } tiLe)
            return new KetQuaGiaiDoan(viec.GiaiDoan, false, "Chưa có tỉ lệ in — bỏ qua giai đoạn này.");

        // Bảng KHỐI LƯỢNG: đây là bảng nói về chính cụm tuyến vừa hoàn thiện (AC4 đối chiếu với
        // XBOSS_BOCKL). Bảng thiết bị/bảng đốt vẫn dựng được bằng XBOSS_VE_THONGKE như cũ.
        var soGiu = VeThongkeCommands.ChayThongKe(
            doc, ed, pack, LoaiBangThongKeUi.KhoiLuong, tiLe, giaiDoanM115: viec.GiaiDoan.Ten);
        return new KetQuaGiaiDoan(viec.GiaiDoan, true,
            $"Đã dựng/cập nhật bảng khối lượng trong bản vẽ{TomTatGiuTay(soGiu)}.");
    }

    // ======================================================================================
    // Dùng chung
    // ======================================================================================

    /// <summary>Hệ của cụm tuyến: hệ xuất hiện nhiều nhất trong đồ thị và còn trong rule pack.</summary>
    private static DrawSystem? HeChinh(DrawToolsPack pack, DoThiChot chot) =>
        chot.Tuyen
            .Select(t => t.HeId)
            .Where(h => !string.IsNullOrWhiteSpace(h))
            .GroupBy(h => h!, StringComparer.Ordinal)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key, StringComparer.Ordinal)
            .Select(g => pack.DrawTools.Systems.FirstOrDefault(s =>
                string.Equals(s.Id, g.Key, StringComparison.Ordinal)))
            .FirstOrDefault(s => s is not null);

    /// <summary>
    /// Các tuyến tim của đồ thị đã chốt, tra ngược về đối tượng thật trong bản vẽ theo handle.
    /// Tuyến đã bị xóa khỏi bản vẽ sau khi chốt thì đơn giản là không có mặt (không phải lỗi chặn —
    /// bản chốt là ẢNH của quá khứ, bản vẽ mới là sự thật).
    /// </summary>
    private static List<TuyenTrongBanVe> DocTuyenTrongPhamVi(Database db, DoThiChot chot)
    {
        var ra = new List<TuyenTrongBanVe>();
        using var tr = db.TransactionManager.StartTransaction();
        foreach (var t in chot.Tuyen)
        {
            if (VeThucThe.TimTheoHandle(db, t.TuyenId) is not { } id) continue;
            if (tr.GetObject(id, OpenMode.ForRead) is not Polyline pl) continue;
            if (VeXDataStore.Doc(pl) is not { VaiTro: VaiTroVe.Tim } xd) continue;
            ra.Add(new TuyenTrongBanVe(id, pl.Handle.ToString(), pl.Layer, xd, VeThucThe.DinhCua(pl), pl.Closed));
        }
        tr.Commit();
        return ra;
    }

    /// <summary>
    /// Dọn thực thể của CHÍNH giai đoạn này ở lần chạy trước (FR4/AC3): xóa đúng
    /// <c>nguon=M115 · giaiDoan=&lt;giai đoạn&gt; · tuyenGoc ∈ phạm vi</c>, giữ nguyên phần kỹ sư
    /// đã sửa tay (băm vị trí lệch — khuôn M114 FR12) và mọi thứ ngoài phạm vi.
    ///
    /// Quyết định "xóa cái nào" tính ở Core (<see cref="HoanThienKeHoach.TinhThayThe"/>, có test);
    /// hàm này chỉ đọc bản vẽ thành DTO rồi thi hành.
    /// </summary>
    private static int DonThucTheM115(Document doc, Editor ed, ViecGiaiDoan viec)
    {
        var db = doc.Database;
        var daSinh = new List<ThucTheDaSinh>();
        var idTheoHandle = new Dictionary<string, ObjectId>(StringComparer.OrdinalIgnoreCase);

        using (var tr = db.TransactionManager.StartTransaction())
        {
            var ms = (BlockTableRecord)tr.GetObject(
                SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
            foreach (ObjectId id in ms)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
                if (VeXDataStore.Doc(ent) is not { } xd) continue;
                if (!string.Equals(xd.NguonHoanThien, HoanThienKeHoach.NguonM115, StringComparison.Ordinal)) continue;
                if (xd.GiaiDoanHoanThien is not { Length: > 0 } giaiDoan) continue;

                var handle = ent.Handle.ToString();
                idTheoHandle[handle] = id;
                daSinh.Add(new ThucTheDaSinh(handle, giaiDoan, xd.HandleTim ?? "", SuaTay: DaSuaTay(ent, xd)));
            }
            tr.Commit();
        }

        var keHoach = HoanThienKeHoach.TinhThayThe(daSinh, [viec]);
        if (keHoach.GiuViSuaTay.Count > 0)
        {
            ed.WriteMessage(
                $"[XBoss] Giữ nguyên {keHoach.GiuViSuaTay.Count} thực thể kỹ sư đã dời/sửa tay — " +
                "chạy lại KHÔNG đè lên công của người.\n");
        }
        if (keHoach.CanXoa.Count == 0) return 0;

        var soXoa = 0;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                foreach (var h in keHoach.CanXoa)
                {
                    if (!idTheoHandle.TryGetValue(h, out var id)) continue;
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
                    $"[XBoss] ⚠ Không dọn được kết quả lần trước ({e.Message}) — giai đoạn này vẫn chạy " +
                    "nhưng có thể sinh phần tử trùng, kiểm lại bằng mắt.\n");
                return 0;
            }
        }
        return soXoa;
    }

    /// <summary>
    /// Kỹ sư đã sửa tay thực thể này chưa — quyết định thuần nằm ở Core
    /// (<see cref="HoanThienKeHoach.DaSuaTay"/>, dùng chung với 4 lệnh ủy thác từ M118 FR2); ở đây
    /// chỉ đọc điểm đại diện của thực thể thật ra khỏi bản vẽ.
    /// </summary>
    private static bool DaSuaTay(Entity ent, VeXDataInfo xd)
    {
        var diem = VeThucThe.DiemBamCua(ent);
        if (diem.Count == 0) return xd.SuaTay;
        return HoanThienKeHoach.DaSuaTay(xd.BamHinhHoc, RevisionSnapshot.BamHinhHoc(diem), xd.SuaTay);
    }

    /// <summary>Đuôi "Giữ nguyên N thực thể đã sửa tay" của tóm tắt giai đoạn (M118 FR2); rỗng khi N = 0.</summary>
    private static string TomTatGiuTay(int soGiu) =>
        soGiu > 0 ? $"; giữ nguyên {soGiu} thực thể kỹ sư đã sửa tay" : "";
}
