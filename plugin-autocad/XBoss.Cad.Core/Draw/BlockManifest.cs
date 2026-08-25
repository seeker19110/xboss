using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace XBoss.Cad.Core.Draw;

/// <summary>Loại block trong thư viện chuẩn (M100 §11 + §6.7–6.9).</summary>
public enum BlockKind
{
    /// <summary>Phụ kiện chèn trên tuyến (co, tê, giảm, van, miệng gió…).</summary>
    Fitting,
    /// <summary>Thiết bị có attribute, đếm được qua takeoff (FCU, AHU…).</summary>
    Equipment,
    /// <summary>Khung tên của trang in (XBOSS_VE_TRANGIN) — mỗi khổ giấy một block.</summary>
    Titleblock,
    /// <summary>Giá đỡ/treo đỡ đặt dọc tuyến (XBOSS_VE_GIADO).</summary>
    Support,
    /// <summary>Sleeve/lỗ chờ xuyên kết cấu (XBOSS_VE_LOCHO).</summary>
    Sleeve,
}

/// <summary>Một block trong manifest thư viện.</summary>
public sealed class BlockDef
{
    /// <summary>Id dùng trong rule pack (drawTools.systems[].fittings/equipment, sheetSetup.titleblockId).</summary>
    [JsonPropertyName("id")] public string Id { get; init; } = "";

    /// <summary>Tên block THẬT trong tệp .dwg — nguồn khớp duy nhất với takeoff.blockNameMatchAny.</summary>
    [JsonPropertyName("blockName")] public string BlockName { get; init; } = "";

    [JsonPropertyName("kind")] public string Kind { get; init; } = "";

    /// <summary>Hệ sở hữu block (khớp layerMap.groups[].id); khung tên không thuộc hệ nào.</summary>
    [JsonPropertyName("system")] public string? System { get; init; }

    [JsonPropertyName("scaleBySize")] public bool ScaleBySize { get; init; }
    [JsonPropertyName("rotateToPath")] public bool RotateToPath { get; init; }

    /// <summary>Thẻ thuộc tính block mang theo (TAG/MODEL/SIZE; khung tên: DU_AN/TI_LE/…).</summary>
    [JsonPropertyName("attributes")] public IReadOnlyList<string> Attributes { get; init; } = [];

    /// <summary>Item takeoff mà block này được đếm vào (measure = count).</summary>
    [JsonPropertyName("takeoffItemId")] public string? TakeoffItemId { get; init; }

    /// <summary>Khổ giấy của khung tên (chỉ kind = titleblock).</summary>
    [JsonPropertyName("paper")] public string? Paper { get; init; }

    /// <summary>
    /// M104 §1 — khoá tệp .dwg RIÊNG của block trong kho lưu trữ máy chủ. Block thêm thẳng từ web
    /// nằm ở tệp lẻ vì máy chủ không chạy AutoCAD nên không gộp được định nghĩa vào tệp nền.
    /// VẮNG trường này = block nằm trong <c>blocks.dwg</c> nền như cũ ⇒ mọi manifest phát hành
    /// trước M104 chạy y nguyên, không đổi một hành vi nào.
    /// Plugin tải tệp lẻ qua <c>GET /api/engineering/cad/block-lib?file=&lt;fileKey&gt;</c> và cache
    /// tại <c>%APPDATA%\XBoss\block-lib\files\&lt;fileKey&gt;</c>.
    /// </summary>
    [JsonPropertyName("fileKey")] public string? FileKey { get; init; }

    /// <summary>
    /// sha256 (hex thường) của tệp lẻ ở <see cref="FileKey"/> — kiểm y hệt tệp nền, lệch là từ chối
    /// thẳng (M100 §12). Đi CẶP với <see cref="FileKey"/>: có khoá thì phải có hash và ngược lại.
    /// </summary>
    [JsonPropertyName("fileSha256")] public string? FileSha256 { get; init; }

    // Khóa "previewSvg" (ảnh xem trước cho web, M104 §2) CỐ Ý không model ở đây: plugin không cần
    // ảnh, mà loader bỏ qua field lạ nên nó vẫn đi qua nguyên vẹn khi dựng manifest ứng viên.

    /// <summary>Block nằm ở tệp .dwg RIÊNG (thêm từ web), không nằm trong tệp nền.</summary>
    [JsonIgnore] public bool CoTepRieng => !string.IsNullOrWhiteSpace(FileKey);

    [JsonIgnore]
    public BlockKind KindEnum => Kind switch
    {
        "fitting" => BlockKind.Fitting,
        "equipment" => BlockKind.Equipment,
        "titleblock" => BlockKind.Titleblock,
        "support" => BlockKind.Support,
        "sleeve" => BlockKind.Sleeve,
        _ => throw new BlockManifestException(
            $"Block \"{Id}\": kind lạ \"{Kind}\" (chỉ nhận fitting/equipment/titleblock/support/sleeve)"),
    };
}

