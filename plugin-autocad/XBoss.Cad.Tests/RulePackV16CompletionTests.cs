using System.Security.Cryptography;
using System.Text.Json.Nodes;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M115 §7 FR5 — validator khối <c>drawTools.completionPolicy</c> (rule pack v16), tầng C# của
/// "validator 2 tầng" (tầng TS: <c>kiemCompletionPolicy</c> trong <c>lib/ky-thuat/cad/rule-pack.ts</c>).
/// Cùng nguyên tắc các khối chính sách v5–v15: bản phát hành KHÔNG bật khối mới, nhưng khai rồi thì
/// phải khai ĐÚNG — sai là chặn lúc nạp, không để kỹ sư phát hiện khi đứng trước AutoCAD.
/// </summary>
public class RulePackV16CompletionTests
{
    private static DrawToolsPack Nap(Action<JsonObject> chinh)
    {
        var goc = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
        chinh(goc["drawTools"]!["completionPolicy"]!.AsObject());
        return DrawToolsConfig.Load(goc.ToJsonString());
    }

    private static RulePackException Loi(Action<JsonObject> chinh) =>
        Assert.Throws<RulePackException>(() => Nap(chinh));

    /// <summary>Một dòng fittingRules hợp lệ để test chỉnh sửa từng trường.</summary>
    private static JsonObject LuatMau() => new()
    {
        ["systemId"] = "HVAC",
        ["nodeKind"] = "te",
        ["maxSizeMm"] = null,
        ["minAngleDeg"] = 0,
        ["maxAngleDeg"] = 180,
        ["blockId"] = "tee-duct",
        ["blockKind"] = "fitting",
        ["name"] = "Tê ống gió (mẫu test)",
    };

    // ===== Bản phát hành =====

