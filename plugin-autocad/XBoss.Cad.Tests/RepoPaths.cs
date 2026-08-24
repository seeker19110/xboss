using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Tests;

/// <summary>Dò gốc repo để nạp rule pack THẬT — test C# và test TS phải cùng một nguồn
/// (chống trôi quy tắc giữa 2 tầng, ADR-0006 nguyên tắc 1).</summary>
public static class RepoPaths
{
    public static string RulePackV2Path
    {
        get
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir is not null)
            {
                var ungVien = Path.Combine(dir.FullName, "lib", "ky-thuat", "cad", "rule-packs", "v2.json");
                if (File.Exists(ungVien)) return ungVien;
                dir = dir.Parent;
            }
            throw new FileNotFoundException(
                "Không tìm thấy lib/ky-thuat/cad/rule-packs/v2.json — test phải chạy trong repo XBoss.");
        }
    }

    private static CadRulePack? _cached;

    public static CadRulePack LoadRulePackV2() =>
        _cached ??= RulePackLoader.Load(File.ReadAllText(RulePackV2Path));
}
