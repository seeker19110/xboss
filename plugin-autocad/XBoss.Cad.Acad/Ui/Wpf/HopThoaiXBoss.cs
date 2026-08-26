using Autodesk.AutoCAD.EditorInput;

namespace XBoss.Cad.Acad.Ui.Wpf;

/// <summary>
/// Cửa duy nhất để lệnh mở hộp thoại, kèm <b>đường lui bắt buộc</b> của M106 FR9: UI không dựng
/// được (thiếu WPF/AdWindows, chạy trong Core Console, tắt bằng biến môi trường
/// <c>XBOSS_UI_DIALOG=0</c>, hoặc bất kỳ lỗi nào lúc dựng cửa sổ) → lệnh quay về hỏi đáp dòng lệnh
/// <b>y như trước M106</b>, in đúng một dòng thông báo. <b>Không lệnh nào được chết vì UI.</b>
///
/// Vì lý do đó chỗ này bắt <see cref="Exception"/> ở mức rộng nhất — có chủ đích: hộp thoại KHÔNG
/// đọc/ghi bản vẽ, không mở transaction, không gọi mạng (guardrail M106 §2), nên nuốt lỗi ở đây
/// không thể để lại trạng thái dở dang; lỗi thật của nghiệp vụ vẫn nổ ở đường dòng lệnh phía sau.
/// </summary>
internal static class HopThoaiXBoss
{
    /// <summary>Biến môi trường tắt hộp thoại (rollback của M106 §2).</summary>
    private const string BienTat = "XBOSS_UI_DIALOG";

    /// <summary>Kỹ sư/script đã tắt hộp thoại chưa (<c>0</c>, <c>off</c>, <c>false</c> đều tính là tắt).</summary>
    internal static bool BiTat
    {
        get
        {
            var v = Environment.GetEnvironmentVariable(BienTat)?.Trim();
            return v is not null &&
                   (v.Equals("0", StringComparison.Ordinal) ||
                    v.Equals("off", StringComparison.OrdinalIgnoreCase) ||
                    v.Equals("false", StringComparison.OrdinalIgnoreCase));
        }
    }

    /// <summary>
    /// Thử thu tham số bằng hộp thoại.
    /// <list type="bullet">
    /// <item><c>(true, kết quả)</c> — kỹ sư bấm OK, lệnh chạy với tham số đó.</item>
    /// <item><c>(true, null)</c> — kỹ sư bấm Hủy: lệnh DỪNG, không rơi về hỏi đáp dòng lệnh (hỏi
    /// lại y hệt thứ vừa hủy là làm phiền).</item>
    /// <item><c>(false, null)</c> — không dùng được UI: lệnh chạy đường hỏi đáp dòng lệnh (FR9).</item>
    /// </list>
    /// </summary>
    internal static (bool DaDungUi, T? KetQua) Thu<T>(Editor ed, Func<T?> mo)
        where T : class
    {
        if (BiTat)
        {
            ed.WriteMessage(
                $"\n[XBoss] {BienTat}=0 — dùng hỏi đáp dòng lệnh thay cho hộp thoại.\n");
            return (false, null);
        }
        try
        {
            return (true, mo());
        }
        catch (Exception e)
        {
            ed.WriteMessage(
                $"\n[XBoss] Không dựng được hộp thoại ({e.GetType().Name}: {e.Message}) — " +
                "chuyển sang hỏi đáp dòng lệnh, lệnh vẫn chạy bình thường.\n");
            return (false, null);
        }
    }
}
