using System.Globalization;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.Routing;

namespace XBoss.Cad.Core.Coordination;

/// <summary>Lớp kiểm sinh ra xung đột (M116 §6 bước 2) — vào cả id nên THỨ TỰ tên là hợp đồng.</summary>
public enum LopKiem
{
    /// <summary>Lớp 1 — hai tuyến khác hệ giao nhau mà dải cao độ chồng lấn.</summary>
    GiaoCatCaoDo,

    /// <summary>Lớp 2 — tổng bề rộng các tuyến song song trong hành lang vượt bề rộng hành lang.</summary>
    TranhChapHanhLang,

    /// <summary>Lớp 3 — cặp hệ gần nhau hơn khoảng cách quy phạm khai trong rule pack.</summary>
    KhoangCachQuyPham,

    /// <summary>
    /// Nhánh cho tuyến THIẾU CAO ĐỘ (M116 §11): chỉ kiểm giao cắt trên mặt bằng như phép kiểm 11,
    /// không đoán cao độ ⇒ không bao giờ lên mức CỨNG.
    /// </summary>
    GiaoCatPhang,
}

/// <summary>Mức nghiêm trọng của một xung đột (M116 §6 bước 2).</summary>
public enum MucXungDot
{
    /// <summary>Chắc chắn va nhau ngoài công trường — phải xử lý.</summary>
    Cung,

    /// <summary>Không va trực tiếp nhưng hết chỗ/khó thi công — kỹ sư cân nhắc.</summary>
    Mem,

    /// <summary>Cần xem lại (khoảng cách quy phạm, thiếu dữ liệu) — nhẹ nhất.</summary>
    CanhBao,
}

/// <summary>
/// Một TUYẾN đưa vào quét phối hợp — DTO thuần, Core KHÔNG đọc XData: Adapter điền các trường này
/// (M116 PR2) từ XData M115 + kích thước rule pack, ở đây chỉ là dữ liệu vào.
///
/// Quy ước số đo bám đúng <c>TuyenDauVao</c> (M115) và <c>HanhLangDauVao</c> (M114): TOẠ ĐỘ theo
/// ĐƠN VỊ BẢN VẼ (M99 §6.7), còn cao độ/bề cao/bề rộng giữ mm như XData.
/// </summary>
/// <param name="Id">Định danh tuyến do Adapter đặt (handle DWG) — vào id xung đột và mọi thông báo.</param>
/// <param name="Dinh">Chuỗi đỉnh đã duỗi thẳng; dưới 2 đỉnh thì tuyến bị bỏ qua.</param>
/// <param name="HeId">Id hệ theo <c>drawTools.systems[].id</c>; rỗng = chưa gán ⇒ bỏ qua, không đoán.</param>
/// <param name="CaoDoMm">Cao độ TIM (mm); null = chưa gán ⇒ tuyến chỉ vào lớp kiểm phẳng (§11).</param>
/// <param name="BeCaoMm">Bề cao NGOÀI đã gồm cách nhiệt (mm); ≤ 0 = chưa suy được ⇒ như thiếu cao độ.</param>
/// <param name="BeRongMm">Bề rộng NGOÀI đã gồm cách nhiệt (mm) — dùng cho lớp 2 và lớp 3.</param>
/// <param name="Co">Cỡ nguyên văn (<c>300x200</c>/<c>DN50</c>) — chỉ để hiện trong báo cáo.</param>
/// <param name="Nguon">Tên tệp xref chứa tuyến; rỗng = bản vẽ hiện hành (xref chỉ đọc, FR1).</param>
public sealed record TuyenPhoiHop(
    string Id,
    IReadOnlyList<Diem2> Dinh,
    string HeId,
    double? CaoDoMm = null,
    double BeCaoMm = 0,
    double BeRongMm = 0,
    string Co = "",
    string Nguon = "")
{
    /// <summary>Có ĐỦ dữ liệu cao độ để vào lớp 1/2/3 không (M116 §11 — thiếu thì không đoán).</summary>
    public bool CoCaoDo => CaoDoMm is not null && BeCaoMm > 0;

    /// <summary>Mép DƯỚI của tuyến (mm) — chỉ có nghĩa khi <see cref="CoCaoDo"/>.</summary>
    public double DayMm => (CaoDoMm ?? 0) - BeCaoMm / 2;

    /// <summary>Mép TRÊN của tuyến (mm) — chỉ có nghĩa khi <see cref="CoCaoDo"/>.</summary>
    public double DinhCaoMm => (CaoDoMm ?? 0) + BeCaoMm / 2;

    /// <summary>Nhãn ngắn cho bảng xung đột: hệ + cỡ + handle (+ tệp xref nếu là tuyến ngoài).</summary>
    public string MoTaNgan =>
        $"{HeId}{(string.IsNullOrWhiteSpace(Co) ? "" : " " + Co)} ({Id}" +
        $"{(string.IsNullOrWhiteSpace(Nguon) ? "" : " @ " + Nguon)})";
}

