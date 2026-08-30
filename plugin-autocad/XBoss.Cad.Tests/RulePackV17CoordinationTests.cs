using System.Security.Cryptography;
using System.Text.Json.Nodes;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M116 §7 FR5 — validator khối <c>drawTools.coordinationPolicy</c> (rule pack v17), tầng C# của
/// "validator 2 tầng" (tầng TS: <c>kiemCoordinationPolicy</c> trong <c>lib/ky-thuat/cad/rule-pack.ts</c>).
/// Cùng nguyên tắc các khối chính sách v5–v16: bản phát hành KHÔNG bật khối mới, nhưng khai rồi thì
/// phải khai ĐÚNG — sai là chặn lúc nạp, không để kỹ sư phát hiện khi đứng trước AutoCAD.
/// </summary>
public class RulePackV17CoordinationTests
{
    private static DrawToolsPack Nap(Action<JsonObject> chinh)
    {
        var goc = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
        chinh(goc["drawTools"]!["coordinationPolicy"]!.AsObject());
        return DrawToolsConfig.Load(goc.ToJsonString());
    }

    private static RulePackException Loi(Action<JsonObject> chinh) =>
        Assert.Throws<RulePackException>(() => Nap(chinh));

    /// <summary>Một dòng minClearancePairsMm hợp lệ để test chỉnh sửa từng trường.</summary>
    private static JsonObject CapMau() => new()
    {
        ["systemA"] = "ELECTRICAL",
        ["systemB"] = "PIPING",
        ["minClearanceMm"] = 300,
    };

    // ===== Bản phát hành =====

