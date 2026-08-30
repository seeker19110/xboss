using System.Globalization;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Ui.ViewModels;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeRevCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// Bộ 3 lệnh revision cloud (M110): <c>XBOSS_VE_REV</c> khoanh vùng đã sửa,
/// <c>XBOSS_VE_REV_CHOT</c> chốt một revision (bảng revision khung tên + mốc so sánh),
/// <c>XBOSS_VE_REV_HIENTHI</c> bật/tắt hiển thị cloud theo từng revision.
///
/// Ranh giới cứng:
/// <list type="bullet">
/// <item><b>Không đụng hình học nghiệp vụ</b> (guardrail 1): cloud + tam giác là chú thích trên
/// layer riêng <c>&lt;revisionPolicy.layer&gt;-R{n}</c>, mang XData vai trò
/// <see cref="VaiTroVe.Revision"/>; tim/biên/phụ kiện không bị chạm ⇒ <c>XBOSS_BOCKL</c> cho
/// đúng con số như trước (AC10).</item>
/// <item><b>Số revision là chuỗi tăng, không tái sử dụng</b> (guardrail 2): vượt
/// <c>maxRows</c> thì DỪNG, không bao giờ ghi đè dòng revision cũ (AC6).</item>
/// <item>Cloud của revision cũ giữ nguyên, chỉ đổi hiển thị (FR6/AC4).</item>
/// <item>1 lệnh = 1 nhóm UNDO, mọi hỏi đáp nằm NGOÀI transaction ghi (M100 §6.11/AC9).</item>
/// </list>
///
/// Toàn bộ phần tính toán ở Core thuần, có test chạy CI Linux: <see cref="RevisionCloud"/> (hình
/// cloud + chỗ đặt tam giác), <see cref="RevisionSnapshot"/> (băm hình học, so mốc §4),
/// <see cref="RevisionDialogViewModel"/>/<see cref="RevChotDialogViewModel"/> (hộp thoại M106).
/// Tệp này chỉ đọc bản vẽ, hỏi kỹ sư và vẽ.
/// </summary>
public sealed class VeRevCommands
{
    /// <summary>Từ khóa "tự chọn vùng bằng chuột" ở đường hỏi đáp dòng lệnh (FR1/FR9).</summary>
    private const string TuKhoaTay = "TAY";

    /// <summary>Từ khóa "khoanh mọi đề xuất" ở đường hỏi đáp dòng lệnh.</summary>
    private const string TuKhoaTatCa = "TATCA";

    /// <summary>Một vùng sắp khoanh: bao hình + các handle đối tượng nằm trong vùng (FR3).</summary>
    private sealed record VungKhoanh(BaoHinh Bao, IReadOnlyList<string> Handle, string MoTa);

    /// <summary>Bọc kết quả hộp thoại FR6 (<see cref="HopThoaiXBoss.Thu{T}"/> chỉ nhận kiểu tham chiếu).</summary>
    private sealed record ChonHienThi(IReadOnlyList<int> So);

    /// <summary>Một cloud đã có trong bản vẽ (đọc trong transaction chỉ đọc) — dùng cho FR5/FR7.</summary>
    private sealed record CloudDaCo(
        ObjectId Id, string Handle, int So, BaoHinh Bao, IReadOnlyList<string> HandleTrongVung, string? HandleCapDoi);

    // ===================================================================================
    // FR1/FR2/FR3/FR7 — XBOSS_VE_REV: khoanh vùng
    // ===================================================================================

