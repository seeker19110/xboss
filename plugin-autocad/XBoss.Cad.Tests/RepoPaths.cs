using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Tests;

/// <summary>Dò gốc repo để nạp rule pack ĐANG PHÁT HÀNH — test C# và test TS phải cùng một nguồn
/// (chống trôi quy tắc giữa 2 tầng, ADR-0006 nguyên tắc 1).</summary>
public static class RepoPaths
{
    /// <summary>Tên tệp rule pack đang phát hành — đổi ở ĐÚNG MỘT chỗ khi phát hành version mới.</summary>
    public const string TenTepHienHanh = "v6.json";

    /// <summary>Đường dẫn một version rule pack cũ trong repo (kiểm tương thích ngược).</summary>
    public static string RulePackPathCua(string tenTep) =>
        Path.Combine(Path.GetDirectoryName(RulePackPath)!, tenTep);

    public static string RulePackPath
    {
        get
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir is not null)
            {
                var ungVien = Path.Combine(dir.FullName, "lib", "ky-thuat", "cad", "rule-packs", TenTepHienHanh);
                if (File.Exists(ungVien)) return ungVien;
                dir = dir.Parent;
            }
            throw new FileNotFoundException(
                $"Không tìm thấy lib/ky-thuat/cad/rule-packs/{TenTepHienHanh} — test phải chạy trong repo XBoss.");
        }
    }

    /// <summary>plugin-autocad/doi-chung/ — bộ dữ liệu đối chứng dùng chung cho cả tầng 2 lẫn tầng 3.</summary>
    public static string DoiChungDir
    {
        get
        {
            // <gốc>/lib/ky-thuat/cad/rule-packs/<tệp> → lùi 4 cấp thư mục về gốc repo.
            var rulePacks = new FileInfo(RulePackPath).Directory!;
            var goc = rulePacks.Parent!.Parent!.Parent!.Parent!;
            return Path.Combine(goc.FullName, "plugin-autocad", "doi-chung");
        }
    }

    private static CadRulePack? _cached;

    public static CadRulePack LoadRulePack() =>
        _cached ??= RulePackLoader.Load(File.ReadAllText(RulePackPath));
}
