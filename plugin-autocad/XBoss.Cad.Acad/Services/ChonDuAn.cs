using System.Globalization;
using Autodesk.AutoCAD.EditorInput;
using XBoss.Cad.Core.Api;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Hỏi kỹ sư chọn dự án khi MÁY CHỦ trả 409 "thuộc nhiều dự án" (M101 PR4) — dùng chung cho cả
/// đường tải rule pack (XBOSS_LOGIN) lẫn đường kéo KL BOQ đối chiếu (XBOSS_BOCKL_XUAT): một cách
/// hỏi, một chỗ nhớ (<see cref="ExcelMetaStore.DuAnHienHanh"/>).
///
/// Danh sách do MÁY CHỦ cấp và vẫn được máy chủ kiểm lại theo token ở lần gọi sau — plugin không
/// bao giờ tự đoán dự án (đoán = lấy nhầm mã BOQ/khối lượng hợp đồng của dự án khác).
/// </summary>
internal static class ChonDuAn
{
    /// <summary>
    /// Trả id dự án kỹ sư chọn, hoặc <c>null</c> khi bỏ qua (Esc, gõ sai, máy chủ không kèm danh
    /// sách). Caller PHẢI coi null là "đi đường lui" (bản toàn cục / bỏ sheet đối chiếu) và chỉ
    /// cảnh báo — không được chặn lệnh.
    /// Chọn xong nhớ ngay để lần sau khỏi hỏi lại.
    /// </summary>
    internal static long? Hoi(Editor ed, string thongDiepMayChu, IReadOnlyList<DuAnTomTat> duAn)
    {
        if (duAn.Count == 0)
        {
            ed.WriteMessage($"\n[XBoss] ⚠ {thongDiepMayChu} — máy chủ không kèm danh sách dự án nào.\n");
            return null;
        }

        ed.WriteMessage("\n[XBoss] Tài khoản thuộc nhiều dự án — chọn dự án đang thi công:\n");
        foreach (var d in duAn)
            ed.WriteMessage($"[XBoss]   {d.Id.ToString(CultureInfo.InvariantCulture)} — {d.Name}\n");

        // Hỏi bằng GetString + mã số như luồng KL BOQ đối chiếu đã dùng (M101 PR4): id dự án là
        // số nên KHÔNG làm keyword của GetKeywords được (keyword thuần số dễ bị AutoCAD từ chối).
        var macDinh = duAn[0].Id.ToString(CultureInfo.InvariantCulture);
        string traLoi;
        try
        {
            var kq = ed.GetString(new PromptStringOptions(
                $"\n[XBoss] Mã số dự án <{macDinh}> (Esc = bỏ qua): ")
            {
                AllowSpaces = false,
            });
            if (kq.Status != PromptStatus.OK) return null;
            traLoi = kq.StringResult;
        }
        catch (Autodesk.AutoCAD.Runtime.Exception e)
        {
            // AutoCAD từ chối hỏi trong ngữ cảnh hiện tại (XBOSS_LOGIN là lệnh async — dòng lệnh
            // có thể đang bận). Coi như bỏ qua để caller đi tiếp bằng đường lui, KHÔNG để một câu
            // hỏi làm hỏng cả lệnh.
            ed.WriteMessage($"[XBoss] ⚠ Không hỏi được lựa chọn dự án ({e.Message}) — bỏ qua.\n");
            return null;
        }

        var nhap = traLoi.Trim();
        if (nhap.Length == 0) nhap = macDinh;
        if (!long.TryParse(nhap, NumberStyles.Integer, CultureInfo.InvariantCulture, out var chon) ||
            !duAn.Any(d => d.Id == chon))
        {
            // Gõ số không có trong danh sách thì hỏi lại là thừa: máy chủ cũng sẽ từ chối.
            ed.WriteMessage($"[XBoss] ⚠ \"{nhap}\" không nằm trong danh sách dự án — bỏ qua.\n");
            return null;
        }

        ExcelMetaStore.GhiDuAn(chon);
        ed.WriteMessage(
            $"[XBoss] Đã chọn dự án #{chon.ToString(CultureInfo.InvariantCulture)} — nhớ cho các lần sau " +
            "(đổi lại bằng cách chạy lại XBOSS_LOGIN khi được hỏi).\n");
        return chon;
    }
}
