using System.Text.Json.Nodes;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Graph;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M115 §7 FR2 — suy phụ kiện tại nút theo <c>completionPolicy.fittingRules</c>.
/// Bất biến quan trọng nhất: KHÔNG luật nào khớp thì trả <see cref="TrangThaiPhuKien.ChuaQuyet"/>,
/// KHÔNG throw và KHÔNG chọn block "gần đúng" — chọn sai phụ kiện đi thẳng vào khối lượng.
/// </summary>
public class SuyPhuKienTests
{
    private static CompletionPolicySection Cp(Action<JsonObject>? chinh = null)
    {
        var goc = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
        chinh?.Invoke(goc["drawTools"]!["completionPolicy"]!.AsObject());
        return DrawToolsConfig.Load(goc.ToJsonString()).DrawTools.CompletionPolicy!;
    }

    private static PhanLoaiNut Nut(
        LoaiNut loai, double goc, string? heId = "HVAC", string? size = "300x200",
        bool doiSize = false, int soNhanh = 2) =>
        new(0, loai, soNhanh, goc, doiSize, false, heId, size, null);

    [Fact]
    public void Doi_huong_goc_nho_ra_co_goc_lon_ra_cut()
    {
        var cp = Cp();

        var co = SuyPhuKien.SuyMotNut(Nut(LoaiNut.DoiHuong, 45), cp);
        Assert.Equal(TrangThaiPhuKien.DaChon, co.TrangThai);
        Assert.Equal("co", co.NodeKind);
        Assert.Equal("elbow-duct", co.BlockId);
        Assert.Equal("fitting", co.BlockKind);

        var cut = SuyPhuKien.SuyMotNut(Nut(LoaiNut.DoiHuong, 90), cp);
        Assert.Equal("cut", cut.NodeKind);

        // Biên nửa mở: đúng 60° đã thuộc dải cút, 59,9° còn là co.
        Assert.Equal("cut", SuyPhuKien.SuyMotNut(Nut(LoaiNut.DoiHuong, 60), cp).NodeKind);
        Assert.Equal("co", SuyPhuKien.SuyMotNut(Nut(LoaiNut.DoiHuong, 59.9), cp).NodeKind);
    }

    [Fact]
    public void Te_va_giam_tra_dung_block_cua_he()
    {
        var cp = Cp();

        Assert.Equal("tee-pipe",
            SuyPhuKien.SuyMotNut(Nut(LoaiNut.Te, 90, "PIPING", "DN80", soNhanh: 3), cp).BlockId);
        Assert.Equal("reducer-tray",
            SuyPhuKien.SuyMotNut(Nut(LoaiNut.Giam, 0, "ELECTRICAL", "300x100", doiSize: true), cp).BlockId);
    }

    [Fact]
    public void Khong_luat_nao_khop_thi_CHUA_QUYET_khong_throw_khong_doan()
    {
        var cp = Cp();

        // ELV cố ý không khai luật "giam" (thư viện chưa có reducer-tray cho hệ này).
        var giamElv = SuyPhuKien.SuyMotNut(Nut(LoaiNut.Giam, 0, "ELV", "200x100", doiSize: true), cp);
        Assert.Equal(TrangThaiPhuKien.ChuaQuyet, giamElv.TrangThai);
        Assert.Null(giamElv.BlockId);
        Assert.Contains("ELV", giamElv.LyDo);

        // Hệ chưa gán trên tuyến.
        var chuaHe = SuyPhuKien.SuyMotNut(Nut(LoaiNut.DoiHuong, 90, heId: null), cp);
        Assert.Equal(TrangThaiPhuKien.ChuaQuyet, chuaHe.TrangThai);
        Assert.Contains("chưa gán hệ", chuaHe.LyDo);

        // Ngã tư và đoạn lên/xuống: chưa có bảng luật → chưa quyết, không phải lỗi.
        Assert.Equal(TrangThaiPhuKien.ChuaQuyet,
            SuyPhuKien.SuyMotNut(Nut(LoaiNut.NgaTu, 0, soNhanh: 4), cp).TrangThai);
        Assert.Equal(TrangThaiPhuKien.ChuaQuyet,
            SuyPhuKien.SuyMotNut(Nut(LoaiNut.DoanLenXuong, 0), cp).TrangThai);
    }

