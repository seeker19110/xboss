using System.Globalization;
using System.Text.Json.Serialization;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Draw;

/// <summary>Kiểu dời bản chép trong model space (<c>floorPolicy.layoutMode</c> — M111 §4).</summary>
public enum KieuDatTang
{
    /// <summary>Dời theo trục Y (mặc định của rule pack phát hành).</summary>
    OffsetY,
    /// <summary>Dời theo trục X.</summary>
    OffsetX,
    /// <summary>Xếp lưới <c>gridColumns</c> cột, bước cả 2 phương = <c>stepMm</c>.</summary>
    Luoi,
}

/// <summary>
/// Khối <c>drawTools.floorPolicy</c> của rule pack v12 (M111 §4) — tham số nhân bản tầng điển hình.
/// <c>enabled = false</c> (mặc định bản phát hành) ⇒ <c>XBOSS_VE_NHANTANG</c> từ chối chạy (AC12).
/// </summary>
public sealed class FloorPolicySection
{
    [JsonPropertyName("enabled")] public bool Enabled { get; init; }

    /// <summary>Nhãn tầng dùng cho <c>{floor}</c>, thứ tự khai = thứ tự chép. CHUỖI (giữ số 0 đứng đầu).</summary>
    [JsonPropertyName("floors")] public IReadOnlyList<string> Floors { get; init; } = [];

    [JsonPropertyName("layoutMode")] public string LayoutMode { get; init; } = "";

    /// <summary>Khoảng dời giữa 2 tầng liền nhau trong model space (mm).</summary>
    [JsonPropertyName("stepMm")] public double StepMm { get; init; }

    /// <summary>Số cột — chỉ dùng khi <see cref="LayoutMode"/> = <c>luoi</c>.</summary>
    [JsonPropertyName("gridColumns")] public int GridColumns { get; init; }

    /// <summary>Mẫu tên vùng bóc của bản chép; BẮT BUỘC chứa <c>{floor}</c>.</summary>
    [JsonPropertyName("zoneNamePattern")] public string ZoneNamePattern { get; init; } = "";

    /// <summary>Tên vai trò (<see cref="VaiTroVe"/>) được chép — ngoài danh sách này thì bỏ qua.</summary>
    [JsonPropertyName("copyRoles")] public IReadOnlyList<string> CopyRoles { get; init; } = [];

    /// <summary>Vai trò được chép, đã đọc thành enum (đã qua <see cref="FloorReplicator.Validate"/>).</summary>
    [JsonIgnore]
    public IReadOnlyList<VaiTroVe> VaiTroChep =>
        CopyRoles.Select(FloorReplicator.DocVaiTro).ToList();

    /// <summary>Vai trò này có được chép không (FR1 — lọc tập chọn).</summary>
    public bool DuocChep(VaiTroVe vaiTro) =>
        CopyRoles.Any(r => string.Equals(r, vaiTro.ToString(), StringComparison.Ordinal));
}

/// <summary>Kế hoạch đặt MỘT tầng đích: nhãn tầng + vector dời so với tầng nguồn.</summary>
/// <param name="ChiSo">Số thứ tự tầng đích trong lần chép này (0 = tầng đích đầu tiên).</param>
public sealed record KeHoachTang(int ChiSo, string NhanTang, Diem2 Doi);

/// <summary>Kế hoạch đổi tag của một tầng đích (FR5).</summary>
/// <param name="Doi">Các tag THỰC SỰ đổi (tag cũ → tag mới).</param>
/// <param name="KhongDoiDuoc">Tag không khớp <c>tagPattern</c> — giữ nguyên + cảnh báo, không đoán bừa.</param>
public sealed record KeHoachDoiTag(IReadOnlyList<GanTag> Doi, IReadOnlyList<string> KhongDoiDuoc);

/// <summary>Kế hoạch đổi tên vùng bóc của một tầng đích (FR6).</summary>
/// <param name="Doi">Tên vùng nguồn → tên vùng của bản chép.</param>
/// <param name="Trung">Tên vùng đích ĐÃ có trong bản vẽ — lệnh phải DỪNG, không tự thêm hậu tố.</param>
public sealed record KeHoachDoiTenVung(
    IReadOnlyList<(string Cu, string Moi)> Doi, IReadOnlyList<string> Trung);

