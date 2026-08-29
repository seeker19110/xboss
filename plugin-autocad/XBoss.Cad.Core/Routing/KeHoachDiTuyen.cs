using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Zoning;

namespace XBoss.Cad.Core.Routing;

/// <summary>Một đoạn hành lang đọc từ bản vẽ kèm sổ chiếm chỗ của nó (M114 FR3).</summary>
public sealed record HanhLangChoTuyen(HanhLangDauVao DauVao, IReadOnlyList<LanChiem> LanDaCap)
{
    public string Id => DauVao.Id;
}

/// <summary>
/// Một thiết bị đích đọc từ bản vẽ (khối mang XData vai trò <c>ThietBi</c>) — M114 FR5.
/// </summary>
/// <param name="DaCoTuyen">Đã có tuyến chạy tới (bấm điểm tay hay lần chạy trước) — bỏ qua mặc định.</param>
/// <param name="TrongVungChon">Nằm trong vùng kỹ sư quét chọn trước khi chạy lệnh.</param>
public sealed record ThietBiChoTuyen(
    string Ten,
    Diem2 ViTri,
    string HeId,
    bool DaCoTuyen = false,
    bool TrongVungChon = false);

/// <summary>
/// Một polyline SẼ VẼ RA — đã gom sao cho mỗi cạnh hành lang chỉ nằm trên đúng một polyline.
/// Một thiết bị có thể sinh nhiều đoạn nếu đường về nguồn của nó xen kẽ đoạn đã có tuyến.
/// </summary>
/// <param name="ThietBi">Thiết bị mà đoạn này thuộc về (để truy nguồn trong bảng xem trước).</param>
/// <param name="Diem">Đỉnh polyline theo chiều thiết bị → về nguồn.</param>
public sealed record NhanhVeRa(string ThietBi, IReadOnlyList<Diem2> Diem, double ChieuDai, int SoCo);

/// <summary>
/// Sổ chiếm chỗ MỚI của một hành lang sau khi gỡ chiếm chỗ cũ của hệ đang chạy rồi cấp lại
/// (M114 FR9/FR13). Adapter chỉ việc ghi <see cref="So"/> vào XData hành lang — không tự cộng trừ.
/// </summary>
/// <param name="LanMoi">Làn vừa cấp cho hệ này; null = hành lang chỉ cần GỠ chiếm chỗ cũ.</param>
public sealed record SoChiemChoMoi(string HanhLangId, LanChiem? LanMoi, IReadOnlyList<LanChiem> So);

/// <summary>Kết quả lập kế hoạch đi tuyến một hệ — đủ để xem trước (FR10) rồi mới ghi (FR11).</summary>
/// <param name="LoiChan">
/// Lý do KHÔNG lập được kế hoạch nào (vd điểm nguồn nằm ngoài bán kính rẽ nhánh). Khác
/// <paramref name="KhongGiai"/>: cái đó là từng thiết bị không nối được, phần còn lại vẫn chạy.
/// </param>
public sealed record KetQuaKeHoach(
    IReadOnlyList<NhanhVeRa> Nhanh,
    IReadOnlyList<KhongGiaiDuoc> KhongGiai,
    IReadOnlyList<SoChiemChoMoi> ChiemCho,
    int SoThietBiDich,
    int SoNoiDuoc,
    double TongChieuDai,
    int SoCo,
    int SoCanhDungChung,
    int TongCanhCacNhanh,
    string? LoiChan = null)
{
    /// <summary>Tỉ lệ cạnh dùng chung — đo hiệu quả gom trục γ (FR14).</summary>
    public double TiLeDungChung => TongCanhCacNhanh == 0 ? 0 : (double)SoCanhDungChung / TongCanhCacNhanh;
}

