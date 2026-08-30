using System.Net;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Api;

/// <summary>Phần rule pack của <see cref="XBossApiClient"/> — GET /api/engineering/cad/rule-pack.</summary>
public sealed partial class XBossApiClient
{
    /// <summary>
    /// GET /api/engineering/cad/rule-pack[?project=] với Bearer token + ETag. Trả (json, etag)
    /// hoặc (null, etag) khi 304 — caller giữ bản cache.
    ///
    /// <paramref name="pham"/> (M101 PR4): hỏi bản rule pack đã gán mã BOQ theo dự án
    /// (<c>takeoff.items[].boqCode</c>) hay bản toàn cục — mặc định <see cref="PhamViDuAn.ToanCuc"/>
    /// nên mọi lời gọi cũ giữ nguyên hành vi trước PR4. Tài khoản thuộc nhiều dự án mà chưa chỉ
    /// định thì máy chủ trả 409 kèm danh sách → ném <see cref="XBossCanChonDuAnException"/> để lệnh
    /// hỏi kỹ sư chọn (CÙNG cơ chế với <see cref="FetchBoqSnapshotAsync"/>, không có cơ chế thứ hai).
    /// Tham số đặt SAU <paramref name="etag"/> là có chủ đích: giữ nguyên thứ tự đối số của mọi
    /// call site/test đã có.
    /// </summary>
    public async Task<(string? Json, string? Etag)> FetchRulePackAsync(
        string token, string? etag = null, PhamViDuAn pham = default, CancellationToken ct = default)
    {
        using var res = await GuiKemToken(
            "api/engineering/cad/rule-pack" + pham.ChuoiTruyVan, token, etag, ct);
        if (res.StatusCode == HttpStatusCode.NotModified) return (null, etag);
        if (res.StatusCode == HttpStatusCode.Conflict)
        {
            var body = await res.Content.ReadAsStringAsync(ct);
            throw new XBossCanChonDuAnException(
                DocLoiTuChuoi(body) ?? "Cần chỉ định dự án.", DocDanhSachDuAn(body));
        }
        await NemNeuLoi(res, ct);
        var json = await res.Content.ReadAsStringAsync(ct);
        return (json, res.Headers.ETag?.ToString());
    }
}
