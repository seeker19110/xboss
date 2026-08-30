using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Graph;
using XBoss.Cad.Core.Ui.ViewModels;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.HoanThienCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_HOANTHIEN</c> — hoàn thiện bản vẽ từ tuyến tim (M115 §6 bước 5, FR3/FR4).
///
/// Điều phối 8 giai đoạn ① nét đôi ② phụ kiện tại nút ③ chia đốt ④ giá đỡ ⑤ lỗ chờ ⑥ ngắt nét
/// ⑦ tag ⑧ bảng thống kê — chạy trọn gói hoặc chỉ vài giai đoạn, THỨ TỰ CHẠY CỐ ĐỊNH ① → ⑧ dù kỹ
/// sư tick theo thứ tự nào.
///
/// Lệnh này KHÔNG chứa một dòng logic vẽ nào: toàn bộ nằm ở <see cref="HoanThienPipeline"/>, và
/// pipeline gọi lại đúng service mà các lệnh <c>XBOSS_VE_*</c> đang dùng. Ở đây chỉ có: đọc bản
/// chốt đồ thị, hỏi kỹ sư chọn giai đoạn, chạy, in tóm tắt.
///
/// Ranh giới cứng: cần bản chốt của <c>XBOSS_TUYEN_DOTHI</c> (AC6 — bước 3 không đạt thì không
/// chạy được bước 5); một lần gọi lệnh = một nhóm UNDO (xem ghi chú ở <see cref="HoanThienPipeline"/>).
/// </summary>
public sealed class HoanThienCommands
{
    [CommandMethod("XBOSS_HOANTHIEN")]
    public void HoanThien()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        if (VeContext.CanCompletionPolicy(ed, pack) is not { } cp) return;
        var db = doc.Database;

        // ===== (1) Bản chốt đồ thị — không có thì DỪNG, không đụng gì (AC6) =====

