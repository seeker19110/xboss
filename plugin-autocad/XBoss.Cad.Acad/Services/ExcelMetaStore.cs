using System.Text.Json;

namespace XBoss.Cad.Acad.Services;

/// <summary>Nhớ tên dự án/gói thầu giữa các lần xuất Excel (đỡ gõ lại mỗi bản vẽ).</summary>
internal static class ExcelMetaStore
{
    /// <param name="DuAnId">
    /// M101 PR4: mã số dự án trên XBoss đã chọn lần trước khi kéo KL BOQ đối chiếu. Tham số CÓ
    /// MẶC ĐỊNH nên tệp cache cũ (chỉ có 2 trường) vẫn đọc được, không bắt kỹ sư chọn lại.
    /// </param>
    internal sealed record MetaLuu(string TenDuAn, string GoiThau, long? DuAnId = null);

    /// <summary>
    /// Dự án XBoss đang làm việc trên máy này — MỘT nguồn sự thật dùng chung cho KL BOQ đối chiếu
    /// (M101 PR4) và rule pack theo dự án. Cố ý KHÔNG mở kho lưu thứ hai: hai nơi nhớ hai dự án
    /// khác nhau là cách chắc chắn nhất để mã BOQ và KL hợp đồng lệch nhau trong cùng một tệp Excel.
    /// null = chưa chọn (để máy chủ tự suy).
    /// </summary>
    internal static long? DuAnHienHanh => Doc().DuAnId;

    /// <summary>Nhớ dự án đang làm, giữ nguyên tên dự án/gói thầu đã lưu.</summary>
    internal static void GhiDuAn(long? duAnId) => Ghi(Doc() with { DuAnId = duAnId });

    private static string Path => System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "XBoss", "excel-meta.json");

    internal static MetaLuu Doc()
    {
        try
        {
            if (File.Exists(Path))
            {
                var luu = JsonSerializer.Deserialize<MetaLuu>(File.ReadAllText(Path));
                if (luu is not null) return luu;
            }
        }
        catch (JsonException) { /* tệp hỏng — dùng mặc định */ }
        // M101 PR4: tệp này nằm trên đường chạy của MỌI lệnh (RulePackStore hỏi dự án đang làm),
        // nên tệp đang bị khoá/không đọc được chỉ được phép làm mất mặc định, không được làm hỏng lệnh.
        catch (IOException) { /* đang bị khoá — dùng mặc định */ }
        return new MetaLuu("", "");
    }

    internal static void Ghi(MetaLuu meta)
    {
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Path)!);
        File.WriteAllText(Path, JsonSerializer.Serialize(meta));
    }
}