    [CommandMethod("XBOSS_VE_REV")]
    public void Rev()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        if (ChinhSach(ed, pack) is not { } rev) return;
        var db = doc.Database;
        var (toMm, canCanhBaoDonVi, tenDonVi) = DrawingUnits.TuInsUnits((int)db.Insunits);
        if (canCanhBaoDonVi)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Đơn vị bản vẽ: {tenDonVi} (INSUNITS={(int)db.Insunits}) — kích thước cloud đã " +
                "quy đổi theo đơn vị này, chuẩn dự án là mm.\n");
        }

        // ===== (1) Đọc bản vẽ + so mốc (transaction CHỈ ĐỌC) =====
        RevisionStore.Moc? moc;
        List<MucMoc> hienTai;
        List<CloudDaCo> cloudDaCo;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            moc = RevisionStore.DocMoc(db, tr);
            hienTai = RevisionStore.QuetHienTai(db, tr);
            cloudDaCo = DocCloud(db, tr);
            tr.Commit();
        }

        var so = (moc?.So ?? 0) + 1;
        var (deXuat, lyDo) = DeXuat(moc, hienTai);
        ed.WriteMessage(
            $"\n[XBoss] ===== KHOANH REVISION R{so.ToString(CultureInfo.InvariantCulture)} =====\n");
        if (lyDo is not null) ed.WriteMessage($"[XBoss] ⚠ {lyDo}\n");

        // ===== (2) Hỏi (NGOÀI transaction ghi) =====
        var daDungUi = false;
        KetQuaHoiRevision? chon = null;
        if (!HopThoaiXBoss.BiTat)
        {
            (daDungUi, chon) = HopThoaiXBoss.Thu(ed, () =>
            {
                var vm = new RevisionDialogViewModel(so, deXuat, lyDo)
                {
                    ZoomToi = m => ZoomToiVung(ed, m.ThayDoi.Vung, rev.BoundingPaddingMm / toMm),
                };
                return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
            });
            if (daDungUi && chon is null) return; // kỹ sư bấm Hủy — bản vẽ nguyên trạng
        }
        chon ??= HoiDongLenh(ed, so, deXuat);
        if (chon is null) return;

        var vung = new List<VungKhoanh>();
        if (chon.TuChonVung)
        {
            if (HoiVungBangChuot(ed) is not { } baoTay) return;
            vung.Add(new VungKhoanh(baoTay, [], "vùng tự chọn bằng chuột"));
        }
        else
        {
            foreach (var d in chon.DaChon)
                vung.Add(new VungKhoanh(d.Vung, [d.Handle], MucDeXuatRevision.NhanLoai(d.Loai)));
        }
        if (vung.Count == 0)
        {
            ed.WriteMessage("\n[XBoss] Không có vùng nào để khoanh — bản vẽ không thay đổi.\n");
            return;
        }

        if (VeContext.HoiTiLeIn(ed, pack) is not { } tiLe) return;

        // Định nghĩa block tam giác — nhập NGOÀI transaction ghi (WblockClone làm việc thẳng trên
        // database), vẫn cùng một lệnh nên vẫn một lần UNDO (như BlockLibraryService.ChenHangLoat).
        if (ChuanBiTamGiac(ed, db, rev) is not { } tamGiac) return;

        // ===== (3) Hình cloud (Core thuần, chưa đụng bản vẽ) =====
        var boTri = vung
            .Select(v => (Vung: v, Cloud: RevisionCloud.Dung(
                v.Bao, rev.BoundingPaddingMm / toMm, rev.CloudArcMm / toMm, tiLe)))
            .ToList();

        // ===== (4) Vẽ: MỘT transaction = MỘT nhóm UNDO (AC9) =====
        var soXoa = 0;
        var soVe = 0;
        var layerCon = RevisionStore.LayerCua(rev.Layer, so);
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeXDataStore.DangKyApp(db, tr);
                var ms = (BlockTableRecord)tr.GetObject(
                    SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);
                // Layer gốc giữ vai trò "layer chuẩn của bảng revision" trong rule pack; cloud nằm
                // trên layer CON để FR6 bật/tắt từng revision mà không đụng đối tượng.
                VeLayerService.DamBaoLayer(db, tr, rev.Layer, VeLayerStyle.AciNhan, pack.RulePack.LineweightMap, out _);
                VeLayerService.DamBaoLayer(db, tr, layerCon, VeLayerStyle.AciNhan, pack.RulePack.LineweightMap, out _);
                var dinhNghia = tamGiac.DaNhap
                    ? BlockLibraryService.DanhDauDinhNghia(db, tr, tamGiac.Def, tamGiac.ThuVienVersion)
                    : BlockLibraryService.MoDinhNghia(db, tr, tamGiac.Def.BlockName);

                foreach (var (v, cloud) in boTri)
                {
                    // FR7 — chạy lại trên cùng vùng/đề xuất: xóa cặp cũ rồi vẽ lại tại chỗ, không
                    // nhân đôi cloud + tam giác (AC5).
                    soXoa += XoaCapCu(db, tr, cloudDaCo, so, v);

                    var pl = VeThucThe.TaoPolyline(cloud.Dinh, kin: true);
                    VeThucThe.Them(tr, ms, pl, layerCon);

                    var khoi = new BlockReference(
                        new Point3d(cloud.ViTriTamGiac.X, cloud.ViTriTamGiac.Y, 0), dinhNghia.ObjectId)
                    {
                        // Ký hiệu chú thích: cỡ theo tỉ lệ in, đúng cách nhãn size của XBOSS_VE_NHAN
                        // quy chiều cao chữ (block thư viện vẽ ở cỡ 1:1 tính bằng mm).
                        ScaleFactors = new Scale3d(tiLe / toMm),
                    };
                    ms.AppendEntity(khoi);
                    tr.AddNewlyCreatedDBObject(khoi, true);
                    khoi.Layer = layerCon; // đặt SAU khi vào database (như XBOSS_VE)
                    BlockLibraryService.ThemThuocTinh(tr, khoi, dinhNghia, TheSoRevision(tr, dinhNghia, rev, so));

                    var handleCloud = pl.Handle.ToString();
                    var handleTamGiac = khoi.Handle.ToString();
                    VeXDataStore.Ghi(pl, new VeXDataInfo
                    {
                        VaiTro = VaiTroVe.Revision,
                        RulePackVersion = pack.RulePack.Version,
                        SoRevision = so,
                        HandleCapDoi = handleTamGiac,
                        HandleTrongVung = v.Handle,
                    });
                    VeXDataStore.Ghi(khoi, new VeXDataInfo
                    {
                        VaiTro = VaiTroVe.Revision,
                        RulePackVersion = pack.RulePack.Version,
                        BlockId = tamGiac.Def.Id,
                        ThuVienVersion = tamGiac.ThuVienVersion,
                        SoRevision = so,
                        HandleCapDoi = handleCloud,
                    });
                    soVe++;
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi vẽ revision cloud — đã rollback, bản vẽ nguyên trạng: {e.Message}\n" +
                    "[XBoss] Nếu layer đang khóa: chạy XBOSS_VE_NEN (hoặc mở khóa layer) rồi thử lại.\n");
                return;
            }
            catch (BlockManifestException e)
            {
                tr.Abort();
                ed.WriteMessage($"\n[XBoss] {e.Message}\n");
                return;
            }
        }

        ed.WriteMessage(
            $"[XBoss] Đã khoanh {soVe} vùng cho R{so.ToString(CultureInfo.InvariantCulture)} trên layer " +
            $"{layerCon} (cập nhật tại chỗ {soXoa} đối tượng của lần chạy trước).\n" +
            "[XBoss] Chốt revision: XBOSS_VE_REV_CHOT · Hiện/ẩn theo revision: XBOSS_VE_REV_HIENTHI · " +
            "Hoàn tác cả lệnh: UNDO 1 lần.\n");
        VeContext.NhatKyPhien.Add(
            $"XBOSS_VE_REV: khoanh {soVe} vùng cho R{so.ToString(CultureInfo.InvariantCulture)}" +
            (chon.TuChonVung ? " (tự chọn vùng bằng chuột)" : " (theo đề xuất so mốc)") + ".");
    }

    // ===================================================================================
    // FR4/FR5 — XBOSS_VE_REV_CHOT: chốt revision
    // ===================================================================================

    [CommandMethod("XBOSS_VE_REV_CHOT")]
    public void RevChot()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        if (ChinhSach(ed, pack) is not { } rev) return;
        var db = doc.Database;

        RevisionStore.Moc? moc;
        List<MucMoc> hienTai;
        List<CloudDaCo> cloudDaCo;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            moc = RevisionStore.DocMoc(db, tr);
            hienTai = RevisionStore.QuetHienTai(db, tr);
            cloudDaCo = DocCloud(db, tr);
            tr.Commit();
        }

        var so = (moc?.So ?? 0) + 1;
        if (so > rev.MaxRows)
        {
            // AC6 — DỪNG, tuyệt đối không ghi đè dòng revision cũ (guardrail 2).
            ed.WriteMessage(
                $"\n[XBoss] Khung tên chỉ chứa được {rev.MaxRows.ToString(CultureInfo.InvariantCulture)} dòng " +
                $"revision (drawTools.revisionPolicy.maxRows) mà bản vẽ đang chốt " +
                $"R{so.ToString(CultureInfo.InvariantCulture)} — DỪNG, bảng revision không mất dòng nào.\n" +
                "[XBoss] Cách xử lý: đổi sang khung tên nhiều dòng revision hơn, hoặc gộp các lần sửa " +
                "còn lại vào một revision.\n");
            return;
        }

        // FR5 — thay đổi phát hiện được mà KHÔNG nằm trong cloud nào của revision đang chốt.
        var (thayDoi, lyDo) = DeXuat(moc, hienTai);
        if (lyDo is not null) ed.WriteMessage($"\n[XBoss] ⚠ {lyDo}\n");
        var cloudCuaRev = cloudDaCo.Where(c => c.So == so).ToList();
        var boSot = thayDoi.Where(t => !DaKhoanh(t, cloudCuaRev)).ToList();

        // ===== Hỏi (NGOÀI transaction ghi) =====
        var daDungUi = false;
        KetQuaHoiRevChot? traLoi = null;
        var ngayMacDinh = DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        if (!HopThoaiXBoss.BiTat)
        {
            (daDungUi, traLoi) = HopThoaiXBoss.Thu(ed, () =>
            {
                var vm = new RevChotDialogViewModel(so, rev.MaxRows, ngayMacDinh, Environment.UserName, boSot);
                return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
            });
            if (daDungUi && traLoi is null) return;
        }
        traLoi ??= HoiChotDongLenh(ed, so, ngayMacDinh, boSot);
        if (traLoi is null) return;

        // ===== Ghi: MỘT transaction = MỘT nhóm UNDO (AC9) =====
        var soLayoutGhi = 0;
        var canhBao = new List<string>();
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                soLayoutGhi = GhiBangRevision(db, tr, rev, traLoi, canhBao);
                // Mốc mới đọc lại NGAY trong transaction ghi để đúng trạng thái tại thời điểm chốt.
                RevisionStore.GhiMoc(db, tr, new RevisionStore.Moc(so, traLoi.NgayIso, RevisionStore.QuetHienTai(db, tr)));
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi chốt revision — đã rollback, bản vẽ nguyên trạng: {e.Message}\n");
                return;
            }
        }

        ed.WriteMessage(
            $"\n[XBoss] Đã chốt R{so.ToString(CultureInfo.InvariantCulture)} ({traLoi.NgayIso} · " +
            $"{traLoi.Nguoi}): ghi bảng revision vào {soLayoutGhi.ToString(CultureInfo.InvariantCulture)} layout, " +
            $"lưu mốc {hienTai.Count.ToString(CultureInfo.InvariantCulture)} đối tượng để so cho lần sửa sau.\n");
        foreach (var c in canhBao)
        {
            ed.WriteMessage($"[XBoss] ⚠ {c}\n");
            VeContext.NhatKyPhien.Add($"XBOSS_VE_REV_CHOT: {c}");
        }
        if (boSot.Count > 0)
        {
            VeContext.NhatKyPhien.Add(
                $"XBOSS_VE_REV_CHOT: chốt R{so.ToString(CultureInfo.InvariantCulture)} khi còn " +
                $"{boSot.Count.ToString(CultureInfo.InvariantCulture)} thay đổi CHƯA khoanh cloud (kỹ sư xác nhận vẫn chốt).");
        }
        ed.WriteMessage(
            "[XBoss] Cloud của revision cũ vẫn còn trong bản vẽ — ẩn/hiện bằng XBOSS_VE_REV_HIENTHI.\n");
    }

    // ===================================================================================
    // FR6 — XBOSS_VE_REV_HIENTHI: bật/tắt hiển thị theo revision
    // ===================================================================================

    [CommandMethod("XBOSS_VE_REV_HIENTHI")]
    public void RevHienThi()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        if (ChinhSach(ed, pack) is not { } rev) return;
        var db = doc.Database;

        List<CloudDaCo> cloudDaCo;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            cloudDaCo = DocCloud(db, tr);
            tr.Commit();
        }

        var soDoiTuong = new Dictionary<int, int>();
        using (var tr = db.TransactionManager.StartTransaction())
        {
            foreach (var r in RevisionStore.QuetRevision(db, tr))
            {
                var n = r.XData.SoRevision ?? 0;
                soDoiTuong[n] = soDoiTuong.GetValueOrDefault(n) + 1;
            }
            tr.Commit();
        }
        var cacSo = soDoiTuong.Keys.Where(n => n > 0).Order().ToList();
        if (cacSo.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Bản vẽ chưa có revision cloud nào — chạy XBOSS_VE_REV để khoanh vùng sửa trước.\n");
            return;
        }

        // Mặc định của FR6: revision hiện hành HIỆN, các revision cũ TẮT.
        var hienHanh = cacSo.Max();
        var muc = cacSo
            .Select(n => new MucHienThiRevision(
                n, soDoiTuong[n], RevisionStore.LayerCua(rev.Layer, n), n == hienHanh))
            .ToList();

        var daDungUi = false;
        IReadOnlyList<int>? canHien = null;
        if (!HopThoaiXBoss.BiTat)
        {
            var (dung, kq) = HopThoaiXBoss.Thu(ed, () =>
            {
                var vm = new HienThiRevisionDialogViewModel(muc);
                return XBossDialog.Hoi(vm) ? new ChonHienThi(vm.KetQua()) : null;
            });
            daDungUi = dung;
            if (daDungUi && kq is null) return;
            canHien = kq?.So;
        }
        canHien ??= HoiHienThiDongLenh(ed, cacSo, hienHanh);
        if (canHien is null) return;

        var hien = new HashSet<int>(canHien);
        var doi = new List<string>();
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
                foreach (var n in cacSo)
                {
                    var ten = RevisionStore.LayerCua(rev.Layer, n);
                    if (!lt.Has(ten))
                    {
                        doi.Add($"R{n.ToString(CultureInfo.InvariantCulture)}: chưa có layer {ten} — bỏ qua.");
                        continue;
                    }
                    var ltr = (LayerTableRecord)tr.GetObject(lt[ten], OpenMode.ForWrite);
                    var tat = !hien.Contains(n);
                    if (ltr.IsOff != tat) ltr.IsOff = tat;
                    doi.Add($"R{n.ToString(CultureInfo.InvariantCulture)}: {(tat ? "ẨN" : "HIỆN")} (layer {ten})");
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage($"\n[XBoss] LỖI khi đổi hiển thị revision — đã rollback: {e.Message}\n");
                return;
            }
        }

        ed.WriteMessage("\n[XBoss] Hiển thị revision cloud:\n");
        foreach (var d in doi) ed.WriteMessage($"[XBoss]   {d}\n");
        ed.WriteMessage("[XBoss] Cloud chỉ bị ẨN, không bị xóa — hồ sơ vẫn tra ngược được.\n");
    }

    // ===================================================================================
    // Hạ tầng chung
    // ===================================================================================

    /// <summary>
    /// Khối <c>drawTools.revisionPolicy</c> đang có hiệu lực; null + thông báo cách bật khi rule
    /// pack chưa khai hoặc còn tắt (AC8 — cả 3 lệnh dừng, bản vẽ không đổi).
    /// </summary>
    private static RevisionPolicySection? ChinhSach(Editor ed, DrawToolsPack pack)
    {
        if (pack.DrawTools.RevisionPolicy is not { } rev)
        {
            ed.WriteMessage(
                $"\n[XBoss] Rule pack {pack.RulePack.Version} chưa khai drawTools.revisionPolicy — bộ lệnh " +
                "revision cloud cần rule pack v11 trở lên. Tải bản mới ở trang XBoss " +
                "/engineering/chuan-hoa-ban-ve rồi chạy XBOSS_RULEPACK.\n");
            return null;
        }
        if (!rev.Enabled)
        {
            ed.WriteMessage(
                "\n[XBoss] drawTools.revisionPolicy.enabled = false — bộ lệnh revision cloud đang TẮT, " +
                "bản vẽ không thay đổi.\n" +
                "[XBoss] Bật bằng cách phát hành rule pack (theo dự án) với enabled = true, kiểm lại " +
                "cloudArcMm/layer/triangleBlockId/numberFormat/maxRows cho khớp khung tên công ty.\n");
            return null;
        }
        return rev;
    }

    /// <summary>Đề xuất vùng khoanh theo §4, kèm LÝ DO tiếng Việt khi không đề xuất được.</summary>
    private static (IReadOnlyList<ThayDoiRevision> DeXuat, string? LyDo) DeXuat(
        RevisionStore.Moc? moc, IReadOnlyList<MucMoc> hienTai)
    {
        if (moc is null)
        {
            return ([],
                "Bản vẽ chưa từng chốt revision nên chưa có mốc để so — lần này khoanh tay, " +
                "chạy XBOSS_VE_REV_CHOT xong thì các lần sau plugin đề xuất được vùng đã sửa.");
        }
        if (RevisionSnapshot.MocVoHieu(moc.Muc, hienTai))
        {
            return ([],
                "Mốc revision không khớp handle nào của bản vẽ hiện tại (dấu hiệu bản vẽ đã bị " +
                "WBLOCK/copy sang tệp khác) — KHÔNG đề xuất bừa; khoanh tay lần này rồi chạy " +
                "XBOSS_VE_REV_CHOT để chốt lại mốc.");
        }
        return (RevisionSnapshot.SoMoc(moc.Muc, hienTai), null);
    }

    /// <summary>Cloud (không tính tam giác) đang có trong bản vẽ, kèm bao hình để so vùng.</summary>
    private static List<CloudDaCo> DocCloud(Database db, Transaction tr)
    {
        var ra = new List<CloudDaCo>();
        foreach (var r in RevisionStore.QuetRevision(db, tr))
        {
            if (!r.LaCloud || r.XData.SoRevision is not { } so) continue;
            if (tr.GetObject(r.Id, OpenMode.ForRead) is not Entity ent) continue;
            if (RevisionStore.BaoHinhCua(ent) is not { } bao) continue;
            ra.Add(new CloudDaCo(r.Id, r.Handle, so, bao, r.XData.HandleTrongVung, r.XData.HandleCapDoi));
        }
        return ra;
    }

    /// <summary>
    /// Một thay đổi đã nằm trong cloud nào của revision đang chốt chưa (FR5): khớp theo HANDLE ghi
    /// trong XData của cloud (đường đề xuất), hoặc theo bao hình nằm gọn trong vùng cloud (đường
    /// kỹ sư tự khoanh bằng chuột — cloud đó không mang handle nào).
    /// </summary>
    private static bool DaKhoanh(ThayDoiRevision t, IReadOnlyList<CloudDaCo> cloud) =>
        cloud.Any(c =>
            c.HandleTrongVung.Contains(t.Handle, StringComparer.OrdinalIgnoreCase) ||
            (t.Vung.MinX >= c.Bao.MinX && t.Vung.MaxX <= c.Bao.MaxX &&
             t.Vung.MinY >= c.Bao.MinY && t.Vung.MaxY <= c.Bao.MaxY));

    /// <summary>
    /// FR7 — xóa cặp cloud + tam giác của LẦN CHẠY TRƯỚC ứng với đúng vùng sắp vẽ: cùng số
    /// revision VÀ (trùng handle đối tượng trong vùng, hoặc bao hình gần trùng khi khoanh tay).
    /// Trả số đối tượng đã xóa.
    /// </summary>
    private static int XoaCapCu(
        Database db, Transaction tr, IReadOnlyList<CloudDaCo> cloudDaCo, int so, VungKhoanh vung)
    {
        var soXoa = 0;
        foreach (var c in cloudDaCo.Where(c => c.So == so && TrungVung(c, vung)))
        {
            soXoa += XoaNeuCon(db, tr, c.Id);
            if (VeThucThe.TimTheoHandle(db, c.HandleCapDoi) is { } idTamGiac)
                soXoa += XoaNeuCon(db, tr, idTamGiac);
        }
        return soXoa;
    }

    /// <summary>Cloud cũ có đang khoanh đúng vùng này không (theo handle, hoặc theo tâm bao hình).</summary>
    private static bool TrungVung(CloudDaCo cu, VungKhoanh moi)
    {
        if (moi.Handle.Count > 0)
            return moi.Handle.Any(h => cu.HandleTrongVung.Contains(h, StringComparer.OrdinalIgnoreCase));

        // Khoanh tay: coi là "cùng một vùng" khi tâm lệch nhau không quá 1/4 kích thước cloud cũ —
        // đủ chặt để không nuốt cloud của vùng khác, đủ rộng để chạy lại trên cùng vùng không nhân đôi.
        var dung = Math.Max(cu.Bao.Rong, cu.Bao.Cao) / 4;
        return Math.Abs(TamX(cu.Bao) - TamX(moi.Bao)) <= dung && Math.Abs(TamY(cu.Bao) - TamY(moi.Bao)) <= dung;
    }

    private static double TamX(BaoHinh b) => (b.MinX + b.MaxX) / 2;

    private static double TamY(BaoHinh b) => (b.MinY + b.MaxY) / 2;

    private static int XoaNeuCon(Database db, Transaction tr, ObjectId id)
    {
        if (tr.GetObject(id, OpenMode.ForRead) is not Entity doc) return 0;
        VeLayerService.MoKhoaNeuCo(db, tr, doc.Layer);
        if (tr.GetObject(id, OpenMode.ForWrite) is not Entity ghi) return 0;
        ghi.Erase();
        return 1;
    }

    /// <summary>Định nghĩa block tam giác revision đã sẵn sàng trong bản vẽ.</summary>
    private sealed record TamGiacSanSang(BlockDef Def, string ThuVienVersion, bool DaNhap);

    /// <summary>
    /// Bảo đảm định nghĩa block tam giác (<c>revisionPolicy.triangleBlockId</c>) có trong bản vẽ.
    /// Block phải là <see cref="BlockKind.Annotation"/> — dùng nhầm block phụ kiện/thiết bị là mở
    /// đường cho <c>XBOSS_BOCKL</c> đếm thêm khối lượng ma (guardrail 1/AC10).
    /// </summary>
    private static TamGiacSanSang? ChuanBiTamGiac(Editor ed, Database db, RevisionPolicySection rev)
    {
        if (BlockLibraryService.CanThuVien(ed) is not { } thuVien) return null;
        var def = thuVien.TimTheoId(rev.TriangleBlockId);
        if (def is null)
        {
            ed.WriteMessage(
                $"\n[XBoss] Thư viện block {thuVien.Version} không có block \"{rev.TriangleBlockId}\" " +
                "(drawTools.revisionPolicy.triangleBlockId) — bổ sung block tam giác revision vào thư viện " +
                "rồi chạy lại XBOSS_VE_THUVIEN. Bản vẽ không thay đổi.\n");
            return null;
        }
        if (def.KindEnum != BlockKind.Annotation)
        {
            ed.WriteMessage(
                $"\n[XBoss] Block \"{def.Id}\" trong thư viện khai kind = {def.Kind}, không phải " +
                "\"annotation\" — tam giác revision là ký hiệu chú thích, dùng block loại khác sẽ lọt vào " +
                "danh mục phụ kiện/thiết bị và làm sai khối lượng. Bản vẽ không thay đổi.\n");
            return null;
        }

        BlockLibraryService.NguonDinhNghia nguon;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            (nguon, _) = BlockLibraryService.KiemTraDinhNghia(db, tr, def.BlockName, thuVien.Version);
            tr.Commit();
        }
        if (nguon != BlockLibraryService.NguonDinhNghia.ChuaCo)
        {
            // Đã có định nghĩa trùng tên: DÙNG NGUYÊN bản trong bản vẽ, không hỏi ghi đè giữa lệnh —
            // tam giác chỉ là ký hiệu chú thích, redefine nó có thể đổi thể hiện của các revision CŨ
            // đã phát hành (guardrail 3: cloud/tam giác cũ giữ nguyên).
            VeContext.NhatKyPhien.Add(
                $"XBOSS_VE_REV: dùng định nghĩa block \"{def.BlockName}\" có sẵn trong bản vẽ " +
                $"(không ghi đè theo thư viện {thuVien.Version}).");
            return new TamGiacSanSang(def, thuVien.Version, DaNhap: false);
        }

        try
        {
            var versionDaNhap = BlockLibraryService.NhapDinhNghia(db, [def], thuVien, ghiDe: false);
            return new TamGiacSanSang(def, versionDaNhap, DaNhap: true);
        }
        catch (BlockManifestException e)
        {
            ed.WriteMessage($"\n[XBoss] {e.Message}\n");
            return null;
        }
        catch (Autodesk.AutoCAD.Runtime.Exception e)
        {
            ed.WriteMessage($"\n[XBoss] Không nhập được block \"{def.BlockName}\" từ thư viện: {e.Message}\n");
            return null;
        }
        catch (IOException e)
        {
            ed.WriteMessage($"\n[XBoss] Không đọc được tệp thư viện block: {e.Message}\n");
            return null;
        }

    }

    /// <summary>
    /// Giá trị attribute của tam giác: MỌI thẻ không cố định đều nhận số revision theo
    /// <c>numberFormat</c> — block tam giác chỉ mang đúng một con số, khai thẻ tên gì cũng điền đúng
    /// (không đoán tên thẻ "REV"/"NO" của từng công ty).
    /// </summary>
    private static Dictionary<string, string> TheSoRevision(
        Transaction tr, BlockTableRecord dinhNghia, RevisionPolicySection rev, int so)
    {
        var ra = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!dinhNghia.HasAttributeDefinitions) return ra;
        foreach (ObjectId id in dinhNghia)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not AttributeDefinition ad || ad.Constant) continue;
            ra[ad.Tag] = rev.SoRevision(so);
        }
        return ra;
    }

    /// <summary>
    /// FR4 — ghi dòng revision vào attribute khung tên của MỌI layout theo
    /// <c>titleblockAttrPattern</c>. Layout không có đủ thẻ → BỎ QUA kèm cảnh báo nêu tên layout,
    /// KHÔNG tự thêm attribute (khung tên là tài sản của công ty, plugin không sửa cấu trúc).
    /// Trả số layout đã ghi được.
    /// </summary>
    private static int GhiBangRevision(
        Database db, Transaction tr, RevisionPolicySection rev, KetQuaHoiRevChot traLoi, List<string> canhBao)
    {
        var (theSo, theNgay, theNoiDung, theNguoi) = rev.TitleblockAttrPattern.ChoDong(traLoi.So);
        var giaTri = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [theSo] = rev.SoRevision(traLoi.So),
            [theNgay] = traLoi.NgayIso,
            [theNoiDung] = traLoi.NoiDung,
            [theNguoi] = traLoi.Nguoi,
        };

        var soLayout = 0;
        var dict = (DBDictionary)tr.GetObject(db.LayoutDictionaryId, OpenMode.ForRead);
        foreach (DBDictionaryEntry muc in dict)
        {
            if (tr.GetObject(muc.Value, OpenMode.ForRead) is not Layout layout) continue;
            if (string.Equals(layout.LayoutName, "Model", StringComparison.OrdinalIgnoreCase)) continue;

            var soThe = 0;
            var btr = (BlockTableRecord)tr.GetObject(layout.BlockTableRecordId, OpenMode.ForRead);
            foreach (ObjectId id in btr)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not BlockReference br) continue;
                foreach (ObjectId attId in br.AttributeCollection)
                {
                    if (tr.GetObject(attId, OpenMode.ForRead) is not AttributeReference att) continue;
                    if (!giaTri.TryGetValue(att.Tag, out var v)) continue;
                    if (tr.GetObject(attId, OpenMode.ForWrite) is not AttributeReference ghi) continue;
                    ghi.TextString = v;
                    soThe++;
                }
            }

            if (soThe == 0)
            {
                canhBao.Add(
                    $"Layout \"{layout.LayoutName}\" không có thẻ {theSo}/{theNgay}/{theNoiDung}/{theNguoi} " +
                    "trong khung tên — bỏ qua, plugin KHÔNG tự thêm attribute vào khung tên.");
                continue;
            }
            soLayout++;
        }
        return soLayout;
    }

    // ===== Hỏi đáp dòng lệnh (đường lui FR9 — NGOÀI transaction) =====

    /// <summary>FR1 qua dòng lệnh: liệt kê đề xuất rồi nhận số thứ tự, TATCA hoặc TAY.</summary>
    private static KetQuaHoiRevision? HoiDongLenh(
        Editor ed, int so, IReadOnlyList<ThayDoiRevision> deXuat)
    {
        if (deXuat.Count == 0)
        {
            ed.WriteMessage("\n[XBoss] Không có đề xuất — chuyển sang tự chọn vùng bằng chuột.\n");
            return new KetQuaHoiRevision(TuChonVung: true, []);
        }

        ed.WriteMessage(
            $"\n[XBoss] Đề xuất vùng khoanh cho R{so.ToString(CultureInfo.InvariantCulture)} " +
            "(so với mốc revision gần nhất):\n");
        for (var i = 0; i < deXuat.Count; i++)
            ed.WriteMessage($"[XBoss]   {i + 1}. {new MucDeXuatRevision(deXuat[i]).Nhan}\n");
        ed.WriteMessage(
            $"[XBoss]   {TuKhoaTatCa} = khoanh mọi đề xuất · {TuKhoaTay} = tự chọn vùng bằng chuột\n");

        var opt = new PromptStringOptions(
            $"\n[XBoss] Chọn vùng (số thứ tự cách nhau dấu phẩy) <{TuKhoaTatCa}>: ") { AllowSpaces = false };
        var kq = ed.GetString(opt);
        if (kq.Status != PromptStatus.OK) return null;

        var nhap = kq.StringResult.Trim();
        if (nhap.Length == 0) nhap = TuKhoaTatCa;
        if (string.Equals(nhap, TuKhoaTay, StringComparison.OrdinalIgnoreCase))
            return new KetQuaHoiRevision(TuChonVung: true, []);
        if (string.Equals(nhap, TuKhoaTatCa, StringComparison.OrdinalIgnoreCase))
            return new KetQuaHoiRevision(TuChonVung: false, deXuat);

        var chon = new List<ThayDoiRevision>();
        foreach (var phan in nhap.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (int.TryParse(phan, NumberStyles.Integer, CultureInfo.InvariantCulture, out var stt) &&
                stt >= 1 && stt <= deXuat.Count)
            {
                if (!chon.Contains(deXuat[stt - 1])) chon.Add(deXuat[stt - 1]);
                continue;
            }
            ed.WriteMessage($"\n[XBoss] Bỏ qua \"{phan}\" — không phải số thứ tự trong danh sách.\n");
        }
        if (chon.Count == 0)
        {
            ed.WriteMessage("\n[XBoss] Chưa chọn vùng nào — bản vẽ không thay đổi.\n");
            return null;
        }
        return new KetQuaHoiRevision(TuChonVung: false, chon);
    }

    /// <summary>Hai góc vùng cần khoanh (đường "tự chọn vùng bằng chuột" của FR1).</summary>
    private static BaoHinh? HoiVungBangChuot(Editor ed)
    {
        var goc1 = ed.GetPoint(new PromptPointOptions("\n[XBoss] Góc thứ nhất của vùng cần khoanh"));
        if (goc1.Status != PromptStatus.OK) return null;
        var goc2 = ed.GetCorner("\n[XBoss] Góc đối diện", goc1.Value);
        if (goc2.Status != PromptStatus.OK) return null;
        return BaoHinh.TuDiem([
            new Diem2(goc1.Value.X, goc1.Value.Y),
            new Diem2(goc2.Value.X, goc2.Value.Y),
        ]);
    }

    /// <summary>FR4/FR5 qua dòng lệnh: ngày → nội dung → người → xác nhận khi còn vùng bỏ sót.</summary>
    private static KetQuaHoiRevChot? HoiChotDongLenh(
        Editor ed, int so, string ngayMacDinh, IReadOnlyList<ThayDoiRevision> boSot)
    {
        var ngayKq = ed.GetString(
            new PromptStringOptions($"\n[XBoss] Ngày phát hành (yyyy-MM-dd) <{ngayMacDinh}>: ") { AllowSpaces = false });
        if (ngayKq.Status != PromptStatus.OK) return null;
        var ngay = ngayKq.StringResult.Trim();
        if (ngay.Length == 0) ngay = ngayMacDinh;
        if (!RevChotDialogViewModel.NgayHopLe(ngay))
        {
            ed.WriteMessage("\n[XBoss] Ngày không hợp lệ (cần yyyy-MM-dd) — bản vẽ không thay đổi.\n");
            return null;
        }

        var noiDungKq = ed.GetString(
            new PromptStringOptions("\n[XBoss] Nội dung sửa đổi: ") { AllowSpaces = true });
        if (noiDungKq.Status != PromptStatus.OK) return null;
        var noiDung = noiDungKq.StringResult.Trim();
        if (noiDung.Length == 0)
        {
            ed.WriteMessage("\n[XBoss] Chưa ghi nội dung sửa đổi — bản vẽ không thay đổi.\n");
            return null;
        }

        var nguoiMacDinh = Environment.UserName;
        var nguoiKq = ed.GetString(
            new PromptStringOptions($"\n[XBoss] Người thực hiện <{nguoiMacDinh}>: ") { AllowSpaces = true });
        if (nguoiKq.Status != PromptStatus.OK) return null;
        var nguoi = nguoiKq.StringResult.Trim();
        if (nguoi.Length == 0) nguoi = nguoiMacDinh;

        if (boSot.Count > 0)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ Còn {boSot.Count.ToString(CultureInfo.InvariantCulture)} thay đổi CHƯA nằm " +
                $"trong cloud nào của R{so.ToString(CultureInfo.InvariantCulture)}:\n");
            foreach (var d in RevChotDialogViewModel.DongBoSotCua(boSot)) ed.WriteMessage($"[XBoss]   - {d}\n");

            var hoi = new PromptKeywordOptions("\n[XBoss] Vẫn chốt revision?") { AllowNone = false };
            hoi.Keywords.Add("CO", "CO", "CO");
            hoi.Keywords.Add("KHONG", "KHONG", "KHONG");
            hoi.Keywords.Default = "KHONG";
            var xacNhan = ed.GetKeywords(hoi);
            if (xacNhan.Status != PromptStatus.OK || xacNhan.StringResult != "CO")
            {
                ed.WriteMessage(
                    "\n[XBoss] Đã dừng — khoanh nốt bằng XBOSS_VE_REV rồi chốt lại. Bản vẽ không thay đổi.\n");
                return null;
            }
        }
        return new KetQuaHoiRevChot(so, ngay, noiDung, nguoi);
    }

    /// <summary>FR6 qua dòng lệnh: MOINHAT (mặc định) / TATCA / CHON số cụ thể.</summary>
    private static IReadOnlyList<int>? HoiHienThiDongLenh(Editor ed, IReadOnlyList<int> cacSo, int hienHanh)
    {
        ed.WriteMessage(
            $"\n[XBoss] Revision có trong bản vẽ: " +
            $"{string.Join(", ", cacSo.Select(n => $"R{n.ToString(CultureInfo.InvariantCulture)}"))}\n" +
            "[XBoss]   MOINHAT = chỉ hiện revision mới nhất (mặc định của hồ sơ nộp)\n" +
            "[XBoss]   TATCA = hiện mọi revision\n" +
            "[XBoss]   CHON = gõ các số cần hiện\n");
        var hoi = new PromptKeywordOptions("\n[XBoss] Hiển thị") { AllowNone = false };
        hoi.Keywords.Add("MOINHAT", "MOINHAT", "MOINHAT");
        hoi.Keywords.Add("TATCA", "TATCA", "TATCA");
        hoi.Keywords.Add("CHON", "CHON", "CHON");
        hoi.Keywords.Default = "MOINHAT";
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return null;
        if (kq.StringResult == "MOINHAT") return [hienHanh];
        if (kq.StringResult == "TATCA") return cacSo;

        var nhapKq = ed.GetString(
            new PromptStringOptions("\n[XBoss] Các revision cần hiện (số cách nhau dấu phẩy): ") { AllowSpaces = false });
        if (nhapKq.Status != PromptStatus.OK) return null;
        var chon = new List<int>();
        foreach (var phan in nhapKq.StringResult.Split(
                     ',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var so = phan.TrimStart('R', 'r');
            if (int.TryParse(so, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) && cacSo.Contains(n))
            {
                if (!chon.Contains(n)) chon.Add(n);
                continue;
            }
            ed.WriteMessage($"\n[XBoss] Bỏ qua \"{phan}\" — không phải revision có trong bản vẽ.\n");
        }
        return chon;
    }

    /// <summary>
    /// Nút "Zoom tới" của hộp thoại (FR1): đưa màn hình về vùng của dòng đang xem bằng
    /// <c>SetCurrentView</c> — KHÔNG gửi lệnh ZOOM, vì hộp thoại đang modal thì lệnh AutoCAD không
    /// chạy được. Lỗi ở đây tuyệt đối không được làm chết hộp thoại: cùng lắm màn hình không nhảy.
    /// </summary>
    private static void ZoomToiVung(Editor ed, BaoHinh bao, double le)
    {
        try
        {
            var rong = Math.Max(bao.Rong + le * 2, 1e-6);
            var cao = Math.Max(bao.Cao + le * 2, 1e-6);
            var view = new ViewTableRecord
            {
                CenterPoint = new Point2d(TamX(bao), TamY(bao)),
                Width = rong,
                Height = cao,
            };
            ed.SetCurrentView(view);
        }
        catch (Autodesk.AutoCAD.Runtime.Exception)
        {
            // Không zoom được (bản vẽ đang bận/không có view) — bỏ qua, hộp thoại vẫn dùng bình thường.
        }
    }
}