        DoThiChot? chot;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            chot = TuyenDoThiStore.Doc(db, tr);
            tr.Commit();
        }
        if (chot is null)
        {
            ed.WriteMessage(
                "\n[XBoss] Bản vẽ chưa có ĐỒ THỊ ĐÃ CHỐT nên chưa hoàn thiện được — bản vẽ không thay đổi.\n" +
                "[XBoss] Làm theo thứ tự: XBOSS_TUYEN_GAN (gán hệ/cỡ/cao độ cho tuyến tim) → " +
                "XBOSS_TUYEN_DOTHI (dựng, kiểm, duyệt rồi CHỐT đồ thị) → XBOSS_HOANTHIEN.\n");
            return;
        }
        if (chot.Tuyen.Count == 0)
        {
            ed.WriteMessage(
                "\n[XBoss] Đồ thị đã chốt không có tuyến nào — chạy lại XBOSS_TUYEN_DOTHI trên đúng " +
                "phạm vi rồi thử lại.\n");
            return;
        }

        ed.WriteMessage(
            $"\n[XBoss] Đồ thị chốt ngày {chot.NgayIso} (rule pack {chot.RulePackVersion}): " +
            $"{chot.Tuyen.Count} tuyến, {chot.Nut.Count} nút, {chot.Canh.Count} cạnh, " +
            $"{chot.ThietBi.Count} kết nối thiết bị.\n");
        if (!string.Equals(chot.RulePackVersion, pack.RulePack.Version, StringComparison.Ordinal))
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ Đồ thị chốt bằng rule pack {chot.RulePackVersion}, máy đang dùng " +
                $"{pack.RulePack.Version} — luật phụ kiện/layer có thể đã đổi. Chạy lại " +
                "XBOSS_TUYEN_DOTHI nếu muốn chốt theo bản mới.\n");
        }

        // ===== (2) Chọn giai đoạn: hộp thoại (mặc định), rơi về dòng lệnh khi UI hỏng (M106 FR9) =====

        var chon = ChonGiaiDoan(ed, chot, cp);
        if (chon is null)
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return;
        }

        var keHoach = HoanThienKeHoach.Lap(chot, chon.GiaiDoanBat);
        if (keHoach.Count == 0)
        {
            ed.WriteMessage("\n[XBoss] Không giai đoạn nào được chọn — bản vẽ không thay đổi.\n");
            return;
        }
        ed.WriteMessage(
            $"[XBoss] Sẽ chạy {keHoach.Count}/8 giai đoạn theo thứ tự: " +
            $"{string.Join(" → ", keHoach.Select(v => v.GiaiDoan.Nhan))}.\n");

        // ===== (3) Chạy — mọi giai đoạn nằm trong CÙNG một lần gọi lệnh = một nhóm UNDO =====

        var thuVien = BlockLibraryService.HienHanh().Manifest;
        var ketQua = HoanThienPipeline.Chay(doc, ed, pack, thuVien, chot, keHoach);

        // ===== (4) Tóm tắt — VeSessionReport của lần chạy này (M118 FR1/AC1/AC8): ghi đủ ĐÚNG
        // 8/8 giai đoạn dù có giai đoạn lỗi, không bỏ sót giai đoạn nào =====

        var soChay = ketQua.Count(k => k.DaChay);
        var soLoi = ketQua.Count(k => k.Loi);
        ed.WriteMessage(
            $"\n[XBoss] ===== HOÀN THIỆN XONG — {soChay}/{keHoach.Count} giai đoạn có thay đổi bản vẽ =====\n");
        foreach (var k in ketQua)
        {
            var daHieu = k.Loi ? "✖" : k.DaChay ? "✔" : "—";
            ed.WriteMessage($"[XBoss]   {daHieu} {k.GiaiDoan.Nhan}: {k.TomTat}\n");
        }
        ed.WriteMessage(
            $"[XBoss] Tổng kết: {keHoach.Count}/8 giai đoạn xong, {soLoi} lỗi.\n");
        if (soLoi > 0)
        {
            ed.WriteMessage(
                "[XBoss] Có giai đoạn lỗi — chạy lại XBOSS_HOANTHIEN sau khi xử lý là an toàn (idempotent).\n");
        }
        ed.WriteMessage(
            "[XBoss] Tọa độ tuyến tim KHÔNG bị đụng (AC2). Chạy lại lệnh này an toàn: mỗi giai đoạn " +
            "thay thế đúng phần của chính nó (AC3).\n" +
            "[XBoss] Xem lại số liệu: XBOSS_VE_BAOCAO · Bóc khối lượng: XBOSS_BOCKL · " +
            "Hoàn tác cả lệnh: UNDO 1 lần.\n");
    }

    /// <summary>
    /// Chọn giai đoạn. Hộp thoại là đường chính (M106 §7.2); UI hỏng hoặc <c>XBOSS_UI_DIALOG=0</c>
    /// thì hỏi dòng lệnh: chạy TRỌN GÓI theo <c>stageDefaults</c>, hoặc tick từng giai đoạn.
    /// Null = kỹ sư hủy.
    /// </summary>
    private static KetQuaHoanThien? ChonGiaiDoan(Editor ed, DoThiChot chot, CompletionPolicySection cp)
    {
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new HoanThienDialogViewModel(chot, cp);
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi) return kq;

        var macDinh = HoanThienKeHoach.DanhMuc.Where(g => cp.BatSan(g.Ten)).Select(g => g.Ten).ToList();
        ed.WriteMessage("\n[XBoss] 8 giai đoạn hoàn thiện (thứ tự chạy cố định):\n");
        foreach (var g in HoanThienKeHoach.DanhMuc.OrderBy(g => g.SoThuTu))
        {
            ed.WriteMessage(
                $"[XBoss]   {g.Nhan} ({g.Lenh}) — {(cp.BatSan(g.Ten) ? "BẬT sẵn" : "tắt")} theo rule pack\n");
        }

        var hoi = new PromptKeywordOptions("\n[XBoss] Chạy giai đoạn nào?") { AllowNone = false };
        hoi.Keywords.Add("MacDinh", "MacDinh", "Theo rule pack (stageDefaults)");
        hoi.Keywords.Add("TatCa", "TatCa", "Trọn gói cả 8 giai đoạn");
        hoi.Keywords.Add("TungBuoc", "TungBuoc", "Hỏi từng giai đoạn");
        hoi.Keywords.Default = macDinh.Count > 0 ? "MacDinh" : "TatCa";
        var traLoi = ed.GetKeywords(hoi);
        if (traLoi.Status != PromptStatus.OK) return null;

        switch (traLoi.StringResult)
        {
            case "TatCa":
                return new KetQuaHoanThien(HoanThienKeHoach.DanhMuc.Select(g => g.Ten).ToList());
            case "MacDinh":
                return new KetQuaHoanThien(macDinh);
            default:
                var bat = new List<string>();
                foreach (var g in HoanThienKeHoach.DanhMuc.OrderBy(g => g.SoThuTu))
                {
                    var h = new PromptKeywordOptions($"\n[XBoss] Chạy {g.Nhan}?") { AllowNone = false };
                    h.Keywords.Add("Co", "Co", "Có");
                    h.Keywords.Add("Khong", "Khong", "Không");
                    h.Keywords.Default = cp.BatSan(g.Ten) ? "Co" : "Khong";
                    var t = ed.GetKeywords(h);
                    if (t.Status != PromptStatus.OK) return null;
                    if (t.StringResult == "Co") bat.Add(g.Ten);
                }
                return new KetQuaHoanThien(bat);
        }
    }
}
