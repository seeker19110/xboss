using XBoss.Cad.Core.Draw;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M118 FR1/AC1/AC8 — cách ly lỗi từng giai đoạn của <c>XBOSS_HOANTHIEN</c>.
///
/// <c>HoanThienPipeline.Chay</c> nằm trong <c>XBoss.Cad.Acad</c> (net10.0-windows, tham chiếu
/// acmgd/acdbmgd/accoremgd) nên KHÔNG build được trên Linux — kể cả cổng biên dịch thử
/// <c>XBoss.Cad.AcadShim</c> cũng chỉ kiểm cú pháp/chữ ký API bằng stub RỖNG THÂN HÀM, không chạy
/// được logic thật (xem <c>plugin-autocad/README.md</c> mục Build). Vì vậy phần "cách ly lỗi, đi
/// tiếp giai đoạn kế" được rút thành hàm THUẦN
/// <see cref="HoanThienKeHoach.ChayCachLyLoi{TViec,TKetQua}"/> ở Core — không biết gì về AutoCAD —
/// và <c>HoanThienPipeline.Chay</c> chỉ còn là lớp mỏng gọi lại đúng hàm này với thân từng giai
/// đoạn thật. Test ở đây xác nhận đúng thuật toán cách ly lỗi bằng kế hoạch 8 giai đoạn thật (dựng
/// từ <see cref="HoanThienKeHoachTests.ChotAc1"/>) và mock service ném lỗi ở một giai đoạn giữa
/// chừng — đúng những gì <c>HoanThienPipeline.Chay</c> lắp ráp lại bằng dữ liệu AutoCAD thật.
/// </summary>
public class HoanThienPipelineTests
{
    private static IReadOnlyList<ViecGiaiDoan> KeHoachDu8() =>
        HoanThienKeHoach.Lap(HoanThienKeHoachTests.ChotAc1(), HoanThienKeHoach.DanhMuc.Select(g => g.Ten));

    /// <summary>Kết quả một giai đoạn dùng riêng cho test — mirror tối giản của <c>KetQuaGiaiDoan</c>.</summary>
    private readonly record struct KetQuaTest(string GiaiDoan, bool DaChay, bool Loi);

    // ===== AC1 — giai đoạn ④ (giá đỡ) ném lỗi, các giai đoạn ⑤–⑧ vẫn chạy =====

    [Fact]
    public void Ac1_loi_giua_pipeline_tra_du_8_ket_qua_va_khong_chan_cac_giai_doan_sau()
    {
        var keHoach = KeHoachDu8();
        Assert.Equal(8, keHoach.Count);

        var daGoi = new List<string>();
        var ra = HoanThienKeHoach.ChayCachLyLoi(
            keHoach,
            viec =>
            {
                daGoi.Add(viec.GiaiDoan.Ten);
                // Mock service của giai đoạn ④ (giá đỡ) ném lỗi .NET thường — đúng ca AC1: rule
                // pack thiếu block giá đỡ (kind=support) cho hệ đang xét.
                if (viec.GiaiDoan.Ten == "giaDo")
                {
                    throw new InvalidOperationException(
                        "Thư viện chưa có block giá đỡ (kind=support) cho hệ HVAC.");
                }
                return new KetQuaTest(viec.GiaiDoan.Ten, DaChay: true, Loi: false);
            },
            (viec, ex) => new KetQuaTest(viec.GiaiDoan.Ten, DaChay: false, Loi: true));

        // Đủ 8 phần tử, ĐÚNG thứ tự chạy cố định ① → ⑧ — không exception nào thoát khỏi hàm chạy.
        Assert.Equal(8, ra.Count);
        Assert.Equal(
            HoanThienKeHoach.DanhMuc.OrderBy(g => g.SoThuTu).Select(g => g.Ten).ToList(),
            ra.Select(k => k.GiaiDoan).ToList());

        // Phần tử thứ 4 (chỉ số 3) là giai đoạn giá đỡ, mang cờ Loi.
        Assert.Equal("giaDo", ra[3].GiaiDoan);
        Assert.True(ra[3].Loi);
        Assert.False(ra[3].DaChay);

        // Các giai đoạn ⑤–⑧ (loCho, ngatNet, tag, thongKe) VẪN được gọi — mock ghi nhận lời gọi.
        Assert.Contains("loCho", daGoi);
        Assert.Contains("ngatNet", daGoi);
        Assert.Contains("tag", daGoi);
        Assert.Contains("thongKe", daGoi);

        // Các giai đoạn khác (không lỗi) không mang cờ Loi.
        Assert.All(ra.Where(k => k.GiaiDoan != "giaDo"), k => Assert.False(k.Loi));
    }

    [Fact]
    public void Khong_loi_thi_moi_giai_doan_deu_khong_mang_co_loi()
    {
        var keHoach = KeHoachDu8();

        var ra = HoanThienKeHoach.ChayCachLyLoi(
            keHoach,
            viec => new KetQuaTest(viec.GiaiDoan.Ten, DaChay: true, Loi: false),
            (viec, ex) => new KetQuaTest(viec.GiaiDoan.Ten, DaChay: false, Loi: true));

        Assert.Equal(8, ra.Count);
        Assert.All(ra, k => Assert.False(k.Loi));
        Assert.All(ra, k => Assert.True(k.DaChay));
    }

    // ===== AC8 — báo cáo phiên (tóm tắt cuối lệnh HoanThienCommands) ghi đủ 8 giai đoạn kèm cờ lỗi =====

    [Fact]
    public void Ac8_bao_cao_phien_ghi_du_8_giai_doan_kem_co_loi_khong_bo_sot_giai_doan_nao()
    {
        var keHoach = KeHoachDu8();

        // Giai đoạn ⑥ (ngắt nét) lỗi lần này — vị trí lỗi không quan trọng, quan trọng là báo cáo
        // (danh sách kết quả HoanThienCommands lặp qua để in tóm tắt/ghi VeSessionReport) vẫn đủ
        // 8/8 dòng, không rơi mất giai đoạn lỗi lẫn các giai đoạn còn lại.
        var ra = HoanThienKeHoach.ChayCachLyLoi(
            keHoach,
            viec => viec.GiaiDoan.Ten == "ngatNet"
                ? throw new InvalidOperationException("Rule pack chưa khai drawTools.crossingPolicy.")
                : new KetQuaTest(viec.GiaiDoan.Ten, DaChay: true, Loi: false),
            (viec, ex) => new KetQuaTest(viec.GiaiDoan.Ten, DaChay: false, Loi: true));

        Assert.Equal(8, ra.Count);
        Assert.Equal(
            HoanThienKeHoach.DanhMuc.OrderBy(g => g.SoThuTu).Select(g => g.Ten).ToList(),
            ra.Select(k => k.GiaiDoan).ToList());

        Assert.Equal(1, ra.Count(k => k.Loi));
        Assert.True(ra.Single(k => k.GiaiDoan == "ngatNet").Loi);
        Assert.All(ra.Where(k => k.GiaiDoan != "ngatNet"), k => Assert.False(k.Loi));

        // Mô phỏng đúng dòng lệnh HoanThienCommands sẽ in (✔/✖) — không dòng nào bị thiếu.
        var dong = ra.Select(k => $"{(k.Loi ? "✖" : "✔")} {k.GiaiDoan}").ToList();
        Assert.Equal(8, dong.Count);
        Assert.Contains(dong, d => d.StartsWith("✖ ngatNet", StringComparison.Ordinal));
    }
}
