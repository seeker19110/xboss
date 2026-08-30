using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Routing;

/// <summary>
/// Tham số hàm chi phí đi tuyến — bản Core của <c>routingPolicy.cost</c> (M114 §6).
/// Đơn vị chiều dài là ĐƠN VỊ BẢN VẼ; caller quy đổi từ mm của rule pack (quy ước M99 §6.7).
/// </summary>
/// <param name="Elbow">α — mỗi lần chuyển hướng cộng thêm chừng này chiều dài.</param>
/// <param name="CongestionMoiDonVi">β — mỗi hệ đã chiếm làn cộng thêm chừng này trên MỖI đơn vị dài.</param>
/// <param name="ReuseFactor">γ — cạnh mà nhánh trước của CHÍNH hệ này đã đi chỉ tính từng này phần giá.</param>
public sealed record ThamSoDinhTuyen(double Elbow, double CongestionMoiDonVi, double ReuseFactor)
{
    /// <summary>Bỏ gom trục (γ = 1) — dùng để chứng minh số hạng γ có tác dụng thật (AC2).</summary>
    public ThamSoDinhTuyen KhongGomTruc() => this with { ReuseFactor = 1 };
}

/// <summary>Ràng buộc tự chảy của hệ có <c>slopeRequired</c> (M114 FR8).</summary>
/// <param name="DoDoc">Độ dốc bắt buộc, dạng tỉ số (2% = 0.02).</param>
/// <param name="CaoDoXaMm">Cao độ điểm xả (mm) — tuyến phải giảm đơn điệu từ thiết bị về đây.</param>
public sealed record RangBuocTuChay(double DoDoc, double CaoDoXaMm);

/// <summary>Một nhánh đã đi tuyến xong.</summary>
public sealed record TuyenNhanh(
    string ThietBi,
    IReadOnlyList<int> Canh,
    IReadOnlyList<Diem2> Diem,
    double ChieuDai,
    int SoCo);

/// <summary>Kết quả đi tuyến một hệ (M114 FR7/FR14).</summary>
/// <param name="TongChieuDai">
/// Tổng chiều dài tuyến VẼ RA — cạnh dùng chung giữa nhiều nhánh chỉ tính MỘT lần, đúng như
/// <c>XBOSS_BOCKL</c> đo trên bản vẽ (AC3). Đây là con số γ phải kéo xuống (AC2).
/// </param>
/// <param name="TongDaiNhanh">Tổng chiều dài từng nhánh cộng lại (đoạn chung đếm nhiều lần).</param>
public sealed record KetQuaDinhTuyen(
    IReadOnlyList<TuyenNhanh> Tuyen,
    IReadOnlyList<KhongGiaiDuoc> KhongGiai,
    double TongChieuDai,
    double TongDaiNhanh,
    int SoCo,
    int SoCanhDungChung)
{
    /// <summary>Tỉ lệ cạnh dùng chung — đo hiệu quả gom trục (FR14).</summary>
    public double TiLeDungChung
    {
        get
        {
            var tong = Tuyen.Sum(t => t.Canh.Count);
            return tong == 0 ? 0 : (double)SoCanhDungChung / tong;
        }
    }
}

/// <summary>
/// Đi tuyến một hệ trên đồ thị hành lang (M114 FR7/FR8) — THUẦN, test trên CI Linux.
///
/// Với mỗi thiết bị (xử lý tuần tự, XA TRỤC NHẤT TRƯỚC — nhánh xa đặt trục chung, nhánh gần gom
/// vào sau): Dijkstra từ điểm rẽ về nút nguồn theo hàm chi phí
/// <c>chiều dài + α×số lần chuyển hướng + β×độ đông − thưởng γ trên cạnh mà nhánh trước của CHÍNH
/// hệ này đã dùng</c>. Trạng thái tìm kiếm là (nút, cạnh vừa đi qua) vì chi phí co phụ thuộc hướng
/// vào — đồ thị chỉ vài chục nút nên thừa sức (NFR1), không cần lưới không gian 3D.
///
/// Không giải được thì NÓI không giải được (guardrail 3): không nới bán kính, không hạ độ dốc.
/// </summary>
public static class DinhTuyen
{
    /// <summary>Góc lệch (độ) từ ngưỡng này trở lên mới tính là một lần chuyển hướng.</summary>
    public const double NguongCoDo = 1;

