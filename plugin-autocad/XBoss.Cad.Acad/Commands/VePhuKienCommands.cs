using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.Ui.ViewModels;

// Khối chờ chèn dùng CHUNG với các lệnh chèn block khác (giá đỡ, lỗ chờ — M100 PR7): định nghĩa
// nằm ở BlockLibraryService, ở đây chỉ đặt bí danh cho ngắn.
using ChoChen = XBoss.Cad.Acad.Services.BlockLibraryService.KhoiChoChen;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VePhuKienCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_PHUKIEN</c> (chèn phụ kiện trên tuyến), <c>XBOSS_VE_THIETBI</c> (chèn thiết bị có
/// attribute) và <c>XBOSS_VE_THUVIEN</c> (nạp thư viện block) — M100 §6.1 bước 4–5, §6.10,
/// FR5/FR6, AC4/AC5/AC7/AC8.
///
/// Nguyên tắc chung với <c>XBOSS_VE</c>:
/// <list type="bullet">
/// <item>mọi hỏi đáp/bấm điểm nằm NGOÀI transaction ⇒ ESC giữa chừng không để lại gì (§6.11);</item>
/// <item>toàn bộ khối chèn trong một lần chạy lệnh nằm trong MỘT transaction ⇒ một lần UNDO xóa
/// sạch, kể cả định nghĩa block vừa nhập từ thư viện (FR10);</item>
/// <item>hình học (góc tiếp tuyến, tỉ lệ theo size, layer đặt thiết bị) tính ở Core
/// (<see cref="FittingPlacement"/>) — Adapter chỉ gọi API AutoCAD (FR11).</item>
/// </list>
/// </summary>
public sealed class VePhuKienCommands
{
    /// <summary>Giá trị attribute nhớ giữa các lần chèn trong cùng phiên (O3 — đỡ gõ lại).</summary>
    private static readonly Dictionary<string, string> ThuocTinhLanTruoc = new(StringComparer.OrdinalIgnoreCase);

    private static double _gocThietBiLanTruoc;

    // ===== XBOSS_VE_PHUKIEN =====

    [CommandMethod("XBOSS_VE_PHUKIEN")]
    public void ChenPhuKien()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        if (BlockLibraryService.CanThuVien(ed) is not { } thuVien) return;
        var db = doc.Database;

        // (1) Hệ + phụ kiện trong MỘT hộp thoại (M106 §7.2); UI hỏng / XBOSS_UI_DIALOG=0 → đúng hai
        //     câu hỏi cũ (FR9). Danh mục phụ kiện: id khai trong rule pack, định nghĩa ở manifest
        //     thư viện. Block kind support/sleeve tuy cũng khai trong fittings[] nhưng có lệnh riêng
        //     (PR7) — không trộn vào đây để kỹ sư không đặt giá đỡ bằng lệnh phụ kiện.
        var chon0 = HoiHeVaBlock(
            ed, pack, thuVien, "XBOSS_VE_PHUKIEN", "phụ kiện",
            "Sau khi bấm OK: bấm các điểm trên TUYẾN TIM để chèn (Enter = kết thúc).",
            s => s.Fittings, d => d.KindEnum == BlockKind.Fitting, VeContext.PhuKienId);
        if (chon0 is not (var he, var def0)) return;
        VeContext.PhuKienId = def0.Id;

        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — tỉ lệ chèn block " +
                "đã quy đổi theo đơn vị này, chuẩn dự án là mm.\n");
        }

        // (2) Bấm điểm trên tim, lặp tới khi Enter. Chưa đụng bản vẽ (§6.11).
        var muc = new List<ChoChen>();
        while (true)
        {
            var hoi = new PromptEntityOptions(
                $"\n[XBoss] Bấm điểm trên TUYẾN TIM để chèn {def0.Id} (Enter = kết thúc, ESC = hủy cả lệnh): ")
            {
                AllowNone = true,
            };
            hoi.SetRejectMessage("\n[XBoss] Chỉ chèn phụ kiện lên tuyến tim do XBOSS_VE vẽ (polyline).\n");
            hoi.AddAllowedClass(typeof(Polyline), false); // false = nhận cả lớp dẫn xuất
            var chon = ed.GetEntity(hoi);
            if (chon.Status == PromptStatus.None) break; // Enter = chèn những gì đã bấm
            if (chon.Status == PromptStatus.Cancel)
            {
                // ESC = hủy cả lệnh: chưa có gì được tạo nên bản vẽ nguyên trạng (§6.11).
                ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
                return;
            }
            if (chon.Status != PromptStatus.OK)
            {
                ed.WriteMessage("\n[XBoss] Không nhận được đối tượng — kết thúc chọn.\n");
                break;
            }

            var diemBam = chon.PickedPoint.TransformBy(ed.CurrentUserCoordinateSystem);
            List<DinhPolyline> dinh;
            bool kin;
            string layerTim;
            VeXDataInfo? xd;
            using (var tr = db.TransactionManager.StartTransaction())
            {
                if (tr.GetObject(chon.ObjectId, OpenMode.ForRead) is not Polyline pl)
                {
                    tr.Commit();
                    ed.WriteMessage("\n[XBoss] Đối tượng chọn không phải polyline tuyến — bấm lại.\n");
                    continue;
                }
                dinh = VeThucThe.DinhCua(pl);
                kin = pl.Closed;
                layerTim = pl.Layer;
                xd = VeXDataStore.Doc(pl);
                tr.Commit();
            }

            if (xd is null || xd.VaiTro != VaiTroVe.Tim)
            {
                ed.WriteMessage(
                    "\n[XBoss] Đối tượng này không phải TUYẾN TIM do XBOSS_VE vẽ — phụ kiện phải bám tuyến có " +
                    "XData (để lấy size/hệ, và để XBOSS_BOCKL bóc đúng). Vẽ tuyến bằng XBOSS_VE trước.\n");
                continue;
            }
            if (!string.Equals(xd.HeId, he.Id, StringComparison.Ordinal))
            {
                ed.WriteMessage(
                    $"\n[XBoss] ⚠ Tuyến vừa bấm thuộc hệ {xd.HeId}, phụ kiện đang chọn là của hệ {he.Id} — " +
                    "vẫn chèn theo layer của tuyến, kiểm lại nếu bấm nhầm.\n");
            }

            var vt = FittingPlacement.TrenTuyen(dinh, new Diem2(diemBam.X, diemBam.Y), kin);
            if (vt is null)
            {
                ed.WriteMessage("\n[XBoss] Tuyến này không đủ 2 đỉnh phân biệt — không xác định được hướng chèn.\n");
                continue;
            }

            var tyLe = 1.0;
            if (def0.ScaleBySize)
            {
                if (FittingPlacement.TyLeTheoSize(xd.Size, toMm) is { } t) tyLe = t;
                else
                    ed.WriteMessage(
                        $"\n[XBoss] ⚠ Không đọc được bề rộng từ size \"{xd.Size}\" — chèn tỉ lệ 1, chỉnh tay nếu cần.\n");
            }
            var goc = def0.RotateToPath ? vt.Goc : 0;

            muc.Add(new ChoChen(
                new Point3d(vt.Diem.X, vt.Diem.Y, 0),
                goc,
                tyLe,
                layerTim,
                new VeXDataInfo
                {
                    VaiTro = VaiTroVe.PhuKien,
                    HeId = xd.HeId,
                    ItemId = xd.ItemId,
                    Size = xd.Size,
                    RulePackVersion = pack.RulePack.Version,
                    BlockId = def0.Id,
                    ThuVienVersion = thuVien.Version,
                    HandleTim = chon.ObjectId.Handle.ToString(),
                },
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)));
            ed.WriteMessage(
                $"[XBoss]   {muc.Count}. {def0.BlockName} — góc {goc * 180 / Math.PI:0.#}°, tỉ lệ {tyLe:0.###}, " +
                $"layer {layerTim}{(vt.TaiDinh ? " (tại đỉnh — lấy hướng đi vào)" : "")}\n");
        }

        if (muc.Count == 0)
        {
            ed.WriteMessage("\n[XBoss] Chưa chèn phụ kiện nào.\n");
            return;
        }
        if (!BlockLibraryService.ChenHangLoat(doc, ed, db, def0, thuVien, muc)) return;

        ed.WriteMessage(
            $"\n[XBoss] Đã chèn {muc.Count} phụ kiện {def0.Id} ({def0.BlockName}) từ thư viện {thuVien.Version}.\n" +
            "[XBoss] Hoàn tác cả lệnh: UNDO 1 lần.\n");
    }

    // ===== XBOSS_VE_THIETBI =====

    [CommandMethod("XBOSS_VE_THIETBI")]
    public void ChenThietBi()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        if (BlockLibraryService.CanThuVien(ed) is not { } thuVien) return;
        var db = doc.Database;

        // (1) Hệ + thiết bị trong MỘT hộp thoại (M106 §7.2), rơi về hai câu hỏi cũ khi UI hỏng (FR9).
        //     Rule pack khai thiết bị theo ID ITEM TAKEOFF (measure=count), manifest khai block trỏ
        //     ngược lại bằng takeoffItemId — khớp theo cả hai chiều để không kén cách viết.
        var chon0 = HoiHeVaBlock(
            ed, pack, thuVien, "XBOSS_VE_THIETBI", "thiết bị",
            "Sau khi bấm OK: bấm điểm chèn → góc xoay → TAG và các thuộc tính cho TỪNG thiết bị " +
            "(Enter = kết thúc).",
            s => s.Equipment, _ => true, VeContext.ThietBiId, theoItemTakeoff: true);
        if (chon0 is not (var he, var def0)) return;
        VeContext.ThietBiId = def0.Id;

        // (2) Layer đặt thiết bị + đối chiếu tên block với bảng bóc tách (AC4).
        var item = pack.RulePack.Takeoff.Items.FirstOrDefault(
            i => string.Equals(i.Id, def0.TakeoffItemId ?? def0.Id, StringComparison.Ordinal));
        var layerChen = FittingPlacement.LayerChoThietBi(he, item?.LayerMatchAny);
        if (layerChen is null)
        {
            ed.WriteMessage($"\n[XBoss] Hệ {he.Id} chưa khai tuyến nào nên không biết đặt thiết bị lên layer nào.\n");
            return;
        }
        if (layerChen.CanhBao is not null) ed.WriteMessage($"\n[XBoss] ⚠ {layerChen.CanhBao}\n");
        if (item is null)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Không thấy item takeoff \"{def0.TakeoffItemId ?? def0.Id}\" trong rule pack — " +
                "XBOSS_BOCKL sẽ không đếm thiết bị này.\n");
        }
        else if (item.BlockNameMatchAny is not { Count: > 0 } ||
                 !TokenMatcher.MatchesAny(def0.BlockName, item.BlockNameMatchAny))
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Tên block \"{def0.BlockName}\" không khớp blockNameMatchAny của item \"{item.Id}\" — " +
                "chèn được nhưng XBOSS_BOCKL sẽ không đếm (trôi tên giữa thư viện và rule pack).\n");
        }

        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — tỉ lệ chèn block " +
                "đã quy đổi theo đơn vị này, chuẩn dự án là mm.\n");
        }

        // (3) Từng thiết bị: điểm chèn → góc → TAG (bắt buộc) → MODEL/SIZE nếu block có khai.
        var thuocTinhKhai = def0.Attributes
            .Where(a => !string.Equals(a, "TAG", StringComparison.OrdinalIgnoreCase))
            .ToList();
        var muc = new List<ChoChen>();
        var tagDaDung = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        while (true)
        {
            var hoiDiem = new PromptPointOptions(
                $"\n[XBoss] Điểm chèn {def0.Id} (Enter = kết thúc, ESC = hủy cả lệnh): ")
            {
                AllowNone = true,
            };
            var kqDiem = ed.GetPoint(hoiDiem);
            if (kqDiem.Status == PromptStatus.None) break; // Enter = chèn những gì đã nhập
            if (kqDiem.Status != PromptStatus.OK)
            {
                // ESC = hủy cả lệnh: chưa có gì được tạo nên bản vẽ nguyên trạng (§6.11).
                ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
                return;
            }
            var diem = kqDiem.Value.TransformBy(ed.CurrentUserCoordinateSystem);

            // Góc nhập bằng GetAngle (bấm 2 điểm hoặc gõ số) rồi gán thẳng vào Rotation của khối —
            // đúng với mọi bản vẽ dùng quy ước góc mặc định (ANGBASE=0, ANGDIR ngược kim), tức là
            // toàn bộ bản vẽ shop của dự án. Bản vẽ đặt ANGBASE≠0 cần kiểm lại trên máy có AutoCAD
            // (không có runner Windows — M100 §18) trước khi kết luận lệch.
            var hoiGoc = new PromptAngleOptions("\n[XBoss] Góc xoay thiết bị")
            {
                UseBasePoint = true,
                BasePoint = new Point3d(diem.X, diem.Y, 0),
                UseDefaultValue = true,
                DefaultValue = _gocThietBiLanTruoc, // Enter = giữ góc lần trước
            };
            var kqGoc = ed.GetAngle(hoiGoc);
            if (kqGoc.Status is not (PromptStatus.OK or PromptStatus.None))
            {
                ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
                return;
            }
            var goc = kqGoc.Status == PromptStatus.OK ? kqGoc.Value : _gocThietBiLanTruoc;
            _gocThietBiLanTruoc = goc;

            var tag = HoiTag(ed);
            if (tag is null)
            {
                ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
                return;
            }
            if (!tagDaDung.Add(tag))
                ed.WriteMessage($"\n[XBoss] ⚠ TAG \"{tag}\" đã dùng cho một thiết bị vừa chèn trong lệnh này.\n");

            var giaTri = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { ["TAG"] = tag };
            foreach (var ten in thuocTinhKhai)
            {
                ThuocTinhLanTruoc.TryGetValue(ten, out var macDinh);
                var kq = ed.GetString(new PromptStringOptions(
                    $"\n[XBoss] {ten}{(string.IsNullOrEmpty(macDinh) ? " (Enter = bỏ trống)" : $" <{macDinh}>")}: ")
                {
                    AllowSpaces = true,
                });
                if (kq.Status != PromptStatus.OK)
                {
                    ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
                    return;
                }
                var v = kq.StringResult.Length > 0 ? kq.StringResult : macDinh ?? "";
                if (v.Length == 0) continue;
                giaTri[ten] = v;
                ThuocTinhLanTruoc[ten] = v;
            }

            // scaleBySize với thiết bị: chỉ tính được khi block khai thuộc tính SIZE và kỹ sư đã nhập.
            var tyLe = 1.0;
            if (def0.ScaleBySize)
            {
                giaTri.TryGetValue("SIZE", out var size);
                if (FittingPlacement.TyLeTheoSize(size, toMm) is { } t) tyLe = t;
                else
                    ed.WriteMessage(
                        "\n[XBoss] ⚠ Block khai scaleBySize nhưng không đọc được SIZE — chèn tỉ lệ 1.\n");
            }

            muc.Add(new ChoChen(
                new Point3d(diem.X, diem.Y, 0),
                goc,
                tyLe,
                layerChen.Layer,
                new VeXDataInfo
                {
                    VaiTro = VaiTroVe.ThietBi,
                    HeId = he.Id,
                    ItemId = item?.Id ?? def0.TakeoffItemId ?? def0.Id,
                    RulePackVersion = pack.RulePack.Version,
                    BlockId = def0.Id,
                    ThuVienVersion = thuVien.Version,
                },
                giaTri));
            ed.WriteMessage($"[XBoss]   {muc.Count}. {def0.BlockName} TAG={tag} trên layer {layerChen.Layer}\n");
        }

        if (muc.Count == 0)
        {
            ed.WriteMessage("\n[XBoss] Chưa chèn thiết bị nào.\n");
            return;
        }
        if (!BlockLibraryService.ChenHangLoat(doc, ed, db, def0, thuVien, muc)) return;

        ed.WriteMessage(
            $"\n[XBoss] Đã chèn {muc.Count} thiết bị {def0.Id} ({def0.BlockName}) từ thư viện {thuVien.Version}.\n" +
            "[XBoss] Đánh tag hàng loạt/kiểm trùng: XBOSS_VE_TAG · Hoàn tác cả lệnh: UNDO 1 lần.\n");
    }

    // ===== XBOSS_VE_THUVIEN =====

    /// <summary>
    /// Nạp thư viện block: từ tệp trên máy (đường dự phòng khi offline — như <c>XBOSS_RULEPACK</c>)
    /// hoặc tải lại từ server bằng token thiết bị. <c>CommandFlags.Session</c> vì nhánh tải là
    /// bất đồng bộ (không chặn UI AutoCAD — NFR3), cùng khuôn <c>XBOSS_LOGIN</c>.
    /// </summary>
    [CommandMethod("XBOSS_VE_THUVIEN", CommandFlags.Session)]
    public async void NapThuVien()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        _ = doc;

        var (hienCo, loi) = BlockLibraryService.HienHanh();
        var boTron = BlockLibraryService.BoTronHienHanh();
        ed.WriteMessage(hienCo is not null
            ? $"\n[XBoss] Thư viện đang dùng: {hienCo.Version} — {hienCo.Blocks.Count} block " +
              $"({(boTron is null ? "bộ toàn cục" : "bản trộn " + boTron.MoTaHaiBo)}, {BlockLibraryService.ThuMucCache})\n"
            : $"\n[XBoss] {loi}\n");

        var hoi = new PromptKeywordOptions("\n[XBoss] Nạp thư viện block từ đâu?") { AllowNone = false };
        hoi.Keywords.Add("Tep", "Tep", "Tệp trên máy");
        hoi.Keywords.Add("Server", "Server", "Tải từ server XBoss");
        hoi.Keywords.Add("Nguon", "Nguon", "Xem nguồn từng block");
        hoi.Keywords.Default = hienCo is null ? "Server" : "Tep";
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return;

        if (kq.StringResult == "Server")
        {
            await TaiTuServer(ed);
            return;
        }
        if (kq.StringResult == "Nguon")
        {
            LietKeNguon(ed, hienCo);
            return;
        }
        NapTuTep(ed);
    }

    /// <summary>
    /// Liệt kê nguồn của TỪNG block trong thư viện đang dùng (M113 FR5): "Dự án" = lấy từ bộ riêng
    /// của dự án (đè bản toàn cục cùng id, hoặc chỉ dự án mới có), "Toàn cục" = bộ dùng chung.
    /// Kỹ sư phải thấy được block khung tên/ký hiệu mình sắp chèn là của ai — đây là điểm khác nhau
    /// giữa hai chủ đầu tư, không phải chi tiết kỹ thuật.
    /// </summary>
    private static void LietKeNguon(Editor ed, BlockManifest? thuVien)
    {
        if (thuVien is null)
        {
            ed.WriteMessage("\n[XBoss] Chưa có thư viện trên máy nên chưa có gì để xem nguồn.\n");
            return;
        }
        var soDuAn = thuVien.Blocks.Count(b => b.LaCuaDuAn);
        ed.WriteMessage(
            $"\n[XBoss] Nguồn từng block ({soDuAn} của dự án / " +
            $"{thuVien.Blocks.Count - soDuAn} toàn cục):\n");
        foreach (var b in thuVien.Blocks.OrderByDescending(b => b.LaCuaDuAn).ThenBy(b => b.Id, StringComparer.Ordinal))
        {
            ed.WriteMessage(
                $"[XBoss]   [{b.NhanNguon}] {b.Id} (block {b.BlockName}" +
                $"{(b.LibVersion is null ? "" : $", bộ {b.LibVersion}")})\n");
        }
    }

    private static async Task TaiTuServer(Editor ed)
    {
        var baseUrl = XBossLoginCommand.DocServerUrl();
        if (baseUrl is null)
        {
            ed.WriteMessage("\n[XBoss] Chưa cấu hình server XBoss trên máy này — chạy XBOSS_LOGIN trước.\n");
            return;
        }
        if (CredentialStore.DocToken(baseUrl) is not { } token)
        {
            ed.WriteMessage($"\n[XBoss] Chưa ghép thiết bị với {baseUrl} — chạy XBOSS_LOGIN trước.\n");
            return;
        }
        ed.WriteMessage($"\n[XBoss] Đang tải thư viện block từ {baseUrl}...\n");
        // Bộ toàn cục + bản trộn của dự án đang chọn (M113 FR5) — hai ô cache song song.
        foreach (var dong in await BlockLibraryService.TaiVeDayDuAsync(new XBossApiClient(baseUrl), token))
            ed.WriteMessage($"[XBoss] {dong}\n");
    }

    private static void NapTuTep(Editor ed)
    {
        var dlgManifest = new Autodesk.AutoCAD.Windows.OpenFileDialog(
            "Chọn manifest thư viện block (tệp .json phát hành kèm tệp .dwg)",
            "", "json", "XBossBlockLib",
            Autodesk.AutoCAD.Windows.OpenFileDialog.OpenFileDialogFlags.DefaultIsFolder);
        if (dlgManifest.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;

        string? duongDanDwg;
        try
        {
            var thuMuc = Path.GetDirectoryName(dlgManifest.Filename) ?? "";
            var dsDwg = Directory.GetFiles(thuMuc, "*.dwg");
            duongDanDwg = dsDwg.Length == 1 ? dsDwg[0] : null;
        }
        catch (IOException e)
        {
            ed.WriteMessage($"\n[XBoss] Không đọc được thư mục thư viện: {e.Message}\n");
            return;
        }

        if (duongDanDwg is null)
        {
            // Không có/nhiều hơn một tệp .dwg cạnh manifest → hỏi rõ tệp nào, không đoán.
            var dlgDwg = new Autodesk.AutoCAD.Windows.OpenFileDialog(
                "Chọn tệp .dwg thư viện block đi kèm manifest",
                "", "dwg", "XBossBlockLibDwg",
                Autodesk.AutoCAD.Windows.OpenFileDialog.OpenFileDialogFlags.DefaultIsFolder);
            if (dlgDwg.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;
            duongDanDwg = dlgDwg.Filename;
        }

        var (manifest, thongDiep) = BlockLibraryService.NapTay(dlgManifest.Filename, duongDanDwg);
        ed.WriteMessage($"\n[XBoss] {(manifest is null ? "" : "✔ ")}{thongDiep}\n");
    }

    // ===== Thu tham số: hộp thoại (mặc định) hoặc dòng lệnh (M106 FR9) =====

    /// <summary>
    /// Hệ + block cho một lần chèn, dùng chung cho <c>XBOSS_VE_PHUKIEN</c> và
    /// <c>XBOSS_VE_THIETBI</c>. Danh mục block của MỌI hệ được tra sẵn ở đây (Adapter đọc manifest)
    /// rồi mới mở hộp thoại — hộp thoại chỉ thu tham số, không chạm tệp thư viện (guardrail M106 §2).
    /// Trả null khi kỹ sư hủy hoặc không hệ nào dùng được.
    /// </summary>
    private static (DrawSystem He, BlockDef Block)? HoiHeVaBlock(
        Editor ed,
        DrawToolsPack pack,
        BlockManifest thuVien,
        string lenh,
        string nhanLoai,
        string moTaSauOk,
        Func<DrawSystem, IReadOnlyList<string>> idCua,
        Func<BlockDef, bool> loc,
        string? blockIdLanTruoc,
        bool theoItemTakeoff = false)
    {
        var cacHe = new List<HeCoBlock>();
        foreach (var sys in pack.DrawTools.Systems)
        {
            var dung = new List<BlockDef>();
            var thieu = new List<string>();
            foreach (var id in idCua(sys))
            {
                var def = theoItemTakeoff ? thuVien.TimThietBiTheoItem(id) : thuVien.TimTheoId(id);
                if (def is null) thieu.Add(id);
                else if (loc(def)) dung.Add(def);
            }
            if (dung.Count > 0) cacHe.Add(new HeCoBlock(sys, dung, thieu));
        }

        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new ChonBlockDialogViewModel(
                lenh, nhanLoai, thuVien.Version, moTaSauOk, cacHe, VeContext.He?.Id, blockIdLanTruoc);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi)
        {
            if (kq is null) return null;
            VeContext.He = kq.He; // ghi nhớ hệ của phiên (FR4)
            return (kq.He, kq.Block);
        }

        // ----- Đường hỏi đáp dòng lệnh cũ (FR9) -----
        var he = VeContext.HoiHe(ed, pack);
        if (he is null) return null;
        var muc = cacHe.FirstOrDefault(h => string.Equals(h.He.Id, he.Id, StringComparison.Ordinal));
        var thieuCuaHe = muc?.Thieu ?? idCua(he)
            .Where(id => (theoItemTakeoff ? thuVien.TimThietBiTheoItem(id) : thuVien.TimTheoId(id)) is null)
            .ToList();
        if (thieuCuaHe.Count > 0)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Thư viện {thuVien.Version} chưa có {nhanLoai}: {string.Join(", ", thieuCuaHe)} — " +
                "phát hành lại thư viện hoặc sửa rule pack ở version sau.\n");
        }
        if (muc is null)
        {
            ed.WriteMessage(
                $"\n[XBoss] Hệ {he.Id} chưa có {nhanLoai} nào dùng được trong thư viện {thuVien.Version}.\n");
            return null;
        }
        var def0 = BlockLibraryService.HoiBlock(
            ed, $"{char.ToUpperInvariant(nhanLoai[0])}{nhanLoai[1..]} của hệ {he.Id}", muc.Blocks, blockIdLanTruoc);
        return def0 is null ? null : (he, def0);
    }

    // ===== Trợ giúp =====

    /// <summary>TAG bắt buộc (FR6): hỏi lại khi bỏ trống; null = kỹ sư hủy lệnh.</summary>
    private static string? HoiTag(Editor ed)
    {
        while (true)
        {
            var kq = ed.GetString(new PromptStringOptions("\n[XBoss] TAG thiết bị (bắt buộc): ")
            {
                AllowSpaces = false,
            });
            if (kq.Status != PromptStatus.OK) return null;
            var v = kq.StringResult.Trim();
            if (v.Length > 0) return v;
            ed.WriteMessage("\n[XBoss] TAG không được để trống — nhập lại hoặc ESC để hủy.\n");
        }
    }
}