/// <summary>Kết quả ánh xạ lại handle trong XData của một đối tượng đã chép (FR4).</summary>
/// <param name="XData">XData của bản chép, mọi handle đã trỏ vào chính bản chép.</param>
/// <param name="HandleDaGo">Handle bị GỠ vì trỏ ra ngoài tập chọn (vào báo cáo FR10).</param>
public sealed record KetQuaAnhXaXData(VeXDataInfo XData, IReadOnlyList<string> HandleDaGo);

/// <summary>
/// Logic thuần của lệnh nhân bản tầng điển hình <c>XBOSS_VE_NHANTANG</c> (M111): vị trí đặt từng
/// tầng, đổi tag <c>{floor}</c>, đổi tên vùng bóc, và KẾ HOẠCH ánh xạ lại handle trong XData.
/// KHÔNG tham chiếu assembly AutoCAD (M100 FR11/M111 NFR3) — test chạy trên CI Linux.
///
/// Ranh giới với Adapter: lớp này chỉ TÍNH, không ghi gì. Adapter (PR2) gọi
/// <c>DeepCloneObjects</c>, lấy bảng <c>IdMapping</c> rồi đưa vào <see cref="AnhXaXData"/> để biết
/// phải ghi XData nào cho bản chép.
///
/// Hai bất biến ép ngay ở chữ ký hàm (M111 §2 guardrail):
/// - <b>Không đụng tầng nguồn:</b> mọi hàm ở đây trả về dữ liệu MỚI, không nhận rồi sửa tại chỗ
///   đối tượng nguồn; vector dời của tầng đích đầu tiên luôn khác 0 nên bản chép không chồng nguồn.
/// - <b>Không sinh handle mồ côi:</b> <see cref="AnhXaXData"/> chỉ giữ handle CÓ trong bảng ánh xạ;
///   handle trỏ ra ngoài tập chọn bị GỠ hẳn (không có đường nào để nó còn trỏ về tầng nguồn).
/// </summary>
public static class FloorReplicator
{
    /// <summary>Chỗ thay tên vùng nguồn trong <c>zoneNamePattern</c>.</summary>
    public const string ChoThayVung = "{zone}";

    /// <summary>Chỗ thay nhãn tầng trong <c>zoneNamePattern</c>.</summary>
    public const string ChoThayTang = "{floor}";

    /// <summary><c>offsetY</c>/<c>offsetX</c>/<c>luoi</c> → enum; chuỗi lạ → lỗi tiếng Việt.</summary>
    public static KieuDatTang DocKieuDat(string layoutMode) => layoutMode switch
    {
        "offsetY" => KieuDatTang.OffsetY,
        "offsetX" => KieuDatTang.OffsetX,
        "luoi" => KieuDatTang.Luoi,
        _ => throw new RulePackException(
            $"floorPolicy.layoutMode không hợp lệ: \"{layoutMode}\" (chỉ nhận \"offsetY\", \"offsetX\" hoặc \"luoi\")."),
    };

    /// <summary>
    /// Chiều ngược của <see cref="DocKieuDat"/> (enum → chuỗi rule pack). Hai chiều nằm cạnh nhau
    /// để không thể trôi khỏi nhau khi thêm kiểu dời mới.
    /// </summary>
    public static string MaKieuDat(KieuDatTang kieu) => kieu switch
    {
        KieuDatTang.OffsetX => "offsetX",
        KieuDatTang.Luoi => "luoi",
        _ => "offsetY",
    };

