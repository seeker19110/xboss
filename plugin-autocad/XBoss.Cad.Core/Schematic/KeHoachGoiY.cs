using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Routing;
using XBoss.Cad.Core.Zoning;

namespace XBoss.Cad.Core.Schematic;

/// <summary>
/// Một tuyến NHÁP của lần chạy trước đang có trong bản vẽ (đọc từ XData: vai trò <c>Tim</c>, khóa
/// <c>phien</c> mang mã <c>goiy-&lt;id&gt;</c>).
/// </summary>
/// <param name="LechBam">
/// Băm hình học hiện tại khác băm lúc sinh ⇒ kỹ sư đã kéo/sửa tuyến nháp này. Lệnh KHÔNG âm thầm
/// xóa: nó hỏi lại (M114 guardrail 4 — không đè lên công sức của người).
/// </param>
public sealed record NhapCuGoiY(string Handle, string? MaPhien, bool LechBam);

/// <summary>Một tuyến tim NHÁP sẽ vẽ ra, kèm thuộc tính điền sẵn từ graph.</summary>
/// <param name="Size">Cỡ đọc từ cạnh schematic; null = graph không ghi cỡ ⇒ dùng cỡ kỹ sư khai.</param>
public sealed record NhanhNhapGoiY(
    string NutId, string Nhan, IReadOnlyList<Diem2> Diem, string? Size, double ChieuDai, int SoCo);

/// <summary>Kế hoạch một lần chạy <c>XBOSS_TUYEN_GOIY</c> — đủ để xem trước rồi mới ghi.</summary>
/// <param name="XoaHandle">Tuyến nháp CŨ của chính graph này sẽ bị xóa trước khi sinh lại (AC5).</param>
/// <param name="HandleDaSuaTay">Tuyến nháp cũ có hình học đã bị sửa tay — cần kỹ sư xác nhận.</param>
public sealed record KetQuaGoiY(
    string MaPhien,
    KetQuaAnhXaGoiY AnhXa,
    KetQuaKeHoach KeHoach,
    IReadOnlyList<NhanhNhapGoiY> Nhanh,
    IReadOnlyList<string> XoaHandle,
    IReadOnlyList<string> HandleDaSuaTay,
    string? LoiChan);

/// <summary>
/// Lập kế hoạch sinh TUYẾN TIM NHÁP từ sơ đồ nguyên lý đã chốt (M117 §6 bước 5, FR6) — THUẦN.
///
/// <para>Dây chuyền: <see cref="AnhXaThietBiGoiY"/> (nút graph ↔ block mặt bằng) →
/// <see cref="KeHoachDiTuyen"/> (routing hành lang tất định của M114) → gán cỡ/hệ từ graph. Lớp
/// này KHÔNG tự nghĩ ra hình học: mọi tọa độ đều do routing M114 sinh, đúng nguyên tắc đã chốt
/// "AI hiểu ngữ nghĩa, thuật toán vẽ hình học" (M117 §1).</para>
///
/// <para>Idempotent theo id graph (AC5): mọi tuyến nháp mang <c>phien = goiy-&lt;id&gt;</c> bị xóa
/// rồi sinh lại; thực thể không mang mã đó — kể cả nháp của graph KHÁC — không bao giờ bị đụng.</para>
/// </summary>
public static class KeHoachGoiY
{
    /// <summary>Layer riêng cho tuyến nháp (M117 FR6) — không lẫn vào layer tuyến thật.</summary>
    public const string LayerNhap = "XBOSS-GOIY";

    /// <summary>Tuyến nháp thuộc đúng graph <paramref name="idGraph"/> trong danh sách đọc được.</summary>
    public static IReadOnlyList<NhapCuGoiY> NhapCuaGraph(
        IReadOnlyList<NhapCuGoiY> nhapCu, long idGraph)
    {
        var ma = BanGoiY.MaPhienCua(idGraph);
        return nhapCu.Where(n => string.Equals(n.MaPhien, ma, StringComparison.Ordinal)).ToList();
    }

