using System.Globalization;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.RulePack;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeChiaDotCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_CHIADOT</c> (M105 §6, FR4–FR6, AC9/AC10): chia các tuyến đã vẽ bằng <c>XBOSS_VE</c>
/// thành ĐỐT chế tạo/lắp đặt theo kiểu kết nối của rule pack, vẽ vạch chia + tag đốt trên layer
/// riêng và ghi dấu chia đốt vào XData của tim.
///
/// Ranh giới cứng:
/// <list type="bullet">
/// <item>Loại tuyến KHÔNG khai <c>jointRules</c> → BỎ QUA kèm lý do, tuyệt đối không đoán tham số
/// mặc định (AC10) — chia sai đốt là cắt sai tôn/ống ngoài xưởng.</item>
/// <item>Không sửa/xóa tim và nét biên: lệnh chỉ THÊM vạch chia + tag trên layer
/// <c>&lt;layer tim&gt;+jointRules.layerStyle.suffix</c> (§2 guardrail).</item>
/// <item>Mọi hỏi đáp nằm NGOÀI transaction ghi; toàn bộ kết quả một lần chạy nằm trong MỘT
/// transaction = MỘT nhóm UNDO (AC9).</item>
/// <item>Chạy lại là idempotent: xóa vạch/tag cũ CỦA ĐÚNG tuyến đó (XData mang handle tim) rồi vẽ
/// lại — không nhân đôi (journey 5).</item>
/// </list>
///
/// Hình học tính ở Core (<see cref="JointSegmenter"/> chia đốt, <see cref="JointMarkPlacement"/>
/// đặt vạch/tag — thuần, có test); tệp này chỉ đọc bản vẽ, hỏi kỹ sư và vẽ.
/// </summary>
public sealed class VeChiaDotCommands
{
    private enum PhamViChiaDot
    {
        /// <summary>Kỹ sư tự chọn các tuyến cần chia.</summary>
        Chon,

        /// <summary>Quét mọi tuyến của một hệ trong bản vẽ (journey 4).</summary>
        CaHe,
    }

    /// <summary>Từ khóa "để engine tự chọn kiểu nối theo cỡ" trong prompt ghi đè (FR1).</summary>
    private const string TuKhoaTuDong = "TUDONG";

    /// <summary>Một tuyến ứng viên đã đọc xong khỏi bản vẽ (transaction chỉ đọc).</summary>
    private sealed record UngVien(
        ObjectId Id,
        string Handle,
        string LayerTim,
        VeXDataInfo XData,
        DrawLine Tuyen,
        JointRules Rules,
        List<DinhPolyline> Dinh,
        bool Kin,
        List<DoanChiaDot> Doan,
        int RunIndex);

    /// <summary>Việc vẽ của một tuyến — tính xong TRƯỚC khi mở transaction ghi.</summary>
    private sealed record ViecVe(
        UngVien Ung, KetQuaChiaDot KetQua, BoTriChiaDot BoTri, double ChieuDaiVachVe, string LayerVach);

    [CommandMethod("XBOSS_VE_CHIADOT")]
    public void ChiaDot()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;

        // ===== (1) Phạm vi — hỏi NGOÀI transaction (ESC là bản vẽ nguyên trạng) =====
        if (HoiPhamVi(ed) is not { } phamVi) return;