/// <summary>
/// Một xung đột phối hợp đã phát hiện. Bản ghi THUẦN — Adapter dựng marker/hộp thoại từ đây, còn
/// trạng thái xử lý ("chấp nhận"/"bỏ qua có lý do", FR4) bám theo <see cref="Id"/>.
/// </summary>
/// <param name="ViTri">Chỗ đánh dấu/zoom tới, ĐƠN VỊ BẢN VẼ.</param>
/// <param name="SoLieuMm">Số đo đếm được của xung đột (mm): chồng cao độ / thiếu bề rộng / khoảng cách.</param>
/// <param name="ThieuCaoDo">Có tuyến thiếu dữ liệu cao độ trong xung đột này không (§11).</param>
public sealed record XungDot(
    string Id,
    LopKiem Lop,
    MucXungDot Muc,
    IReadOnlyList<string> IdTuyen,
    IReadOnlyList<string> HeLienQuan,
    string MoTa,
    Diem2 ViTri,
    double? SoLieuMm,
    bool ThieuCaoDo,
    IReadOnlyList<DeXuat> DeXuat,
    string HanhLangId = "");

/// <summary>
/// Quét 3 lớp kiểm phối hợp xung đột 2D liên hệ của <c>XBOSS_PHOIHOP</c> (M116 §6 bước 2, §7 FR1) —
/// THUẦN, không biết gì về AutoCAD, test trên CI Linux.
///
/// <para><b>Tái dùng, không viết bộ dò thứ hai:</b> giao cắt hình học vẫn đi qua
/// <see cref="Segment2D"/> — đúng bộ dò mà phép kiểm 11 (<c>PhepKiemMoRong.GiaoCatKhacHe</c>) và
/// <c>XBOSS_VE_NGATNET</c> đang dùng; phép kiểm 11 KHÔNG bị đụng tới. Hành lang dùng lại
/// <see cref="HanhLangDauVao"/> của M114 thay vì khai một kiểu hành lang thứ hai.</para>
///
/// <para><b>Chỉ mục quét:</b> sweep line theo trục X trên bao của từng ĐOẠN (đã nới thêm nửa bề
/// rộng + ngưỡng khoảng cách lớn nhất), nên chỉ những đoạn thật sự gần nhau mới được xét từng cặp —
/// không duyệt n² cặp tuyến như phép kiểm 11 (NFR: 2.000 đoạn × 4 hệ dưới 5 giây).</para>
///
/// <para><b>Không tự tắt theo cờ:</b> <c>coordinationPolicy.enabled</c> là cổng của LỆNH (Adapter
/// dừng kèm hướng dẫn bật, như <c>VeContext</c> làm với các khối chính sách khác), không phải của
/// hàm thuần này — để test và bộ đối chứng gọi thẳng được.</para>
/// </summary>
public static class QuetXungDot
{
    /// <summary>Dưới ngưỡng này (mm) coi như hai dải cao độ chỉ CHẠM nhau, chưa chồng.</summary>
    private const double NguongChongMm = 1e-9;