    /// <param name="ban">Bản schematic đã tải (phải <c>da_duyet</c>).</param>
    /// <param name="block">Block thiết bị đọc từ mặt bằng.</param>
    /// <param name="hanhLang">Hành lang đọc từ bản vẽ (M114) — rỗng thì dừng sạch, có lý do.</param>
    /// <param name="nhapCu">Tuyến nháp của mọi graph đang có trong bản vẽ.</param>
    /// <param name="chinhSach">Khối <c>drawTools.routingPolicy</c> đang phát hành.</param>
    /// <param name="nguon">Điểm nguồn kỹ sư bấm trên mặt bằng, ĐƠN VỊ BẢN VẼ.</param>
    /// <param name="snapRadius">Bán kính rẽ nhánh, ĐƠN VỊ BẢN VẼ.</param>
    /// <param name="chiPhi">Hệ số α/β/γ đã quy về đơn vị bản vẽ.</param>
    /// <param name="beRongTuyenMm">Bề rộng làn xin trong hành lang (mm — suy từ cỡ kỹ sư khai).</param>
    /// <param name="caoThietDienMm">Chiều cao thiết diện tuyến (mm).</param>
    /// <param name="vungCam">Vùng cấm (tùy chọn).</param>
    public static KetQuaGoiY Lap(
        BanGoiY ban,
        IReadOnlyList<BlockMatBang> block,
        IReadOnlyList<HanhLangChoTuyen> hanhLang,
        IReadOnlyList<NhapCuGoiY> nhapCu,
        RoutingPolicySection chinhSach,
        Diem2 nguon,
        double snapRadius,
        ThamSoDinhTuyen chiPhi,
        double beRongTuyenMm,
        double caoThietDienMm,
        IReadOnlyList<RanhGioiVung>? vungCam = null)
    {
        var cuCuaGraph = NhapCuaGraph(nhapCu, ban.Id);
        var xoa = cuCuaGraph.Select(n => n.Handle).ToList();
        var suaTay = cuCuaGraph.Where(n => n.LechBam).Select(n => n.Handle).ToList();
        var anhXa = AnhXaThietBiGoiY.Khop(ban.Graph, ban.SystemId, block);

        KetQuaGoiY Chan(string lyDo, KetQuaAnhXaGoiY ax) => new(
            ban.MaPhien, ax, KeHoachRong(lyDo), [], xoa, suaTay, lyDo);

        if (!ban.DaDuyet)
        {
            return Chan(
                $"Sơ đồ nguyên lý #{ban.Id} chưa được chốt trên web (trạng thái \"{ban.TrangThai}\") — " +
                "vào tab Sơ đồ nguyên lý, duyệt rồi bấm \"Chốt graph\" trước.",
                anhXa);
        }
        if (hanhLang.Count == 0)
        {
            return Chan(
                "Bản vẽ chưa có hành lang nào — chạy XBOSS_VE_HANHLANG để vẽ (hoặc nhận) hành lang đi " +
                "ống trước rồi chạy lại XBOSS_TUYEN_GOIY.",
                anhXa);
        }
        if (anhXa.Cap.Count == 0)
        {
            return Chan(
                $"Không ánh xạ được thiết bị nào của sơ đồ #{ban.Id} sang block trên mặt bằng " +
                $"({anhXa.Thieu.Count} nút thiếu) — đặt block thiết bị/đánh tag rồi chạy lại.",
                anhXa);
        }

        // Tên thiết bị đưa vào routing là ID NÚT (duy nhất trong graph) — nhờ vậy gán ngược cỡ từ
        // graph cho từng nhánh là chính xác, không phụ thuộc tag trùng nhau trên bản vẽ.
        var thietBi = anhXa.Cap
            .Select(c => new ThietBiChoTuyen(c.Nut.Id, c.Block.ViTri, ban.SystemId))
            .ToList();

        var keHoach = KeHoachDiTuyen.Lap(
            hanhLang,
            thietBi,
            chinhSach,
            ban.SystemId,
            nguon,
            snapRadius,
            chiPhi,
            beRongTuyenMm,
            caoThietDienMm,
            CapPhatLanTang.HeDienDuAn,
            vungCam,
            tuChay: null,
            caoDoThietBiMm: 0,
            chiThietBiChuaCoTuyen: false);

        var nhan = anhXa.Cap.ToDictionary(c => c.Nut.Id, c => c.Nut.Nhan, StringComparer.Ordinal);
        var nhanh = keHoach.Nhanh
            .Select(n => new NhanhNhapGoiY(
                n.ThietBi,
                nhan.TryGetValue(n.ThietBi, out var t) ? t : n.ThietBi,
                n.Diem,
                ban.Graph.SizeCuaNut(n.ThietBi),
                n.ChieuDai,
                n.SoCo))
            .ToList();

        return new KetQuaGoiY(ban.MaPhien, anhXa, keHoach, nhanh, xoa, suaTay, keHoach.LoiChan);
    }

    private static KetQuaKeHoach KeHoachRong(string lyDo) => new([], [], [], 0, 0, 0, 0, 0, 0, lyDo);
}