/// <summary>
/// Manifest thư viện block (M100 §11) — bản đồ "id ↔ tên block ↔ hệ ↔ tham số chèn" đi kèm tệp
/// .dwg thư viện. Đây là dữ liệu, không phải mã: plugin kiểm chặt rồi mới dùng.
/// </summary>
public sealed class BlockManifest
{
    /// <summary>
    /// Id block mũi tên hướng dốc trong manifest thư viện (M100 §6.9/FR9g) — <c>XBOSS_VE_NHAN</c>
    /// chèn kèm nhãn <c>i=…%</c>. Khai MỘT chỗ: id này cũng nằm trong
    /// <c>drawTools.systems[].fittings</c> của rule pack, lệch nhau là mũi tên không bao giờ chèn được.
    /// </summary>
    public const string IdMuiTenDoDoc = "slope-arrow";

    [JsonPropertyName("version")] public string Version { get; init; } = "";

    /// <summary>sha256 (hex thường) của tệp .dwg thư viện — chống tráo tệp trong cache cục bộ.</summary>
    [JsonPropertyName("dwgSha256")] public string DwgSha256 { get; init; } = "";

    [JsonPropertyName("blocks")] public IReadOnlyList<BlockDef> Blocks { get; init; } = [];

    /// <summary>Tra block theo id manifest (rule pack chỉ nhắc tới id, không nhắc tên block).</summary>
    public BlockDef? TimTheoId(string id) =>
        Blocks.FirstOrDefault(b => string.Equals(b.Id, id, StringComparison.Ordinal));

    /// <summary>Các block cùng một loại — vd mọi khung tên để chọn theo khổ giấy.</summary>
    public IEnumerable<BlockDef> TheoLoai(BlockKind kind) => Blocks.Where(b => b.KindEnum == kind);

    /// <summary>
    /// Các block nằm ở tệp .dwg riêng (M104 §1) — plugin phải tải + kiểm hash từng tệp trước khi
    /// coi thư viện là dùng được. Rỗng với mọi thư viện phát hành trước M104.
    /// </summary>
    public IEnumerable<BlockDef> TepRieng() => Blocks.Where(b => b.CoTepRieng);

    /// <summary>
    /// Block thiết bị ứng với một id khai trong <c>drawTools.systems[].equipment[]</c> (id đó là
    /// **id item takeoff** <c>measure=count</c> — xem <see cref="TakeoffCrossCheck"/>):
    /// ưu tiên block trỏ đúng item bằng <c>takeoffItemId</c>, sau đó mới tới block trùng id
    /// manifest. Khớp cả hai chiều để cách khai lệch nhau giữa manifest và rule pack không làm
    /// "mất" thiết bị khi chèn (M100 §18 — rủi ro trôi tên số 1). Null = thư viện chưa có block.
    /// </summary>
    public BlockDef? TimThietBiTheoItem(string itemId)
    {
        var thietBi = TheoLoai(BlockKind.Equipment).ToList();
        return thietBi.FirstOrDefault(b => string.Equals(b.TakeoffItemId, itemId, StringComparison.Ordinal))
            ?? thietBi.FirstOrDefault(b => string.Equals(b.Id, itemId, StringComparison.Ordinal));
    }
}

