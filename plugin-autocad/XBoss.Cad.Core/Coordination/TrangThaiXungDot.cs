namespace XBoss.Cad.Core.Coordination;

/// <summary>
/// Trạng thái xử lý của MỘT xung đột phối hợp (M116 §6 bước 4 / §7 FR4). Kỹ sư quyết, plugin chỉ
/// ghi lại — guardrail §2: plugin không bao giờ tự sửa tuyến.
///
/// Trạng thái bám theo <see cref="XungDot.Id"/> và sống trong XData của marker trên bản vẽ, nên
/// chạy lại <c>XBOSS_PHOIHOP</c> vẫn giữ nguyên quyết định của lần trước (AC2).
/// </summary>
public enum TrangThaiXungDot
{
    /// <summary>Mới quét ra, kỹ sư chưa quyết gì.</summary>
    ChuaXuLy,

    /// <summary>Kỹ sư CHẤP NHẬN đề xuất và sẽ tự sửa tay (M115: sửa cao độ XData rồi hoàn thiện lại).</summary>
    ChapNhan,

    /// <summary>Kỹ sư BỎ QUA — bắt buộc kèm lý do, để lần sau đọc lại biết vì sao.</summary>
    BoQua,
}

/// <summary>
/// Mã chuỗi của <see cref="TrangThaiXungDot"/> dùng trong XData marker (M116 §7 FR4) — khai một
/// chỗ để Adapter ghi và đọc không thể lệch nhau, cùng khuôn các mã slug khác của bộ lệnh vẽ.
/// </summary>
public static class MaTrangThaiXungDot
{
    public const string ChuaXuLy = "chua_xu_ly";
    public const string ChapNhan = "chap_nhan";
    public const string BoQua = "bo_qua";

    /// <summary>Mã chuỗi để ghi vào XData.</summary>
    public static string Ma(TrangThaiXungDot trangThai) => trangThai switch
    {
        TrangThaiXungDot.ChapNhan => ChapNhan,
        TrangThaiXungDot.BoQua => BoQua,
        _ => ChuaXuLy,
    };

    /// <summary>Đọc mã từ XData; mã lạ/rỗng ⇒ <see cref="TrangThaiXungDot.ChuaXuLy"/> (không đoán).</summary>
    public static TrangThaiXungDot Doc(string? ma) => ma switch
    {
        ChapNhan => TrangThaiXungDot.ChapNhan,
        BoQua => TrangThaiXungDot.BoQua,
        _ => TrangThaiXungDot.ChuaXuLy,
    };

    /// <summary>Nhãn tiếng Việt (dùng chung cho hộp thoại lẫn tóm tắt dòng lệnh).</summary>
    public static string Nhan(TrangThaiXungDot trangThai) => trangThai switch
    {
        TrangThaiXungDot.ChapNhan => "Chấp nhận (kỹ sư tự sửa tay)",
        TrangThaiXungDot.BoQua => "Bỏ qua có lý do",
        _ => "Chưa xử lý",
    };
}
