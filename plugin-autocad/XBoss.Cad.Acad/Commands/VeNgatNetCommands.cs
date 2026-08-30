using System.Globalization;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Ui.ViewModels;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeNgatNetCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_NGATNET</c> + <c>XBOSS_VE_NGATNET_XOA</c> (M109 §6, FR1–FR10): quy ước trình bày 2D
/// "tuyến đi dưới ngắt nét tại chỗ giao" — bản vẽ nộp đọc được ngay ai trên ai dưới mà không phải
/// tra mặt cắt.
///
/// <b>GUARDRAIL M109 §2 — ĐỌC TRƯỚC KHI SỬA TỆP NÀY:</b>
/// <list type="number">
/// <item><b>Polyline tim TUYỆT ĐỐI không bị cắt, chia hay đổi tọa độ đỉnh.</b> Tim là nguồn sự
/// thật duy nhất của <c>XBOSS_BOCKL</c> (M100 FR4) — cắt tim là bóc thiếu chiều dài, sai khối
/// lượng đưa ra công trường. Cả hai lệnh trong tệp này CHỈ tạo thực thể MỚI (vùng che
/// <see cref="Wipeout"/> + cung cầu vượt) và CHỈ xóa thực thể do chính M109 tạo (XData vai trò
/// <see cref="VaiTroVe.NgatNet"/>). Không có một chỗ nào mở tim ở chế độ ghi: bằng chứng kiểm
/// được bằng mắt là trong tệp này không hề có <c>OpenMode.ForWrite</c> trên đối tượng tim, mọi
/// <c>ForWrite</c> đều là model space (để thêm thực thể), bảng thứ tự vẽ, hoặc chính đối tượng
/// vai trò <see cref="VaiTroVe.NgatNet"/> sắp bị xóa (xem
/// <c>VeThucThe.XoaNgatNet</c>).</item>
/// <item>Kết quả <b>gỡ được sạch</b> bằng <c>XBOSS_VE_NGATNET_XOA</c> (FR8/AC6).</item>
/// <item>Chạy lại là <b>idempotent</b>: dọn đối tượng ngắt nét cũ của đúng các tuyến trong phạm vi
/// rồi dựng lại — số đối tượng không đổi từ lần 2 trở đi (FR6/AC4).</item>
/// <item>1 lệnh = <b>1 nhóm UNDO</b>; mọi hỏi đáp nằm NGOÀI transaction ghi (M100 §6.11 / AC7).</item>
/// </list>
///
/// Hình học tính ở Core (<see cref="CrossingGeometry"/> — vùng che, cầu vượt, xếp hạng
/// <c>priority</c>, lọc góc gắt; <see cref="Segment2D.GiaoDiemGiuaHaiChuoi"/> — dò giao điểm, dùng
/// chung với phép kiểm 11 của M101). Tệp này chỉ đọc bản vẽ, hỏi kỹ sư và vẽ.
/// </summary>
public sealed class VeNgatNetCommands
{
    /// <summary>Dung sai gom điểm ĐA GIAO (M109 §11), tính bằng mm rồi quy sang đơn vị bản vẽ.</summary>
    private const double DungSaiDaGiaoMm = 1.0;

    /// <summary>Một tuyến tim đã đọc xong khỏi bản vẽ (transaction CHỈ ĐỌC).</summary>
    private sealed record UngVienTim(
        ObjectId Id,
        string Handle,
        VeXDataInfo XData,
        TuyenNgatNet ChoCore,
        IReadOnlyList<(double X, double Y)> Dinh,
        bool CoCung,
        (double X, double Y) BaoMin,
        (double X, double Y) BaoMax);

    /// <summary>Một cặp tuyến có giao cắt: dữ liệu bản vẽ + dòng hộp thoại tương ứng.</summary>
    private sealed record CapGiao(UngVienTim A, UngVienTim B, IReadOnlyList<GiaoDiemChuoi> Giao, DongGiaoNgatNet Dong);

    /// <summary>
    /// Một đối tượng ngắt nét đã tính xong hình học, chờ vẽ. Dựng TRƯỚC khi mở transaction ghi để
    /// transaction ghi chỉ còn việc tạo thực thể (nhóm UNDO gọn, không có tính toán ở giữa).
    /// </summary>
    /// <param name="HangTren">
    /// Hạng ưu tiên của hệ ĐI TRÊN — khóa xếp nhóm thứ tự vẽ (xem <see cref="XepThuTuVe"/>).
    /// </param>
    private sealed record ViecVeDiem(
        string LayerNgat,
        int AciLayer,
        VeXDataInfo XData,
        IReadOnlyList<Diem2> VungChe,
        KetQuaCauVuot? CauVuot,
        int HangTren,
        ObjectId TimTren,
        IReadOnlyList<string> BienTren);

    // ==========================================================================================
    // XBOSS_VE_NGATNET
    // ==========================================================================================

    [CommandMethod("XBOSS_VE_NGATNET")]
    public void NgatNet()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;

        // ===== (1) Chính sách ngắt nét — AC8: khóa chưa bật thì DỪNG, không vẽ gì =====

