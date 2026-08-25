using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Kho rule pack cục bộ (M99 §6.2 — giai đoạn chuyển tiếp khi chưa có token PR2):
/// kỹ sư tải JSON từ trang /engineering/chuan-hoa-ban-ve rồi nạp bằng XBOSS_RULEPACK;
/// bản đã kiểm được cache tại %APPDATA%\XBoss\rule-pack.json. Chưa nạp → mọi lệnh
/// từ chối chạy (không có quy tắc nhúng cứng — ADR-0006 nguyên tắc 1, AC14).
///
/// M101 PR4 — CACHE TÁCH THEO DỰ ÁN: bản rule pack hỏi kèm <c>?project=</c> mang mã BOQ của
/// riêng dự án đó, nên mỗi phạm vi có tệp cache + tệp .etag riêng
/// (<c>rule-pack.json</c> cho bản toàn cục, <c>rule-pack.du-an-&lt;id&gt;.json</c> cho từng dự án —
/// quy tắc đặt tên nằm ở <see cref="RulePackCache"/>, thuần và có test). Dùng chung một ô cache
/// là cách chắc chắn để mã BOQ dự án A chui vào bảng bóc của dự án B mà không ai thấy.
/// </summary>
internal static class RulePackStore
{
    private static CadRulePack? _cached;
    private static string? _duongDanCache;
    private static DateTime _thoiDiemCache;

