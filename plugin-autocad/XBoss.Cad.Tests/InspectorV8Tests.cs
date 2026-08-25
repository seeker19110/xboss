using System.Text.Json.Nodes;
using XBoss.Cad.Core.Inspection;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M102 §6.4/§6.5 — 2 phép kiểm mới của rule pack v8 (số 17 tag trùng, 18 mã BOQ mồ côi). Mỗi phép
/// có ca DƯƠNG (bắt đúng lỗi), ca ÂM (dữ liệu sạch → không báo oan) và ca TỰ TẮT (thiếu dữ liệu
/// đầu vào), cộng bằng chứng AC7: v8 để mặc định cho kết quả y HỆT v7 trên cùng snapshot.
/// </summary>
public class InspectorV8Tests
{
    private static readonly CadRulePack V8 = RepoPaths.LoadRulePack();

    /// <summary>Bật một phép kiểm bằng cách chỉnh rule pack THẬT rồi nạp lại qua validator thật.</summary>
    private static CadRulePack PackBat(string tenPhep, Action<JsonObject>? chinhPack = null)
    {
        var goc = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
        goc["inspectionPolicy"]![tenPhep]!.AsObject()["enabled"] = true;
        chinhPack?.Invoke(goc);
        return RulePackLoader.Load(goc.ToJsonString());
    }

    private static InspectionFinding? Tim(InspectionReport bc, string id) =>
        bc.Findings.FirstOrDefault(f => f.Id == id);

    private static DrawingSnapshot Snapshot(
        IReadOnlyList<TagInfo>? tags = null, IReadOnlyList<EntityInfo>? entities = null) =>
        new()
        {
            Layers = [],
            Entities = entities ?? [],
            InsUnits = 4, // mm
            Tags = tags,
        };

    private static EntityInfo Ent(string handle, string layer) =>
        new() { Handle = handle, Layer = layer, Kind = EntityKind.Other };

    /// <summary>Gán mã BOQ cho một số hạng mục — mô phỏng rule pack phát hành theo dự án (M101 PR4).</summary>
    private static Action<JsonObject> GanMa(params (string Id, string Ma)[] gan) => goc =>
    {
        foreach (var item in goc["takeoff"]!["items"]!.AsArray())
        {
            var o = item!.AsObject();
            var found = gan.FirstOrDefault(g => g.Id == (string)o["id"]!);
            if (found.Id is not null) o["boqCode"] = found.Ma;
        }
    };

    // ===== AC7 — v8 mặc định không đổi hành vi =====

    [Fact]
    public void AC7_v8_mac_dinh_cho_ket_qua_y_het_v7_tren_cung_du_lieu()
    {
        var v7 = RulePackLoader.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v7.json")));
        var snapshot = Snapshot(
            tags:
            [
                new TagInfo { Handle = "A1", Tag = "T-05", HeLayer = "M-DUCT-SUPP" },
                new TagInfo { Handle = "A2", Tag = "T-05", HeLayer = "M-DUCT-SUPP" },
            ],
            entities: [Ent("E1", "M-DUCT-SUPP")]);

        var bcV7 = new Inspector(v7).Run(snapshot);
        var bcV8 = new Inspector(V8).Run(snapshot);

        Assert.Equal(
            bcV7.Findings.Select(f => f.Id).ToList(),
            bcV8.Findings.Select(f => f.Id).ToList());
        Assert.Null(Tim(bcV8, "tag-trung"));
        Assert.Null(Tim(bcV8, "ma-boq-mo-coi"));
    }

    // ===== (17) Tag trùng =====