    [Fact]
    public void Ban_phat_hanh_khai_du_tham_so_hoan_thien_va_van_TAT()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath));
        var cp = pack.DrawTools.CompletionPolicy;

        Assert.NotNull(cp);
        Assert.False(cp!.Enabled); // AC5 — mọi lệnh cũ cho kết quả y hệt v15
        Assert.True(cp.NodeToleranceMm > 0);
        Assert.True(cp.EquipmentSnapMm >= cp.NodeToleranceMm);
        Assert.True(cp.ElevationToleranceMm >= 0);
        Assert.True(cp.MinTurnAngleDeg is > 0 and <= 90);

        // Guardrail M115 §2(d): nạp rule pack mới KHÔNG bật giai đoạn hoàn thiện nào.
        Assert.Equal(8, cp.StageDefaults.Count);
        Assert.All(CompletionPolicySection.TenGiaiDoan, t => Assert.False(cp.BatSan(t)));

        // Mọi luật trỏ vào phụ kiện CÓ THẬT của đúng hệ đó.
        var phuKien = pack.DrawTools.PhuKienCuaHe();
        Assert.NotEmpty(cp.FittingRules);
        foreach (var r in cp.FittingRules)
        {
            Assert.Contains(r.BlockId, phuKien[r.SystemId]);
            Assert.NotNull(r.LoaiNut);
            Assert.Equal("fitting", r.BlockKind);
        }

        // Mỗi hệ vẽ được đều có ít nhất luật co/cút và tê — thiếu thì hệ đó không suy được phụ kiện.
        foreach (var he in pack.DrawTools.Systems)
        {
            var cua = cp.FittingRules.Where(r => r.SystemId == he.Id).ToList();
            Assert.Contains(cua, r => r.LoaiNut == LoaiNutPhuKien.Co);
            Assert.Contains(cua, r => r.LoaiNut == LoaiNutPhuKien.Cut);
            Assert.Contains(cua, r => r.LoaiNut == LoaiNutPhuKien.Te);
        }
    }

    [Fact]
    public void Rule_pack_cu_khong_co_completionPolicy_van_nap_duoc()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v15.json")));

        Assert.Null(pack.DrawTools.CompletionPolicy); // → 2 lệnh mới từ chối chạy, không đoán ngầm
        Assert.NotNull(pack.DrawTools.RoutingPolicy); // v15 vẫn nạp đủ khối cũ
    }

    /// <summary>
    /// AC5 — append-only: phát hành v16 KHÔNG được đụng một byte nào của version cũ. Băm sha256
    /// từng tệp v1..v15 và khóa vào test: sửa nhầm tệp cũ (kể cả một dấu cách) là đỏ ngay.
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
    public void Version_cu_khong_doi_mot_byte_nao(string tenTep, string sha256)
    {
        var duongDan = RepoPaths.RulePackPathCua(tenTep);

        Assert.True(File.Exists(duongDan), $"Thiếu tệp rule pack đã phát hành {tenTep}");
        Assert.Equal(
            sha256,
            Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(duongDan))).ToLowerInvariant());
    }

    [Fact]
    public void v16_la_mo_rong_thuan_cua_v15_chi_them_completionPolicy()
    {
        var v15 = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPathCua("v15.json")))!.AsObject();
        var v16 = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();

        Assert.Equal("v16", v16["version"]!.GetValue<string>());
        Assert.DoesNotContain(v16.Select(k => k.Key), k => !v15.ContainsKey(k));

        // Mọi khối cấp cao ngoài version/description phải giống v15 từng ký tự.
        foreach (var (khoa, giaTri) in v15)
        {
            if (khoa is "version" or "description") continue;
            if (khoa == "drawTools")
            {
                var dt16 = v16["drawTools"]!.AsObject();
                Assert.True(dt16.ContainsKey("completionPolicy"), "v16 phải có drawTools.completionPolicy");
                foreach (var (k2, v2) in giaTri!.AsObject())
                {
                    Assert.Equal(v2!.ToJsonString(), dt16[k2]!.ToJsonString());
                }
                Assert.DoesNotContain(dt16.Select(k => k.Key), k => k != "completionPolicy" && !giaTri.AsObject().ContainsKey(k));
                continue;
            }
            Assert.Equal(giaTri!.ToJsonString(), v16[khoa]!.ToJsonString());
        }
    }

    // ===== Tham số ngưỡng =====

    [Fact]
    public void Bat_dung_sai_nut_va_ban_kinh_cham_khong_duong()
    {
        Assert.Contains("nodeToleranceMm", Loi(cp => cp["nodeToleranceMm"] = 0).Message);
        Assert.Contains("nodeToleranceMm", Loi(cp => cp["nodeToleranceMm"] = -5).Message);
        Assert.Contains("equipmentSnapMm", Loi(cp => cp["equipmentSnapMm"] = 0).Message);
    }

    [Fact]
    public void Bat_ban_kinh_cham_thiet_bi_nho_hon_dung_sai_nut()
    {
        // Nhỏ hơn dung sai gộp nút thì mọi đầu tuyến vào thiết bị đều bị báo là tuyến hở.
        var loi = Loi(cp =>
        {
            cp["nodeToleranceMm"] = 100;
            cp["equipmentSnapMm"] = 50;
        });

        Assert.Contains("equipmentSnapMm", loi.Message);
        Assert.Contains("tuyến hở", loi.Message);

        // Bằng nhau là hợp lệ.
        Assert.NotNull(Nap(cp =>
        {
            cp["nodeToleranceMm"] = 50;
            cp["equipmentSnapMm"] = 50;
        }));
    }

    [Fact]
    public void Bat_dung_sai_cao_do_am_va_goc_toi_thieu_ngoai_khoang()
    {
        Assert.Contains("elevationToleranceMm", Loi(cp => cp["elevationToleranceMm"] = -1).Message);
        Assert.NotNull(Nap(cp => cp["elevationToleranceMm"] = 0)); // 0 = đòi cao độ trùng tuyệt đối

        Assert.Contains("minTurnAngleDeg", Loi(cp => cp["minTurnAngleDeg"] = 0).Message);
        Assert.Contains("minTurnAngleDeg", Loi(cp => cp["minTurnAngleDeg"] = 91).Message);
    }

    // ===== fittingRules =====

    [Fact]
    public void Bat_id_he_la_va_block_phu_kien_troi_khoi_fittings()
    {
        var loiHe = Loi(cp =>
        {
            var luat = LuatMau();
            luat["systemId"] = "PLUMB";
            cp["fittingRules"] = new JsonArray(luat);
        });
        Assert.Contains("PLUMB", loiHe.Message);

        // tee-tray là phụ kiện CÓ THẬT nhưng của hệ khác — vẫn phải bắt.
        var loiBlock = Loi(cp =>
        {
            var luat = LuatMau();
            luat["blockId"] = "tee-tray";
            cp["fittingRules"] = new JsonArray(luat);
        });
        Assert.Contains("tee-tray", loiBlock.Message);
        Assert.Contains("HVAC", loiBlock.Message);
    }

    [Fact]
    public void Bat_nodeKind_la_va_blockKind_khong_phai_fitting()
    {
        var loiKind = Loi(cp =>
        {
            var luat = LuatMau();
            luat["nodeKind"] = "chuyen_huong";
            cp["fittingRules"] = new JsonArray(luat);
        });
        Assert.Contains("chuyen_huong", loiKind.Message);

        var loiBlockKind = Loi(cp =>
        {
            var luat = LuatMau();
            luat["blockKind"] = "equipment";
            cp["fittingRules"] = new JsonArray(luat);
        });
        Assert.Contains("blockKind", loiBlockKind.Message);
    }

    [Fact]
    public void Bat_khoang_goc_va_nguong_co_khong_hop_le()
    {
        foreach (var (min, max) in new[] { (60d, 60d), (90d, 45d), (-5d, 90d), (0d, 200d) })
        {
            var loi = Loi(cp =>
            {
                var luat = LuatMau();
                luat["minAngleDeg"] = min;
                luat["maxAngleDeg"] = max;
                cp["fittingRules"] = new JsonArray(luat);
            });
            Assert.Contains("khoảng góc", loi.Message);
        }

        var loiCo = Loi(cp =>
        {
            var luat = LuatMau();
            luat["maxSizeMm"] = 0;
            cp["fittingRules"] = new JsonArray(luat);
        });
        Assert.Contains("maxSizeMm", loiCo.Message);

        // Dải cỡ dương là hợp lệ — validator đã sẵn sàng nhận phân dải ở version sau.
        Assert.NotNull(Nap(cp =>
        {
            var luat = LuatMau();
            luat["maxSizeMm"] = 450;
            cp["fittingRules"] = new JsonArray(luat);
        }));
    }

    [Fact]
    public void Bat_luat_co_cut_nam_tron_duoi_nguong_coi_la_tuyen_thang()
    {
        var loi = Loi(cp =>
        {
            cp["minTurnAngleDeg"] = 10;
            var luat = LuatMau();
            luat["nodeKind"] = "co";
            luat["blockId"] = "elbow-duct";
            luat["minAngleDeg"] = 0;
            luat["maxAngleDeg"] = 8;
            cp["fittingRules"] = new JsonArray(luat);
        });

        Assert.Contains("minTurnAngleDeg", loi.Message);
        Assert.Contains("không bao giờ được xét", loi.Message);
    }

    [Fact]
    public void Bat_hai_luat_cung_he_cung_loai_nut_chong_lan_khoang_goc()
    {
        var loi = Loi(cp =>
        {
            var a = LuatMau();
            a["nodeKind"] = "cut";
            a["blockId"] = "elbow-duct";
            a["minAngleDeg"] = 30;
            a["maxAngleDeg"] = 120;
            a["name"] = "Cút A";
            var b = LuatMau();
            b["nodeKind"] = "cut";
            b["blockId"] = "elbow-duct";
            b["minAngleDeg"] = 100;
            b["maxAngleDeg"] = 180;
            b["name"] = "Cút B";
            cp["fittingRules"] = new JsonArray(a, b);
        });

        Assert.Contains("chồng lấn", loi.Message);
        Assert.Contains("Cút A", loi.Message);

        // Kề nhau (nửa mở) thì KHÔNG chồng: [30;100) và [100;180).
        Assert.NotNull(Nap(cp =>
        {
            var a = LuatMau();
            a["nodeKind"] = "cut";
            a["blockId"] = "elbow-duct";
            a["minAngleDeg"] = 30;
            a["maxAngleDeg"] = 100;
            var b = LuatMau();
            b["nodeKind"] = "cut";
            b["blockId"] = "elbow-duct";
            b["minAngleDeg"] = 100;
            b["maxAngleDeg"] = 180;
            cp["fittingRules"] = new JsonArray(a, b);
        }));
    }

    // ===== stageDefaults =====

    [Fact]
    public void Bat_stageDefaults_thieu_khoa_hoac_khoa_la()
    {
        var loiThieu = Loi(cp => cp["stageDefaults"]!.AsObject().Remove("tag"));
        Assert.Contains("tag", loiThieu.Message);
        Assert.Contains("thiếu giai đoạn", loiThieu.Message);

        var loiThua = Loi(cp => cp["stageDefaults"]!["veThem"] = false);
        Assert.Contains("veThem", loiThua.Message);
    }

    [Fact]
    public void Bat_bat_khoi_ma_khong_giai_doan_nao_bat()
    {
        var loi = Loi(cp => cp["enabled"] = true);
        Assert.Contains("cả 8 giai đoạn đều tắt", loi.Message);

        // Bật khối kèm ít nhất một giai đoạn là hợp lệ.
        var pack = Nap(cp =>
        {
            cp["enabled"] = true;
            cp["stageDefaults"]!["netDoi"] = true;
        });
        Assert.True(pack.DrawTools.CompletionPolicy!.BatSan("netDoi"));
        Assert.False(pack.DrawTools.CompletionPolicy.BatSan("tag"));
    }

    [Fact]
    public void Thu_tu_8_giai_doan_la_hop_dong_khoa_cung()
    {
        Assert.Equal(
            ["netDoi", "phuKienTaiNut", "chiaDot", "giaDo", "loCho", "ngatNet", "tag", "thongKe"],
            CompletionPolicySection.TenGiaiDoan);
    }
}
