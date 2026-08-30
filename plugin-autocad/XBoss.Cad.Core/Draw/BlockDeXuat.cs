using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Draw;

/// <summary>
/// Metadata một đề xuất block vào thư viện chuẩn (M103 §2/§4) — thuần dữ liệu, không chạm
/// AutoCAD: đây chính là phần <c>meta</c> mà <c>XBOSS_VE_DEXUAT</c> gửi lên server.
/// Quy tắc "trường nào bắt buộc theo loại" nằm ở <see cref="BlockDeXuatRules"/>, dùng CHUNG cho
/// hộp thoại (khóa nút Gửi) và cho bước kiểm trước khi gửi — hai nơi không được lệch nhau.
/// </summary>
public sealed record BlockDeXuat
{
    public string BlockName { get; init; } = "";
    public BlockKind Kind { get; init; }

    /// <summary>Id hệ (khớp <c>layerMap.groups[].id</c>); null với khung tên.</summary>
    public string? SystemId { get; init; }

    /// <summary>Id item bóc tách <c>measure=count</c>; null với khung tên.</summary>
    public string? TakeoffItemId { get; init; }

    /// <summary>Khổ giấy — CHỈ khung tên.</summary>
    public string? PaperSize { get; init; }

    public string? Note { get; init; }
}

/// <summary>
/// Quy tắc metadata theo loại block (M103 §2 — hợp đồng với server, KHÔNG tự nới):
/// hệ + item bóc tách bắt buộc với mọi loại TRỪ khung tên; khổ giấy chỉ dành cho khung tên.
/// </summary>
public static class BlockDeXuatRules
{
    /// <summary>5 loại block người dùng được đề xuất, theo thứ tự hiện trong hộp thoại.</summary>
    public static readonly IReadOnlyList<BlockKind> CacLoai =
    [
        BlockKind.Fitting, BlockKind.Equipment, BlockKind.Support, BlockKind.Sleeve, BlockKind.Titleblock,
    ];

    /// <summary>Ký tự AutoCAD KHÔNG cho phép trong tên block (đặt được cũng không lưu được).</summary>
    private const string KyTuCam = "<>/\\\":;?*|,=`";

    public static bool CanHe(BlockKind kind) => kind != BlockKind.Titleblock;

    public static bool CanItemBocTach(BlockKind kind) => kind != BlockKind.Titleblock;

    public static bool CanKhoGiay(BlockKind kind) => kind == BlockKind.Titleblock;

    /// <summary>Mã kind ghi vào manifest/JSON (khớp <see cref="BlockDef.Kind"/>).</summary>
    public static string Ma(BlockKind kind) => kind switch
    {
        BlockKind.Fitting => "fitting",
        BlockKind.Equipment => "equipment",
        BlockKind.Titleblock => "titleblock",
        BlockKind.Support => "support",
        BlockKind.Sleeve => "sleeve",
        _ => throw new BlockManifestException($"Loại block lạ: {kind}"),
    };

    /// <summary>Nhãn tiếng Việt hiện trong combo loại block.</summary>
    public static string Nhan(BlockKind kind) => kind switch
    {
        BlockKind.Fitting => "Phụ kiện trên tuyến (fitting)",
        BlockKind.Equipment => "Thiết bị có TAG (equipment)",
        BlockKind.Titleblock => "Khung tên trang in (titleblock)",
        BlockKind.Support => "Giá đỡ/treo đỡ (support)",
        BlockKind.Sleeve => "Lỗ chờ/sleeve (sleeve)",
        _ => kind.ToString(),
    };