    /// <summary>
    /// Quét toàn bộ 3 lớp kiểm.
    /// </summary>
    /// <param name="tuyen">Tuyến trong bản vẽ + tuyến đọc từ xref (FR1).</param>
    /// <param name="chinhSach">Khối <c>drawTools.coordinationPolicy</c> đang phát hành.</param>
    /// <param name="hangUuTien">
    /// Bảng ưu tiên nhường đường — lấy bằng
    /// <see cref="CoordinationPolicySection.HangUuTien"/> (tham chiếu <c>crossingPolicy.priority</c>).
    /// Truyền tường minh để Core không phải biết cả khối <c>drawTools</c>, cùng khuôn
    /// <c>CapPhatLanTang.Cap(..., heDien)</c> của M114.
    /// </param>
    /// <param name="donViTrenMm">
    /// Số đơn vị bản vẽ ứng với 1 mm (bản vẽ mm = 1; bản vẽ mét = 0,001) — Adapter tính từ INSUNITS,
    /// đúng quy ước <c>ThamSoDoThi.Tu</c> của M115.
    /// </param>
    /// <param name="hanhLang">Hành lang đã vẽ (M114) — không có thì lớp 2 tự bỏ qua.</param>
    public static IReadOnlyList<XungDot> Quet(
        IReadOnlyList<TuyenPhoiHop> tuyen,
        CoordinationPolicySection chinhSach,
        IReadOnlyList<string> hangUuTien,
        double donViTrenMm = 1,
        IReadOnlyList<HanhLangDauVao>? hanhLang = null)
    {
        // Tuyến chưa gán hệ hoặc dưới 2 đỉnh bị bỏ qua — KHÔNG đoán hệ hộ (cùng cách phép kiểm 11
        // bỏ qua tim nằm trên layer không suy được nhóm).
        var ds = tuyen
            .Where(t => t.Dinh.Count >= 2 && !string.IsNullOrWhiteSpace(t.HeId))
            .ToList();

        var ketQua = new Dictionary<string, XungDot>(StringComparer.Ordinal);
        QuetGiaoCat(ds, chinhSach, hangUuTien, donViTrenMm, ketQua);
        QuetTranhChapHanhLang(ds, chinhSach, hangUuTien, donViTrenMm, hanhLang, ketQua);

        return ketQua.Values
            .OrderBy(x => x.Lop)
            .ThenBy(x => x.Id, StringComparer.Ordinal)
            .ToList();
    }

    // ===== Lớp 1 + lớp 3 (+ nhánh phẳng khi thiếu cao độ) =====

