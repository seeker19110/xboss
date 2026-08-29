using System.Text.Json.Nodes;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M111 §4 — validator khối <c>drawTools.floorPolicy</c> của rule pack v12 (tầng 2), đôi của
/// <c>kiemFloorPolicy</c> bên TS. Cùng nguyên tắc v5–v9: bản phát hành KHÔNG bật lệnh mới; khai
/// bật thì phải khai đủ và đúng, thiếu/vô nghĩa là chặn ngay lúc nạp chứ không đoán.
/// </summary>
public class RulePackV12Tests
{
    private static DrawToolsPack Nap(Action<JsonObject> chinh)
    {
        var goc = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
        chinh(goc["drawTools"]!["floorPolicy"]!.AsObject());
        return DrawToolsConfig.Load(goc.ToJsonString());
    }

    private static RulePackException Loi(Action<JsonObject> chinh) =>
        Assert.Throws<RulePackException>(() => Nap(chinh));

    // ===== Bản phát hành =====

    [Fact]
    public void V12_phat_hanh_tat_lenh_nhan_tang_nhung_khai_san_tham_so_dung_duoc_ngay()
    {
        var fp = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath)).DrawTools.FloorPolicy;

        Assert.NotNull(fp);
        Assert.False(fp!.Enabled); // AC12 — mặc định tắt
        Assert.NotEmpty(fp.Floors);
        Assert.True(fp.StepMm > 0);
        Assert.Contains("{floor}", fp.ZoneNamePattern, StringComparison.Ordinal);
        Assert.NotEmpty(fp.CopyRoles);

        // Vai trò hồ sơ/trình bày KHÔNG được chép (§4 copyRolesNote, FR7).
        Assert.DoesNotContain(VaiTroVe.MatCat, fp.VaiTroChep);
        Assert.DoesNotContain(VaiTroVe.TuyenCat, fp.VaiTroChep);
        Assert.DoesNotContain(VaiTroVe.BangThongKe, fp.VaiTroChep);
    }

    [Fact]
    public void Rule_pack_v9_cu_van_nap_duoc_va_khong_co_floorPolicy()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));

        Assert.Equal("v9", pack.RulePack.Version);
        Assert.Null(pack.DrawTools.FloorPolicy); // lệnh nhân tầng từ chối chạy, không đoán mặc định
    }

    // ===== 4 lỗi validator §4 =====

    [Fact]
    public void Floors_rong_thi_chan()
    {
        var loi = Loi(fp => fp["floors"] = new JsonArray());

        Assert.Contains("floors", loi.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Floors_trung_nhan_tang_thi_chan()
    {
        var loi = Loi(fp => fp["floors"] = new JsonArray("05", "06", "05"));

        Assert.Contains("05", loi.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void StepMm_khong_duong_thi_chan()
    {
        Assert.Contains("stepMm", Loi(fp => fp["stepMm"] = 0).Message, StringComparison.Ordinal);
        Assert.Contains("stepMm", Loi(fp => fp["stepMm"] = -1).Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ZoneNamePattern_thieu_floor_thi_chan()
    {
        var loi = Loi(fp => fp["zoneNamePattern"] = "{zone}-T");

        Assert.Contains("{floor}", loi.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void CopyRoles_co_vai_tro_khong_co_that_thi_chan()
    {
        var loi = Loi(fp => fp["copyRoles"] = new JsonArray("Tim", "KhongCoVaiTroNay"));

        Assert.Contains("KhongCoVaiTroNay", loi.Message, StringComparison.Ordinal);
    }

    // ===== Các khóa còn lại =====

    [Fact]
    public void LayoutMode_la_thi_chan()
    {
        var loi = Loi(fp => fp["layoutMode"] = "cheo");

        Assert.Contains("cheo", loi.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Luoi_ma_gridColumns_khong_duong_thi_chan()
    {
        var loi = Loi(fp =>
        {
            fp["layoutMode"] = "luoi";
            fp["gridColumns"] = 0;
        });

        Assert.Contains("gridColumns", loi.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Khoi_hop_le_thi_nap_duoc_ke_ca_khi_bat()
    {
        var pack = Nap(fp => fp["enabled"] = true);

        Assert.True(pack.DrawTools.FloorPolicy!.Enabled);
    }
}
