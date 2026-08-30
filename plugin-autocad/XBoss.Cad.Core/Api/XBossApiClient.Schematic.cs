using System.Net;

namespace XBoss.Cad.Core.Api;

/// <summary>Phần sơ đồ nguyên lý của <see cref="XBossApiClient"/> (M117 PR4 §7 FR5, chỉ ĐỌC) —
/// GET /api/engineering/cad/schematic/:id/plugin.</summary>
public sealed partial class XBossApiClient
{
    /// <summary>
    /// GET /api/engineering/cad/schematic/:id/plugin[?project=] — graph sơ đồ nguyên lý ĐÃ CHỐT,
    /// nguồn của <c>XBOSS_TUYEN_GOIY</c>. Trả JSON THÔ để lệnh vừa dựng được
    /// <see cref="Schematic.BanGoiY"/> vừa cất nguyên văn vào cache offline (M117 NFR — cache cùng
    /// cơ chế M113).
    ///
    /// <para>Máy chủ dùng 409 cho HAI việc khác nhau nên ở đây tách rõ: có danh sách <c>duAn</c> ⇒
    /// người dùng thuộc nhiều dự án (<see cref="XBossCanChonDuAnException"/> để lệnh hỏi kỹ sư
    /// chọn); không có ⇒ graph còn <c>nhap</c>, chưa ai chốt — báo nguyên văn lời máy chủ, KHÔNG
    /// tự đi tiếp bằng bản chưa duyệt (guardrail M117 §2b).</para>
    /// </summary>
    public async Task<string> FetchSchematicPluginAsync(
        string token, long id, long? projectId = null, CancellationToken ct = default)
    {
        var duongDan = $"api/engineering/cad/schematic/{id}/plugin"
                       + (projectId is null ? "" : $"?project={projectId.Value}");
        using var res = await GuiKemToken(duongDan, token, null, ct);
        if (res.StatusCode == HttpStatusCode.Conflict)
        {
            var body = await res.Content.ReadAsStringAsync(ct);
            var ds = DocDanhSachDuAn(body);
            var loi = DocLoiTuChuoi(body);
            if (ds.Count > 0) throw new XBossCanChonDuAnException(loi ?? "Cần chỉ định dự án.", ds);
            throw new XBossApiException(loi ?? "Sơ đồ nguyên lý chưa được chốt trên web.");
        }
        await NemNeuLoi(res, ct);
        return await res.Content.ReadAsStringAsync(ct);
    }
}
