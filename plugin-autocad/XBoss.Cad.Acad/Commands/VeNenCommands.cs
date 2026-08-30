using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui.ViewModels;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeNenCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_NEN</c> (M100 §6.1 bước 2, FR9): chuẩn bị nền để vẽ shop drawing đè lên bản
/// thiết kế — khóa + làm mờ mọi layer hiện có, tạo sẵn layer đích của hệ (kèm layer nét biên)
/// đúng màu/lineweight bảng CTB. Chạy lệnh lần nữa = hoàn nguyên đúng trạng thái trước đó.
///
/// KHÔNG sửa/xóa bất kỳ đối tượng nào của bản thiết kế nền (guardrail M100 §2): chỉ đụng
/// thuộc tính khóa/độ mờ trong bảng layer, và tạo thêm layer rỗng.
/// Một lệnh = một transaction = một nhóm UNDO (FR10); hỏi đáp đặt NGOÀI transaction.
/// </summary>
public sealed class VeNenCommands
{
    [CommandMethod("XBOSS_VE_NEN")]
    public void ChuanBiNen()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;

        // (1) Bản vẽ đang ở chế độ nền hay chưa — đọc trạng thái đã cất trong NOD.
        VeLayerService.TrangThaiNen? dangLamNen;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            dangLamNen = VeLayerService.DocTrangThai(db, tr);
            tr.Commit();
        }

        if (dangLamNen is not null)
        {
            HoanNguyen(doc, db, dangLamNen);
            return;
        }

        // (2) Hỏi hệ NGOÀI transaction (không giữ transaction mở trong lúc chờ người dùng):
        //     hộp thoại trước (M106 §7.2), rơi về câu hỏi keyword cũ khi UI hỏng/bị tắt (FR9).
        var he = HoiHe(ed, pack);
        if (he is null)
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return;
        }

        ApNen(doc, ed, pack, he);
    }

    /// <summary>
    /// Trạng thái nền hiện tại của bản vẽ; null = chưa chạy <c>XBOSS_VE_NEN</c> lần nào (hoặc đã
    /// hoàn nguyên). Tách ra để <c>XBOSS_HOANTHIEN</c> (M115) biết có cần áp nền nữa không —
    /// gọi lại lệnh khi đang ở chế độ nền là HOÀN NGUYÊN, đúng thứ pipeline không được làm.
    /// </summary>
    internal static VeLayerService.TrangThaiNen? TrangThaiNenHienTai(Database db)
    {
        using var tr = db.TransactionManager.StartTransaction();
        var tt = VeLayerService.DocTrangThai(db, tr);
        tr.Commit();
        return tt;
    }

    /// <summary>
    /// Áp nền cho một hệ: khóa + làm mờ layer nền, tạo sẵn layer đích (kèm layer nét biên). Thân
    /// bước (3) của <c>XBOSS_VE_NEN</c>, tách nguyên vẹn ra service để cả lệnh gốc lẫn
    /// <c>XBOSS_HOANTHIEN</c> (M115 giai đoạn ① nét đôi) cùng gọi — không nhân đôi logic.
    /// Trả false khi API AutoCAD lỗi (đã rollback, đã báo dòng lệnh).
    /// </summary>
    internal static bool ApNen(
        Autodesk.AutoCAD.ApplicationServices.Document doc,
        Autodesk.AutoCAD.EditorInput.Editor ed,
        DrawToolsPack pack,
        DrawSystem he)
    {
        var db = doc.Database;

        // 1 transaction = 1 nhóm UNDO.
        var daTao = new List<string>();
        var coSanNoiDung = new List<string>();
        var boQuaLayer = new List<string>();
        var soLayerNen = 0;
        // Mốc bước hiện hành: lỗi API AutoCAD (eInvalidKey/eLayerFrozen…) chỉ có mã lỗi trần, không
        // nói chết ở đâu — bản vẽ AEC thật có xref/layer lạ thì "eInvalidKey" trơ trọi là ngõ cụt
        // cho cả kỹ sư lẫn người sửa lỗi (vấp thật 2026-08-27). Cập nhật trước mỗi thao tác ghi.
        var buoc = "đọc layer hiện hành";
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                var clayerCu = ((LayerTableRecord)tr.GetObject(db.Clayer, OpenMode.ForRead)).Name;
                buoc = "khóa + làm mờ layer nền";
                var trangThaiCu = VeLayerService.KhoaVaLamMo(
                    db, tr, pack.DrawTools.BaseFadePct, boQuaLayer);
                soLayerNen = trangThaiCu.Count;

                ObjectId? layerVeDauTien = null;
                foreach (var line in he.Lines)
                {
                    buoc = $"tạo/mở layer đích \"{line.Layer}\"";
                    var idTim = VeLayerService.DamBaoLayer(
                        db, tr, line.Layer, VeLayerStyle.AciChoTim(line.EdgeStyle),
                        pack.RulePack.LineweightMap, out var moiTim);
                    layerVeDauTien ??= idTim;
                    if (moiTim) daTao.Add(line.Layer);
                    else if (VeLayerService.CoThucThe(db, tr, line.Layer)) coSanNoiDung.Add(line.Layer);

                    if (line.EdgeStyle != "double") continue;
                    var tenBien = VeLayerStyle.LayerNetBien(line.Layer, pack.DrawTools.EdgeLayerSuffix);
                    buoc = $"tạo/mở layer nét biên \"{tenBien}\"";
                    VeLayerService.DamBaoLayer(
                        db, tr, tenBien, VeLayerStyle.AciNetBien, pack.RulePack.LineweightMap, out var moiBien);
                    if (moiBien) daTao.Add(tenBien);
                }

                // Mọi layer nền vừa bị khóa ⇒ layer hiện hành phải chuyển sang layer vẽ được.
                buoc = "đặt layer hiện hành";
                if (layerVeDauTien is { } idClayer) db.Clayer = idClayer;

                buoc = "ghi trạng thái nền vào bản vẽ";
                VeLayerService.GhiTrangThai(
                    db, tr, new VeLayerService.TrangThaiNen(he.Id, clayerCu, trangThaiCu));
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi chuẩn bị nền ({buoc}) — đã rollback, bản vẽ nguyên trạng: {e.Message}\n" +
                    "[XBoss] Gửi dòng này kèm tên bản vẽ cho đội phát triển; lệnh vẽ XBOSS_VE vẫn dùng được bình thường.\n");
                return false;
            }
        }

        ed.WriteMessage(
            $"\n[XBoss] ===== NỀN SẴN SÀNG — hệ {he.Id} ({he.Name}), rule pack {pack.RulePack.Version} =====\n" +
            $"[XBoss] Đã khóa + làm mờ {pack.DrawTools.BaseFadePct}% cho {soLayerNen} layer nền (đối tượng nền KHÔNG bị sửa).\n");
        ed.WriteMessage(daTao.Count > 0
            ? $"[XBoss] Layer đích tạo mới: {string.Join(", ", daTao)}\n"
            : "[XBoss] Layer đích đã có sẵn đủ.\n");
        foreach (var l in coSanNoiDung)
            ed.WriteMessage($"[XBoss] ⚠ Layer đích \"{l}\" đã có đối tượng cũ — nên chạy XBOSS_CHUANHOA trước khi vẽ.\n");
        if (boQuaLayer.Count > 0)
        {
            // Nói thật là chưa bảo vệ hết: layer xref không khóa/làm mờ được, nên nét nền trên đó
            // vẫn đậm và vẫn chọn trúng khi kỹ sư quét chọn. Im lặng ở đây là để kỹ sư tưởng cả
            // bản vẽ đã được che.
            ed.WriteMessage(
                $"[XBoss] ⚠ {boQuaLayer.Count} layer KHÔNG khóa/làm mờ được (layer của xref — AutoCAD " +
                "không cho sửa): nét nền trên đó vẫn đậm. Cần che hẳn thì tắt/unload xref khi vẽ.\n");
        }
        ed.WriteMessage(
            "[XBoss] Vẽ tuyến: XBOSS_VE · Ghi nhãn: XBOSS_VE_NHAN · Xong hệ: chạy lại XBOSS_VE_NEN để hoàn nguyên.\n");
        return true;
    }

    /// <summary>
    /// Hệ sắp vẽ. Hộp thoại (M106 §7.2) hiện luôn mức làm mờ + số layer đích ở dạng CHỈ ĐỌC; UI
    /// không dựng được hoặc <c>XBOSS_UI_DIALOG=0</c> thì về ĐÚNG câu hỏi keyword cũ (FR9). Cả hai
    /// đường đều ghi nhớ hệ vào <see cref="VeContext"/> (FR4).
    /// </summary>
    private static DrawSystem? HoiHe(Autodesk.AutoCAD.EditorInput.Editor ed, DrawToolsPack pack)
    {
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new VeNenDialogViewModel(
                pack.DrawTools.Systems, pack.DrawTools.BaseFadePct, VeContext.He?.Id);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (!daDungUi) return VeContext.HoiHe(ed, pack, batBuocHoiLai: true);
        if (kq is null) return null;
        // Đổi hệ ⇒ loại tuyến/size/độ dốc cũ không còn ý nghĩa (đúng luật của VeContext.HoiHe).
        if (VeContext.He?.Id != kq.He.Id)
        {
            VeContext.Tuyen = null;
            VeContext.Size = null;
            VeContext.SizeTuNhap = false;
            VeContext.DoDoc = null;
        }
        VeContext.He = kq.He;
        return kq.He;
    }

    private static void HoanNguyen(
        Autodesk.AutoCAD.ApplicationServices.Document doc, Database db, VeLayerService.TrangThaiNen tt)
    {
        var ed = doc.Editor;
        int soTra;
        var thatBai = new List<string>();
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                soTra = VeLayerService.HoanNguyen(db, tr, tt, thatBai);
                VeLayerService.XoaTrangThai(db, tr);
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage($"\n[XBoss] LỖI khi hoàn nguyên nền — đã rollback: {e.Message}\n");
                return;
            }
        }
        ed.WriteMessage(
            $"\n[XBoss] Đã hoàn nguyên nền (hệ {tt.HeId}): trả khóa + độ mờ cho {soTra} layer.\n" +
            "[XBoss] Layer đích và các đối tượng đã vẽ giữ nguyên. Hoàn tác: UNDO.\n");
        if (thatBai.Count > 0)
        {
            // Trạng thái nền đã bị xóa khỏi bản vẽ ở trên, nên các layer này sẽ KHÔNG được thử lại
            // lần nữa — phải nói tên ra để kỹ sư tự mở khóa/bỏ mờ, im lặng là bỏ mặc.
            ed.WriteMessage(
                $"[XBoss] ⚠ {thatBai.Count} layer KHÔNG trả được khóa/độ mờ: {string.Join(", ", thatBai)}. " +
                "Mở LAYER chỉnh tay các layer này.\n");
        }
    }
}