    private static void QuetGiaoCat(
        IReadOnlyList<TuyenPhoiHop> ds,
        CoordinationPolicySection chinhSach,
        IReadOnlyList<string> hangUuTien,
        double donViTrenMm,
        Dictionary<string, XungDot> ketQua)
    {
        var capCung = new HashSet<(int, int)>();
        // Cặp tuyến → chỗ gần nhau nhất (mm) + vị trí, để chốt lớp 3 sau khi biết cặp nào đã CỨNG.
        var ganNhat = new Dictionary<(int A, int B), (double KhoangCachMm, Diem2 ViTri, double NguongMm)>();

        foreach (var (i, di, j, dj) in CapDoanUngVien(ds, chinhSach, donViTrenMm))
        {
            var a = ds[i];
            var b = ds[j];
            var (a1, a2) = Doan(a, di);
            var (b1, b2) = Doan(b, dj);

            var giao = Segment2D.GiaoDiem(a1, a2, b1, b2);
            var thieuCaoDo = !a.CoCaoDo || !b.CoCaoDo;

            if (thieuCaoDo)
            {
                // §11 — không đoán cao độ: chỉ báo giao cắt PHẲNG như phép kiểm 11, mức cảnh báo.
                if (giao is not { } diemPhang) continue;
                Them(ketQua, new XungDot(
                    XungDotId.Tao(LopKiem.GiaoCatPhang, [a.Id, b.Id], XungDotId.MocToaDo(
                        diemPhang.X / donViTrenMm, diemPhang.Y / donViTrenMm)),
                    LopKiem.GiaoCatPhang,
                    MucXungDot.CanhBao,
                    [a.Id, b.Id],
                    [a.HeId, b.HeId],
                    $"Giao cắt trên mặt bằng, THIẾU CAO ĐỘ: {a.MoTaNgan} × {b.MoTaNgan} tại " +
                    $"({Toa(diemPhang.X)}, {Toa(diemPhang.Y)}) — " +
                    $"{string.Join(" và ", new[] { a, b }.Where(t => !t.CoCaoDo).Select(t => "tuyến " + t.Id))} " +
                    "thiếu cao độ nên không kết luận được có va nhau hay không (M116 §11).",
                    new Diem2(diemPhang.X, diemPhang.Y),
                    null,
                    true,
                    DeXuatXuLy.ChoThieuCaoDo(a, b)));
                continue;
            }

            var chongMm = Math.Min(a.DinhCaoMm, b.DinhCaoMm) - Math.Max(a.DayMm, b.DayMm);
            if (giao is { } diem && chongMm > NguongChongMm)
            {
                capCung.Add((i, j));
                Them(ketQua, new XungDot(
                    XungDotId.Tao(LopKiem.GiaoCatCaoDo, [a.Id, b.Id], XungDotId.MocToaDo(
                        diem.X / donViTrenMm, diem.Y / donViTrenMm)),
                    LopKiem.GiaoCatCaoDo,
                    MucXungDot.Cung,
                    [a.Id, b.Id],
                    [a.HeId, b.HeId],
                    $"Giao cắt cùng cao độ: {a.MoTaNgan} × {b.MoTaNgan} tại " +
                    $"({Toa(diem.X)}, {Toa(diem.Y)}) — dải cao độ chồng nhau {So(chongMm)} mm " +
                    $"({a.HeId}: {So(a.DayMm)}–{So(a.DinhCaoMm)} mm, {b.HeId}: {So(b.DayMm)}–{So(b.DinhCaoMm)} mm).",
                    new Diem2(diem.X, diem.Y),
                    chongMm,
                    false,
                    DeXuatXuLy.ChoGiaoCat(a, b, hangUuTien)));
                continue;
            }

            // Lớp 3 — chỉ khi rule pack khai ngưỡng cho đúng cặp hệ này.
            if (chinhSach.NguongKhoangCachMm(a.HeId, b.HeId) is not { } nguongMm) continue;

            var (khoangCachTim, cho) = Segment2D.GanNhatHaiDoan(a1, a2, b1, b2);
            var ngangMm = Math.Max(0, khoangCachTim / donViTrenMm - (a.BeRongMm + b.BeRongMm) / 2);
            var dungMm = Math.Max(0, -chongMm);
            var khoangCachMm = Math.Sqrt(ngangMm * ngangMm + dungMm * dungMm);
            if (khoangCachMm >= nguongMm) continue;

            var khoa = (i, j);
            if (!ganNhat.TryGetValue(khoa, out var cu) || khoangCachMm < cu.KhoangCachMm)
            {
                ganNhat[khoa] = (khoangCachMm, new Diem2(cho.X, cho.Y), nguongMm);
            }
        }

        foreach (var (khoa, gan) in ganNhat)
        {
            // Cặp đã va nhau thật (lớp 1) thì không báo lại ở mức nhẹ hơn — một chỗ, một dòng.
            if (capCung.Contains(khoa)) continue;

            var a = ds[khoa.A];
            var b = ds[khoa.B];
            Them(ketQua, new XungDot(
                XungDotId.Tao(LopKiem.KhoangCachQuyPham, [a.Id, b.Id], XungDotId.MocToaDo(
                    gan.ViTri.X / donViTrenMm, gan.ViTri.Y / donViTrenMm)),
                LopKiem.KhoangCachQuyPham,
                MucXungDot.CanhBao,
                [a.Id, b.Id],
                [a.HeId, b.HeId],
                $"Khoảng cách quy phạm: {a.MoTaNgan} × {b.MoTaNgan} chỉ cách nhau {So(gan.KhoangCachMm)} mm " +
                $"(mép–mép, gộp cả lệch cao độ), nhỏ hơn ngưỡng {So(gan.NguongMm)} mm khai cho cặp " +
                $"{a.HeId} × {b.HeId}.",
                gan.ViTri,
                gan.KhoangCachMm,
                false,
                DeXuatXuLy.ChoKhoangCach(a, b, gan.KhoangCachMm, gan.NguongMm, hangUuTien)));
        }
    }

    // ===== Lớp 2 — tranh chấp hành lang =====