/// <summary>
/// Lập kế hoạch đi tuyến cho MỘT hệ (M114 FR6→FR9) — THUẦN, không biết gì về AutoCAD nên toàn bộ
/// AC1/AC2/AC4/AC5/AC7/AC10 kiểm được trên CI Linux.
///
/// Dây chuyền: <see cref="HanhLangGraph"/> (đồ thị) → <see cref="DinhTuyen"/> (Dijkstra α/β/γ +
/// tự chảy) → <see cref="CapPhatLanTang"/> (tầng/làn). Lớp này KHÔNG tự tính lại thứ gì trong ba
/// việc đó; nó chỉ nối chúng lại, chuyển thiết bị/điểm nguồn thành đầu vào đồ thị, và <b>gom nhánh
/// thành polyline</b> sao cho mỗi cạnh hành lang chỉ được vẽ đúng MỘT lần.
///
/// <para><b>Vì sao gom (quyết định hoãn tới PR4 trong M114 §12).</b> Đường đi của mọi thiết bị đều
/// dùng chung đoạn trục cuối; vẽ mỗi nhánh một polyline riêng là đoạn trục đó nằm chồng N lớp và
/// <c>XBOSS_BOCKL</c> bóc ra gấp N lần chiều dài thật (sai thẳng vào khối lượng — AC3). Nên nhánh
/// nào chạm vào cạnh đã có tuyến thì DỪNG tại đúng nút đó: ra đúng hình một trục chính + các nhánh
/// đấu vào, giống bản vẽ người làm, và tổng chiều dài vẽ ra khớp
/// <see cref="KetQuaDinhTuyen.TongChieuDai"/> của Core.</para>
///
/// Không giải được thì NÓI không giải được (guardrail §3): không nới bán kính, không hạ độ dốc,
/// không ép hai hệ chung làn.
/// </summary>
public static class KeHoachDiTuyen
{
    /// <summary>
    /// Tên thiết bị ảo dành cho ĐIỂM NGUỒN. Điểm nguồn phải trở thành một NÚT của đồ thị mới đi
    /// tuyến về được, mà <see cref="HanhLangGraph"/> chỉ tách nút tại đỉnh/giao điểm/điểm rẽ của
    /// thiết bị — nên nguồn đi vào đồ thị dưới dạng một "thiết bị" rồi bị loại khỏi kết quả.
    /// Tên đặt trong ngoặc để không đụng tag thiết bị thật (tag do <c>XBOSS_VE_TAG</c> sinh).
    /// </summary>
    public const string TenNguonAo = "(điểm nguồn)";

    /// <summary>Hai điểm cách nhau dưới ngưỡng này (đơn vị bản vẽ) coi như trùng nhau.</summary>
    private const double DungSai = HanhLangGraph.DungSaiNut;