        if (pack.DrawTools.CrossingPolicy is not { } chinhSach)
        {
            ed.WriteMessage(
                $"\n[XBoss] Rule pack {pack.RulePack.Version} chưa khai drawTools.crossingPolicy — lệnh " +
                "XBOSS_VE_NGATNET cần rule pack từ v10 trở lên. Tải bản mới ở /engineering/chuan-hoa-ban-ve " +
                "rồi chạy XBOSS_RULEPACK (hoặc XBOSS_LOGIN).\n");
            return;
        }
        if (!chinhSach.Enabled)
        {
            ed.WriteMessage(
                $"\n[XBoss] drawTools.crossingPolicy.enabled = false trong rule pack {pack.RulePack.Version} — " +
                "lệnh DỪNG, bản vẽ không thay đổi.\n" +
                "[XBoss] Quy ước ngắt nét là quy ước TRÌNH BÀY của từng dự án nên mặc định tắt. Bật bằng cách " +
                "sửa khóa đó thành true trong rule pack của dự án (trang /engineering/chuan-hoa-ban-ve, mục " +
                "rule pack theo dự án) rồi nạp lại bằng XBOSS_RULEPACK.\n");
            return;
        }

        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — clearanceMm/jogRadiusMm " +
                "đã quy đổi theo đơn vị này, chuẩn dự án là mm.\n");
        }
        var clearance = chinhSach.ClearanceMm / toMm;
        var banKinhCung = chinhSach.JogRadiusMm / toMm;

        ChayNgatNet(doc, ed, pack, chinhSach, toMm, clearance, banKinhCung, hoiThamSo: true, phamViM115: null);
    }

    /// <summary>
    /// Thân thật của <c>XBOSS_VE_NGATNET</c> — dò giao cắt, tính vùng che/cầu vượt, dọn kết quả cũ
    /// rồi vẽ lại. Tách nguyên vẹn khỏi <see cref="NgatNet"/> để <c>XBOSS_HOANTHIEN</c> (M115 giai
    /// đoạn ⑥) gọi lại đúng logic này; hành vi lệnh gốc không đổi vì mọi câu hỏi vẫn ở đúng chỗ cũ.
    /// </summary>
    /// <param name="hoiThamSo">true = lệnh gốc (hỏi phạm vi + đảo tay); false = pipeline M115.</param>
    /// <param name="phamViM115">
    /// Handle các tuyến tim trong phạm vi khi pipeline gọi; null + <paramref name="hoiThamSo"/>
    /// false = cả bản vẽ.
    /// </param>
    /// <returns>
    /// Số đối tượng ngắt nét GIỮ NGUYÊN vì kỹ sư đã dời tay (M118 FR2) — luôn 0 khi chạy tay lệnh
    /// lẻ (<paramref name="giaiDoanM115"/> null), để pipeline in "Giữ nguyên N" trong tóm tắt ⑥.
    /// </returns>
    internal static int ChayNgatNet(
        Autodesk.AutoCAD.ApplicationServices.Document doc, Editor ed, DrawToolsPack pack,
        CrossingPolicySection chinhSach, double toMm, double clearance, double banKinhCung,
        bool hoiThamSo, IReadOnlyCollection<string>? phamViM115, string? giaiDoanM115 = null)
    {
        var db = doc.Database;

        // ===== (2) Đọc tim + dò giao cắt cả bản vẽ (transaction CHỈ ĐỌC) =====

        List<UngVienTim> tim;
        List<CapGiao> cap;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            var daDao = CacCapDaDao(VeThucThe.NgatNetTrongBanVe(db, tr));
            tim = DocTim(db, tr, pack, toMm);
            cap = DoGiaoCat(tim, chinhSach, daDao);
            tr.Commit();
        }

        if (cap.Count == 0)
        {
            ed.WriteMessage(
                $"\n[XBoss] Bản vẽ có {tim.Count} tuyến tim XBoss nhưng không cặp nào giao nhau — " +
                "bản vẽ không thay đổi.\n");
            return 0;
        }

        // ===== (3) Phạm vi + đảo tay: hộp thoại (mặc định) hoặc dòng lệnh (FR10) =====
        // Pipeline M115 KHÔNG hỏi lại: phạm vi đã do đồ thị chốt quyết, đảo tay giữ nguyên quyết
        // định cũ đọc từ XData ở bước (2) — kỹ sư không phải duyệt hai lần cho cùng một việc.

        KetQuaHoiNgatNet ts;
        if (hoiThamSo)
        {
            if (HoiThamSo(ed, cap.Select(c => c.Dong).ToList(), chinhSach, DungSaiDaGiaoMm / toMm) is not { } hoi)
                return 0;
            ts = hoi;
        }
        else
        {
            ts = new KetQuaHoiNgatNet(
                phamViM115 is null ? PhamViNgatNet.ToanBanVe : PhamViNgatNet.ChonTay,
                cap.Select(c => c.Dong).ToList());
        }

        var trongPhamVi = cap;
        var tomTatChon = new TomTatChonNgatNet(SoTim: tim.Count);
        if (!hoiThamSo && phamViM115 is not null)
        {
            var handleM115 = new HashSet<string>(phamViM115, StringComparer.OrdinalIgnoreCase);
            trongPhamVi = cap
                .Where(c => handleM115.Contains(c.A.Handle) || handleM115.Contains(c.B.Handle))
                .ToList();
        }
        else if (ts.PhamVi == PhamViNgatNet.ChonTay)
        {
            if (HoiVungChon(ed, db, tim) is not { } vungChon) return 0;
            tomTatChon = vungChon.TomTat;
            var handleChon = vungChon.Handle;
            foreach (var d in tomTatChon.DongBoQua) ed.WriteMessage($"[XBoss] Bỏ qua {d}\n");
            if (handleChon.Count == 0)
            {
                ed.WriteMessage(
                    "\n[XBoss] Vùng chọn không có tuyến tim XBoss nào — bản vẽ không thay đổi.\n");
                return 0;
            }
            // Một cặp thuộc phạm vi khi CÓ ÍT NHẤT MỘT tuyến của nó được chọn: kỹ sư chọn một tuyến
            // vừa dời là muốn ngắt nét của tuyến đó cập nhật theo, dù tuyến kia nằm ngoài vùng chọn.
            trongPhamVi = cap
                .Where(c => handleChon.Contains(c.A.Handle) || handleChon.Contains(c.B.Handle))
                .ToList();
        }

        // ===== (4) Tính hình học từng điểm giao (Core thuần, CHƯA đụng bản vẽ) =====

        var boQua = new List<string>();
        var viec = DungViecVe(trongPhamVi, chinhSach, clearance, banKinhCung, pack, boQua, giaiDoanM115);
        foreach (var d in boQua) ed.WriteMessage($"[XBoss] ⚠ {d}\n");

        // Cặp bị dọn kết quả cũ = mọi cặp TRONG PHẠM VI, kể cả cặp lần này không vẽ nữa (đổi
        // priority, đổi cỡ, dời tuyến ra xa nhau) — nếu không thì vết cũ ở lại trên bản vẽ nộp.
        var handlePhamVi = new HashSet<string>(
            trongPhamVi.SelectMany(c => new[] { c.A.Handle, c.B.Handle }), StringComparer.OrdinalIgnoreCase);
        if (ts.PhamVi == PhamViNgatNet.ToanBanVe)
        {
            foreach (var t in tim) handlePhamVi.Add(t.Handle);
        }

        if (viec.Count == 0 && handlePhamVi.Count == 0)
        {
            ed.WriteMessage("\n[XBoss] Không có gì để vẽ hay để dọn — bản vẽ không thay đổi.\n");
            return 0;
        }

        // ===== (5) Vẽ: MỘT transaction = MỘT nhóm UNDO (AC7) =====

        var soXoa = 0;
        var soGiuSuaTay = 0;
        var soChe = 0;
        var soCung = 0;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeXDataStore.DangKyApp(db, tr);
                var ms = (BlockTableRecord)tr.GetObject(
                    SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);

                // (a) Dọn kết quả cũ của ĐÚNG các tuyến trong phạm vi (FR6 — idempotent). Lọc theo
                //     CẢ HAI handle trong XData: đảo tay hoán đổi vai trò trên/dưới nên tuyến đang
                //     chọn có thể nằm ở vế "tim đi trên" của đối tượng cũ.
                //     M118 FR2: chạy QUA PIPELINE thì đối tượng mang dấu nguon=M115 mà kỹ sư đã dời
                //     tay được giữ nguyên; chạy tay lệnh lẻ vẫn đi đường cũ XoaNgatNet, xóa hết như
                //     trước M118 (bất biến AC3).
                var canDon = VeThucThe.NgatNetTrongBanVe(db, tr)
                    .Where(o => handlePhamVi.Contains(o.HandleTim) ||
                                (o.HandleTimGiao is { Length: > 0 } giao && handlePhamVi.Contains(giao)))
                    .Select(o => o.Id)
                    .ToList();
                if (giaiDoanM115 is null)
                {
                    soXoa = VeThucThe.XoaNgatNet(db, tr, canDon);
                }
                else
                {
                    (soXoa, soGiuSuaTay) = VeThucThe.XoaNgatNetGiuTay(db, tr, canDon);
                }

                // (b) Dựng vùng che + cầu vượt.
                var theoHang = new Dictionary<int, (List<ObjectId> Che, List<ObjectId> LenTren)>();
                foreach (var v in viec)
                {
                    VeLayerService.DamBaoLayer(
                        db, tr, v.LayerNgat, v.AciLayer, pack.RulePack.LineweightMap, out _);
                    VeLayerService.MoKhoaNeuCo(db, tr, v.LayerNgat);

                    if (!theoHang.TryGetValue(v.HangTren, out var nhom))
                        theoHang[v.HangTren] = nhom = ([], []);

                    var che = VeThucThe.TaoWipeout(v.VungChe);
                    VeThucThe.Them(tr, ms, che, v.LayerNgat);
                    // Băm ghi SAU khi thực thể đã vào bản vẽ: điểm đại diện của vùng che là hộp bao
                    // (đỉnh Wipeout đọc lại qua SetFrom không tất định — M118 FR2).
                    VeXDataStore.Ghi(che, VeThucThe.KemBam(v.XData, che, giaiDoanM115));
                    nhom.Che.Add(che.ObjectId);
                    soChe++;

                    if (v.CauVuot is { ThanhCong: true } cv)
                    {
                        var cung = VeThucThe.TaoCungCauVuot(cv);
                        VeThucThe.Them(tr, ms, cung, v.LayerNgat);
                        VeXDataStore.Ghi(cung, VeThucThe.KemBam(v.XData, cung, giaiDoanM115));
                        // Cung phải nằm TRÊN vùng che của chính nó, nếu không thì bị chính vùng che
                        // xóa mất — xếp cùng nhóm "lên trên" với tuyến đi trên.
                        nhom.LenTren.Add(cung.ObjectId);
                        soCung++;
                    }

                    // Tim + nét biên của tuyến ĐI TRÊN phải nổi lên trên vùng che, nếu không thì
                    // chính tuyến đi trên bị che một khúc — đúng thứ AC1 cấm ("ống gió liền mạch").
                    nhom.LenTren.Add(v.TimTren);
                    foreach (var h in v.BienTren)
                    {
                        if (VeThucThe.TimTheoHandle(db, h) is { } idBien) nhom.LenTren.Add(idBien);
                    }
                }

                XepThuTuVe(tr, ms, theoHang);
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi vẽ ngắt nét — đã rollback, bản vẽ nguyên trạng: {e.Message}\n" +
                    "[XBoss] Nếu layer đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi thử lại.\n");
                return 0;
            }
        }

        BaoCao(ed, trongPhamVi, viec, tomTatChon, soXoa, soChe, soCung, boQua, chinhSach, toMm);
        if (soGiuSuaTay > 0)
        {
            ed.WriteMessage(
                $"[XBoss] Giữ nguyên {soGiuSuaTay} đối tượng ngắt nét kỹ sư đã dời tay — chạy lại KHÔNG đè " +
                "lên công của người.\n");
        }
        return soGiuSuaTay;
    }

    // ==========================================================================================
    // XBOSS_VE_NGATNET_XOA (FR8)
    // ==========================================================================================

    /// <summary>
    /// Gỡ sạch đối tượng ngắt nét, trả bản vẽ về trước khi chạy <c>XBOSS_VE_NGATNET</c> (FR8/AC6).
    /// CỐ Ý không đòi rule pack: đây là đường lui của guardrail 2 — phải chạy được cả khi rule pack
    /// chưa nạp, hỏng, hoặc đã đổi version.
    /// </summary>
    [CommandMethod("XBOSS_VE_NGATNET_XOA")]
    public void XoaNgatNet()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        var db = doc.Database;

        List<VeThucThe.DoiTuongNgatNet> tatCa;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            tatCa = VeThucThe.NgatNetTrongBanVe(db, tr);
            tr.Commit();
        }
        if (tatCa.Count == 0)
        {
            ed.WriteMessage("\n[XBoss] Bản vẽ không có đối tượng ngắt nét nào — không có gì để xóa.\n");
            return;
        }

        ed.WriteMessage($"\n[XBoss] Bản vẽ đang có {tatCa.Count} đối tượng ngắt nét giao chéo.\n");
        if (HoiPhamVi(ed, "xóa ngắt nét") is not { } phamVi) return;

        var canXoa = tatCa;
        if (phamVi == PhamViNgatNet.ChonTay)
        {
            ed.WriteMessage(
                "\n[XBoss] Chọn các tuyến TIM cần gỡ ngắt nét (quét cả vùng cũng được — đối tượng khác " +
                "tự bỏ qua).\n");
            var chon = ed.GetSelection();
            if (chon.Status != PromptStatus.OK)
            {
                ed.WriteMessage("\n[XBoss] Chưa chọn gì — bản vẽ không thay đổi.\n");
                return;
            }
            var handle = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using (var tr = db.TransactionManager.StartTransaction())
            {
                foreach (var id in chon.Value.GetObjectIds())
                {
                    if (tr.GetObject(id, OpenMode.ForRead) is Entity ent) handle.Add(ent.Handle.ToString());
                }
                tr.Commit();
            }
            canXoa = tatCa
                .Where(o => handle.Contains(o.HandleTim) ||
                            (o.HandleTimGiao is { Length: > 0 } giao && handle.Contains(giao)) ||
                            handle.Contains(HandleCua(o)))
                .ToList();
            if (canXoa.Count == 0)
            {
                ed.WriteMessage(
                    "\n[XBoss] Không đối tượng ngắt nét nào thuộc vùng chọn — bản vẽ không thay đổi.\n" +
                    "[XBoss] Chọn chính TUYẾN TIM (hoặc chạy lại và chọn TATCA để xóa cả bản vẽ).\n");
                return;
            }
        }

        var soXoa = 0;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                soXoa = VeThucThe.XoaNgatNet(db, tr, canXoa.Select(o => o.Id).ToList());
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi xóa ngắt nét — đã rollback, bản vẽ nguyên trạng: {e.Message}\n");
                return;
            }
        }

        ed.WriteMessage(
            $"\n[XBoss] Đã xóa {soXoa} đối tượng ngắt nét" +
            $"{(soXoa < tatCa.Count ? $" (bản vẽ còn {tatCa.Count - soXoa} đối tượng của tuyến ngoài vùng chọn)" : "")}.\n" +
            "[XBoss] Tuyến tim và nét biên KHÔNG bị đụng tới. Hoàn tác cả lệnh: UNDO 1 lần.\n");
        if (soXoa > 0)
        {
            ed.WriteMessage(
                "[XBoss] ⚠ Thứ tự vẽ (DrawOrder) mà XBOSS_VE_NGATNET đã đẩy cho các tuyến đi trên KHÔNG tự " +
                "trở lại như cũ — lệnh xóa chỉ gỡ đối tượng. Muốn về đúng trạng thái trước lệnh thì dùng UNDO.\n");
        }
    }

    // ==========================================================================================
    // Đọc bản vẽ
    // ==========================================================================================

    /// <summary>
    /// Mọi tuyến TIM do XBoss quản trong model space, kèm bao hình chữ nhật để lọc cặp nhanh.
    /// Tuyến không còn trong rule pack (loại tuyến đã bị xóa khỏi pack) vẫn được đọc: hệ của nó
    /// vẫn có ý nghĩa cho hạng ưu tiên, chỉ <c>edgeStyle</c> là không tra được nên coi như tuyến
    /// hai nét biên (ca hiếm, và vùng che luôn dựng được nên không mất điểm giao nào).
    /// </summary>
    private static List<UngVienTim> DocTim(Database db, Transaction tr, DrawToolsPack pack, double toMm)
    {
        var ra = new List<UngVienTim>();
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Polyline pl) continue;
            var xd = VeXDataStore.Doc(pl);
            if (xd is null || xd.VaiTro != VaiTroVe.Tim) continue;

            var tuyen = TimLoaiTuyen(pack, xd);
            var dinh = VeThucThe.DinhCua(pl);
            if (dinh.Count < 2) continue;

            // Đoạn cung trên tim được dò giao theo DÂY CUNG (Core chỉ biết đoạn thẳng — xem
            // Segment2D). Tim shop drawing gần như luôn là chuỗi đoạn thẳng (co/tê là phụ kiện,
            // không phải cung), nên đây là xấp xỉ chấp nhận được — nhưng phải ĐẾM và nói ra.
            var coCung = dinh.Any(d => !BulgeMath.LaThang(d.Bulge));

            var toaDo = dinh.Select(d => (d.X, d.Y)).ToList();
            if (pl.Closed) toaDo.Add(toaDo[0]);
            var min = (X: toaDo.Min(p => p.X), Y: toaDo.Min(p => p.Y));
            var max = (X: toaDo.Max(p => p.X), Y: toaDo.Max(p => p.Y));

            ra.Add(new UngVienTim(
                id,
                pl.Handle.ToString(),
                xd,
                new TuyenNgatNet(
                    pl.Handle.ToString(),
                    xd.HeId,
                    xd.ItemId,
                    xd.Size,
                    pl.Layer,
                    tuyen?.EdgeStyle ?? "double",
                    DrawSize.PhanTich(xd.Size) is { } kt ? kt.RongMm / toMm : null),
                toaDo,
                coCung,
                min,
                max));
        }
        return ra;
    }

    /// <summary>Loại tuyến trong rule pack ứng với XData của tim (theo hệ + itemId); null = đã trôi khỏi pack.</summary>
    private static DrawLine? TimLoaiTuyen(DrawToolsPack pack, VeXDataInfo xd) =>
        pack.DrawTools.Systems
            .FirstOrDefault(s => string.Equals(s.Id, xd.HeId, StringComparison.Ordinal))
            ?.Lines.FirstOrDefault(l => string.Equals(l.ItemId, xd.ItemId, StringComparison.Ordinal));

    /// <summary>
    /// Mọi cặp tuyến có giao cắt (FR2). Lọc thô bằng bao hình chữ nhật trước khi dò từng đoạn —
    /// ĐÚNG cách phép kiểm 11 làm (<c>PhepKiemMoRong.GiaoCatKhacHe</c>), nên bản vẽ 3000 tuyến
    /// không phải chạy O(n²) phép giao đoạn (NFR1). Thuật toán giao điểm là hàm dùng chung
    /// <see cref="Segment2D.GiaoDiemGiuaHaiChuoi"/>, không có bộ dò thứ hai.
    /// </summary>
    private static List<CapGiao> DoGiaoCat(
        IReadOnlyList<UngVienTim> tim, CrossingPolicySection chinhSach, IReadOnlySet<string> daDao)
    {
        var ra = new List<CapGiao>();
        for (var i = 0; i < tim.Count; i++)
        {
            for (var j = i + 1; j < tim.Count; j++)
            {
                var a = tim[i];
                var b = tim[j];
                if (!Segment2D.BaoGiaoNhau(a.BaoMin, a.BaoMax, b.BaoMin, b.BaoMax, 0)) continue;

                var giao = Segment2D.GiaoDiemGiuaHaiChuoi(a.Dinh, b.Dinh).ToList();
                if (giao.Count == 0) continue;

                ra.Add(new CapGiao(
                    a, b, giao,
                    new DongGiaoNgatNet(
                        a.ChoCore, b.ChoCore,
                        giao.Select(g => new Diem2(g.X, g.Y)).ToList(),
                        chinhSach.Priority,
                        daDao.Contains(KhoaCap(a.Handle, b.Handle)))));
            }
        }
        return ra;
    }

    /// <summary>
    /// Các cặp tuyến kỹ sư ĐÃ ĐẢO TAY, đọc từ XData của đối tượng ngắt nét đang có (FR7/AC5).
    /// Khóa là cặp handle KHÔNG kể thứ tự: đảo tay hoán đổi vai trò trên/dưới nên
    /// <c>HandleTim</c>/<c>HandleTimGiao</c> đổi chỗ giữa hai lần chạy.
    /// </summary>
    private static HashSet<string> CacCapDaDao(IEnumerable<VeThucThe.DoiTuongNgatNet> doiTuong)
    {
        var ra = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var o in doiTuong)
        {
            if (!o.DaoTay) continue;
            if (o.HandleTimGiao is not { Length: > 0 } giao) continue;
            ra.Add(KhoaCap(o.HandleTim, giao));
        }
        return ra;
    }

    /// <summary>Khóa cặp handle không kể thứ tự (cùng quy ước <c>PhepKiemMoRong.KhoaCap</c>).</summary>
    private static string KhoaCap(string a, string b) =>
        string.CompareOrdinal(a, b) <= 0 ? $"{a}|{b}" : $"{b}|{a}";

    /// <summary>Handle của chính đối tượng ngắt nét (để lệnh xóa nhận cả khi kỹ sư chọn thẳng nó).</summary>
    private static string HandleCua(VeThucThe.DoiTuongNgatNet o) => o.Id.Handle.ToString();

    // ==========================================================================================
    // Tính hình học (Core thuần)
    // ==========================================================================================

    /// <summary>
    /// Biến từng điểm giao thành một việc vẽ. Ba ca BỎ QUA có đếm được (FR3/FR9): cặp không ngắt
    /// nét (cùng hệ / thiếu cỡ), góc giao gắt hơn <c>minAngleDeg</c>, và hai đoạn song song tại
    /// chỗ chạm (không có vùng giao xác định).
    /// </summary>
    private static List<ViecVeDiem> DungViecVe(
        IReadOnlyList<CapGiao> cap,
        CrossingPolicySection chinhSach,
        double clearance,
        double banKinhCung,
        DrawToolsPack pack,
        List<string> boQua,
        string? giaiDoanM115)
    {
        var ra = new List<ViecVeDiem>();
        var soGocGat = 0;
        var soSongSong = 0;
        var soCungHong = 0;
        string? lyDoCungHong = null;

        foreach (var c in cap)
        {
            if (c.Dong.LyDoBoQua is { } lyDo)
            {
                boQua.Add($"{c.Dong.Ma}: {lyDo}.");
                continue;
            }
            if (c.Dong.TrenLaA is not { } trenLaA) continue;

            var timTren = trenLaA ? c.A : c.B;
            var timDuoi = trenLaA ? c.B : c.A;
            var beRongTren = timTren.ChoCore.BeRongVe ?? 0;
            var beRongDuoi = timDuoi.ChoCore.BeRongVe ?? 0;
            var layerNgat = timDuoi.ChoCore.Layer + chinhSach.LayerSuffix;
            var dungCauVuot = DungCauVuot(chinhSach.GapMode, timDuoi.ChoCore.EdgeStyle);

            foreach (var g in c.Giao)
            {
                if (!CrossingGeometry.DuGocDeNgat(g.GocDeg, chinhSach.MinAngleDeg))
                {
                    soGocGat++;
                    continue;
                }

                var huongTren = trenLaA ? g.HuongA : g.HuongB;
                var huongDuoi = trenLaA ? g.HuongB : g.HuongA;
                var diem = new Diem2(g.X, g.Y);

                var vungChe = CrossingGeometry.VungChe(
                    diem, huongTren, huongDuoi, beRongTren, beRongDuoi, clearance);
                if (vungChe.Count == 0)
                {
                    soSongSong++;
                    continue;
                }

                // Cầu vượt: vùng che ở trên cắt hiển thị tuyến đơn nét, cung nối lại hai đầu.
                // Dựng không được (bán kính nhỏ hơn nửa dây) thì VẪN che — chỗ giao có khe hở là
                // đúng quy ước, chỉ thiếu cung — và nói rõ lý do thay vì bỏ luôn điểm giao.
                KetQuaCauVuot? cauVuot = null;
                if (dungCauVuot)
                {
                    var kq = CrossingGeometry.CauVuot(
                        diem, huongDuoi, huongTren, beRongTren, clearance, banKinhCung);
                    if (kq.ThanhCong)
                    {
                        cauVuot = kq;
                    }
                    else
                    {
                        soCungHong++;
                        lyDoCungHong ??= kq.LyDo;
                    }
                }

                ra.Add(new ViecVeDiem(
                    layerNgat,
                    VeLayerStyle.AciChoTim(timDuoi.ChoCore.EdgeStyle),
                    new VeXDataInfo
                    {
                        NguonHoanThien = giaiDoanM115 is null ? null : HoanThienKeHoach.NguonM115,
                        GiaiDoanHoanThien = giaiDoanM115,
                        VaiTro = VaiTroVe.NgatNet,
                        HeId = timDuoi.ChoCore.HeId,
                        ItemId = timDuoi.ChoCore.ItemId,
                        Size = timDuoi.ChoCore.Size,
                        RulePackVersion = pack.RulePack.Version,
                        HandleTim = timDuoi.Handle,
                        HandleTimGiao = timTren.Handle,
                        DaoTay = c.Dong.DaoTay,
                    },
                    vungChe,
                    cauVuot,
                    CrossingGeometry.HangUuTien(timTren.ChoCore.HeId, chinhSach.Priority),
                    timTren.Id,
                    timTren.XData.HandleBien));
            }
        }

        if (soGocGat > 0)
        {
            boQua.Add(
                $"{soGocGat} điểm giao có góc nhỏ hơn minAngleDeg = {So(chinhSach.MinAngleDeg)}° — KHÔNG ngắt " +
                "nét (giao gần song song thì vùng che dài lê thê và che mất tuyến), kỹ sư xử lý tay.");
        }
        if (soSongSong > 0)
        {
            boQua.Add(
                $"{soSongSong} điểm giao có hai đoạn trùng phương tại chỗ chạm — không xác định được vùng " +
                "giao, bỏ qua.");
        }
        if (soCungHong > 0)
        {
            boQua.Add(
                $"{soCungHong} điểm giao KHÔNG dựng được cung cầu vượt ({lyDoCungHong}) — vẫn ngắt nét bằng " +
                "vùng che nên chỗ giao có khe hở đúng quy ước, chỉ thiếu cung nối.");
        }
        return ra;
    }

    /// <summary>
    /// Chọn cách thể hiện cho tuyến ĐI DƯỚI (M109 §4/FR4).
    ///
    /// Mặc định suy theo <c>edgeStyle</c>: tuyến 2 nét biên → vùng che; tuyến đơn nét → cầu vượt.
    /// Khóa <c>gapMode</c> chỉ dùng để ÉP sang cầu vượt (<c>"jog"</c>) — đó là đường lui của M109
    /// §11 khi driver in PDF dựng wipeout sai thứ tự vẽ. <c>gapMode: "wipeout"</c> (giá trị mặc
    /// định của rule pack v10) KHÔNG ép ngược lại: ép wipeout cho mọi tuyến sẽ xóa sổ cầu vượt của
    /// tuyến đơn nét ngay trên rule pack mặc định, tức là AC3 không bao giờ chạy được.
    /// </summary>
    private static bool DungCauVuot(string? gapMode, string edgeStyle) =>
        string.Equals(gapMode, "jog", StringComparison.Ordinal) ||
        !string.Equals(edgeStyle, "double", StringComparison.Ordinal);

    // ==========================================================================================
    // Thứ tự vẽ (M109 §4 phương án B — chỗ phải cân nhắc đánh đổi)
    // ==========================================================================================

    /// <summary>
    /// Xếp thứ tự vẽ cho kết quả vừa dựng. Quan hệ BẮT BUỘC tại mỗi điểm giao là ba tầng:
    /// <c>tuyến ĐI TRÊN &gt; vùng che &gt; tuyến ĐI DƯỚI</c>. Đẩy vùng che lên trên cùng thôi là
    /// KHÔNG đủ — vùng che rộng bằng cả bề rộng tuyến đi trên nên nó sẽ che luôn nét biên của
    /// chính tuyến đi trên, đúng thứ AC1 cấm ("ống gió liền mạch").
    ///
    /// Cách làm: gom việc theo HẠNG ƯU TIÊN của hệ đi trên rồi xử lý từ hạng THẤP NHẤT lên; mỗi
    /// nhóm đẩy vùng che lên trên cùng trước, rồi đẩy tuyến đi trên (+ cung cầu vượt) lên trên nữa.
    /// Nhóm hạng cao hơn xử lý sau nên nằm trên tất cả — kết quả là một chồng lớp đúng theo hạng:
    /// <c>hệ hạng 0 &gt; vùng che của hạng 0 &gt; hệ hạng 1 &gt; vùng che của hạng 1 &gt; …</c>.
    /// Nhờ vậy chuỗi ba hệ (A trên B, B trên C) cũng đúng, chứ không phải chỉ ca hai hệ.
    ///
    /// <b>Đánh đổi đã chấp nhận (ghi để người sau khỏi phải đoán):</b> cách này ĐỘNG vào thứ tự vẽ
    /// của các tuyến đi trên vốn đã có sẵn trong bản vẽ. Không có cách nào tránh: nếu tuyến đi dưới
    /// đang nằm trên tuyến đi trong thứ tự vẽ hiện tại thì một vùng che mới, đặt ở đâu đi nữa, cũng
    /// không thỏa được cả hai vế. Hệ quả phải nói rõ với kỹ sư: <c>XBOSS_VE_NGATNET_XOA</c> gỡ được
    /// đối tượng nhưng KHÔNG hoàn nguyên thứ tự vẽ cũ — muốn về đúng trạng thái trước lệnh thì dùng
    /// UNDO (AC7 vẫn đủ vì cả lệnh nằm trong một transaction).
    /// </summary>
    private static void XepThuTuVe(
        Transaction tr,
        BlockTableRecord ms,
        IReadOnlyDictionary<int, (List<ObjectId> Che, List<ObjectId> LenTren)> theoHang)
    {
        foreach (var hang in theoHang.Keys.OrderByDescending(h => h))
        {
            var (che, lenTren) = theoHang[hang];
            VeThucThe.DayLenTrenCung(tr, ms, che);
            VeThucThe.DayLenTrenCung(tr, ms, lenTren.Distinct().ToList());
        }
    }

    // ==========================================================================================
    // Hỏi đáp (NGOÀI transaction)
    // ==========================================================================================

    /// <summary>
    /// Phạm vi + đảo tay cho lần chạy này. Thử hộp thoại trước; UI không dựng được hoặc bị tắt bằng
    /// <c>XBOSS_UI_DIALOG=0</c> thì rơi về hỏi đáp dòng lệnh cho ĐÚNG cùng bộ tham số (FR10).
    /// Hủy ở hộp thoại = dừng lệnh, KHÔNG hỏi lại bằng dòng lệnh.
    /// </summary>
    private static KetQuaHoiNgatNet? HoiThamSo(
        Editor ed, IReadOnlyList<DongGiaoNgatNet> dong, CrossingPolicySection chinhSach, double dungSaiDaGiao)
    {
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new NgatNetDialogViewModel(dong, chinhSach, dungSaiDaGiao);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi)
        {
            if (kq is null) ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return kq;
        }
        return HoiThamSoDongLenh(ed, dong);
    }

    /// <summary>Đường hỏi đáp dòng lệnh — cùng hai tham số mà hộp thoại thu (FR10).</summary>
    private static KetQuaHoiNgatNet? HoiThamSoDongLenh(Editor ed, IReadOnlyList<DongGiaoNgatNet> dong)
    {
        if (HoiPhamVi(ed, "ngắt nét") is not { } phamVi) return null;

        ed.WriteMessage($"\n[XBoss] Các cặp tuyến giao nhau ({dong.Count}):\n");
        foreach (var d in dong) ed.WriteMessage($"[XBoss]   {d.MoTa}\n");

        // Đảo tay: gõ mã cặp để lật chiều, Enter để xong. Lặp để đảo nhiều cặp trong một lần chạy.
        while (true)
        {
            var opt = new PromptStringOptions(
                "\n[XBoss] Đảo chiều cặp nào? (gõ mã dạng handleA×handleB hoặc handleA, Enter = xong): ")
            {
                AllowSpaces = false,
            };
            var kq = ed.GetString(opt);
            if (kq.Status != PromptStatus.OK) return null;

            var nhap = kq.StringResult.Trim();
            if (nhap.Length == 0) break;

            var chon = dong.FirstOrDefault(d =>
                string.Equals(d.Ma, nhap, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(d.A.Handle, nhap, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(d.B.Handle, nhap, StringComparison.OrdinalIgnoreCase));
            if (chon is null)
            {
                ed.WriteMessage($"[XBoss] Không có cặp nào mang mã \"{nhap}\" — xem danh sách ở trên.\n");
                continue;
            }
            if (!chon.CoTheDao)
            {
                ed.WriteMessage($"[XBoss] Cặp {chon.Ma} không ngắt nét nên không đảo được — {chon.LyDoBoQua}.\n");
                continue;
            }
            chon.DaoTay = !chon.DaoTay;
            ed.WriteMessage($"[XBoss]   {chon.MoTa}\n");
        }

        return new KetQuaHoiNgatNet(phamVi, dong);
    }

    /// <summary>Phạm vi TATCA/CHON — dùng chung cho cả lệnh vẽ và lệnh xóa.</summary>
    private static PhamViNgatNet? HoiPhamVi(Editor ed, string viec)
    {
        ed.WriteMessage(
            $"\n[XBoss] Phạm vi {viec}:\n" +
            "[XBoss]   TATCA = toàn bộ tuyến XBoss trong bản vẽ\n" +
            "[XBoss]   CHON  = chỉ các tuyến bạn chọn trên bản vẽ\n");
        var hoi = new PromptKeywordOptions($"\n[XBoss] Chọn phạm vi {viec}") { AllowNone = false };
        hoi.Keywords.Add("TATCA", "TATCA", "TATCA");
        hoi.Keywords.Add("CHON", "CHON", "CHON");
        hoi.Keywords.Default = "TATCA";
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return null;
        return kq.StringResult == "CHON" ? PhamViNgatNet.ChonTay : PhamViNgatNet.ToanBanVe;
    }

    /// <summary>
    /// Vùng chọn của FR1: lọc ra tuyến tim XBoss, đếm phần bỏ qua THEO TỪNG LÝ DO (cùng khuôn
    /// M107 FR1). Trả null khi kỹ sư hủy chọn.
    /// </summary>
    private static (TomTatChonNgatNet TomTat, HashSet<string> Handle)? HoiVungChon(
        Editor ed, Database db, IReadOnlyList<UngVienTim> tim)
    {
        ed.WriteMessage(
            "\n[XBoss] Chọn các tuyến TIM cần ngắt nét (quét cả vùng cũng được — đối tượng khác và " +
            "đối tượng thuộc xref tự bỏ qua).\n");
        var chon = ed.GetSelection();
        if (chon.Status != PromptStatus.OK)
        {
            ed.WriteMessage("\n[XBoss] Chưa chọn gì — bản vẽ không thay đổi.\n");
            return null;
        }

        var timTheoId = tim.ToDictionary(t => t.Id, t => t.Handle);
        var handle = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var soKhongCoXData = 0;
        var soVaiTroKhac = 0;
        var soThuocXref = 0;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            foreach (var id in chon.Value.GetObjectIds())
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
                if (timTheoId.TryGetValue(id, out var h))
                {
                    handle.Add(h);
                    continue;
                }
                if (VeXDataStore.Doc(ent) is null) soKhongCoXData++;
                else soVaiTroKhac++;
            }
            tr.Commit();
        }

        return (
            new TomTatChonNgatNet(handle.Count, soKhongCoXData, soVaiTroKhac, soThuocXref),
            handle);
    }

    /// <summary>
    /// Thực thể nằm trên layer PHỤ THUỘC XREF (<c>tên-xref|LAYER</c>)? Cùng lý do với
    /// <c>VeNhanTuyenCommands</c>: chọn lọt thì mở ForWrite là <c>eInvalidKey</c> kéo rollback cả
    /// lệnh (AC9 — bỏ qua kèm lý do đếm được).
    /// </summary>
    private static bool LayerCuaXref(Transaction tr, Entity ent) =>
        tr.GetObject(ent.LayerId, OpenMode.ForRead) is LayerTableRecord ltr && ltr.IsDependent;

    // ==========================================================================================
    // Báo cáo (FR9)
    // ==========================================================================================

    private static void BaoCao(
        Editor ed,
        IReadOnlyList<CapGiao> trongPhamVi,
        IReadOnlyList<ViecVeDiem> viec,
        TomTatChonNgatNet tomTatChon,
        int soXoa,
        int soChe,
        int soCung,
        IReadOnlyList<string> boQua,
        CrossingPolicySection chinhSach,
        double toMm)
    {
        var soDaoTay = trongPhamVi.Count(c => c.Dong.CoTheDao && c.Dong.DaoTay);
        var soCungHe = trongPhamVi.Count(c => !c.Dong.CoTheDao);
        var soDaGiao = NgatNetDaGiao.Dem(
            trongPhamVi.Where(c => c.Dong.CoTheDao).Select(c => c.Dong), DungSaiDaGiaoMm / toMm);
        var soCoCung = trongPhamVi
            .SelectMany(c => new[] { c.A, c.B })
            .Where(t => t.CoCung)
            .Select(t => t.Handle)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();

        ed.WriteMessage(
            $"\n[XBoss] Đã ngắt nét {viec.Count} điểm giao trên {trongPhamVi.Count(c => c.Dong.CoTheDao)} cặp tuyến: " +
            $"{soChe} vùng che + {soCung} cung cầu vượt (dọn {soXoa} đối tượng của lần chạy trước).\n");
        ed.WriteMessage(
            $"[XBoss] Tham số rule pack: clearance {So(chinhSach.ClearanceMm)}mm · cung cầu vượt " +
            $"R{So(chinhSach.JogRadiusMm)}mm · góc tối thiểu {So(chinhSach.MinAngleDeg)}° · layer " +
            $"<layer tim>{chinhSach.LayerSuffix} · hạng ưu tiên {string.Join(" > ", chinhSach.Priority)}.\n");

        if (tomTatChon.TongBoQua > 0)
            ed.WriteMessage($"[XBoss] Vùng chọn bỏ qua {tomTatChon.TongBoQua} đối tượng (lý do in ở trên).\n");
        if (soCungHe > 0)
        {
            ed.WriteMessage(
                $"[XBoss] {soCungHe} cặp KHÔNG ngắt nét (cùng hệ hoặc không đọc được cỡ) — lý do từng cặp " +
                "in ở trên, các chỗ đó cần kỹ sư xử lý bằng phụ kiện.\n");
        }
        if (soDaoTay > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {soDaoTay} cặp đang ĐẢO TAY (không theo crossingPolicy.priority) — dấu đảo đã ghi " +
                "vào bản vẽ nên chạy lại lệnh vẫn giữ nguyên chiều bạn chọn.\n");
        }
        if (soDaGiao > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {soDaGiao} chỗ ĐA GIAO (từ 3 tuyến trở lên cùng cắt nhau tại một chỗ): lệnh xử lý " +
                "theo từng cặp nên các vùng che chồng nhau — hình vẫn đúng, nhưng hãy nhìn lại bằng mắt trước " +
                "khi in.\n");
        }
        if (soCoCung > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {soCoCung} tuyến trong phạm vi có đoạn CUNG: điểm giao trên đoạn cung được dò theo " +
                "dây cung, vị trí vùng che ở đó có thể lệch — kiểm mắt các chỗ đó.\n");
        }
        if (viec.Count > 0)
        {
            ed.WriteMessage(
                "[XBoss] Vùng che đặt TRÊN nét biên tuyến đi dưới và DƯỚI tuyến đi trên (thứ tự vẽ đã xếp " +
                "theo hạng ưu tiên). Đặt WIPEOUTFRAME = 2 để không in khung vùng che.\n");
        }
        ed.WriteMessage(
            "[XBoss] Tuyến tim KHÔNG bị cắt hay đổi tọa độ — lệnh chỉ thêm đối tượng hiển thị. " +
            "Gỡ sạch: XBOSS_VE_NGATNET_XOA · Hoàn tác cả lệnh: UNDO 1 lần.\n");

        // Lý do bỏ qua là chuyện của LẦN CHẠY này (bản vẽ chỉ giữ được kết quả), nên đẩy vào nhật ký
        // phiên để XBOSS_VE_BAOCAO in lại — cùng cách XBOSS_VE_CHIADOT làm.
        foreach (var d in boQua) VeContext.NhatKyPhien.Add($"XBOSS_VE_NGATNET bỏ qua: {d}");
    }

    private static string So(double v) => v.ToString("#,##0.##", CultureInfo.InvariantCulture);
}