    /// <summary>
    /// Mọi lý do khiến đề xuất chưa gửi được, tiếng Việt, theo thứ tự ưu tiên hiển thị.
    /// Rỗng = đủ điều kiện gửi.
    /// </summary>
    public static IReadOnlyList<string> Kiem(BlockDeXuat meta, IEnumerable<string> tenBlockDaCo)
    {
        var loi = new List<string>();
        var ten = (meta.BlockName ?? "").Trim();

        if (ten.Length == 0)
        {
            loi.Add("Chưa nhập tên block.");
        }
        else if (ten.IndexOfAny(KyTuCam.ToCharArray()) >= 0)
        {
            loi.Add($"Tên block chứa ký tự AutoCAD không cho phép ({KyTuCam}).");
        }
        else if (tenBlockDaCo.Any(t => string.Equals(t, ten, StringComparison.OrdinalIgnoreCase)))
        {
            // Chặn ngay tại chỗ cho khỏi mất công dựng ứng viên rồi ăn 409 (M103 AC3):
            // AutoCAD không phân biệt hoa/thường nên so không phân biệt hoa/thường.
            loi.Add($"Thư viện hiện hành đã có block tên \"{ten}\" — đổi tên khác (server sẽ từ chối trùng tên).");
        }

        if (CanHe(meta.Kind) && string.IsNullOrWhiteSpace(meta.SystemId))
            loi.Add($"Chưa chọn hệ — bắt buộc với loại {Nhan(meta.Kind)}.");
        if (!CanHe(meta.Kind) && !string.IsNullOrWhiteSpace(meta.SystemId))
            loi.Add("Khung tên không thuộc hệ nào — bỏ trống ô Hệ.");

        if (CanItemBocTach(meta.Kind) && string.IsNullOrWhiteSpace(meta.TakeoffItemId))
            loi.Add("Chưa chọn item bóc tách — thiếu thì XBOSS_BOCKL sẽ không đếm được block này.");
        if (!CanItemBocTach(meta.Kind) && !string.IsNullOrWhiteSpace(meta.TakeoffItemId))
            loi.Add("Khung tên không đếm khối lượng — bỏ trống ô Item bóc tách.");

        if (CanKhoGiay(meta.Kind) && string.IsNullOrWhiteSpace(meta.PaperSize))
            loi.Add("Chưa chọn khổ giấy — bắt buộc với khung tên.");
        if (!CanKhoGiay(meta.Kind) && !string.IsNullOrWhiteSpace(meta.PaperSize))
            loi.Add("Khổ giấy chỉ dành cho khung tên.");

        return loi;
    }

    /// <summary>Lý do ĐẦU TIÊN khiến chưa gửi được (hiện cạnh nút Gửi bị khóa); null = gửi được.</summary>
    public static string? LyDoChuaGui(BlockDeXuat meta, IEnumerable<string> tenBlockDaCo) =>
        Kiem(meta, tenBlockDaCo).FirstOrDefault();
}

/// <summary>
/// Dựng "thư viện ứng viên" phần THUẦN (M103 §1 bước 3): manifest mới = manifest hiện hành +
/// đúng một entry cho block được đề xuất. Phần chạm AutoCAD (copy .dwg cache, WblockClone,
/// DxfOut) nằm ở Adapter — ở đây chỉ có dữ liệu nên test được trên CI Linux.
/// </summary>
public static class BlockUngVien
{
    private static readonly JsonSerializerOptions BoKhoaNull = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>
    /// Manifest ứng viên, dựng THẲNG TRÊN JSON manifest hiện hành thay vì trên model đã parse.
    ///
    /// Vì sao trên JSON: manifest của máy chủ có những khóa plugin CHƯA model (M104 thêm
    /// <c>fileKey</c>/<c>fileSha256</c>/<c>previewSvg</c> cho block thêm từ web). Đi vòng qua model
    /// là rụng hết các khóa đó, và máy chủ từ chối ứng viên vì "block bị sửa/mất fileKey so với
    /// thư viện hiện hành". Giữ nguyên cây JSON gốc ⇒ mọi khóa hiện có VÀ khóa version sau này
    /// đều sống sót; ta chỉ thêm đúng 1 phần tử vào <c>blocks</c> và cập nhật <c>dwgSha256</c>.
    ///
    /// <c>version</c> GIỮ NGUYÊN version hiện hành: version mới do SERVER đặt lúc duyệt (M103 §3),
    /// plugin không tự đoán số version rồi phát hành hộ. <c>dwgSha256</c> bắt buộc đổi vì tệp .dwg
    /// ứng viên đã khác tệp thư viện gốc.
    ///
    /// Ném <see cref="BlockManifestException"/> (tiếng Việt) khi manifest dựng ra không hợp lệ —
    /// vd block thiết bị thiếu thuộc tính TAG, khung tên chưa khai attribute, trùng tên block.
    /// </summary>
    public static JsonObject DungManifest(
        string manifestGocJson, BlockDeXuat meta, IReadOnlyList<string> thuocTinh, string dwgSha256)
    {
        var hienHanh = BlockManifestLoader.Load(manifestGocJson); // cache hỏng thì hỏng ngay tại đây

        JsonObject goc;
        try
        {
            goc = JsonNode.Parse(manifestGocJson)?.AsObject()
                  ?? throw new BlockManifestException("Manifest thư viện block rỗng.");
        }
        catch (JsonException e)
        {
            throw new BlockManifestException($"Manifest thư viện block không đọc lại được: {e.Message}");
        }

        var def = DungEntry(hienHanh, meta, thuocTinh);
        goc["dwgSha256"] = dwgSha256;
        goc["blocks"]!.AsArray().Add(JsonSerializer.SerializeToNode(def, BoKhoaNull));

        // Kiểm bằng CHÍNH bộ kiểm manifest của plugin: ứng viên không hợp lệ thì đừng gửi đi.
        BlockManifestLoader.Load(goc.ToJsonString());
        return goc;
    }