    [Fact]
    public void Nut_khong_can_phu_kien()
    {
        var cp = Cp();

        foreach (var loai in new[] { LoaiNut.Nguon, LoaiNut.KetNoiThietBi, LoaiNut.Thang })
        {
            Assert.Equal(TrangThaiPhuKien.KhongCan, SuyPhuKien.SuyMotNut(Nut(loai, 0), cp).TrangThai);
        }
    }

    [Fact]
    public void Dau_tu_do_la_chua_quyet_khong_phai_khong_can()
    {
        // Đầu tự do là lỗi CHẶN (tuyến hở) ở KiemTuyen — SuyPhuKien không được ngầm coi là
        // "không cần phụ kiện" kẻo hộp thoại duyệt bỏ sót cảnh báo này.
        var cp = Cp();
        var kq = SuyPhuKien.SuyMotNut(Nut(LoaiNut.DauTuDo, 0), cp);
        Assert.Equal(TrangThaiPhuKien.ChuaQuyet, kq.TrangThai);
    }

    [Fact]
    public void Dai_co_chon_dung_luat_theo_canh_lon_va_theo_DN()
    {
        // Phân dải cỡ cho HVAC: ≤ 450 mm dùng cút nhỏ (elbow-duct), lớn hơn dùng tê (chỉ để phân
        // biệt block trong test — validator chỉ đòi id có thật trong fittings của hệ).
        var cp = Cp(c =>
        {
            c["fittingRules"] = new JsonArray(
                LuatJson("HVAC", "cut", 450, 60, 180, "elbow-duct", "Cút nhỏ"),
                LuatJson("HVAC", "cut", null, 60, 180, "damper-vcd", "Cút lớn"),
                LuatJson("PIPING", "cut", 80, 60, 180, "elbow-pipe", "Cút DN nhỏ"));
        });

        // 400x250 → cạnh lớn 400 ≤ 450 → luật nhỏ.
        Assert.Equal("elbow-duct",
            SuyPhuKien.SuyMotNut(Nut(LoaiNut.DoiHuong, 90, size: "400x250"), cp).BlockId);
        // 800x400 → cạnh lớn 800 > 450 → rơi xuống luật bắt hết.
        Assert.Equal("damper-vcd",
            SuyPhuKien.SuyMotNut(Nut(LoaiNut.DoiHuong, 90, size: "800x400"), cp).BlockId);
        // DN50 ≤ 80 → luật DN.
        Assert.Equal("elbow-pipe",
            SuyPhuKien.SuyMotNut(Nut(LoaiNut.DoiHuong, 90, "PIPING", "DN50"), cp).BlockId);
        // DN100 > 80 và PIPING không có luật bắt hết → chưa quyết.
        Assert.Equal(TrangThaiPhuKien.ChuaQuyet,
            SuyPhuKien.SuyMotNut(Nut(LoaiNut.DoiHuong, 90, "PIPING", "DN100"), cp).TrangThai);
        // Cỡ chưa đọc được thì chỉ luật bắt hết mới khớp — không đoán cỡ.
        Assert.Equal("damper-vcd",
            SuyPhuKien.SuyMotNut(Nut(LoaiNut.DoiHuong, 90, size: null), cp).BlockId);
    }

    [Fact]
    public void Nut_vua_doi_huong_vua_doi_co_van_neu_ro_con_con_giam()
    {
        var pk = SuyPhuKien.SuyMotNut(Nut(LoaiNut.DoiHuong, 90, doiSize: true), Cp());

        Assert.Equal(TrangThaiPhuKien.DaChon, pk.TrangThai);
        Assert.Equal("cut", pk.NodeKind);
        Assert.Contains("ĐỔI CỠ", pk.LyDo);
    }

    private static JsonObject LuatJson(
        string he, string nodeKind, double? maxSize, double min, double max, string blockId, string ten) =>
        new()
        {
            ["systemId"] = he,
            ["nodeKind"] = nodeKind,
            ["maxSizeMm"] = maxSize,
            ["minAngleDeg"] = min,
            ["maxAngleDeg"] = max,
            ["blockId"] = blockId,
            ["blockKind"] = "fitting",
            ["name"] = ten,
        };
}