    /// <summary>
    /// Lập kế hoạch đi tuyến.
    /// </summary>
    /// <param name="hanhLang">Hành lang đọc từ bản vẽ (kèm sổ chiếm chỗ).</param>
    /// <param name="thietBi">Mọi thiết bị đọc từ bản vẽ — lọc theo hệ/vùng chọn ngay trong hàm này.</param>
    /// <param name="chinhSach">Khối <c>drawTools.routingPolicy</c> đang phát hành.</param>
    /// <param name="heId">Hệ đang chạy.</param>
    /// <param name="nguon">Điểm nguồn/trục chính, ĐƠN VỊ BẢN VẼ.</param>
    /// <param name="snapRadius">Bán kính rẽ nhánh, ĐƠN VỊ BẢN VẼ (đổi từ <c>snapRadiusMm</c>).</param>
    /// <param name="chiPhi">3 hệ số α/β/γ đã quy về đơn vị bản vẽ.</param>
    /// <param name="beRongTuyenMm">Bề rộng làn hệ này xin trong hành lang (mm — suy từ cỡ tuyến).</param>
    /// <param name="caoThietDienMm">Chiều cao thiết diện tuyến (mm) — quyết định cao độ tầng.</param>
    /// <param name="heDien">Id hệ điện (khe hở <c>elecToHot</c>) — xem <see cref="CapPhatLanTang"/>.</param>
    /// <param name="vungCam">Vùng cấm (M101 PR3) — cạnh chạm vào bị loại khỏi đồ thị (FR7).</param>
    /// <param name="tuChay">Ràng buộc tự chảy (FR8); null = hệ không cần độ dốc.</param>
    /// <param name="caoDoThietBiMm">Cao độ thiết bị (mm) — chỉ dùng khi có <paramref name="tuChay"/>.</param>
    /// <param name="chiThietBiChuaCoTuyen">Bỏ qua thiết bị đã có tuyến chạy tới (mặc định — FR5).</param>
    /// <param name="theoVungChon">Chỉ lấy thiết bị trong vùng kỹ sư quét chọn (FR5).</param>
    public static KetQuaKeHoach Lap(
        IReadOnlyList<HanhLangChoTuyen> hanhLang,
        IReadOnlyList<ThietBiChoTuyen> thietBi,
        RoutingPolicySection chinhSach,
        string heId,
        Diem2 nguon,
        double snapRadius,
        ThamSoDinhTuyen chiPhi,
        double beRongTuyenMm,
        double caoThietDienMm,
        IReadOnlyCollection<string> heDien,
        IReadOnlyList<RanhGioiVung>? vungCam = null,
        RangBuocTuChay? tuChay = null,
        double caoDoThietBiMm = 0,
        bool chiThietBiChuaCoTuyen = true,
        bool theoVungChon = false)
    {
        var dich = TachTenTrung(thietBi
            .Where(t => string.Equals(t.HeId, heId, StringComparison.Ordinal))
            .Where(t => !theoVungChon || t.TrongVungChon)
            .Where(t => !chiThietBiChuaCoTuyen || !t.DaCoTuyen)
            .ToList());

        var trong = new KetQuaKeHoach([], [], [], dich.Count, 0, 0, 0, 0, 0);
        if (hanhLang.Count == 0)
        {
            return trong with
            {
                LoiChan =
                    "Bản vẽ chưa có hành lang nào — chạy XBOSS_VE_HANHLANG để vẽ (hoặc nhận) hành lang " +
                    "đi ống trước.",
            };
        }
        if (dich.Count == 0)
        {
            return trong with
            {
                LoiChan =
                    $"Không có thiết bị đích nào của hệ {heId} " +
                    (theoVungChon ? "trong vùng chọn" : "trong bản vẽ") +
                    (chiThietBiChuaCoTuyen ? " mà chưa có tuyến" : "") +
                    " — chọn lại phạm vi rồi chạy lại.",
            };
        }

        // (1) Đồ thị: điểm nguồn đi kèm danh sách thiết bị để đồ thị tách ra một nút tại đó.
        var vao = new List<ThietBiDauVao> { new(TenNguonAo, nguon) };
        vao.AddRange(dich.Select(t => new ThietBiDauVao(t.Ten, t.ViTri, caoDoThietBiMm)));
        var doThi = HanhLangGraph.Dung(
            hanhLang.Select(h => h.DauVao).ToList(), vao, snapRadius, heId, vungCam);

        if (doThi.DiemRe.FirstOrDefault(r => r.ThietBi == TenNguonAo) is not { } reNguon)
        {
            var lyDo = doThi.KhongGiai.FirstOrDefault(k => k.ThietBi == TenNguonAo)?.LyDo
                       ?? "Không tìm được hành lang nào cho hệ này đi qua.";
            return trong with
            {
                LoiChan =
                    $"Điểm nguồn không đấu được vào hành lang: {lyDo} Bấm lại điểm nguồn ngay trên (hoặc " +
                    "sát) một hành lang của hệ này — lệnh KHÔNG nới bán kính rẽ nhánh để cho ra kết quả.",
            };
        }

        // (2) Đi tuyến. β đọc độ đông theo SỐ HỆ KHÁC đang chiếm làn — chính hệ này không tự làm
        //     đông chỗ của mình (chạy lại sẽ tự phạt mình, tuyến trôi mỗi lần chạy).
        var doDong = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var h in hanhLang)
        {
            doDong[h.Id] = h.LanDaCap
                .Select(l => l.HeId)
                .Where(id => !string.Equals(id, heId, StringComparison.Ordinal))
                .Distinct(StringComparer.Ordinal)
                .Count();
        }

        Dictionary<string, double>? caoDo = null;
        if (tuChay is { } tc)
        {
            // Gán bằng chỉ mục (không ToDictionary): tag thiết bị trong bản vẽ thật CÓ THỂ TRÙNG
            // (đó chính là thứ phép kiểm 17 của XBOSS_KIEMTRA đi tìm) — ToDictionary sẽ ném lỗi và
            // giết cả lệnh vì một chuyện chỉ cần cảnh báo.
            caoDo = new Dictionary<string, double>(StringComparer.Ordinal);
            // Nguồn ảo phải "thỏa" tự chảy tầm thường (quãng đường 0) — nếu không nó rơi vào danh
            // sách không giải được và làm nhiễu báo cáo.
            foreach (var t in vao) caoDo[t.Ten] = t.Ten == TenNguonAo ? tc.CaoDoXaMm : caoDoThietBiMm;
        }

        var ketQua = DinhTuyen.Chay(doThi, reNguon.Nut, chiPhi, doDong, tuChay, caoDo);
        var nhanh = ketQua.Tuyen.Where(t => t.ThietBi != TenNguonAo).ToList();
        var khongGiai = ketQua.KhongGiai.Where(k => k.ThietBi != TenNguonAo).ToList();