    /// <summary>Entry manifest cho block được đề xuất (không đụng phần còn lại của manifest).</summary>
    public static BlockDef DungEntry(
        BlockManifest hienHanh, BlockDeXuat meta, IReadOnlyList<string> thuocTinh)
    {
        var ten = (meta.BlockName ?? "").Trim();
        return new BlockDef
        {
            Id = IdMoi(hienHanh, ten),
            BlockName = ten,
            Kind = BlockDeXuatRules.Ma(meta.Kind),
            System = BlockDeXuatRules.CanHe(meta.Kind) ? Rong(meta.SystemId) : null,
            Attributes = thuocTinh,
            TakeoffItemId = BlockDeXuatRules.CanItemBocTach(meta.Kind) ? Rong(meta.TakeoffItemId) : null,
            Paper = BlockDeXuatRules.CanKhoGiay(meta.Kind) ? Rong(meta.PaperSize) : null,
            // scaleBySize/rotateToPath không nằm trong metadata đề xuất (M103 §3) → để mặc định;
            // người duyệt chỉnh trên web nếu phụ kiện cần xoay theo tuyến / co giãn theo size.
        };
    }

    /// <summary>
    /// Id manifest cho block mới: slug từ tên block (chữ thường, ký tự lạ → "-"), thêm hậu tố số
    /// khi trùng id đã có. Id là khóa rule pack trỏ tới, nên phải duy nhất trong manifest.
    /// </summary>
    public static string IdMoi(BlockManifest hienHanh, string tenBlock)
    {
        var goc = Slug(tenBlock);
        if (goc.Length == 0) goc = "block-moi";
        var daCo = hienHanh.Blocks.Select(b => b.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!daCo.Contains(goc)) return goc;
        for (var i = 2; ; i++)
        {
            var thu = $"{goc}-{i}";
            if (!daCo.Contains(thu)) return thu;
        }
    }

    private static string Slug(string s)
    {
        var kq = new System.Text.StringBuilder(s.Length);
        foreach (var c in s.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(c)) kq.Append(c);
            else if (kq.Length > 0 && kq[^1] != '-') kq.Append('-'); // gộp mọi ký tự lạ liền nhau thành 1 gạch
        }
        return kq.ToString().Trim('-');
    }

    private static string? Rong(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    /// <summary>Hệ đoán theo layer của khối được chọn: nhóm layerMap ĐẦU TIÊN khớp token
    /// (đúng thứ tự first-match của <see cref="Layers.LayerMapper"/>); null = không đoán được.</summary>
    public static string? DoanHeTheoLayer(LayerMapSection layerMap, string? tenLayer)
    {
        if (string.IsNullOrWhiteSpace(tenLayer)) return null;
        foreach (var g in layerMap.Groups)
        {
            if (TokenMatcher.MatchesAny(tenLayer, g.MatchAny)) return g.Id;
        }
        return null;
    }

    /// <summary>Item bóc tách đoán theo TÊN BLOCK (<c>blockNameMatchAny</c> của item
    /// <c>measure=count</c>) — cùng cách <c>XBOSS_BOCKL</c> đếm, nên đoán đúng thì bóc đúng.</summary>
    public static string? DoanItemTheoTenBlock(TakeoffSection takeoff, string? tenBlock)
    {
        if (string.IsNullOrWhiteSpace(tenBlock)) return null;
        foreach (var i in takeoff.Items)
        {
            if (i.MeasureKind == TakeoffMeasure.Count &&
                i.BlockNameMatchAny is { Count: > 0 } mau &&
                TokenMatcher.MatchesAny(tenBlock, mau))
            {
                return i.Id;
            }
        }
        return null;
    }
}