/// <summary>
/// Nạp + kiểm manifest thư viện block, và đối chiếu hash tệp .dwg trong cache cục bộ
/// (%APPDATA%\XBoss\block-lib\ — M100 §6.10).
///
/// Cùng khuôn <see cref="RulePack.RulePackLoader"/>: field không model được bỏ qua (manifest
/// version sau thêm khóa mới không làm vỡ plugin cũ), field đã model sai kiểu → lỗi parse,
/// nội dung vô nghĩa → <see cref="BlockManifestException"/> với thông điệp tiếng Việt.
///
/// Hash LỆCH là từ chối thẳng, không "dùng tạm": thư viện sai định nghĩa sẽ đẻ ra bản vẽ shop sai
/// block hàng loạt, mà lỗi chỉ lộ ra lúc bóc khối lượng (M100 §12 — toàn vẹn chuỗi cung ứng).
/// </summary>
public static class BlockManifestLoader
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = false,
        ReadCommentHandling = JsonCommentHandling.Disallow,
        AllowTrailingCommas = false,
    };

    public static BlockManifest Load(string json)
    {
        BlockManifest? manifest;
        try
        {
            manifest = JsonSerializer.Deserialize<BlockManifest>(json, Options);
        }
        catch (JsonException e)
        {
            throw new BlockManifestException(
                $"Manifest thư viện block không phải JSON hợp lệ hoặc sai kiểu dữ liệu: {e.Message}");
        }
        if (manifest is null) throw new BlockManifestException("Manifest thư viện block rỗng.");
        Validate(manifest);
        return manifest;
    }

    public static void Validate(BlockManifest manifest)
    {
        if (string.IsNullOrWhiteSpace(manifest.Version))
            throw new BlockManifestException("Manifest thư viện block thiếu \"version\".");
        if (!LaSha256Hex(manifest.DwgSha256))
            throw new BlockManifestException(
                "Manifest thư viện block thiếu \"dwgSha256\" hợp lệ (64 ký tự hex của tệp .dwg).");
        if (manifest.Blocks.Count == 0)
            throw new BlockManifestException("Manifest thư viện block không khai block nào.");

        var ids = new HashSet<string>(StringComparer.Ordinal);
        var tenBlock = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var b in manifest.Blocks)
        {
            if (string.IsNullOrWhiteSpace(b.Id))
                throw new BlockManifestException("Manifest có block thiếu \"id\".");
            if (!ids.Add(b.Id))
                throw new BlockManifestException($"Manifest có id block trùng: \"{b.Id}\".");
            if (string.IsNullOrWhiteSpace(b.BlockName))
                throw new BlockManifestException($"Block \"{b.Id}\" thiếu \"blockName\".");
            // Tên block trong AutoCAD KHÔNG phân biệt hoa thường: hai mục khai cùng tên khác kiểu
            // chữ sẽ trỏ về đúng một định nghĩa trong DWG — lỗi im lặng, chặn ngay.
            if (!tenBlock.Add(b.BlockName))
                throw new BlockManifestException(
                    $"Block \"{b.Id}\": tên block \"{b.BlockName}\" đã được một mục khác dùng (AutoCAD không phân biệt hoa thường).");

            switch (b.KindEnum) // ném BlockManifestException nếu kind lạ
            {
                case BlockKind.Equipment:
                    // FR6: XBOSS_VE_THIETBI bắt nhập tag ngay lúc chèn → block phải có thẻ TAG.
                    if (!b.Attributes.Any(a => string.Equals(a, "TAG", StringComparison.OrdinalIgnoreCase)))
                        throw new BlockManifestException(
                            $"Block thiết bị \"{b.Id}\" phải khai thuộc tính \"TAG\".");
                    break;
                case BlockKind.Titleblock:
                    // FR9a: mỗi khổ giấy một khung tên, attribute điền tự động lúc tạo layout.
                    if (string.IsNullOrWhiteSpace(b.Paper))
                        throw new BlockManifestException(
                            $"Block khung tên \"{b.Id}\" thiếu \"paper\" (khổ giấy).");
                    if (b.Attributes.Count == 0)
                        throw new BlockManifestException(
                            $"Block khung tên \"{b.Id}\" chưa khai \"attributes\" để XBOSS_VE_TRANGIN điền.");
                    break;
            }

            foreach (var a in b.Attributes)
            {
                if (string.IsNullOrWhiteSpace(a))
                    throw new BlockManifestException($"Block \"{b.Id}\" có thuộc tính rỗng trong \"attributes\".");
            }

            // M104 §1 — cặp fileKey/fileSha256 của block thêm từ web. Cả hai đều TÙY CHỌN (manifest
            // cũ không có gì phải kiểm), nhưng đã khai thì phải khai đủ và đúng khuôn: khoá được
            // dùng làm TÊN TỆP trong cache nên manifest hỏng/bị tráo không được trỏ ra ngoài
            // thư mục cache; hash thiếu thì không có gì để đối chiếu ⇒ mất luôn lớp chống tráo tệp.
            if (b.CoTepRieng)
            {
                if (!LaKhoaTepHopLe(b.FileKey))
                {
                    throw new BlockManifestException(
                        $"Block \"{b.Id}\": \"fileKey\" không hợp lệ (chỉ nhận chữ/số/. _ - , không chứa đường dẫn).");
                }
                if (!LaSha256Hex(b.FileSha256 ?? ""))
                {
                    throw new BlockManifestException(
                        $"Block \"{b.Id}\": có \"fileKey\" thì phải kèm \"fileSha256\" (64 ký tự hex của tệp lẻ).");
                }
            }
            else if (!string.IsNullOrWhiteSpace(b.FileSha256))
            {
                throw new BlockManifestException(
                    $"Block \"{b.Id}\": khai \"fileSha256\" nhưng thiếu \"fileKey\" — hash không trỏ tới tệp nào.");
            }
        }
    }

    /// <summary>sha256 của nội dung tệp, dạng hex thường — cùng định dạng manifest khai.</summary>
    public static string TinhSha256(byte[] noiDung) =>
        Convert.ToHexString(SHA256.HashData(noiDung)).ToLowerInvariant();

    /// <summary>
    /// Đối chiếu hash tệp .dwg thật với hash khai trong manifest. Lệch → ném lỗi (từ chối dùng
    /// thư viện, M100 §6.10 "client coi là thư viện hỏng").
    /// </summary>
    public static void KiemTraHashTep(BlockManifest manifest, byte[] noiDungDwg)
    {
        var that = TinhSha256(noiDungDwg);
        if (!string.Equals(that, manifest.DwgSha256, StringComparison.OrdinalIgnoreCase))
        {
            throw new BlockManifestException(
                $"Tệp thư viện block không khớp manifest (manifest {Rut(manifest.DwgSha256)}, tệp {Rut(that)}) — " +
                "tải lại thư viện bằng XBOSS_LOGIN hoặc nạp tay bằng XBOSS_VE_THUVIEN.");
        }
    }

    /// <summary>Bản đọc từ đĩa của <see cref="KiemTraHashTep(BlockManifest, byte[])"/> (tệp cache cục bộ).</summary>
    public static void KiemTraHashTep(BlockManifest manifest, string duongDanDwg)
    {
        if (!File.Exists(duongDanDwg))
            throw new BlockManifestException($"Không thấy tệp thư viện block: {duongDanDwg}");
        KiemTraHashTep(manifest, File.ReadAllBytes(duongDanDwg));
    }

    /// <summary>
    /// Đối chiếu hash tệp .dwg LẺ của một block thêm từ web (M104 §1) với <c>fileSha256</c> khai
    /// trong manifest. Lệch → ném lỗi: y hệt tệp nền, KHÔNG "dùng tạm" (M100 §12) — một định nghĩa
    /// block sai đẻ ra hàng loạt bản vẽ shop sai mà chỉ lộ ra lúc bóc khối lượng.
    /// </summary>
    public static void KiemTraHashTepLe(BlockDef def, byte[] noiDung)
    {
        if (!def.CoTepRieng)
            throw new BlockManifestException($"Block \"{def.Id}\" không khai \"fileKey\" nên không có tệp lẻ để kiểm.");
        var that = TinhSha256(noiDung);
        if (!string.Equals(that, def.FileSha256, StringComparison.OrdinalIgnoreCase))
        {
            throw new BlockManifestException(
                $"Tệp block \"{def.BlockName}\" không khớp manifest (manifest {Rut(def.FileSha256 ?? "")}, tệp {Rut(that)}) — " +
                "tải lại thư viện bằng XBOSS_LOGIN hoặc nạp tay bằng XBOSS_VE_THUVIEN.");
        }
    }

    /// <summary>Bản đọc từ đĩa của <see cref="KiemTraHashTepLe(BlockDef, byte[])"/> (tệp cache cục bộ).</summary>
    public static void KiemTraHashTepLe(BlockDef def, string duongDanDwg)
    {
        if (!File.Exists(duongDanDwg))
            throw new BlockManifestException($"Không thấy tệp block \"{def.BlockName}\" trong cache: {duongDanDwg}");
        KiemTraHashTepLe(def, File.ReadAllBytes(duongDanDwg));
    }

    /// <summary>
    /// <c>fileKey</c> có dùng làm TÊN TỆP trong cache được không (M104 §1): chỉ chữ/số và
    /// <c>. _ -</c>, không rỗng, không phải <c>.</c>/<c>..</c>, không quá 200 ký tự. Manifest là
    /// dữ liệu tải từ mạng về, nên khoá phải bị ràng — không có đường nào ghi/đọc ra ngoài
    /// <c>%APPDATA%\XBoss\block-lib\files\</c>.
    ///
    /// CỐ Ý không ràng đúng tiền tố <c>blocklib-</c> mà máy chủ đang sinh: đổi cách đặt tên bên máy
    /// chủ sẽ khiến mọi plugin đã cài từ chối NGUYÊN thư viện, trong khi không chặn thêm được gì —
    /// lớp an toàn thật nằm ở "không có ký tự đường dẫn" cộng với đối chiếu sha256.
    /// </summary>
    public static bool LaKhoaTepHopLe(string? fileKey)
    {
        if (string.IsNullOrWhiteSpace(fileKey) || fileKey.Length > 200) return false;
        if (fileKey is "." or "..") return false;
        return fileKey.All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '_' or '-');
    }

    private static string Rut(string hash) => hash.Length <= 12 ? hash : hash[..12] + "…";

    private static bool LaSha256Hex(string s) =>
        s.Length == 64 && s.All(c => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'));
}

/// <summary>Manifest thư viện block không hợp lệ — thông điệp tiếng Việt, hiện thẳng cho kỹ sư.</summary>
public sealed class BlockManifestException(string message) : Exception(message);