    /// <summary>
    /// Đi tuyến toàn bộ thiết bị của một hệ về <paramref name="nutNguon"/>.
    /// </summary>
    /// <param name="doThi">Đồ thị hành lang của hệ (đã loại cạnh qua vùng cấm).</param>
    /// <param name="nutNguon">Nút nguồn/trục chính (điểm đấu về).</param>
    /// <param name="thamSo">3 hệ số α/β/γ.</param>
    /// <param name="doDongTheoHanhLang">Số hệ ĐÃ chiếm làn trong từng hành lang (đọc từ <c>lanDaCap</c>).</param>
    /// <param name="tuChay">Ràng buộc tự chảy; null = hệ không cần độ dốc.</param>
    /// <param name="caoDoThietBi">Cao độ (mm) từng thiết bị — chỉ dùng khi có <paramref name="tuChay"/>.</param>
    public static KetQuaDinhTuyen Chay(
        HanhLangGraph doThi,
        int nutNguon,
        ThamSoDinhTuyen thamSo,
        IReadOnlyDictionary<string, int>? doDongTheoHanhLang = null,
        RangBuocTuChay? tuChay = null,
        IReadOnlyDictionary<string, double>? caoDoThietBi = null)
    {
        var tuyen = new List<TuyenNhanh>();
        var khongGiai = new List<KhongGiaiDuoc>(doThi.KhongGiai);
        var daDung = new HashSet<int>();
        var soDungChung = 0;

        // Xa trục nhất trước (FR7) — khoảng cách đường chim bay từ điểm rẽ tới nguồn.
        var viTriNguon = doThi.Nut[nutNguon].ViTri;
        var thuTu = doThi.DiemRe
            .OrderByDescending(r => doThi.Nut[r.Nut].ViTri.KhoangCach(viTriNguon))
            .ThenBy(r => r.ThietBi, StringComparer.Ordinal)
            .ToList();

        foreach (var re in thuTu)
        {
            var duong = TimDuong(doThi, re.Nut, nutNguon, thamSo, doDongTheoHanhLang, daDung, re.ThietBi);
            if (duong is not { } d)
            {
                khongGiai.Add(new KhongGiaiDuoc(
                    re.ThietBi,
                    $"Không có đường nào từ điểm rẽ trên hành lang \"{re.HanhLangId}\" về điểm nguồn " +
                    "(hành lang không nối liền, hoặc bị vùng cấm cắt đứt)."));
                continue;
            }

            if (tuChay is { } tc)
            {
                var caoDo = caoDoThietBi is not null && caoDoThietBi.TryGetValue(re.ThietBi, out var c) ? c : 0;
                var canGiam = tc.DoDoc * d.ChieuDai;
                var coGiam = caoDo - tc.CaoDoXaMm;
                if (coGiam < canGiam - 1e-9)
                {
                    khongGiai.Add(new KhongGiaiDuoc(
                        re.ThietBi,
                        $"Không thỏa tự chảy: cần chênh cao {canGiam:0.###} mm trên {d.ChieuDai:0.###} " +
                        $"chiều dài, chỉ có {coGiam:0.###} mm.",
                        canGiam - coGiam));
                    continue;
                }
            }

            foreach (var canh in d.Canh)
            {
                if (!daDung.Add(canh)) soDungChung++;
            }
            tuyen.Add(d);
        }

        return new KetQuaDinhTuyen(
            tuyen,
            khongGiai,
            daDung.Sum(c => doThi.Canh[c].ChieuDai),
            tuyen.Sum(t => t.ChieuDai),
            tuyen.Sum(t => t.SoCo),
            soDungChung);
    }