/// <summary>
/// Gói đề xuất gửi lên server (M103 §3): 2 tệp nhị phân + phần <c>meta</c> JSON.
/// Giữ ở Core để hình dạng JSON của hợp đồng API test được không cần AutoCAD.
/// </summary>
public sealed record DeXuatBlockGoi
{
    public required BlockDeXuat Meta { get; init; }

    /// <summary>Version thư viện mà ứng viên dựng trên đó — server so với version hiện hành (chống đua).</summary>
    public required string BaseLibVersion { get; init; }

    /// <summary>Manifest ứng viên dạng cây JSON (giữ nguyên khóa lạ — xem <see cref="BlockUngVien.DungManifest"/>).</summary>
    public required JsonObject CandidateManifest { get; init; }

    /// <summary>sha256 (hex thường) của <see cref="CandidateDwg"/> — server kiểm lại.</summary>
    public required string Sha256 { get; init; }

    public required byte[] CandidateDwg { get; init; }
    public required byte[] SidecarDxf { get; init; }

    /// <summary>Tên tệp trong multipart (server tự sinh tên lưu, đây chỉ là nhãn).</summary>
    public string TenTepDwg { get; init; } = "blocks.dwg";

    private static readonly JsonSerializerOptions Options = new()
    {
        // Khóa null bỏ hẳn để manifest ứng viên giữ đúng hình dạng chuẩn của manifest phát hành
        // (vd khung tên không có "system"), tránh server hiểu null là "có khóa nhưng rỗng".
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>
    /// Phần <c>meta</c> của multipart (JSON UTF-8).
    ///
    /// Manifest ứng viên gửi kèm HAI khóa cùng nội dung: <c>candidate_manifest</c> (khóa máy chủ
    /// đọc thật — <c>lib/ky-thuat/cad/block-proposals.ts</c> đọc thẳng snake_case, KHÔNG có lối
    /// camelCase như các khóa khác) và <c>candidateManifest</c> (khóa ghi trong đặc tả M103 §3).
    /// Gửi cả hai để plugin chạy đúng với máy chủ hiện tại mà không sửa hợp đồng đã chốt.
    /// </summary>
    public string MetaJson()
    {
        var meta = new JsonObject
        {
            ["blockName"] = Meta.BlockName.Trim(),
            ["kind"] = BlockDeXuatRules.Ma(Meta.Kind),
            ["baseLibVersion"] = BaseLibVersion,
            ["sha256"] = Sha256,
        };
        if (BlockDeXuatRules.CanHe(Meta.Kind) && !string.IsNullOrWhiteSpace(Meta.SystemId))
            meta["systemId"] = Meta.SystemId.Trim();
        if (BlockDeXuatRules.CanItemBocTach(Meta.Kind) && !string.IsNullOrWhiteSpace(Meta.TakeoffItemId))
            meta["takeoffItemId"] = Meta.TakeoffItemId.Trim();
        if (BlockDeXuatRules.CanKhoGiay(Meta.Kind) && !string.IsNullOrWhiteSpace(Meta.PaperSize))
            meta["paperSize"] = Meta.PaperSize.Trim();
        if (!string.IsNullOrWhiteSpace(Meta.Note)) meta["note"] = Meta.Note.Trim();

        // JsonNode chỉ có MỘT cha ⇒ nhân bản để gắn được vào hai khóa.
        meta["candidateManifest"] = CandidateManifest.DeepClone();
        meta["candidate_manifest"] = CandidateManifest.DeepClone();
        return meta.ToJsonString(Options);
    }
}