    private static void QuetTranhChapHanhLang(
        IReadOnlyList<TuyenPhoiHop> ds,
        CoordinationPolicySection chinhSach,
        IReadOnlyList<string> hangUuTien,
        double donViTrenMm,
        IReadOnlyList<HanhLangDauVao>? hanhLang,
        Dictionary<string, XungDot> ketQua)
    {
        if (hanhLang is not { Count: > 0 }) return;

        foreach (var hl in hanhLang.Where(h => h.Dinh.Count >= 2 && h.BeRongMm > 0))
        {
            // Tuyến CHẠY DỌC trong lòng hành lang: dùng lại phép "nằm trong dải song song" của phép
            // kiểm 10 (Segment2D.ChongLanSongSong) với dải rộng bằng nửa bề rộng hành lang.
            var nuaDai = hl.BeRongMm / 2 * donViTrenMm;
            var trong = ds
                .Where(t => t.CoCaoDo && ChayDocHanhLang(t, hl, nuaDai))
                .ToList();
            if (trong.Count == 0) continue;

            foreach (var tang in GomTheoTang(trong))
            {
                // Bề rộng CẦN = tổng bề rộng + một khe bảo trì trước MỖI làn — đúng cách cộng của
                // Routing/CapPhatLanTang (M114) để hai lệnh không ra hai con số khác nhau.
                var canMm = tang.Sum(t => t.BeRongMm) + chinhSach.MaintenanceGapMm * tang.Count;
                var thieuMm = canMm - hl.BeRongMm;
                if (thieuMm <= NguongChongMm) continue;

                var caoDoTangMm = tang.Min(t => t.DayMm);
                Them(ketQua, new XungDot(
                    XungDotId.Tao(
                        LopKiem.TranhChapHanhLang,
                        tang.Select(t => t.Id),
                        XungDotId.MocHanhLang(hl.Id, caoDoTangMm)),
                    LopKiem.TranhChapHanhLang,
                    MucXungDot.Mem,
                    tang.Select(t => t.Id).ToList(),
                    tang.Select(t => t.HeId).Distinct(StringComparer.Ordinal).ToList(),
                    $"Tranh chấp hành lang \"{hl.Id}\" ở tầng cao độ ~{So(caoDoTangMm)} mm: {tang.Count} tuyến " +
                    $"({string.Join(", ", tang.Select(t => t.MoTaNgan))}) cần {So(canMm)} mm bề rộng " +
                    $"(đã gồm khoảng bảo trì {So(chinhSach.MaintenanceGapMm)} mm mỗi làn) mà hành lang chỉ rộng " +
                    $"{So(hl.BeRongMm)} mm — thiếu {So(thieuMm)} mm.",
                    TamHanhLang(hl),
                    thieuMm,
                    false,
                    DeXuatXuLy.ChoHanhLang(hl.Id, tang, thieuMm, hangUuTien),
                    hl.Id));
            }
        }
    }

    /// <summary>Tuyến có đoạn nào chạy song song trong lòng hành lang không (phần chồng > 0).</summary>
    private static bool ChayDocHanhLang(TuyenPhoiHop t, HanhLangDauVao hl, double nuaDai)
    {
        for (var h = 0; h + 1 < hl.Dinh.Count; h++)
        {
            for (var d = 0; d + 1 < t.Dinh.Count; d++)
            {
                var chong = Segment2D.ChongLanSongSong(
                    (hl.Dinh[h].X, hl.Dinh[h].Y), (hl.Dinh[h + 1].X, hl.Dinh[h + 1].Y),
                    (t.Dinh[d].X, t.Dinh[d].Y), (t.Dinh[d + 1].X, t.Dinh[d + 1].Y),
                    nuaDai);
                if (chong > 0) return true;
            }
        }
        return false;
    }

    /// <summary>
    /// Gom các tuyến trong hành lang thành TẦNG cao độ: hai tuyến chỉ tranh nhau bề rộng khi dải
    /// cao độ của chúng chồng nhau. Không gom thì một hành lang 3 tầng ống luôn bị báo oan hết chỗ.
    /// </summary>
    private static IEnumerable<List<TuyenPhoiHop>> GomTheoTang(IReadOnlyList<TuyenPhoiHop> trong)
    {
        var theoDay = trong.OrderBy(t => t.DayMm).ThenBy(t => t.Id, StringComparer.Ordinal).ToList();
        var nhom = new List<TuyenPhoiHop> { theoDay[0] };
        var tran = theoDay[0].DinhCaoMm;

        for (var i = 1; i < theoDay.Count; i++)
        {
            if (theoDay[i].DayMm < tran - NguongChongMm)
            {
                nhom.Add(theoDay[i]);
                tran = Math.Max(tran, theoDay[i].DinhCaoMm);
                continue;
            }
            yield return nhom;
            nhom = [theoDay[i]];
            tran = theoDay[i].DinhCaoMm;
        }
        yield return nhom;
    }