        List<ObjectId>? daChon = null;
        DrawSystem? he = null;
        if (phamVi == PhamViChiaDot.Chon)
        {
            ed.WriteMessage(
                "\n[XBoss] Chọn các tuyến TIM cần chia đốt (quét cả vùng cũng được — đối tượng khác tự bỏ qua).\n");
            var chon = ed.GetSelection();
            if (chon.Status != PromptStatus.OK)
            {
                ed.WriteMessage("\n[XBoss] Chưa chọn tuyến nào — bản vẽ không thay đổi.\n");
                return;
            }
            daChon = chon.Value.GetObjectIds().ToList();
        }
        else
        {
            he = VeContext.HoiHe(ed, pack);
            if (he is null) return;
        }

        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — chiều dài đốt đã quy đổi " +
                "theo đơn vị này, chuẩn dự án là mm.\n");
        }

        // ===== (2) Đọc bản vẽ (transaction CHỈ ĐỌC) =====
        var boQua = new List<string>();
        List<UngVien> ungVien;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            ungVien = DocUngVien(db, tr, pack, daChon, he, toMm, boQua);
            tr.Commit();
        }

        foreach (var d in boQua) ed.WriteMessage($"\n[XBoss] ⚠ {d}\n");
        if (ungVien.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Không có tuyến nào chia đốt được — bản vẽ không thay đổi.\n" +
                "[XBoss] Tuyến phải do XBOSS_VE vẽ (có XData) và loại tuyến phải khai jointRules trong rule pack.\n");
            return;
        }

        // ===== (3) Ghi đè kiểu nối + tỉ lệ in (vẫn NGOÀI transaction ghi) =====
        var ghiDe = HoiGhiDeKieuNoi(ed, ungVien);
        if (ghiDe.Huy) return;
        if (VeContext.HoiTiLeIn(ed, pack) is not { } tiLe) return;
        var caoChu = pack.DrawTools.LabelStyle.TextHeightMm * tiLe / toMm;

        // ===== (4) Chia đốt + đặt vạch/tag (Core thuần, chưa đụng bản vẽ) =====
        var viec = new List<ViecVe>();
        foreach (var u in ungVien)
        {
            try
            {
                var kq = JointSegmenter.ChiaTuyen(new YeuCauChiaDot
                {
                    SystemId = u.XData.HeId,
                    ItemId = u.XData.ItemId,
                    Size = u.XData.Size,
                    SizeKind = u.Tuyen.SizeKind,
                    RunIndex = u.RunIndex,
                    OverrideJointType = ghiDe.KieuNoi,
                    Rules = u.Rules,
                    Segments = u.Doan.Select(d => d.Doan).ToList(),
                });
                viec.Add(new ViecVe(
                    u,
                    kq,
                    JointMarkPlacement.BoTri(kq, u.Doan, u.Dinh, u.Kin, toMm),
                    JointMarkPlacement.ChieuDaiVachMm(u.Tuyen.EdgeStyle, kq.SizeVars) / toMm,
                    JointRulesConfig.LayerVachChia(u.Tuyen.Layer, u.Rules.LayerStyle)));
            }
            catch (RulePackException e)
            {
                // Cỡ không đọc được / bảng selection không phủ cỡ / ghi đè kiểu nối tuyến không
                // khai — bỏ qua ĐÚNG tuyến đó, các tuyến còn lại vẫn chia bình thường.
                var lyDo = $"Tuyến {u.XData.ItemId} {u.XData.Size} (handle {u.Handle}): {e.Message}";
                boQua.Add(lyDo);
                ed.WriteMessage($"\n[XBoss] ⚠ {lyDo}\n");
            }
        }
        if (viec.Count == 0)
        {
            ed.WriteMessage("\n[XBoss] Không tuyến nào chia được — bản vẽ không thay đổi.\n");
            return;
        }

        // ===== (5) Vẽ: MỘT transaction = MỘT nhóm UNDO (AC9) =====
        var soXoa = 0;
        var soVach = 0;
        var soTag = 0;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeXDataStore.DangKyApp(db, tr);
                var ms = (BlockTableRecord)tr.GetObject(
                    SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);

                // Dọn kết quả cũ CỦA ĐÚNG các tuyến sắp vẽ lại (idempotent — journey 5/AC9):
                // lọc theo vai trò XData + handle tim, không xóa theo layer/vùng (sẽ nuốt cả vạch
                // của tuyến khác). Quét một lần rồi mới xóa — không sửa block record khi đang duyệt.
                var chiaDotCu = VeThucThe.ChiaDotTheoTim(db, tr);
                foreach (var v in viec)
                    soXoa += VeThucThe.XoaChiaDotCua(db, tr, chiaDotCu, v.Ung.Handle);

                foreach (var v in viec)
                {
                    // Tim phải mở khóa mới ghi được dấu chia đốt lên XData của nó — sau
                    // XBOSS_VE_NEN thì mọi layer đang khóa (cùng cách XBOSS_VE_DOI làm).
                    VeLayerService.MoKhoaNeuCo(db, tr, v.Ung.LayerTim);
                    DamBaoLayerVach(db, tr, ed, pack, v);
                    foreach (var vach in v.BoTri.Vach)
                    {
                        var (dau, cuoi) = vach.HaiDau(v.ChieuDaiVachVe);
                        var line = new Line(new Point3d(dau.X, dau.Y, 0), new Point3d(cuoi.X, cuoi.Y, 0));
                        VeThucThe.Them(tr, ms, line, v.LayerVach);
                        VeXDataStore.Ghi(line, XDataCon(v, VaiTroVe.VachChia, vach.ChiSoDotTruoc, pack));
                        soVach++;
                    }
                    foreach (var nhan in v.BoTri.Nhan)
                    {
                        var diem = nhan.ViTriChu(v.ChieuDaiVachVe / 2 + caoChu * 0.4);
                        var text = new MText
                        {
                            Contents = nhan.NoiDung,
                            Location = new Point3d(diem.X, diem.Y, 0),
                            TextHeight = caoChu,
                            Rotation = nhan.GocChu,
                            Attachment = AttachmentPoint.BottomCenter,
                        };
                        VeThucThe.Them(tr, ms, text, v.LayerVach);
                        VeXDataStore.Ghi(text, XDataCon(v, VaiTroVe.NhanDot, nhan.ChiSoDot, pack));
                        soTag++;
                    }

                    // Dấu chia đốt trên TIM (FR6) — nguồn của bảng đốt và báo cáo phiên vẽ.
                    if (tr.GetObject(v.Ung.Id, OpenMode.ForWrite) is Entity tim)
                    {
                        VeXDataStore.Ghi(tim, v.Ung.XData with
                        {
                            RulePackVersion = pack.RulePack.Version,
                            KieuNoi = v.KetQua.JointType,
                            KieuNoiGhiDe = v.KetQua.Overridden,
                            SoDot = v.KetQua.PieceCount,
                            SoMoiNoi = v.KetQua.JointCount,
                            TongDaiDotMm = v.KetQua.TotalLengthMm,
                        });
                    }
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi vẽ vạch chia đốt — đã rollback, bản vẽ nguyên trạng: {e.Message}\n" +
                    "[XBoss] Nếu layer đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi thử lại.\n");
                return;
            }
        }

        BaoCao(ed, viec, boQua, soXoa, soVach, soTag);
    }

    // ===== Hỏi đáp (NGOÀI transaction) =====

    private static PhamViChiaDot? HoiPhamVi(Editor ed)
    {
        ed.WriteMessage(
            "\n[XBoss] Phạm vi chia đốt:\n" +
            "[XBoss]   CHON = chọn tay các tuyến cần chia\n" +
            "[XBoss]   CAHE = quét mọi tuyến của một hệ trong bản vẽ\n");
        var hoi = new PromptKeywordOptions("\n[XBoss] Chọn phạm vi") { AllowNone = false };
        hoi.Keywords.Add("CHON", "CHON", "CHON");
        hoi.Keywords.Add("CAHE", "CAHE", "CAHE");
        hoi.Keywords.Default = "CHON";
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return null;
        return kq.StringResult == "CAHE" ? PhamViChiaDot.CaHe : PhamViChiaDot.Chon;
    }

    /// <summary>
    /// Ghi đè kiểu nối (FR1). Chỉ hỏi khi mọi tuyến đang chia thuộc CÙNG một loại tuyến — mỗi loại
    /// tuyến khai một bảng <c>selection</c> riêng, gộp danh sách kiểu nối của nhiều loại vào một
    /// prompt là mời kỹ sư chọn nhầm kiểu không tồn tại ở tuyến kia. Quét cả hệ nhiều loại tuyến ⇒
    /// để engine tự chọn theo cỡ (đúng mặc định của FR1).
    /// </summary>
    private static (string? KieuNoi, bool Huy) HoiGhiDeKieuNoi(Editor ed, IReadOnlyList<UngVien> ungVien)
    {
        var loai = ungVien.Select(u => u.XData.ItemId).Distinct(StringComparer.Ordinal).ToList();
        if (loai.Count != 1)
        {
            ed.WriteMessage(
                $"\n[XBoss] Đang chia {loai.Count} loại tuyến khác nhau — kiểu nối để engine TỰ CHỌN theo cỡ. " +
                "Muốn ghi đè tay thì chạy lại lệnh cho từng loại tuyến.\n");
            return (null, false);
        }

        var mau = ungVien[0];
        var kieuTuDong = ungVien
            .Select(u => JointSegmenter.ChonKieuNoi(
                u.XData.Size, JointRulesConfig.DocKieuCo(u.Tuyen.SizeKind), u.Rules.Selection)?.JointType)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        var macDinh = kieuTuDong.Count == 1 && kieuTuDong[0] is { Length: > 0 } k
            ? VeContext.TuKhoaCua(k)
            : TuKhoaTuDong;

        ed.WriteMessage($"\n[XBoss] Kiểu nối của tuyến {mau.Tuyen.Name} (rule pack khai):\n");
        var theoTuKhoa = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in mau.Rules.Selection)
        {
            var tuKhoa = VeContext.TuKhoaCua(row.JointType);
            if (!theoTuKhoa.TryAdd(tuKhoa, row.JointType)) continue;
            ed.WriteMessage(
                $"[XBoss]   {tuKhoa} = {row.JointType} (đốt ≤ {So(row.MaxLenMm)}mm, khe {So(row.JointGapMm)}mm)\n");
        }
        ed.WriteMessage($"[XBoss]   {TuKhoaTuDong} = để rule pack tự chọn theo cỡ tuyến (khuyến nghị)\n");

        var hoi = new PromptKeywordOptions("\n[XBoss] Kiểu nối") { AllowNone = false };
        foreach (var tuKhoa in theoTuKhoa.Keys) hoi.Keywords.Add(tuKhoa, tuKhoa, tuKhoa);
        hoi.Keywords.Add(TuKhoaTuDong, TuKhoaTuDong, TuKhoaTuDong);
        hoi.Keywords.Default = macDinh;
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return (null, true);
        if (kq.StringResult == TuKhoaTuDong) return (null, false);
        return (theoTuKhoa.GetValueOrDefault(kq.StringResult), false);
    }

    // ===== Đọc bản vẽ =====

    /// <summary>
    /// Các tuyến chia được, kèm lý do BỎ QUA cho phần còn lại (AC10). Số thứ tự tuyến (vào tag đốt)
    /// tính theo TOÀN BẢN VẼ, sắp theo handle — chạy lại với vùng chọn khác vẫn ra đúng tag cũ.
    /// </summary>
    private static List<UngVien> DocUngVien(
        Database db, Transaction tr, DrawToolsPack pack,
        IReadOnlyList<ObjectId>? daChon, DrawSystem? he, double toMm, List<string> boQua)
    {
        // (a) Mọi tim trong bản vẽ → số thứ tự tuyến ổn định theo từng loại tuyến.
        var moiTim = new List<(ObjectId Id, string Handle, VeXDataInfo XData)>();
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Polyline pl) continue;
            var xd = VeXDataStore.Doc(pl);
            if (xd is null || xd.VaiTro != VaiTroVe.Tim) continue;
            moiTim.Add((id, pl.Handle.ToString(), xd));
        }

        var soThuTu = new Dictionary<string, int>(StringComparer.Ordinal);
        var runIndex = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var t in moiTim.OrderBy(t => KhoaHandle(t.Handle)))
        {
            soThuTu[t.XData.ItemId] = soThuTu.GetValueOrDefault(t.XData.ItemId) + 1;
            runIndex[t.Handle] = soThuTu[t.XData.ItemId];
        }

        // (b) Lọc theo phạm vi kỹ sư chọn.
        var trongPhamVi = moiTim;
        if (daChon is not null)
        {
            var chon = new HashSet<ObjectId>(daChon);
            var soKhongPhaiTim = daChon.Count(id => !moiTim.Any(t => t.Id == id));
            if (soKhongPhaiTim > 0)
            {
                boQua.Add(
                    $"Bỏ qua {soKhongPhaiTim} đối tượng không phải tuyến tim của XBOSS_VE — chia đốt phải đọc " +
                    "hệ/size/kiểu nối từ XData của tim, không đoán từ hình học.");
            }
            trongPhamVi = moiTim.Where(t => chon.Contains(t.Id)).ToList();
        }
        else if (he is not null)
        {
            trongPhamVi = moiTim.Where(t => string.Equals(t.XData.HeId, he.Id, StringComparison.Ordinal)).ToList();
            if (trongPhamVi.Count == 0)
                boQua.Add($"Bản vẽ chưa có tuyến nào của hệ {he.Id} do XBOSS_VE vẽ.");
        }

        // (c) Tra rule pack + dựng đoạn tim.
        var ra = new List<UngVien>();
        foreach (var t in trongPhamVi.OrderBy(t => KhoaHandle(t.Handle)))
        {
            var tuyen = TimLoaiTuyen(pack, t.XData);
            if (tuyen is null)
            {
                boQua.Add(
                    $"Tuyến {t.XData.HeId}/{t.XData.ItemId} (handle {t.Handle}) không còn trong rule pack " +
                    $"{pack.RulePack.Version} — bỏ qua.");
                continue;
            }
            if (tuyen.JointRules is not { } rules)
            {
                // AC10 — KHÔNG đoán mặc định: tham số chia đốt sai là cắt sai tôn/ống ngoài xưởng.
                boQua.Add(
                    $"Tuyến {tuyen.Name} ({t.XData.ItemId}, handle {t.Handle}): rule pack " +
                    $"{pack.RulePack.Version} không khai jointRules — BỎ QUA, plugin không đoán tham số chia đốt. " +
                    "Bổ sung jointRules rồi phát hành rule pack version mới.");
                continue;
            }
            if (tr.GetObject(t.Id, OpenMode.ForRead) is not Polyline pl) continue;

            var dinh = VeThucThe.DinhCua(pl);
            var doan = JointMarkPlacement.DoanTuTim(dinh, pl.Closed, toMm);
            if (doan.Count == 0)
            {
                boQua.Add(
                    $"Tuyến {t.XData.ItemId} (handle {t.Handle}) không có đoạn nào đủ chiều dài — bỏ qua.");
                continue;
            }
            ra.Add(new UngVien(
                t.Id, t.Handle, pl.Layer, t.XData, tuyen, rules, dinh, pl.Closed, doan,
                runIndex.GetValueOrDefault(t.Handle, 1)));
        }
        return ra;
    }

    /// <summary>Loại tuyến trong rule pack ứng với XData của tim (theo hệ + itemId).</summary>
    private static DrawLine? TimLoaiTuyen(DrawToolsPack pack, VeXDataInfo xd) =>
        pack.DrawTools.Systems
            .FirstOrDefault(s => string.Equals(s.Id, xd.HeId, StringComparison.Ordinal))
            ?.Lines.FirstOrDefault(l => string.Equals(l.ItemId, xd.ItemId, StringComparison.Ordinal));

    /// <summary>Handle hex → số để sắp thứ tự tạo; handle lạ xếp cuối thay vì làm hỏng cả lệnh.</summary>
    private static long KhoaHandle(string handle)
    {
        try
        {
            return Convert.ToInt64(handle, 16);
        }
        catch (FormatException)
        {
            return long.MaxValue;
        }
        catch (OverflowException)
        {
            return long.MaxValue;
        }
    }

    // ===== Vẽ =====

    /// <summary>
    /// Layer vạch chia theo <c>jointRules.layerStyle</c>: màu ACI của rule pack, và kiểu nét khai
    /// trong rule pack nếu bản vẽ ĐÃ nạp kiểu nét đó (không tự nạp từ tệp .lin ngoài — plugin không
    /// đoán tệp kiểu nét của công ty; thiếu thì báo để kỹ sư LINETYPE nạp một lần).
    /// </summary>
    private static void DamBaoLayerVach(
        Database db, Transaction tr, Editor ed, DrawToolsPack pack, ViecVe v)
    {
        var aci = v.Ung.Rules.LayerStyle.Color ?? VeLayerStyle.AciNhan;
        var id = VeLayerService.DamBaoLayer(db, tr, v.LayerVach, aci, pack.RulePack.LineweightMap, out var vuaTao);
        if (!vuaTao || v.Ung.Rules.LayerStyle.Linetype is not { Length: > 0 } net) return;
        if (!VeLayerService.DatKieuNetNeuCo(db, tr, id, net))
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Bản vẽ chưa nạp kiểu nét \"{net}\" (rule pack khai cho layer {v.LayerVach}) — " +
                "layer dùng nét liền. Nạp kiểu nét bằng lệnh LINETYPE rồi chạy lại nếu cần đúng thể hiện.\n");
        }
    }

    /// <summary>XData của vạch/tag: liên kết ngược về tim + chỉ số đốt (FR6).</summary>
    private static VeXDataInfo XDataCon(ViecVe v, VaiTroVe vaiTro, int chiSoDot, DrawToolsPack pack) =>
        new()
        {
            VaiTro = vaiTro,
            HeId = v.Ung.XData.HeId,
            ItemId = v.Ung.XData.ItemId,
            Size = v.Ung.XData.Size,
            RulePackVersion = pack.RulePack.Version,
            HandleTim = v.Ung.Handle,
            KieuNoi = v.KetQua.JointType,
            KieuNoiGhiDe = v.KetQua.Overridden,
            ChiSoDot = chiSoDot,
        };

    // ===== Báo cáo =====

    private static void BaoCao(
        Editor ed, IReadOnlyList<ViecVe> viec, IReadOnlyList<string> boQua, int soXoa, int soVach, int soTag)
    {
        var tongDot = viec.Sum(v => v.KetQua.PieceCount);
        var tongMoi = viec.Sum(v => v.KetQua.JointCount);

        ed.WriteMessage(
            $"\n[XBoss] Đã chia đốt {viec.Count} tuyến: {tongDot} đốt, {tongMoi} mối nối " +
            $"(vẽ {soVach} vạch chia + {soTag} tag; dọn {soXoa} đối tượng của lần chạy trước).\n");
        foreach (var v in viec)
        {
            ed.WriteMessage(
                $"[XBoss]   {v.Ung.XData.ItemId} {v.Ung.XData.Size} (handle {v.Ung.Handle}): " +
                $"{v.KetQua.JointType}{(v.KetQua.Overridden ? " (ghi đè tay)" : "")} · " +
                $"{v.KetQua.PieceCount} đốt / {v.KetQua.JointCount} mối · " +
                $"tổng dài {So(v.KetQua.TotalLengthMm)}mm · layer {v.LayerVach}\n");
            if (v.Ung.XData.SizeTuNhap)
            {
                ed.WriteMessage(
                    $"[XBoss]   ⚠ Size \"{v.Ung.XData.Size}\" NGOÀI danh mục rule pack — vẫn chia vì đọc được cỡ, " +
                    "soát lại tham số kiểu nối trước khi đặt gia công.\n");
            }
            foreach (var c in v.KetQua.Warnings)
                ed.WriteMessage($"[XBoss]   ⚠ {JointSegmenter.NhanCanhBao[c]}\n");
        }

        if (boQua.Count > 0)
        {
            ed.WriteMessage($"[XBoss] Bỏ qua {boQua.Count} trường hợp (xem lý do phía trên).\n");
            // Vào BÁO CÁO PHIÊN VẼ (XBOSS_VE_BAOCAO) — bản vẽ chỉ ghi được "tuyến chưa chia",
            // còn LÝ DO là chuyện của lần chạy lệnh này.
            foreach (var d in boQua) VeContext.NhatKyPhien.Add($"XBOSS_VE_CHIADOT bỏ qua: {d}");
        }
        ed.WriteMessage(
            "[XBoss] Bảng đốt trong bản vẽ: XBOSS_VE_THONGKE → CHIADOT · Hoàn tác cả lệnh: UNDO 1 lần.\n");
    }

    private static string So(double v) => v.ToString("#,##0.#", CultureInfo.InvariantCulture);
}
