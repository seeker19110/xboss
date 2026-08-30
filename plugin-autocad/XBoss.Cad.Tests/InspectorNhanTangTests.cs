using XBoss.Cad.Core.Inspection;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M111 PR3 — phép kiểm 19 "handle mồ côi trong bản chép tầng" (<c>nhantang-handle-mo-coi</c>),
/// bằng chứng tự động cho AC3 ("với mọi đối tượng của tầng chép, mọi handle trong XData đều phân
/// giải được và trỏ tới đối tượng CÙNG tầng chép đó"). Không có cờ <c>enabled</c> riêng trong rule
/// pack — phép TỰ TẮT khi bản vẽ không có đối tượng nhân bản tầng nào (§4/§10 quyết định 2026-08-29).
/// </summary>
public class InspectorNhanTangTests
{
    private static readonly CadRulePack Pack = RepoPaths.LoadRulePack();

    private static InspectionFinding? Tim(InspectionReport bc, string id) =>
        bc.Findings.FirstOrDefault(f => f.Id == id);

    private static DrawingSnapshot Snapshot(IReadOnlyList<FloorCopyInfo>? nhanTang) =>
        new()
        {
            Layers = [],
            Entities = [],
            InsUnits = 4, // mm
            NhanTang = nhanTang,
        };

    private const string Id = "nhantang-handle-mo-coi";

    // ===== Ca ÂM — dữ liệu sạch/thiếu dữ liệu → không báo oan =====

    [Fact]
    public void Ban_ve_khong_co_doi_tuong_nhan_tang_thi_phep_19_tu_tat()
    {
        var bc = new Inspector(Pack).Run(Snapshot(null));
        Assert.Null(Tim(bc, Id));
    }

    [Fact]
    public void Ban_chep_lanh_lan_moi_tham_chieu_deu_cung_tang_thi_khong_bao()
    {
        // Tầng 06: tim TM6 <-> biên BE6 (2 chiều) + nhãn NH6, đều thuộc cùng tầng 06.
        var bc = new Inspector(Pack).Run(Snapshot(
        [
            new FloorCopyInfo { Handle = "TM6", NhanTang = "06", HandleThamChieu = ["BE6", "NH6"] },
            new FloorCopyInfo { Handle = "BE6", NhanTang = "06", HandleThamChieu = ["TM6"] },
            new FloorCopyInfo { Handle = "NH6", NhanTang = "06", HandleThamChieu = ["TM6"] },
        ]));

        Assert.Null(Tim(bc, Id));
    }

    // ===== Ca DƯƠNG =====

    [Fact]
    public void Handle_tham_chieu_khong_ton_tai_trong_bat_ky_ban_chep_nao_thi_bao_mo_coi()
    {
        // Tim TM6 (tầng 06) trỏ HandleBien "BE_GOC" — handle này KHÔNG có trong tập bản chép nào cả
        // (điển hình: FloorReplicator.AnhXaXData bỏ sót, XData vẫn giữ handle của tầng nguồn).
        var bc = new Inspector(Pack).Run(Snapshot(
        [
            new FloorCopyInfo { Handle = "TM6", NhanTang = "06", HandleThamChieu = ["BE_GOC"] },
        ]));

        var loi = Tim(bc, Id);
        Assert.NotNull(loi);
        Assert.Equal(["TM6"], loi!.Handles);
        Assert.Single(loi.ChiTiet);
        Assert.Contains("BE_GOC", loi.ChiTiet[0], StringComparison.Ordinal);
        Assert.Contains("không tìm thấy", loi.ChiTiet[0], StringComparison.Ordinal);
    }

    [Fact]
    public void Handle_tham_chieu_ton_tai_nhung_thuoc_tang_chep_khac_thi_bao_tro_sai_tang()
    {
        // Tim TM6 (tầng 06) trỏ nhầm sang biên BE7 vốn thuộc tầng 07 — hai lệnh nhân bản đụng nhau
        // hoặc bảng ánh xạ IdMapping bị lẫn.
        var bc = new Inspector(Pack).Run(Snapshot(
        [
            new FloorCopyInfo { Handle = "TM6", NhanTang = "06", HandleThamChieu = ["BE7"] },
            new FloorCopyInfo { Handle = "TM7", NhanTang = "07", HandleThamChieu = ["BE7"] },
            new FloorCopyInfo { Handle = "BE7", NhanTang = "07", HandleThamChieu = ["TM7"] },
        ]));

        var loi = Tim(bc, Id);
        Assert.NotNull(loi);
        Assert.Equal(["TM6"], loi!.Handles);
        Assert.Single(loi.ChiTiet);
        Assert.Contains("tầng 07", loi.ChiTiet[0], StringComparison.Ordinal);
    }

    [Fact]
    public void Gop_handle_theo_doi_tuong_khong_lap_lai_dan_bao_trung()
    {
        // Một đối tượng tham chiếu 2 handle hỏng — chỉ thêm handle của NÓ vào danh sách 1 lần
        // (ThemHandle chống trùng), nhưng đủ 2 dòng chi tiết cho kỹ sư biết cả hai chỗ hỏng.
        var bc = new Inspector(Pack).Run(Snapshot(
        [
            new FloorCopyInfo { Handle = "TM6", NhanTang = "06", HandleThamChieu = ["BE_GOC", "NH_GOC"] },
        ]));

        var loi = Tim(bc, Id);
        Assert.NotNull(loi);
        Assert.Equal(["TM6"], loi!.Handles);
        Assert.Equal(2, loi.ChiTiet.Count);
    }
}