    /// <summary>
    /// Bản sao chính sách với kiểu dời + bước dời kỹ sư chọn trong hộp thoại (FR2 — "mặc định từ
    /// rule pack, sửa được"). Mọi khóa còn lại giữ NGUYÊN từ rule pack: <c>copyRoles</c> và
    /// <c>zoneNamePattern</c> là hợp đồng của rule pack, lệnh không được sửa giữa đường.
    /// </summary>
    public static FloorPolicySection VoiKieuDat(FloorPolicySection fp, KieuDatTang kieu, double stepMm) =>
        new()
        {
            Enabled = fp.Enabled,
            Floors = fp.Floors,
            LayoutMode = MaKieuDat(kieu),
            StepMm = stepMm,
            GridColumns = fp.GridColumns,
            ZoneNamePattern = fp.ZoneNamePattern,
            CopyRoles = fp.CopyRoles,
        };

    /// <summary>Tên vai trò trong rule pack → <see cref="VaiTroVe"/>; tên lạ → lỗi tiếng Việt.</summary>
    public static VaiTroVe DocVaiTro(string ten) =>
        Enum.TryParse<VaiTroVe>(ten, ignoreCase: false, out var vaiTro)
            ? vaiTro
            : throw new RulePackException(
                $"floorPolicy.copyRoles[\"{ten}\"] không phải vai trò có thật trong VaiTroVe " +
                $"(hợp lệ: {string.Join(", ", Enum.GetNames<VaiTroVe>())}).");

    /// <summary>
    /// Kiểm khối <c>floorPolicy</c> (M111 §4). Kiểm cả khi đang TẮT: rule pack phát hành phải khai
    /// sẵn tham số dùng được ngay khi bật (đúng quy ước các khối chính sách v5–v9).
    /// </summary>
    public static void Validate(FloorPolicySection fp, string moTa = "drawTools.floorPolicy")
    {
        var kieu = DocKieuDat(fp.LayoutMode);

        if (fp.Floors.Count == 0)
            throw new RulePackException($"{moTa}.floors rỗng — không có tầng đích nào để chép.");

        var daCo = new HashSet<string>(StringComparer.Ordinal);
        foreach (var tang in fp.Floors)
        {
            if (string.IsNullOrWhiteSpace(tang))
                throw new RulePackException($"{moTa}.floors có nhãn tầng rỗng.");
            if (!daCo.Add(tang))
                throw new RulePackException($"{moTa}.floors khai trùng nhãn tầng \"{tang}\".");
        }

        if (fp.StepMm <= 0)
        {
            throw new RulePackException(
                $"{moTa}.stepMm = {fp.StepMm.ToString("0.######", CultureInfo.InvariantCulture)} phải dương — " +
                "hai tầng sẽ chồng khít lên nhau.");
        }

        if (!fp.ZoneNamePattern.Contains(ChoThayTang, StringComparison.Ordinal))
        {
            throw new RulePackException(
                $"{moTa}.zoneNamePattern \"{fp.ZoneNamePattern}\" thiếu {ChoThayTang} — mọi tầng ra cùng một " +
                "tên vùng, sheet Tong-hop-vung gộp nhầm các tầng vào một dòng (M111 FR6).");
        }

        if (kieu == KieuDatTang.Luoi && fp.GridColumns <= 0)
            throw new RulePackException($"{moTa}.gridColumns phải dương khi layoutMode = \"luoi\".");

        if (fp.CopyRoles.Count == 0)
            throw new RulePackException($"{moTa}.copyRoles rỗng — không vai trò nào được chép.");
        foreach (var ten in fp.CopyRoles) DocVaiTro(ten);
    }

    /// <summary>
    /// Vị trí đặt tầng đích thứ <paramref name="chiSo"/> (0 = tầng đích đầu tiên) so với tầng nguồn.
    /// Ô số 0 của lưới/dãy dành cho CHÍNH tầng nguồn nên tầng đích luôn dời khác 0 (guardrail 1).
    /// </summary>
    public static Diem2 ViTriDatTang(FloorPolicySection fp, int chiSo)
    {
        if (chiSo < 0) throw new ArgumentOutOfRangeException(nameof(chiSo));
        var k = chiSo + 1; // ô 0 là tầng nguồn
        return DocKieuDat(fp.LayoutMode) switch
        {
            KieuDatTang.OffsetX => new Diem2(fp.StepMm * k, 0),
            KieuDatTang.Luoi => new Diem2(
                fp.StepMm * (k % fp.GridColumns), fp.StepMm * (k / fp.GridColumns)),
            _ => new Diem2(0, fp.StepMm * k),
        };
    }

