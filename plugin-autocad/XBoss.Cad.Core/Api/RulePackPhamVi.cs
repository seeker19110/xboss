using System.Globalization;

namespace XBoss.Cad.Core.Api;

/// <summary>
/// Phạm vi dự án khi hỏi rule pack (<c>GET /api/engineering/cad/rule-pack</c>, M101 PR4).
/// BA trạng thái, cố ý KHÔNG rút gọn thành <c>long?</c>:
/// <list type="bullet">
///   <item><see cref="ToanCuc"/> — KHÔNG gắn <c>?project=</c>: máy chủ trả bản toàn cục
///   (<c>takeoff.items[].boqCode</c> đúng như trong tệp rule pack). Đây là hành vi trước PR4 và
///   là đường lui khi không chọn được dự án.</item>
///   <item><see cref="MayChuTuSuy"/> — gắn <c>?project=</c> RỖNG: máy chủ tự suy khi tài khoản
///   chỉ thuộc 1 dự án; thuộc nhiều dự án thì trả 409 kèm danh sách để plugin hỏi kỹ sư.</item>
///   <item><see cref="Cua"/> — gắn <c>?project=&lt;id&gt;</c>: dự án kỹ sư đã chọn. Id nhớ trong
///   máy KHÔNG được tin: máy chủ vẫn đối chiếu lại theo token ở mỗi lần gọi.</item>
/// </list>
/// Chỗ dễ sai nhất là gộp "toàn cục" với "để máy chủ tự suy": cả hai đều "chưa biết id" nhưng
/// một bên không được gắn query, một bên phải gắn query rỗng — gộp là mất luôn tính năng
/// (không bao giờ có mã BOQ) hoặc mất đường lui (máy chủ cũ/không quyền là hỏng lệnh).
/// </summary>
public readonly record struct PhamViDuAn
{
    private PhamViDuAn(long? id, bool theoDuAn)
    {
        Id = id;
        TheoDuAn = theoDuAn;
    }

    /// <summary>Bản rule pack toàn cục — cũng chính là giá trị <c>default</c> của kiểu này.</summary>
    public static PhamViDuAn ToanCuc => default;

    /// <summary>Để máy chủ tự suy dự án (<c>?project=</c> rỗng) — có thể dẫn tới 409 chọn dự án.</summary>
    public static PhamViDuAn MayChuTuSuy => new(null, true);

    /// <summary>Dự án cụ thể (id phải &gt; 0).</summary>
    public static PhamViDuAn Cua(long id) =>
        id > 0
            ? new PhamViDuAn(id, true)
            : throw new ArgumentOutOfRangeException(nameof(id), "Mã số dự án phải là số dương.");

    /// <summary>Id dự án; null khi toàn cục HOẶC khi để máy chủ tự suy.</summary>
    public long? Id { get; }

    /// <summary>Có hỏi theo dự án không (tức có gắn <c>?project=</c> hay không).</summary>
    public bool TheoDuAn { get; }

    /// <summary>
    /// Đã biết chắc pack thuộc phạm vi nào chưa. Chỉ khi đó mới được đụng cache/ETag: gửi ETag
    /// lúc chưa biết phạm vi là tự xin một cú 304 rồi dùng cache của dự án khác.
    /// </summary>
    public bool DaXacDinh => !TheoDuAn || Id is not null;

    /// <summary>Phần query gắn vào đường dẫn API: <c>""</c> | <c>"?project="</c> | <c>"?project=7"</c>.</summary>
    public string ChuoiTruyVan =>
        !TheoDuAn ? ""
        : Id is null ? "?project="
        : "?project=" + Id.Value.ToString(CultureInfo.InvariantCulture);

    /// <summary>Mô tả tiếng Việt để in trong AutoCAD.</summary>
    public override string ToString() =>
        !TheoDuAn ? "bản toàn cục"
        : Id is null ? "máy chủ tự suy dự án"
        : "dự án #" + Id.Value.ToString(CultureInfo.InvariantCulture);
}

/// <summary>
/// Quy tắc khoá CACHE rule pack theo dự án (M101 PR4) — thuần, không chạm đĩa để test được trên
/// CI Linux. <c>RulePackStore</c> (Adapter) chỉ ghép tên tệp ở đây với <c>%APPDATA%\XBoss</c>.
///
/// Vì sao phải tách cache: bản theo dự án mang <c>takeoff.items[].boqCode</c> của ĐÚNG dự án đó.
/// Dùng chung một tệp cache cho mọi dự án thì mã BOQ của dự án A lặng lẽ chui vào bảng bóc khối
/// lượng của dự án B — sai số liệu mà không có một dấu hiệu nào trên màn hình. ETag đi kèm theo
/// tệp vì cùng lý do (máy chủ tính ETag riêng cho từng dự án).
/// </summary>
public static class RulePackCache
{
    /// <summary>Tệp cache bản toàn cục — GIỮ NGUYÊN tên cũ để bản đã cài không mất cache.</summary>
    public const string TepToanCuc = "rule-pack.json";

    /// <summary>Tên tệp cache của một phạm vi. Ném khi phạm vi chưa xác định (fail-fast).</summary>
    public static string TenTep(PhamViDuAn pham)
    {
        if (!pham.DaXacDinh)
        {
            throw new InvalidOperationException(
                "Chưa biết rule pack thuộc dự án nào — không được đặt tên tệp cache theo phạm vi này.");
        }
        return pham.Id is { } id
            ? $"rule-pack.du-an-{id.ToString(CultureInfo.InvariantCulture)}.json"
            : TepToanCuc;
    }

    /// <summary>Tên tệp ETag đi kèm cache của phạm vi đó.</summary>
    public static string TenTepEtag(PhamViDuAn pham) => TenTep(pham) + ".etag";

    /// <summary>
    /// Phạm vi THẬT của pack vừa tải: theo <c>projectId</c> MÁY CHỦ đóng dấu trong pack, KHÔNG
    /// theo cái plugin hỏi. Máy chủ cũ (chưa có PR4) bỏ qua <c>?project=</c> và trả bản toàn cục —
    /// lấy theo cái ta hỏi là cất bản toàn cục vào ô cache của dự án.
    /// </summary>
    public static PhamViDuAn PhamViCuaPack(long? projectIdTrongPack) =>
        projectIdTrongPack is { } id && id > 0 ? PhamViDuAn.Cua(id) : PhamViDuAn.ToanCuc;

    /// <summary>
    /// Phạm vi để HỎI máy chủ: đã nhớ dự án thì hỏi thẳng dự án đó, chưa nhớ thì để máy chủ tự
    /// suy (tài khoản 1 dự án khỏi phải hỏi kỹ sư câu nào).
    /// </summary>
    public static PhamViDuAn PhamViDeHoi(long? duAnDaChon) =>
        duAnDaChon is { } id && id > 0 ? PhamViDuAn.Cua(id) : PhamViDuAn.MayChuTuSuy;

    /// <summary>
    /// Tên tệp cache ĐANG có hiệu lực cho các lệnh: bản của dự án đang làm nếu đã tải về, chưa
    /// tải thì lui về bản toàn cục (mã BOQ để trống — thà thiếu mã còn hơn mã của dự án khác).
    /// </summary>
    public static string TenTepDangDung(long? duAnDaChon, bool coCacheDuAn) =>
        duAnDaChon is { } id && id > 0 && coCacheDuAn ? TenTep(PhamViDuAn.Cua(id)) : TepToanCuc;
}