    private static Diem2 TamHanhLang(HanhLangDauVao hl) => new(
        (hl.Dinh.Min(d => d.X) + hl.Dinh.Max(d => d.X)) / 2,
        (hl.Dinh.Min(d => d.Y) + hl.Dinh.Max(d => d.Y)) / 2);

    // ===== Chỉ mục quét (sweep line theo X) =====

    /// <summary>Bao của một đoạn tuyến, đã nới thêm phần "còn phải xét" của chính tuyến đó.</summary>
    private readonly record struct BaoDoan(
        int Tuyen, int Doan, double MinX, double MaxX, double MinY, double MaxY);

    /// <summary>
    /// Các cặp ĐOẠN đáng xét: khác tuyến, khác hệ, và bao (đã nới) giao nhau. Sweep line theo X nên
    /// hai đầu bản vẽ không bao giờ bị đem ra so với nhau.
    ///
    /// <para>Bỏ cặp CÙNG hệ đúng như phép kiểm 11 và <c>crossingPolicy</c>: cấp × thoát nước cùng
    /// thuộc hệ PIPING vẫn là việc kỹ sư xử lý bằng phụ kiện, không phải xung đột liên hệ.</para>
    /// </summary>
    private static IEnumerable<(int I, int DoanI, int J, int DoanJ)> CapDoanUngVien(
        IReadOnlyList<TuyenPhoiHop> ds, CoordinationPolicySection chinhSach, double donViTrenMm)
    {
        var nguongLonNhatMm = chinhSach.MinClearancePairsMm.Count == 0
            ? 0
            : chinhSach.MinClearancePairsMm.Max(c => c.MinClearanceMm);

        var bao = new List<BaoDoan>();
        for (var i = 0; i < ds.Count; i++)
        {
            var noiRong = (nguongLonNhatMm + ds[i].BeRongMm / 2) * donViTrenMm;
            for (var d = 0; d + 1 < ds[i].Dinh.Count; d++)
            {
                var (p, q) = Doan(ds[i], d);
                bao.Add(new BaoDoan(
                    i, d,
                    Math.Min(p.X, q.X) - noiRong, Math.Max(p.X, q.X) + noiRong,
                    Math.Min(p.Y, q.Y) - noiRong, Math.Max(p.Y, q.Y) + noiRong));
            }
        }
        bao.Sort((x, y) => x.MinX.CompareTo(y.MinX));

        var dangMo = new List<int>();
        for (var k = 0; k < bao.Count; k++)
        {
            var d = bao[k];
            dangMo.RemoveAll(idx => bao[idx].MaxX < d.MinX);
            foreach (var idx in dangMo)
            {
                var e = bao[idx];
                if (e.Tuyen == d.Tuyen) continue;
                if (string.Equals(ds[e.Tuyen].HeId, ds[d.Tuyen].HeId, StringComparison.Ordinal)) continue;
                if (e.MaxY < d.MinY || d.MaxY < e.MinY) continue;

                // Luôn trả cặp theo THỨ TỰ đầu vào để thông báo/đề xuất không phụ thuộc thứ tự quét.
                yield return e.Tuyen < d.Tuyen
                    ? (e.Tuyen, e.Doan, d.Tuyen, d.Doan)
                    : (d.Tuyen, d.Doan, e.Tuyen, e.Doan);
            }
            dangMo.Add(k);
        }
    }

    private static ((double X, double Y) Dau, (double X, double Y) Cuoi) Doan(TuyenPhoiHop t, int d) =>
        ((t.Dinh[d].X, t.Dinh[d].Y), (t.Dinh[d + 1].X, t.Dinh[d + 1].Y));

    /// <summary>Ghi xung đột theo id — chạy lại trên cùng dữ liệu không bao giờ nhân đôi (FR1/AC2).</summary>
    private static void Them(Dictionary<string, XungDot> ketQua, XungDot xd) => ketQua[xd.Id] = xd;

    private static string So(double v) => v.ToString("0.###", CultureInfo.InvariantCulture);

    private static string Toa(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);
}
