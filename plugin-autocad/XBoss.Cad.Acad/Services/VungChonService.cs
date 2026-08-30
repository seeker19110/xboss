using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using XBoss.Cad.Core.Zoning;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Hỏi ranh giới vùng cho XBOSS_BOCKL (M101 §6.3 "bóc theo vùng"): kỹ sư chọn các polyline KÍN
/// sẵn có trên bản vẽ và đặt tên vùng ("Tầng 5", "Zone A"). Lệnh KHÔNG vẽ/sửa gì — chỉ đọc hình
/// học rồi đưa xuống Core cắt (mọi tính toán ở Core, Adapter chỉ đo — M101 FR4).
/// </summary>
internal static class VungChonService
{
    /// <summary>
    /// Vùng đã chọn + handle của chính các polyline ranh giới. Handle dùng để LOẠI ranh giới khỏi
    /// khối lượng: ranh giới do kỹ sư vẽ có thể nằm trên layer thuộc quy tắc bóc, không loại ra thì
    /// chu vi của nó bị cộng vào mét ống (lỗi âm thầm, rất khó phát hiện trên bảng Excel).
    /// </summary>
    internal sealed record KetQuaChonVung(List<RanhGioiVung> Vung, HashSet<string> HandleRanhGioi);

    /// <summary>Hỏi ranh giới; vùng rỗng = không bóc theo vùng (ESC hoặc không chọn gì).</summary>
    internal static KetQuaChonVung Hoi(Editor ed, Transaction tr)
    {
        var ra = new List<RanhGioiVung>();
        var handle = new HashSet<string>(StringComparer.Ordinal);
        while (true)
        {
            var opt = new PromptEntityOptions(
                $"\n[XBoss] Chọn polyline ranh giới vùng thứ {ra.Count + 1} (Enter để kết thúc): ")
            {
                AllowNone = true,
            };
            opt.SetRejectMessage("\n[XBoss] Ranh giới vùng phải là POLYLINE (LWPOLYLINE) kín.");
            opt.AddAllowedClass(typeof(Polyline), false); // false = nhận cả lớp dẫn xuất

            var chon = ed.GetEntity(opt);
            if (chon.Status == PromptStatus.None) break;      // Enter = xong
            if (chon.Status != PromptStatus.OK) return new KetQuaChonVung([], []); // ESC = bỏ bóc theo vùng

            if (tr.GetObject(chon.ObjectId, OpenMode.ForRead) is not Polyline pl) continue;
            if (!pl.Closed)
            {
                ed.WriteMessage("\n[XBoss] ⚠ Polyline chưa KÍN — đóng lại (PEDIT > Close) rồi chọn lại.\n");
                continue;
            }
            if (TakeoffScanner.DoanTuyenCua(pl) is not { Count: > 0 } bien)
            {
                ed.WriteMessage("\n[XBoss] ⚠ Không đọc được hình học ranh giới này — bỏ qua.\n");
                continue;
            }

            var macDinh = $"Vùng {ra.Count + 1}";
            var hoiTen = new PromptStringOptions($"\n[XBoss] Tên vùng <{macDinh}>: ") { AllowSpaces = true };
            var ten = ed.GetString(hoiTen);
            if (ten.Status != PromptStatus.OK) return new KetQuaChonVung([], []);
            var tenVung = ten.StringResult.Length > 0 ? ten.StringResult : macDinh;
            if (ra.Any(v => string.Equals(v.Ten, tenVung, StringComparison.Ordinal)))
            {
                ed.WriteMessage($"\n[XBoss] ⚠ Tên vùng \"{tenVung}\" đã dùng — đặt tên khác để bảng khối lượng không gộp nhầm.\n");
                continue;
            }

            ra.Add(new RanhGioiVung(tenVung, bien));
            handle.Add(pl.Handle.ToString());
            ed.WriteMessage($"[XBoss] Đã nhận ranh giới \"{tenVung}\" (bản thân đường ranh giới KHÔNG bị tính khối lượng).\n");
        }
        return new KetQuaChonVung(ra, handle);
    }
}
