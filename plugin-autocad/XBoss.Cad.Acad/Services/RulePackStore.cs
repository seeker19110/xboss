using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Kho rule pack cục bộ (M99 §6.2 — giai đoạn chuyển tiếp khi chưa có token PR2):
/// kỹ sư tải JSON từ trang /engineering/chuan-hoa-ban-ve rồi nạp bằng XBOSS_RULEPACK;
/// bản đã kiểm được cache tại %APPDATA%\XBoss\rule-pack.json. Chưa nạp → mọi lệnh
/// từ chối chạy (không có quy tắc nhúng cứng — ADR-0006 nguyên tắc 1, AC14).
/// </summary>
internal static class RulePackStore
{
    private static CadRulePack? _cached;

    internal static string CachePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "XBoss", "rule-pack.json");

    /// <summary>Rule pack hiện hành, hoặc null kèm lý do khi chưa có/hỏng.</summary>
    internal static (CadRulePack? Pack, string? LoiTiengViet) HienHanh()
    {
        if (_cached is not null) return (_cached, null);
        if (!File.Exists(CachePath))
        {
            return (null, "Chưa nạp rule pack. Tải tệp JSON từ trang XBoss /engineering/chuan-hoa-ban-ve rồi chạy XBOSS_RULEPACK.");
        }
        try
        {
            _cached = RulePackLoader.Load(File.ReadAllText(CachePath));
            return (_cached, null);
        }
        catch (RulePackException e)
        {
            return (null, $"Rule pack cache hỏng ({e.Message}) — nạp lại bằng XBOSS_RULEPACK.");
        }
    }

    /// <summary>Nạp tệp mới: kiểm chặt TRƯỚC, hợp lệ mới ghi đè cache.</summary>
    internal static CadRulePack Import(string duongDanTep) => ImportJson(File.ReadAllText(duongDanTep));

    /// <summary>Nạp từ chuỗi JSON (XBOSS_LOGIN tải qua API — M99 PR2): cùng đường kiểm chặt.</summary>
    internal static CadRulePack ImportJson(string noiDung)
    {
        var pack = RulePackLoader.Load(noiDung); // ném RulePackException nếu không hợp lệ
        Directory.CreateDirectory(Path.GetDirectoryName(CachePath)!);
        File.WriteAllText(CachePath, noiDung);
        _cached = pack;
        return pack;
    }

    /// <summary>ETag của lần tải rule pack gần nhất (cache HTTP — không phải bí mật).</summary>
    internal static string EtagPath => CachePath + ".etag";
}