    private static string ThuMuc => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "XBoss");

    /// <summary>Đường dẫn cache của một phạm vi cụ thể.</summary>
    internal static string DuongDan(PhamViDuAn pham) => Path.Combine(ThuMuc, RulePackCache.TenTep(pham));

    /// <summary>Đường dẫn tệp ETag đi kèm cache của phạm vi đó (cache HTTP — không phải bí mật).</summary>
    internal static string DuongDanEtag(PhamViDuAn pham) => Path.Combine(ThuMuc, RulePackCache.TenTepEtag(pham));

    /// <summary>
    /// Tệp rule pack ĐANG có hiệu lực cho mọi lệnh: bản của dự án đang làm (ExcelMetaStore) nếu đã
    /// tải về, chưa có thì lui về bản toàn cục. Đổi dự án mà chưa XBOSS_LOGIN lại ⇒ dùng bản toàn
    /// cục (cột mã BOQ trống) chứ KHÔNG dùng bản của dự án cũ.
    /// </summary>
    internal static string DuongDanHienHanh => TepHienHanh().DuongDan;

    /// <summary>Tệp cache đang có hiệu lực + phạm vi mà nó PHẢI thuộc về.</summary>
    private static (string DuongDan, PhamViDuAn Pham) TepHienHanh()
    {
        var duAn = ExcelMetaStore.DuAnHienHanh;
        var coCacheDuAn = duAn is { } id && id > 0 && File.Exists(DuongDan(PhamViDuAn.Cua(id)));
        var duongDan = Path.Combine(ThuMuc, RulePackCache.TenTepDangDung(duAn, coCacheDuAn));
        return (duongDan, coCacheDuAn ? PhamViDuAn.Cua(duAn!.Value) : PhamViDuAn.ToanCuc);
    }

    /// <summary>Nơi một pack vừa nạp sẽ được cất — theo dấu <c>projectId</c> của máy chủ.</summary>
    internal static string DuongDanCua(CadRulePack pack) => DuongDan(RulePackCache.PhamViCuaPack(pack.ProjectId));

    /// <summary>Rule pack hiện hành, hoặc null kèm lý do khi chưa có/hỏng.</summary>
    internal static (CadRulePack? Pack, string? LoiTiengViet) HienHanh()
    {
        var (duongDan, phamMongDoi) = TepHienHanh();
        if (!File.Exists(duongDan))
        {
            return (null, "Chưa nạp rule pack. Tải tệp JSON từ trang XBoss /engineering/chuan-hoa-ban-ve rồi chạy XBOSS_RULEPACK.");
        }
        try
        {
            // Cache bộ nhớ khoá theo (đường dẫn, thời điểm ghi): đổi dự án hoặc vừa XBOSS_LOGIN
            // là nạp lại, không giữ pack của phạm vi cũ trong phiên AutoCAD.
            var thoiDiem = File.GetLastWriteTimeUtc(duongDan);
            if (_cached is not null && _duongDanCache == duongDan && _thoiDiemCache == thoiDiem)
                return (_cached, null);

            var pack = RulePackLoader.Load(File.ReadAllText(duongDan));
            if (KiemDauDuAn(pack, phamMongDoi) is { } lech) return (null, lech);
            _cached = pack;
            _duongDanCache = duongDan;
            _thoiDiemCache = thoiDiem;
            return (pack, null);
        }
        catch (RulePackException e)
        {
            return (null, $"Rule pack cache hỏng ({e.Message}) — nạp lại bằng XBOSS_RULEPACK.");
        }
    }

    /// <summary>
    /// Chốt chặn cuối chống lẫn dự án: tệp cache theo dự án phải mang đúng dấu <c>projectId</c> của
    /// máy chủ. Lệch (chép tay tệp giữa các máy, sửa tay) thì thà không có rule pack còn hơn in ra
    /// mã BOQ của dự án khác. Trả null = khớp.
    /// </summary>
    private static string? KiemDauDuAn(CadRulePack pack, PhamViDuAn phamMongDoi)
    {
        var phamThat = RulePackCache.PhamViCuaPack(pack.ProjectId);
        if (phamThat == phamMongDoi) return null;
        return $"Cache rule pack đáng ra là {phamMongDoi} nhưng mang dấu {phamThat} — " +
               "chạy XBOSS_LOGIN để tải lại đúng bản của dự án.";
    }

    /// <summary>Nạp tệp mới: kiểm chặt TRƯỚC, hợp lệ mới ghi đè cache.</summary>
    internal static CadRulePack Import(string duongDanTep) => ImportJson(File.ReadAllText(duongDanTep));

    /// <summary>
    /// Nạp từ chuỗi JSON (XBOSS_LOGIN tải qua API — M99 PR2): cùng đường kiểm chặt.
    /// Cất vào ô cache nào là do DẤU <c>projectId</c> trong chính pack quyết định, không phải do
    /// lời gọi truyền vào — nhờ vậy máy chủ cũ (bỏ qua <c>?project=</c>) không thể làm bản toàn cục
    /// nằm nhầm trong ô cache của một dự án.
    /// </summary>
    internal static CadRulePack ImportJson(string noiDung)
    {
        var pack = RulePackLoader.Load(noiDung); // ném RulePackException nếu không hợp lệ
        var duongDan = DuongDanCua(pack);
        Directory.CreateDirectory(ThuMuc);
        File.WriteAllText(duongDan, noiDung);
        // Nạp một pack CÓ DẤU dự án ⇒ dự án đó là dự án đang làm. Giữ đúng giao kèo cũ của
        // XBOSS_RULEPACK/XBOSS_LOGIN: "nạp xong là bản đang dùng" — không có dòng này thì pack
        // vừa tải nằm im trong ô cache của dự án còn các lệnh vẫn xài bản cũ.
        // Pack toàn cục thì KHÔNG đụng lựa chọn đã nhớ (quên dự án là việc của lệnh gọi, có cảnh báo).
        if (pack.ProjectId is { } duAnCuaPack) ExcelMetaStore.GhiDuAn(duAnCuaPack);
        _cached = pack;
        _duongDanCache = duongDan;
        _thoiDiemCache = File.GetLastWriteTimeUtc(duongDan);
        return pack;
    }

    /// <summary>ETag đã lưu của phạm vi này; null khi chưa có, đọc lỗi, hoặc phạm vi CHƯA xác
    /// định (để máy chủ tự suy dự án) — lúc đó gửi ETag là dùng nhầm cache của phạm vi khác.</summary>
    internal static string? DocEtag(PhamViDuAn pham)
    {
        if (!pham.DaXacDinh) return null;
        try
        {
            var duongDan = DuongDanEtag(pham);
            return File.Exists(duongDan) ? File.ReadAllText(duongDan) : null;
        }
        catch (IOException)
        {
            return null; // thiếu etag chỉ tốn 1 lần tải lại
        }
    }

    /// <summary>Ghi ETag vào đúng ô của pack vừa nạp (theo dấu dự án của máy chủ).</summary>
    internal static void GhiEtag(CadRulePack pack, string etag)
    {
        Directory.CreateDirectory(ThuMuc);
        File.WriteAllText(DuongDanEtag(RulePackCache.PhamViCuaPack(pack.ProjectId)), etag);
    }
}
