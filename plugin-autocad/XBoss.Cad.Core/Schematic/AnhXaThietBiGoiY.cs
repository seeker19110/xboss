using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Schematic;

/// <summary>
/// Một BLOCK thiết bị đã đặt trên MẶT BẰNG (đọc từ XData vai trò <c>ThietBi</c>) — đầu vào ánh xạ
/// của <see cref="AnhXaThietBiGoiY"/>. Thuần: Adapter đọc bản vẽ rồi dựng danh sách này.
/// </summary>
/// <param name="Kind">Loại block theo thư viện, nếu Adapter tra được từ manifest; null = không biết.</param>
public sealed record BlockMatBang(
    string Handle,
    string? Tag,
    string? BlockName,
    string? Kind,
    string HeId,
    Diem2 ViTri);

/// <summary>Một cặp nút graph ↔ block mặt bằng đã khớp, kèm CÁCH khớp để kỹ sư soát lại.</summary>
public sealed record CapGoiY(NutGoiY Nut, BlockMatBang Block, string CachKhop);

/// <summary>Nút thiết bị KHÔNG tìm được block trên mặt bằng — liệt kê, không chặn lệnh (M117 §6).</summary>
public sealed record ThieuGoiY(NutGoiY Nut, string LyDo);

/// <summary>Kết quả ánh xạ một graph vào mặt bằng.</summary>
public sealed record KetQuaAnhXaGoiY(IReadOnlyList<CapGoiY> Cap, IReadOnlyList<ThieuGoiY> Thieu)
{
    public int TongThietBi => Cap.Count + Thieu.Count;
}

/// <summary>
/// Ánh xạ nút thiết bị của sơ đồ nguyên lý ↔ block đã đặt trên mặt bằng (M117 §6 bước 5) — THUẦN,
/// không biết gì về AutoCAD nên kiểm được trọn vẹn trên CI Linux.
///
/// <para>Ba luật khớp, xét theo đúng thứ tự dưới đây; luật nào cho ĐÚNG MỘT ứng viên chưa dùng thì
/// chốt, nhiều ứng viên thì DỪNG ở nút đó (liệt kê "không đoán" — cùng tinh thần
/// <c>chua_quyet</c> của tầng 1/tầng 2):</para>
/// <list type="number">
/// <item><b>Theo tag</b> — tag trên schematic trùng tag khối trên mặt bằng (bỏ hoa/thường, bỏ
/// khoảng trắng thừa). Đây là khớp chắc nhất vì tag do <c>XBOSS_VE_TAG</c> quản.</item>
/// <item><b>Theo tên block</b> — cùng <c>blockName</c> và cùng hệ.</item>
/// <item><b>Theo kind</b> — cùng loại block thư viện và cùng hệ (chỉ khi Adapter tra được kind).</item>
/// </list>
///
/// Một block mặt bằng chỉ được gán cho MỘT nút: gán hai lần nghĩa là hai nhánh cùng chạy về một
/// thiết bị — sai bản chất, và làm hỏng luôn phép đếm nhánh.
/// </summary>
public static class AnhXaThietBiGoiY
{
    /// <param name="graph">Đồ thị đã chốt.</param>
    /// <param name="heId">Hệ của bản schematic — block khác hệ không bao giờ là ứng viên.</param>
    /// <param name="block">Block thiết bị đọc từ mặt bằng (mọi hệ; lọc trong hàm).</param>
    public static KetQuaAnhXaGoiY Khop(
        GraphGoiY graph, string heId, IReadOnlyList<BlockMatBang> block)
    {
        var ungVien = block
            .Where(b => string.Equals(b.HeId, heId, StringComparison.Ordinal))
            .ToList();
        var daDung = new HashSet<string>(StringComparer.Ordinal);
        var cap = new List<CapGoiY>();
        var thieu = new List<ThieuGoiY>();

        foreach (var nut in graph.Nodes.Where(n => n.LaThietBi))
        {
            var conLai = ungVien.Where(b => !daDung.Contains(b.Handle)).ToList();

            List<BlockMatBang> theoTag = string.IsNullOrWhiteSpace(nut.Tag)
                ? []
                : conLai.Where(b => BangNhau(b.Tag, nut.Tag)).ToList();
            List<BlockMatBang> theoTen = string.IsNullOrWhiteSpace(nut.BlockName)
                ? []
                : conLai.Where(b => BangNhau(b.BlockName, nut.BlockName)).ToList();
            List<BlockMatBang> theoKind = string.IsNullOrWhiteSpace(nut.Kind)
                ? []
                : conLai.Where(b => BangNhau(b.Kind, nut.Kind)).ToList();

            if (Chot(cap, daDung, nut, theoTag, "theo tag")) continue;
            if (Chot(cap, daDung, nut, theoTen, "theo tên block")) continue;
            if (Chot(cap, daDung, nut, theoKind, "theo loại block (kind)")) continue;

            thieu.Add(new ThieuGoiY(nut, LyDoThieu(nut, theoTag, theoTen, theoKind)));
        }

        return new KetQuaAnhXaGoiY(cap, thieu);
    }

    private static bool Chot(
        List<CapGoiY> cap,
        HashSet<string> daDung,
        NutGoiY nut,
        List<BlockMatBang> ungVien,
        string cachKhop)
    {
        if (ungVien.Count != 1) return false;
        cap.Add(new CapGoiY(nut, ungVien[0], cachKhop));
        daDung.Add(ungVien[0].Handle);
        return true;
    }

    /// <summary>Lý do tiếng Việt đủ để kỹ sư biết phải sửa gì trên mặt bằng (đặt tag / thêm block).</summary>
    private static string LyDoThieu(
        NutGoiY nut,
        List<BlockMatBang> theoTag,
        List<BlockMatBang> theoTen,
        List<BlockMatBang> theoKind)
    {
        var nhieu = theoTag.Count > 1 ? theoTag : theoTen.Count > 1 ? theoTen : theoKind;
        if (nhieu.Count > 1)
        {
            return $"{nhieu.Count} block trên mặt bằng cùng khớp (handle " +
                   $"{string.Join(", ", nhieu.Take(5).Select(b => b.Handle))}) — đặt tag riêng bằng " +
                   "XBOSS_VE_TAG rồi chạy lại, lệnh KHÔNG đoán.";
        }
        var mo = string.IsNullOrWhiteSpace(nut.Tag)
            ? "nút chưa có tag trên sơ đồ nguyên lý"
            : $"không có block nào mang tag \"{nut.Tag}\"";
        return $"{mo} và cũng không khớp được theo tên block/loại block — đặt block thiết bị tương " +
               "ứng trên mặt bằng (XBOSS_VE_THIETBI) rồi chạy lại.";
    }

    private static bool BangNhau(string? a, string? b) =>
        !string.IsNullOrWhiteSpace(a) && !string.IsNullOrWhiteSpace(b) &&
        string.Equals(a!.Trim(), b!.Trim(), StringComparison.OrdinalIgnoreCase);
}
