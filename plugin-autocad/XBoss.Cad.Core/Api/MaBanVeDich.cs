using System.Globalization;

namespace XBoss.Cad.Core.Api;

/// <summary>
/// Bản vẽ đích của <c>XBOSS_UPLOAD</c>: SỐ bản vẽ trong sổ (<c>drawings.code</c>) hoặc MÃ SỐ bản
/// vẽ (<c>drawings.id</c>).
///
/// Vì sao cần cả hai: route <c>POST /api/engineering/cad/plugin-upload</c> nhận cả
/// <c>drawingCode</c> lẫn <c>drawingId</c> và tra theo <c>drawingId</c> TRƯỚC. Mã bản vẽ chỉ duy
/// nhất trong phạm vi một dự án, nên hai dự án cùng đặt "ACMV-SD-T05-001" thì gửi mỗi code sẽ rơi
/// vào bản vẽ của dự án kia — server trả 403 "không thuộc dự án bạn được thao tác" hoặc 404, và
/// kỹ sư không có cách nào chỉ định đúng bản ghi. Gõ <c>#&lt;id&gt;</c> là đường thoát cho đúng ca đó.
///
/// Thuần (không chạm AutoCAD/đĩa) để test được trên CI Linux; Adapter chỉ hỏi chuỗi rồi gọi
/// <see cref="PhanTich"/>. CỐ Ý không coi chuỗi toàn số là id: <c>drawings.code</c> hoàn toàn có
/// thể là "1204" — đoán sai ở đây là ghi revision vào nhầm bản vẽ, nên id phải được gõ TƯỜNG MINH.
/// </summary>
public sealed record MaBanVeDich
{
    private MaBanVeDich(string? code, long? id, string? loi)
    {
        Code = code;
        Id = id;
        Loi = loi;
    }

    /// <summary>Số bản vẽ trong sổ (<c>drawings.code</c>); null khi kỹ sư gõ mã số.</summary>
    public string? Code { get; }

    /// <summary>Mã số bản vẽ (<c>drawings.id</c>); null khi kỹ sư gõ số bản vẽ.</summary>
    public long? Id { get; }

    /// <summary>Lý do tiếng Việt khi chuỗi nhập không dùng được; null khi hợp lệ.</summary>
    public string? Loi { get; }

    /// <summary>Có đủ thông tin để gọi API không.</summary>
    public bool HopLe => Loi is null;

    /// <summary>Cách gọi bản vẽ này trong thông báo trên dòng lệnh AutoCAD.</summary>
    public string MoTa =>
        Id is { } id ? "#" + id.ToString(CultureInfo.InvariantCulture) : Code ?? "";

    /// <summary>
    /// Đọc câu trả lời của kỹ sư ở lời nhắc số bản vẽ. <c>#128</c> hoặc <c>id:128</c> (không phân
    /// biệt hoa thường) = mã số bản vẽ; mọi chuỗi khác = số bản vẽ trong sổ, y như trước.
    /// </summary>
    public static MaBanVeDich PhanTich(string? nhap)
    {
        var s = (nhap ?? "").Trim();
        if (s.Length == 0) return new MaBanVeDich(null, null, "Chưa nhập số bản vẽ.");

        var phanId = s.StartsWith('#') ? s[1..]
            : s.StartsWith("id:", StringComparison.OrdinalIgnoreCase) ? s[3..]
            : null;
        if (phanId is null) return new MaBanVeDich(s, null, null);

        phanId = phanId.Trim();
        return long.TryParse(phanId, NumberStyles.None, CultureInfo.InvariantCulture, out var id) && id > 0
            ? new MaBanVeDich(null, id, null)
            : new MaBanVeDich(null, null,
                $"\"{s}\" không phải mã số bản vẽ — sau # phải là số nguyên dương (vd #128), " +
                "hoặc gõ thẳng số bản vẽ trong sổ (vd ACMV-SD-T05-001).");
    }
}
