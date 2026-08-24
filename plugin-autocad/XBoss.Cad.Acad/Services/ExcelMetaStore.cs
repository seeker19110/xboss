using System.Text.Json;

namespace XBoss.Cad.Acad.Services;

/// <summary>Nhớ tên dự án/gói thầu giữa các lần xuất Excel (đỡ gõ lại mỗi bản vẽ).</summary>
internal static class ExcelMetaStore
{
    internal sealed record MetaLuu(string TenDuAn, string GoiThau);

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
        return new MetaLuu("", "");
    }

    internal static void Ghi(MetaLuu meta)
    {
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Path)!);
        File.WriteAllText(Path, JsonSerializer.Serialize(meta));
    }
}