    [Fact]
    public void Tag_trung_trong_cung_he_thi_bao_kem_du_ca_hai_handle()
    {
        var bc = new Inspector(PackBat("tagDuplicate")).Run(Snapshot(tags:
        [
            new TagInfo { Handle = "A1", Tag = "T-05", HeLayer = "M-DUCT-SUPP" },
            new TagInfo { Handle = "A2", Tag = "T-05", HeLayer = "M-DUCT-SUPP" },
            new TagInfo { Handle = "A3", Tag = "T-06", HeLayer = "M-DUCT-SUPP" },
        ]));

        var loi = Tim(bc, "tag-trung");
        Assert.NotNull(loi);
        Assert.Equal(["A1", "A2"], loi!.Handles);
        Assert.Single(loi.ChiTiet);
        Assert.Contains("T-05", loi.ChiTiet[0], StringComparison.Ordinal);
    }

    [Fact]
    public void Cung_tag_o_hai_he_khac_nhau_khong_phai_loi()
    {
        // Mỗi hệ đánh số riêng từ 1 là quy ước bình thường — báo ở đây là báo oan.
        var bc = new Inspector(PackBat("tagDuplicate")).Run(Snapshot(tags:
        [
            new TagInfo { Handle = "A1", Tag = "T-01", HeLayer = "M-DUCT-SUPP" },
            new TagInfo { Handle = "A2", Tag = "T-01", HeLayer = "P-PIPE-DOMW" },
        ]));

        Assert.Null(Tim(bc, "tag-trung"));
    }

    [Fact]
    public void Ban_ve_khong_co_tag_xdata_thi_phep_17_tu_tat()
    {
        // Tags = null (Adapter chưa quét / bản vẽ vẽ tay) → không báo dù rule pack đã bật.
        var bc = new Inspector(PackBat("tagDuplicate")).Run(Snapshot(tags: null));
        Assert.Null(Tim(bc, "tag-trung"));
    }

    [Fact]
    public void Tag_rong_khong_tinh_la_trung()
    {
        var bc = new Inspector(PackBat("tagDuplicate")).Run(Snapshot(tags:
        [
            new TagInfo { Handle = "A1", Tag = "", HeLayer = "M-DUCT-SUPP" },
            new TagInfo { Handle = "A2", Tag = "   ", HeLayer = "M-DUCT-SUPP" },
        ]));

        Assert.Null(Tim(bc, "tag-trung"));
    }

    // ===== (18) Mã BOQ mồ côi =====

    [Fact]
    public void Hang_muc_co_doi_tuong_ma_thieu_ma_boq_thi_bao_o_cap_hang_muc()
    {
        // Rule pack theo dự án: duct-supp có mã, duct-retn chưa — trên bản vẽ có cả hai layer.
        var pack = PackBat("boqCodeMissing", GanMa(("duct-supp", "MEP.01")));
        var bc = new Inspector(pack).Run(Snapshot(entities:
            [Ent("E1", "M-DUCT-SUPP"), Ent("E2", "M-DUCT-RETN")]));

        var loi = Tim(bc, "ma-boq-mo-coi");
        Assert.NotNull(loi);
        Assert.Empty(loi!.Handles); // lỗi ở cấp hạng mục, không marker từng đối tượng
        Assert.Single(loi.ChiTiet);
        Assert.Contains("duct-retn", loi.ChiTiet[0], StringComparison.Ordinal);
    }

    [Fact]
    public void Hang_muc_thieu_ma_nhung_ban_ve_khong_co_doi_tuong_nao_thi_khong_bao()
    {
        var pack = PackBat("boqCodeMissing", GanMa(("duct-supp", "MEP.01")));
        var bc = new Inspector(pack).Run(Snapshot(entities: [Ent("E1", "M-DUCT-SUPP")]));

        Assert.Null(Tim(bc, "ma-boq-mo-coi"));
    }

    [Fact]
    public void Rule_pack_toan_cuc_chua_gan_ma_nao_thi_phep_18_tu_tat()
    {
        // Bản toàn cục: mọi boqCode rỗng → báo tất cả chỉ là nhiễu, phép tự tắt.
        var bc = new Inspector(PackBat("boqCodeMissing")).Run(Snapshot(entities:
            [Ent("E1", "M-DUCT-SUPP"), Ent("E2", "M-DUCT-RETN")]));

        Assert.Null(Tim(bc, "ma-boq-mo-coi"));
    }
}
