using System.Net;

namespace XBoss.Cad.Core.Api;

/// <summary>Phần đối chiếu BOQ của <see cref="XBossApiClient"/> (M101 PR4 §6.3, chỉ ĐỌC) —
/// GET /api/engineering/cad/boq-snapshot.</summary>
public sealed partial class XBossApiClient
{
    /// <summary>
    /// GET /api/engineering/cad/boq-snapshot[?project=] — KL BOQ hợp đồng theo hạng mục bóc tách,
    /// để dựng sheet phụ <c>Doi-chieu</c>. KHÔNG có đường ghi ngược: số liệu bóc chỉ về máy chủ
    /// qua XBOSS_UPLOAD có kiểm định (M101 §6.4).
    ///
    /// <paramref name="projectId"/> null = để máy chủ tự suy (người dùng chỉ thuộc 1 dự án); thuộc
    /// nhiều dự án thì máy chủ trả 409 kèm danh sách → ném <see cref="XBossCanChonDuAnException"/>
    /// để lệnh hỏi kỹ sư chọn, KHÔNG tự đoán một dự án (đoán = đưa nhầm KL hợp đồng của dự án khác).
    /// </summary>
    public async Task<BoqSnapshot> FetchBoqSnapshotAsync(
        string token, long? projectId = null, CancellationToken ct = default)
    {
        var duongDan = "api/engineering/cad/boq-snapshot"
                       + (projectId is null ? "" : $"?project={projectId.Value}");
        using var res = await GuiKemToken(duongDan, token, null, ct);
        if (res.StatusCode == HttpStatusCode.Conflict)
        {
            var body = await res.Content.ReadAsStringAsync(ct);
            throw new XBossCanChonDuAnException(
                DocLoiTuChuoi(body) ?? "Cần chỉ định dự án.", DocDanhSachDuAn(body));
        }
        await NemNeuLoi(res, ct);
        return BoqSnapshot.TuJson(await res.Content.ReadAsStringAsync(ct));
    }
}