    /// <summary>
    /// Đường rẻ nhất từ <paramref name="tu"/> về <paramref name="den"/> theo hàm chi phí α/β/γ.
    /// null = không có đường. Public để test dựng đồ thị tay rồi kiểm đúng đường (M114 §10).
    /// </summary>
    public static TuyenNhanh? TimDuong(
        HanhLangGraph doThi,
        int tu,
        int den,
        ThamSoDinhTuyen thamSo,
        IReadOnlyDictionary<string, int>? doDongTheoHanhLang = null,
        IReadOnlySet<int>? canhDaDung = null,
        string thietBi = "")
    {
        // Trạng thái = (nút đang đứng, cạnh vừa đi qua). -1 = xuất phát, chưa có hướng vào.
        var giaTot = new Dictionary<(int Nut, int Canh), double>();
        var truoc = new Dictionary<(int Nut, int Canh), (int Nut, int Canh)>();
        var hangDoi = new PriorityQueue<(int Nut, int Canh), double>();

        var batDau = (Nut: tu, Canh: -1);
        giaTot[batDau] = 0;
        hangDoi.Enqueue(batDau, 0);

        while (hangDoi.TryDequeue(out var tt, out var gia))
        {
            if (gia > giaTot.GetValueOrDefault(tt, double.PositiveInfinity) + 1e-12) continue;
            if (tt.Nut == den) return DungTuyen(doThi, truoc, tt, batDau, thietBi);

            foreach (var canh in doThi.CanhTaiNut(tt.Nut))
            {
                if (canh == tt.Canh) continue; // không quay đầu ngay trên chính cạnh vừa đi
                var ke = doThi.Canh[canh];
                var giaCanh = ke.ChieuDai;
                if (canhDaDung is not null && canhDaDung.Contains(canh)) giaCanh *= thamSo.ReuseFactor;

                var doDong = doDongTheoHanhLang is not null &&
                             doDongTheoHanhLang.TryGetValue(ke.HanhLangId, out var n) ? n : 0;
                giaCanh += thamSo.CongestionMoiDonVi * doDong * ke.ChieuDai;

                if (tt.Canh >= 0 && LaCo(doThi, tt.Canh, canh, tt.Nut)) giaCanh += thamSo.Elbow;

                var sau = (Nut: doThi.DauKia(canh, tt.Nut), Canh: canh);
                var giaMoi = gia + giaCanh;
                if (giaMoi + 1e-12 >= giaTot.GetValueOrDefault(sau, double.PositiveInfinity)) continue;
                giaTot[sau] = giaMoi;
                truoc[sau] = tt;
                hangDoi.Enqueue(sau, giaMoi);
            }
        }
        return null;
    }

    /// <summary>Hai cạnh nối nhau tại <paramref name="nut"/> có tạo thành một lần chuyển hướng không.</summary>
    private static bool LaCo(HanhLangGraph doThi, int canhVao, int canhRa, int nut)
    {
        var vao = Huong(doThi, canhVao, nut, toiNut: true);
        var ra = Huong(doThi, canhRa, nut, toiNut: false);
        var cos = vao.X * ra.X + vao.Y * ra.Y;
        var goc = Math.Acos(Math.Clamp(cos, -1, 1)) * 180 / Math.PI;
        return goc >= NguongCoDo;
    }

    private static Diem2 Huong(HanhLangGraph doThi, int canh, int nut, bool toiNut)
    {
        var c = doThi.Canh[canh];
        var kia = doThi.DauKia(canh, nut);
        var a = doThi.Nut[toiNut ? kia : nut].ViTri;
        var b = doThi.Nut[toiNut ? nut : kia].ViTri;
        var v = b - a;
        var dai = v.DoDai;
        return dai <= 0 ? new Diem2(0, 0) : v * (1 / dai);
    }

    private static TuyenNhanh DungTuyen(
        HanhLangGraph doThi,
        Dictionary<(int Nut, int Canh), (int Nut, int Canh)> truoc,
        (int Nut, int Canh) cuoi,
        (int Nut, int Canh) batDau,
        string thietBi)
    {
        var canh = new List<int>();
        var nut = new List<int> { cuoi.Nut };
        var tt = cuoi;
        while (tt != batDau)
        {
            canh.Add(tt.Canh);
            tt = truoc[tt];
            nut.Add(tt.Nut);
        }
        canh.Reverse();
        nut.Reverse();

        var diem = nut.Select(n => doThi.Nut[n].ViTri).ToList();
        var dai = canh.Sum(c => doThi.Canh[c].ChieuDai);
        var soCo = 0;
        for (var i = 1; i < canh.Count; i++)
        {
            if (LaCo(doThi, canh[i - 1], canh[i], nut[i])) soCo++;
        }
        return new TuyenNhanh(thietBi, canh, diem, dai, soCo);
    }
}
