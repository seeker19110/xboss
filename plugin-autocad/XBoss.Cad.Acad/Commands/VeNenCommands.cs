using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Draw;

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

        // (2) Hỏi hệ NGOÀI transaction (không giữ transaction mở trong lúc chờ người dùng).
        var he = VeContext.HoiHe(ed, pack, batBuocHoiLai: true);
        if (he is null)
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return;
        }

        // (3) Áp nền: 1 transaction = 1 nhóm UNDO.
        var daTao = new List<string>();
        var coSanNoiDung = new List<string>();
        var soLayerNen = 0;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                var clayerCu = ((LayerTableRecord)tr.GetObject(db.Clayer, OpenMode.ForRead)).Name;
                var trangThaiCu = VeLayerService.KhoaVaLamMo(db, tr, pack.DrawTools.BaseFadePct);
                soLayerNen = trangThaiCu.Count;

                ObjectId? layerVeDauTien = null;
                foreach (var line in he.Lines)
                {
                    var idTim = VeLayerService.DamBaoLayer(
                        db, tr, line.Layer, VeLayerStyle.AciChoTim(line.EdgeStyle),
                        pack.RulePack.LineweightMap, out var moiTim);
                    layerVeDauTien ??= idTim;
                    if (moiTim) daTao.Add(line.Layer);
                    else if (VeLayerService.CoThucThe(db, tr, line.Layer)) coSanNoiDung.Add(line.Layer);

                    if (line.EdgeStyle != "double") continue;
                    var tenBien = VeLayerStyle.LayerNetBien(line.Layer, pack.DrawTools.EdgeLayerSuffix);
                    VeLayerService.DamBaoLayer(
                        db, tr, tenBien, VeLayerStyle.AciNetBien, pack.RulePack.LineweightMap, out var moiBien);
                    if (moiBien) daTao.Add(tenBien);
                }

                // Mọi layer nền vừa bị khóa ⇒ layer hiện hành phải chuyển sang layer vẽ được.
                if (layerVeDauTien is { } idClayer) db.Clayer = idClayer;

                VeLayerService.GhiTrangThai(
                    db, tr, new VeLayerService.TrangThaiNen(he.Id, clayerCu, trangThaiCu));
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage($"\n[XBoss] LỖI khi chuẩn bị nền — đã rollback, bản vẽ nguyên trạng: {e.Message}\n");
                return;
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
        ed.WriteMessage(
            "[XBoss] Vẽ tuyến: XBOSS_VE · Ghi nhãn: XBOSS_VE_NHAN · Xong hệ: chạy lại XBOSS_VE_NEN để hoàn nguyên.\n");
    }

    private static void HoanNguyen(
        Autodesk.AutoCAD.ApplicationServices.Document doc, Database db, VeLayerService.TrangThaiNen tt)
    {
        var ed = doc.Editor;
        int soTra;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                soTra = VeLayerService.HoanNguyen(db, tr, tt);
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
    }
}