        // (3) Cấp tầng/làn cho từng hành lang tuyến đi qua (FR9). Hành lang hết làn ⇒ mọi nhánh đi
        //     qua nó thành KHÔNG GIẢI ĐƯỢC — không vẽ đè lên làn của hệ khác (guardrail 3, AC7).
        //     Danh sách hành lang của từng nhánh đánh theo CHỈ SỐ (không theo tên thiết bị) để hai
        //     nhánh cùng tên không đè lên nhau.
        var theoHanhLang = nhanh
            .Select(t => t.Canh.Select(c => doThi.Canh[c].HanhLangId).Distinct(StringComparer.Ordinal).ToList())
            .ToList();

        var canhCap = theoHanhLang.SelectMany(v => v).Distinct(StringComparer.Ordinal).ToList();
        var capDuoc = new Dictionary<string, SoChiemChoMoi>(StringComparer.Ordinal);
        var hanhLangDay = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var id in canhCap)
        {
            var hl = hanhLang.First(h => string.Equals(h.Id, id, StringComparison.Ordinal));
            var soDaGo = CapPhatLanTang.GoChiemCho(hl.LanDaCap, heId);
            var kq = CapPhatLanTang.Cap(
                chinhSach,
                new HanhLangCapLan(hl.Id, hl.DauVao.BeRongMm, hl.DauVao.CotDayDamMm, hl.DauVao.CotTranMm, soDaGo),
                [new YeuCauLan(heId, beRongTuyenMm, caoThietDienMm)],
                heDien);

            if (kq.LanMoi.Count == 0)
            {
                hanhLangDay[id] = kq.KhongCap.Count > 0
                    ? kq.KhongCap[0].LyDo
                    : $"Hành lang \"{id}\" không cấp được làn cho hệ {heId}.";
                continue;
            }
            capDuoc[id] = new SoChiemChoMoi(id, kq.LanMoi[0], kq.SoSauKhiCap);
        }

        if (hanhLangDay.Count > 0)
        {
            var giu = new List<TuyenNhanh>();
            var hanhLangGiu = new List<List<string>>();
            for (var i = 0; i < nhanh.Count; i++)
            {
                var day = theoHanhLang[i].FirstOrDefault(id => hanhLangDay.ContainsKey(id));
                if (day is null)
                {
                    giu.Add(nhanh[i]);
                    hanhLangGiu.Add(theoHanhLang[i]);
                    continue;
                }
                khongGiai.Add(new KhongGiaiDuoc(nhanh[i].ThietBi, hanhLangDay[day]));
            }
            nhanh = giu;
            theoHanhLang = hanhLangGiu;
        }

        // (4) Chỉ ghi chiếm chỗ cho hành lang mà tuyến CÒN LẠI thật sự đi qua; hành lang từng có
        //     chiếm chỗ của hệ này mà nay không dùng nữa thì GỠ (FR13 — không rò rỉ làn).
        var conDung = theoHanhLang
            .SelectMany(v => v)
            .ToHashSet(StringComparer.Ordinal);

        var chiemCho = new List<SoChiemChoMoi>();
        foreach (var h in hanhLang)
        {
            if (conDung.Contains(h.Id) && capDuoc.TryGetValue(h.Id, out var moi))
            {
                chiemCho.Add(moi);
                continue;
            }
            if (h.LanDaCap.Any(l => string.Equals(l.HeId, heId, StringComparison.Ordinal)))
                chiemCho.Add(new SoChiemChoMoi(h.Id, null, CapPhatLanTang.GoChiemCho(h.LanDaCap, heId)));
        }

        // (5) Gom nhánh thành polyline: mỗi cạnh vẽ đúng MỘT lần (xem chú thích đầu lớp).
        //     Đường về nguồn của một thiết bị có thể XEN KẼ đoạn đã vẽ và đoạn mới (đồ thị hành lang
        //     có vòng), nên phải cắt thành từng đoạn liên tục các cạnh CHƯA vẽ — cắt kiểu "gặp cạnh
        //     đã vẽ thì dừng hẳn" sẽ bỏ rơi phần sau và nhánh không nối tới nguồn.
        var viTri = new Dictionary<string, Diem2>(StringComparer.Ordinal);
        foreach (var t in dich) viTri[t.Ten] = t.ViTri;
        var daVe = new HashSet<int>();
        var raNhanh = new List<NhanhVeRa>();
        var tongCanh = 0;
        var dungChung = 0;
        foreach (var t in nhanh)
        {
            tongCanh += t.Canh.Count;

            var doan = new List<Diem2>();
            // Đoạn rẽ từ thiết bị vào điểm rẽ trên hành lang: luôn là nét mới (mỗi thiết bị một cái).
            if (viTri.TryGetValue(t.ThietBi, out var vt) && vt.KhoangCach(t.Diem[0]) > DungSai) doan.Add(vt);
            doan.Add(t.Diem[0]);

            for (var i = 0; i < t.Canh.Count; i++)
            {
                if (!daVe.Add(t.Canh[i]))
                {
                    // Cạnh đã có tuyến: kết thúc đoạn đang dựng (nó đấu vào tuyến đã vẽ tại đây),
                    // đoạn kế tiếp bắt đầu lại từ đầu kia của cạnh dùng chung.
                    dungChung++;
                    ThemDoan(raNhanh, t.ThietBi, doan);
                    doan = [];
                    continue;
                }
                if (doan.Count == 0) doan.Add(t.Diem[i]);
                doan.Add(t.Diem[i + 1]);
            }
            ThemDoan(raNhanh, t.ThietBi, doan);
        }

        return new KetQuaKeHoach(
            raNhanh,
            khongGiai,
            chiemCho,
            dich.Count,
            nhanh.Count,
            raNhanh.Sum(n => n.ChieuDai),
            raNhanh.Sum(n => n.SoCo),
            dungChung,
            tongCanh);
    }

    /// <summary>
    /// Ép mỗi thiết bị một TÊN DUY NHẤT — tiền điều kiện của cả dây chuyền: <see cref="HanhLangGraph"/>
    /// và <see cref="DinhTuyen"/> nhận diện thiết bị BẰNG TÊN (điểm rẽ, cao độ tự chảy, dòng "không
    /// giải được"), mà tag trong bản vẽ thật hoàn toàn có thể trùng nhau. Trùng thì đánh số thứ tự
    /// vào tên thay vì lặng lẽ trộn hai thiết bị làm một (Adapter còn thay số này bằng handle để
    /// kỹ sư chỉ đúng được vật trên bản vẽ).
    /// </summary>
    private static List<ThietBiChoTuyen> TachTenTrung(List<ThietBiChoTuyen> dich)
    {
        var dem = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var t in dich) dem[t.Ten] = dem.GetValueOrDefault(t.Ten) + 1;
        if (dem.Count == dich.Count) return dich;

        var thu = new Dictionary<string, int>(StringComparer.Ordinal);
        var ra = new List<ThietBiChoTuyen>(dich.Count);
        foreach (var t in dich)
        {
            if (dem[t.Ten] <= 1)
            {
                ra.Add(t);
                continue;
            }
            var k = thu.GetValueOrDefault(t.Ten) + 1;
            thu[t.Ten] = k;
            ra.Add(t with { Ten = $"{t.Ten} #{k}" });
        }
        return ra;
    }

    /// <summary>Ghi một đoạn vào danh sách vẽ; đoạn dưới 2 đỉnh (thiết bị đứng ngay trên nút) bị bỏ.</summary>
    private static void ThemDoan(List<NhanhVeRa> ra, string thietBi, List<Diem2> diem)
    {
        if (diem.Count < 2) return;
        ra.Add(new NhanhVeRa(thietBi, diem, ChieuDai(diem), SoCo(diem)));
    }

    /// <summary>Chiều dài đường gãy khúc (đơn vị bản vẽ).</summary>
    public static double ChieuDai(IReadOnlyList<Diem2> diem)
    {
        var dai = 0.0;
        for (var i = 0; i + 1 < diem.Count; i++) dai += diem[i].KhoangCach(diem[i + 1]);
        return dai;
    }

    /// <summary>
    /// Số lần chuyển hướng của một đường gãy khúc — cùng ngưỡng <see cref="DinhTuyen.NguongCoDo"/>
    /// mà hàm chi phí dùng, để con số trong báo cáo và con số α phạt lúc đi tuyến nói cùng một thứ.
    /// </summary>
    public static int SoCo(IReadOnlyList<Diem2> diem)
    {
        var so = 0;
        for (var i = 1; i + 1 < diem.Count; i++)
        {
            var vao = diem[i] - diem[i - 1];
            var ra = diem[i + 1] - diem[i];
            if (vao.DoDai <= DungSai || ra.DoDai <= DungSai) continue;
            var cos = (vao.X * ra.X + vao.Y * ra.Y) / (vao.DoDai * ra.DoDai);
            var goc = Math.Acos(Math.Clamp(cos, -1, 1)) * 180 / Math.PI;
            if (goc >= DinhTuyen.NguongCoDo) so++;
        }
        return so;
    }
}