    /// <summary>Kế hoạch đặt cho danh sách tầng đích kỹ sư tick (theo đúng thứ tự đã tick — FR2/FR3).</summary>
    public static IReadOnlyList<KeHoachTang> LapKeHoachDat(
        FloorPolicySection fp, IReadOnlyList<string> tangDich) =>
        tangDich.Select((tang, i) => new KeHoachTang(i, tang, ViTriDatTang(fp, i))).ToList();

    /// <summary>
    /// Kế hoạch đặt theo Ô CỐ ĐỊNH của từng nhãn tầng: ô của một tầng = vị trí của nó trong
    /// <c>floorPolicy.floors</c> sau khi bỏ tầng nguồn (tầng nguồn giữ ô số 0 tại chỗ).
    ///
    /// Khác với bản chỉ nhận <paramref name="tangDich"/>: ở đây vị trí một tầng KHÔNG phụ thuộc
    /// vào việc lần này kỹ sư tick bao nhiêu tầng. Đó là điều kiện của FR9/AC8 — chạy lại lệnh
    /// cho riêng tầng 08 (chép đè) phải đặt tầng 08 về ĐÚNG chỗ cũ, chứ không nhảy sang chỗ của
    /// tầng 06 chỉ vì lần này nó là tầng đầu danh sách (bản chép sẽ chồng khít lên tầng khác).
    /// Nhãn không có trong <c>floors</c> (không xảy ra khi tick từ danh mục) được xếp sau mọi ô
    /// đã khai, không bao giờ đè lên tầng đã khai.
    /// </summary>
    public static IReadOnlyList<KeHoachTang> LapKeHoachDat(
        FloorPolicySection fp, string tangNguon, IReadOnlyList<string> tangDich)
    {
        var oCua = new Dictionary<string, int>(StringComparer.Ordinal);
        var o = 0;
        foreach (var tang in fp.Floors)
        {
            if (string.Equals(tang, tangNguon, StringComparison.Ordinal)) continue;
            if (!oCua.ContainsKey(tang)) oCua[tang] = o++;
        }

        var keHoach = new List<KeHoachTang>();
        for (var i = 0; i < tangDich.Count; i++)
        {
            var chiSo = oCua.TryGetValue(tangDich[i], out var oKhai) ? oKhai : fp.Floors.Count + i;
            keHoach.Add(new KeHoachTang(chiSo, tangDich[i], ViTriDatTang(fp, chiSo)));
        }
        return keHoach;
    }

    /// <summary>
    /// Tag của bản chép: giữ nguyên <c>{type}</c>/<c>{seq}</c>, chỉ thay <c>{floor}</c> bằng nhãn
    /// tầng đích (FR5). null = tag rỗng hoặc không khớp pattern ⇒ GIỮ NGUYÊN + cảnh báo.
    /// </summary>
    public static string? DoiTagTheoTang(string? pattern, string? tagCu, string tangDich)
    {
        if (TagSchedule.PhanTich(pattern, tagCu) is not { } pt) return null;
        return TagSchedule.Dung(pattern, pt.Loai, tangDich, pt.Stt);
    }

    /// <summary>Kế hoạch đổi tag cho một tầng đích; tag không khớp pattern vào <c>KhongDoiDuoc</c>.</summary>
    public static KeHoachDoiTag LapKeHoachDoiTag(
        string? pattern, IReadOnlyList<TagHienCo> tags, string tangDich)
    {
        var doi = new List<GanTag>();
        var khong = new List<string>();
        foreach (var t in tags)
        {
            if (string.IsNullOrWhiteSpace(t.Tag)) continue;
            if (DoiTagTheoTang(pattern, t.Tag, tangDich) is not { } moi)
            {
                khong.Add(t.Tag);
                continue;
            }
            if (!string.Equals(moi, t.Tag, StringComparison.Ordinal)) doi.Add(new GanTag(t.Handle, t.Tag, moi));
        }
        return new KeHoachDoiTag(doi, khong);
    }