    [Fact]
    public void Ban_phat_hanh_khai_du_tham_so_phoi_hop_va_van_TAT()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath));
        var cp = pack.DrawTools.CoordinationPolicy;

        Assert.NotNull(cp);
        Assert.False(cp!.Enabled); // AC4 — mọi lệnh cũ cho kết quả y hệt v16
        Assert.Equal("crossingPolicy", cp.PriorityFrom);
        Assert.True(cp.MaintenanceGapMm >= 0);

        // Bảng khoảng cách quy phạm để RỖNG: ngưỡng khác nhau theo tiêu chuẩn từng dự án, XBoss
        // không đoán hộ (cùng mặc định an toàn với inspectionPolicy.clash2d.clashPairs).
        Assert.Empty(cp.MinClearancePairsMm);
        Assert.Null(cp.NguongKhoangCachMm("ELECTRICAL", "PIPING"));

        // Bảng ưu tiên THAM CHIẾU crossingPolicy chứ không chép lại — và phải phân giải ra danh
        // sách hệ có thật.
        var hang = cp.HangUuTien(pack.DrawTools.CrossingPolicy);
        Assert.NotEmpty(hang);
        Assert.Equal(pack.DrawTools.CrossingPolicy!.Priority, hang);
        var heThat = pack.DrawTools.Systems.Select(s => s.Id).ToHashSet(StringComparer.Ordinal);
        Assert.All(hang, id => Assert.Contains(id, heThat));
    }

    [Fact]
    public void Rule_pack_cu_khong_co_coordinationPolicy_van_nap_duoc()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v16.json")));

        Assert.Null(pack.DrawTools.CoordinationPolicy); // → bộ lệnh phối hợp từ chối chạy, không đoán ngầm
        Assert.NotNull(pack.DrawTools.CompletionPolicy); // v16 vẫn nạp đủ khối cũ
    }

    /// <summary>
    /// AC4 — append-only: phát hành v17 KHÔNG được đụng một byte nào của version cũ. Băm sha256
    /// từng tệp v1..v16 và khóa vào test: sửa nhầm tệp cũ (kể cả một dấu cách) là đỏ ngay.
    /// Đổi hằng số ở đây = tự nhận đã phá luật append-only, không phải "sửa test cho xanh".
    /// </summary>
    [Theory]
    [InlineData("v1.json", "5f8d3d13f0891adbbe47399b42e450f9c173eb37a6a69acbeaa66fc72fe13ea9")]
    [InlineData("v2.json", "0ef7ab8a51b5abb6cd6e1f4ebf6d4bf8495c1bbc3be206dda3ee5f02acbca85f")]
    [InlineData("v3.json", "917b912ac083c5a1a9ecd0c4537219bd2415a5a9e4824fec54663a04aeec4839")]
    [InlineData("v4.json", "a733ccc5e0af9f0a8af84dda7a167b796aea778e8147a618a34f4a2eace15f2e")]
    [InlineData("v5.json", "cf687e9674935abb05ec7d26076b2eacde706389e4967f7c31fb9a16e0b4c41f")]
    [InlineData("v6.json", "65879104cf85b288c202c1cc5b9a69547d161e08297b114b4e543f866da35c7d")]
    [InlineData("v7.json", "3a39f600de882d009e37302d0ff9e06b49f51fc8b0092006f63ea4b51c0731f7")]
    [InlineData("v8.json", "cd40803c73b6526a196904b7c236ea13d749b94d7a367c91687ad04671b540b3")]
    [InlineData("v9.json", "8b9abd3000d7fd9f692037ff6ddb7e0b129d7b3d463106e2ef5dd22cdced56e6")]
    [InlineData("v10.json", "4eb3454f67257d8878aadb0f51270fa5940a3f5c3d1672dc25ee222ec14bb293")]
    [InlineData("v12.json", "1e0f1790580a9acfa64f7c592b3758eff554e7b8c256797c68c24508eee653f7")]
    [InlineData("v13.json", "d0c313473697ab0148315b461be7319a4249d40019b4f88cc5f75eefe32809b8")]
    [InlineData("v14.json", "71b568e0e90d0cc5f8ebe45566324541589ac5f4f6a512295d282ad235c33b76")]
    [InlineData("v15.json", "232f2e15af0539784eb2ac91c6bb07f0aea651996493d9970238eea90629c0b0")]
    [InlineData("v16.json", "3c52138c690f8fed7fac4452d03ae368f9de95508ce9240adf17d2bddadac243")]
    public void Version_cu_khong_doi_mot_byte_nao(string tenTep, string sha256)
    {
        var duongDan = RepoPaths.RulePackPathCua(tenTep);

        Assert.True(File.Exists(duongDan), $"Thiếu tệp rule pack đã phát hành {tenTep}");
        Assert.Equal(
            sha256,
            Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(duongDan))).ToLowerInvariant());
    }

    [Fact]
    public void v17_la_mo_rong_thuan_cua_v16_chi_them_coordinationPolicy()
    {
        var v16 = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPathCua("v16.json")))!.AsObject();
        var v17 = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();

        Assert.Equal("v17", v17["version"]!.GetValue<string>());
        Assert.DoesNotContain(v17.Select(k => k.Key), k => !v16.ContainsKey(k));

        // Mọi khối cấp cao ngoài version/description phải giống v16 từng ký tự.
        foreach (var (khoa, giaTri) in v16)
        {
            if (khoa is "version" or "description") continue;
            if (khoa == "drawTools")
            {
                var dt17 = v17["drawTools"]!.AsObject();
                Assert.True(dt17.ContainsKey("coordinationPolicy"), "v17 phải có drawTools.coordinationPolicy");
                foreach (var (k2, v2) in giaTri!.AsObject())
                {
                    Assert.Equal(v2!.ToJsonString(), dt17[k2]!.ToJsonString());
                }
                Assert.DoesNotContain(
                    dt17.Select(k => k.Key),
                    k => k != "coordinationPolicy" && !giaTri.AsObject().ContainsKey(k));
                continue;
            }
            Assert.Equal(giaTri!.ToJsonString(), v17[khoa]!.ToJsonString());
        }
    }

    // ===== priorityFrom + bảng ưu tiên =====

    [Fact]
    public void Bat_priorityFrom_la()
    {
        var loi = Loi(cp => cp["priorityFrom"] = "routingPolicy");

        Assert.Contains("priorityFrom", loi.Message);
        Assert.Contains("routingPolicy", loi.Message);
    }

    [Fact]
    public void Bat_bat_khoi_ma_bang_uu_tien_rong()
    {
        // Bật quét mà crossingPolicy.priority rỗng: vẫn tìm ra xung đột nhưng không suy được ai nhường.
        var loi = Assert.Throws<RulePackException>(() =>
        {
            var goc = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
            goc["drawTools"]!["crossingPolicy"]!["priority"] = new JsonArray();
            goc["drawTools"]!["coordinationPolicy"]!["enabled"] = true;
            return DrawToolsConfig.Load(goc.ToJsonString());
        });

        Assert.Contains("crossingPolicy.priority", loi.Message);

        // Còn TẮT thì bảng ưu tiên rỗng chưa gây hại — chỉ là chưa dùng tới.
        var goc2 = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
        goc2["drawTools"]!["crossingPolicy"]!["priority"] = new JsonArray();
        Assert.NotNull(DrawToolsConfig.Load(goc2.ToJsonString()));
    }

    [Fact]
    public void Bat_khoi_kem_bang_uu_tien_du_thi_nap_duoc()
    {
        var pack = Nap(cp => cp["enabled"] = true);

        Assert.True(pack.DrawTools.CoordinationPolicy!.Enabled);
        Assert.NotEmpty(pack.DrawTools.CoordinationPolicy.HangUuTien(pack.DrawTools.CrossingPolicy));
    }

    // ===== maintenanceGapMm =====

    [Fact]
    public void Bat_khoang_bao_tri_am_nhung_cho_phep_bang_0()
    {
        var loi = Loi(cp => cp["maintenanceGapMm"] = -1);
        Assert.Contains("maintenanceGapMm", loi.Message);

        // 0 = không chừa khoảng bảo trì (bề rộng khai đã gồm khoảng thao tác) — hợp lệ.
        Assert.Equal(0, Nap(cp => cp["maintenanceGapMm"] = 0).DrawTools.CoordinationPolicy!.MaintenanceGapMm);
    }

    // ===== minClearancePairsMm =====

    [Fact]
    public void Nhan_cap_khoang_cach_hop_le_va_tra_dung_nguong_theo_ca_hai_chieu()
    {
        var pack = Nap(cp => cp["minClearancePairsMm"] = new JsonArray(CapMau()));
        var cp = pack.DrawTools.CoordinationPolicy!;

        Assert.Equal(300, cp.NguongKhoangCachMm("ELECTRICAL", "PIPING"));
        Assert.Equal(300, cp.NguongKhoangCachMm("PIPING", "ELECTRICAL"));
        Assert.Null(cp.NguongKhoangCachMm("HVAC", "PIPING"));
    }

    [Fact]
    public void Bat_id_he_la_trong_cap_khoang_cach()
    {
        var loi = Loi(cp =>
        {
            var cap = CapMau();
            cap["systemB"] = "PLUMB";
            cp["minClearancePairsMm"] = new JsonArray(cap);
        });

        Assert.Contains("PLUMB", loi.Message);
        Assert.Contains("systemB", loi.Message);
    }

    [Fact]
    public void Bat_cap_cung_mot_he_va_nguong_khong_duong()
    {
        var loiCungHe = Loi(cp =>
        {
            var cap = CapMau();
            cap["systemB"] = "ELECTRICAL";
            cp["minClearancePairsMm"] = new JsonArray(cap);
        });
        Assert.Contains("cùng một hệ", loiCungHe.Message);

        foreach (var xau in new[] { 0, -50 })
        {
            var loi = Loi(cp =>
            {
                var cap = CapMau();
                cap["minClearanceMm"] = xau;
                cp["minClearancePairsMm"] = new JsonArray(cap);
            });
            Assert.Contains("minClearanceMm", loi.Message);
        }
    }

    [Fact]
    public void Bat_cap_he_khai_trung_ke_ca_khi_dao_thu_tu()
    {
        var loi = Loi(cp =>
        {
            var a = CapMau();
            var b = CapMau();
            b["systemA"] = "PIPING";
            b["systemB"] = "ELECTRICAL";
            b["minClearanceMm"] = 500;
            cp["minClearancePairsMm"] = new JsonArray(a, b);
        });

        Assert.Contains("khai trùng", loi.Message);

        // Cặp KHÁC nhau thì khai bao nhiêu dòng cũng được.
        Assert.NotNull(Nap(cp =>
        {
            var a = CapMau();
            var b = CapMau();
            b["systemB"] = "FIREFIGHTING";
            cp["minClearancePairsMm"] = new JsonArray(a, b);
        }));
    }
}