    /// <summary>Tên vùng bóc của bản chép theo <c>zoneNamePattern</c> (FR6).</summary>
    public static string TenVungMoi(string pattern, string tenVungNguon, string tangDich) =>
        pattern
            .Replace(ChoThayVung, tenVungNguon, StringComparison.Ordinal)
            .Replace(ChoThayTang, tangDich, StringComparison.Ordinal);

    /// <summary>
    /// Kế hoạch đổi tên vùng cho một tầng đích. Tên đích trùng vùng ĐÃ có trong bản vẽ được liệt kê
    /// vào <see cref="KeHoachDoiTenVung.Trung"/> — caller phải DỪNG cả lệnh (FR6/AC9), tuyệt đối
    /// không tự thêm hậu tố vì tên vùng đi thẳng vào sheet Excel <c>Tong-hop-vung</c>.
    /// </summary>
    public static KeHoachDoiTenVung LapKeHoachDoiTenVung(
        FloorPolicySection fp,
        IReadOnlyList<string> vungNguon,
        IReadOnlyCollection<string> vungDaCo,
        string tangDich)
    {
        var daCo = new HashSet<string>(vungDaCo, StringComparer.OrdinalIgnoreCase);
        var doi = new List<(string, string)>();
        var trung = new List<string>();
        foreach (var ten in vungNguon)
        {
            var moi = TenVungMoi(fp.ZoneNamePattern, ten, tangDich);
            if (!daCo.Add(moi)) trung.Add(moi);
            doi.Add((ten, moi));
        }
        return new KeHoachDoiTenVung(doi, trung);
    }

    /// <summary>
    /// Ánh xạ lại toàn bộ handle trong XData của một đối tượng ĐÃ chép (FR4 — guardrail 2).
    /// <paramref name="anhXa"/> = bảng handle nguồn → handle bản chép (Adapter lấy từ
    /// <c>IdMapping</c> của <c>DeepCloneObjects</c>). Handle không có trong bảng = trỏ ra ngoài tập
    /// chọn ⇒ GỠ khỏi XData và liệt vào báo cáo, KHÔNG giữ handle trỏ về tầng nguồn.
    /// </summary>
    public static KetQuaAnhXaXData AnhXaXData(
        VeXDataInfo xdata,
        IReadOnlyDictionary<string, string> anhXa,
        string tangNguon,
        string tangDich)
    {
        var goBo = new List<string>();

        string? Mot(string? handle)
        {
            if (string.IsNullOrWhiteSpace(handle)) return null;
            if (anhXa.TryGetValue(handle, out var moi)) return moi;
            goBo.Add(handle);
            return null;
        }

        List<string> Nhieu(IReadOnlyList<string> handles)
        {
            var ra = new List<string>();
            foreach (var h in handles)
            {
                if (Mot(h) is { } moi) ra.Add(moi);
            }
            return ra;
        }

        var moiXData = xdata with
        {
            HandleTim = Mot(xdata.HandleTim),
            HandleBien = Nhieu(xdata.HandleBien),
            HandleNhan = Nhieu(xdata.HandleNhan),
            HandleTuyenCat = Mot(xdata.HandleTuyenCat),
            TangNguon = tangNguon,
            NhanTang = tangDich,
        };
        return new KetQuaAnhXaXData(moiXData, goBo);
    }

    /// <summary>
    /// Đối tượng này là bản chép do CHÍNH lệnh nhân tầng sinh ra cho tầng <paramref name="tangDich"/>
    /// chưa (FR9 — idempotent theo tầng: bỏ qua hay chép đè).
    /// </summary>
    public static bool LaBanChepCuaTang(VeXDataInfo xdata, string tangDich) =>
        !string.IsNullOrWhiteSpace(xdata.TangNguon) &&
        string.Equals(xdata.NhanTang, tangDich, StringComparison.Ordinal);
}
