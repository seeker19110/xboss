using System.Text.Json.Nodes;
using XBoss.Cad.Core.Inspection;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M101 PR1 — 7 phép kiểm mới của rule pack v5 (§6.1, số 10..16). Mỗi phép có ca DƯƠNG (bắt đúng lỗi)
/// và ca ÂM (dữ liệu sạch/thiếu dữ liệu → KHÔNG báo oan), cộng bằng chứng then chốt:
/// v5 để mặc định cho kết quả y HỆT v4 trên cùng một snapshot (M101 AC(a)).
/// </summary>
public class InspectorV5Tests
{
    private static readonly CadRulePack V5 = RepoPaths.LoadRulePack();

    /// <summary>Nạp lại rule pack đang phát hành sau khi chỉnh khối của một phép kiểm — cách duy nhất
    /// bật phép kiểm trong test mà vẫn đi qua validator thật (không dựng pack giả trong bộ nhớ).</summary>
    private static CadRulePack PackBat(string tenPhep, Action<JsonObject>? chinh = null)
    {
        var goc = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
        var khoi = goc["inspectionPolicy"]![tenPhep]!.AsObject();
        khoi["enabled"] = true;
        chinh?.Invoke(khoi);
        return RulePackLoader.Load(goc.ToJsonString());
    }

    private static InspectionFinding? Tim(InspectionReport bc, string id) =>
        bc.Findings.FirstOrDefault(f => f.Id == id);

    private static CenterlineInfo Tim(string handle, string layer, params (double X, double Y)[] dinh) =>
        new() { Handle = handle, Layer = layer, Vertices = dinh };

    private static DrawingSnapshot Snapshot(
        IReadOnlyList<EntityInfo>? entities = null,
        IReadOnlyList<CenterlineInfo>? centerlines = null,
        IReadOnlyList<LayoutInfo>? layouts = null,
        IReadOnlyList<LabelLinkInfo>? nhan = null) =>
        new()
        {
            Layers = [],
            Entities = entities ?? [],
            InsUnits = 4, // mm
            Centerlines = centerlines,
            Layouts = layouts,
            NhanLienKet = nhan,
        };

    // ===== AC(a) — v5 mặc định KHÔNG đổi hành vi =====

    [Fact]
    public void AC_a_v5_mac_dinh_cho_ket_qua_y_het_v4_tren_cung_du_lieu()
    {
        var v4 = RulePackLoader.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v4.json")));
        var snapshot = SnapshotViPhamDuMoiPhep();

        var bcV4 = new Inspector(v4).Run(snapshot).DongDau("MB-TANG-05.dwg", "2026-08-25");
        var bcV5 = new Inspector(V5).Run(snapshot).DongDau("MB-TANG-05.dwg", "2026-08-25");

        // Chỉ khác đúng nhãn version; toàn bộ findings/cảnh báo/tổng số lỗi giống hệt.
        Assert.Equal(
            bcV4.ToJson().Replace("\"rulePackVersion\": \"v4\"", "\"rulePackVersion\": \"v5\""),
            bcV5.ToJson());
        Assert.DoesNotContain(bcV5.Findings, f => f.Id is "chong-lan-cung-he" or "giao-cat-khac-he"
            or "khung-ten-thieu-truong" or "viewport-le-chuan" or "style-lech-chuan"
            or "nhan-lech-xdata" or "doi-tuong-ngoai-khung");
    }

    /// <summary>Một snapshot vi phạm CẢ 7 phép kiểm mới — dùng để chứng minh "tắt là im lặng".</summary>
    private static DrawingSnapshot SnapshotViPhamDuMoiPhep() => new()
    {
        Layers = [],
        Entities =
        [
            new EntityInfo { Handle = "T1", Layer = "0", Kind = EntityKind.Text, TextStyleName = "STYLE_LA" },
            new EntityInfo { Handle = "D1", Layer = "0", Kind = EntityKind.Dimension, DimStyleName = "DIM_LA" },
            .. ThucTheCoBao(),
        ],
        InsUnits = 4,
        Centerlines =
        [
            Tim("C1", "M-DUCT-SUPP", (0, 0), (10000, 0)),
            Tim("C2", "M-DUCT-SUPP", (0, 20), (10000, 20)),
            Tim("C3", "P-PIPE-DOMW", (5000, -5000), (5000, 5000)),
        ],
        Layouts =
        [
            new LayoutInfo
            {
                Name = "SHOP-HVAC-01",
                Viewports = [new ViewportInfo { Handle = "V1", ScaleDenominator = 75, IsLocked = false }],
                BlockRefs = [new BlockRefInfo { Handle = "B1", BlockName = "TITLEBLOCK-A1" }],
            },
        ],
        NhanLienKet =
        [
            new LabelLinkInfo { Handle = "N1", NoiDung = "300x200", TimHandle = "C1", SizeTheoXData = "400x200" },
        ],
    };

    // ===== (10) Chồng lấn tuyến cùng hệ =====

    [Fact]
    public void Phep10_bat_hai_tim_cung_layer_ve_de_nhau()
    {
        var pack = PackBat("overlapSameSystem");
        var bc = new Inspector(pack).Run(Snapshot(centerlines:
        [
            Tim("C1", "M-DUCT-SUPP", (0, 0), (10000, 0)),
            Tim("C2", "M-DUCT-SUPP", (0, 20), (10000, 20)), // lệch 20mm ≤ 50mm, chồng 10m
        ]));
        var f = Tim(bc, "chong-lan-cung-he");
        Assert.NotNull(f);
        Assert.Equal(["C1", "C2"], f.Handles);
        Assert.Contains("10000mm", Assert.Single(f.ChiTiet));
    }

    [Fact]
    public void Phep10_khong_bao_oan_khi_cach_xa_hoac_chong_qua_ngan()
    {
        var pack = PackBat("overlapSameSystem");
        var bc = new Inspector(pack).Run(Snapshot(centerlines:
        [
            Tim("C1", "M-DUCT-SUPP", (0, 0), (10000, 0)),
            Tim("C2", "M-DUCT-SUPP", (0, 500), (10000, 500)),  // song song nhưng cách 500mm > 50mm
            Tim("C3", "M-DUCT-SUPP", (0, 10), (300, 10)),      // sát nhưng chỉ chồng 300mm < 500mm
            Tim("C4", "M-DUCT-RETN", (0, 5), (10000, 5)),      // sát C1 nhưng KHÁC layer (khác hệ)
        ]));
        Assert.Null(Tim(bc, "chong-lan-cung-he"));
    }

    // ===== (11) Giao cắt khác hệ (clash 2D) =====

    [Fact]
    public void Phep11_bat_giao_cat_khac_he_kem_canh_bao_co_dinh_ve_clash_3D()
    {
        var pack = PackBat("clash2d", k => k["clashPairs"] = new JsonArray(new JsonArray("HVAC", "PIPING")));
        var bc = new Inspector(pack).Run(Snapshot(centerlines:
        [
            Tim("C1", "M-DUCT-SUPP", (0, 0), (10000, 0)),
            Tim("C2", "P-PIPE-DOMW", (5000, -5000), (5000, 5000)),
        ]));
        var f = Tim(bc, "giao-cat-khac-he");
        Assert.NotNull(f);
        Assert.Contains("(mặt bằng)", f.Ten);
        Assert.Contains("clash 3D", f.Ten);
        Assert.Contains("(5000, 0)", Assert.Single(f.ChiTiet));
        // Nhãn cảnh báo cố định phải nằm trong báo cáo, không chỉ trong tên phép kiểm.
        Assert.Contains(PhepKiemMoRong.CanhBaoClash2d, bc.CanhBao);
    }

    [Fact]
    public void Phep11_khong_bao_cap_he_khong_khai_va_khong_bao_cung_he()
    {
        var pack = PackBat("clash2d", k => k["clashPairs"] = new JsonArray(new JsonArray("HVAC", "PIPING")));
        var bc = new Inspector(pack).Run(Snapshot(centerlines:
        [
            Tim("C1", "M-DUCT-SUPP", (0, 0), (10000, 0)),
            Tim("C2", "M-DUCT-RETN", (5000, -5000), (5000, 5000)),   // cùng hệ HVAC
            Tim("C3", "E-TRAY-PWRR", (7000, -5000), (7000, 5000)),   // cặp HVAC×ELECTRICAL chưa khai
            Tim("C4", "LAYER_LA", (9000, -5000), (9000, 5000)),      // layer không quy được về hệ
        ]));
        Assert.Null(Tim(bc, "giao-cat-khac-he"));
        Assert.DoesNotContain(PhepKiemMoRong.CanhBaoClash2d, bc.CanhBao);
    }

    // ===== (12) Khung tên thiếu trường =====

    [Fact]
    public void Phep12_bat_khung_ten_thieu_truong_bat_buoc()
    {
        var pack = PackBat("titleblockFields");
        var bc = new Inspector(pack).Run(Snapshot(layouts:
        [
            new LayoutInfo
            {
                Name = "SHOP-HVAC-01",
                BlockRefs =
                [
                    new BlockRefInfo
                    {
                        Handle = "B1",
                        BlockName = "TITLEBLOCK-A1",
                        Attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                        {
                            ["DU_AN"] = "TT AVIO", ["HANG_MUC"] = "MEP", ["TEN_BAN_VE"] = "  ",
                            ["MA_BAN_VE"] = "M-01", ["TY_LE"] = "1:100",
                        },
                    },
                ],
            },
        ]));
        var f = Tim(bc, "khung-ten-thieu-truong");
        Assert.NotNull(f);
        Assert.Equal(["B1"], f.Handles);
        var chiTiet = Assert.Single(f.ChiTiet);
        Assert.Contains("TEN_BAN_VE", chiTiet); // để rỗng
        Assert.Contains("NGAY", chiTiet);       // thiếu hẳn
    }

    [Fact]
    public void Phep12_khong_bao_khi_du_truong_hoac_block_khong_phai_khung_ten()
    {
        var pack = PackBat("titleblockFields");
        var duTruong = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["DU_AN"] = "TT AVIO", ["HANG_MUC"] = "MEP", ["TEN_BAN_VE"] = "Mặt bằng tầng 5",
            ["MA_BAN_VE"] = "M-01", ["TY_LE"] = "1:100", ["NGAY"] = "2026-08-25",
        };
        var bc = new Inspector(pack).Run(Snapshot(layouts:
        [
            new LayoutInfo
            {
                Name = "SHOP-HVAC-01",
                BlockRefs =
                [
                    new BlockRefInfo { Handle = "B1", BlockName = "TITLEBLOCK-A1", Attributes = duTruong },
                    // Block thường (không phải khung tên) rỗng attribute → không đụng tới.
                    new BlockRefInfo { Handle = "B2", BlockName = "FCU-600" },
                    // Manifest M100 khẳng định KHÔNG phải khung tên dù tên có chữ TITLE.
                    new BlockRefInfo { Handle = "B3", BlockName = "TITLE-NOTE", IsTitleblock = false },
                ],
            },
        ]));
        Assert.Null(Tim(bc, "khung-ten-thieu-truong"));
    }

    // ===== (13) Viewport không khóa / tỉ lệ lạ =====

    [Fact]
    public void Phep13_bat_viewport_chua_khoa_va_ti_le_ngoai_danh_muc()
    {
        var pack = PackBat("viewportScale");
        var bc = new Inspector(pack).Run(Snapshot(layouts:
        [
            new LayoutInfo
            {
                Name = "SHOP-HVAC-01",
                Viewports =
                [
                    new ViewportInfo { Handle = "V1", ScaleDenominator = 50, IsLocked = false },
                    new ViewportInfo { Handle = "V2", ScaleDenominator = 75, IsLocked = true },
                ],
            },
        ]));
        var f = Tim(bc, "viewport-le-chuan");
        Assert.NotNull(f);
        Assert.Equal(["V1", "V2"], f.Handles);
        Assert.Contains("chưa khóa", f.ChiTiet[0]);
        Assert.Contains("1:75", f.ChiTiet[1]);
    }

    [Fact]
    public void Phep13_khong_bao_viewport_dung_chuan_va_bo_qua_ti_le_khong_doc_duoc()
    {
        var pack = PackBat("viewportScale");
        var bc = new Inspector(pack).Run(Snapshot(layouts:
        [
            new LayoutInfo
            {
                Name = "SHOP-HVAC-01",
                Viewports =
                [
                    new ViewportInfo { Handle = "V1", ScaleDenominator = 100, IsLocked = true },
                    new ViewportInfo { Handle = "V2", ScaleDenominator = null, IsLocked = true },
                ],
            },
        ]));
        Assert.Null(Tim(bc, "viewport-le-chuan"));
    }

    // ===== (14) Text/Dim style lệch chuẩn =====

    [Fact]
    public void Phep14_bat_style_ngoai_bo_chuan_kem_so_doi_tuong()
    {
        var pack = PackBat("styleDeviation");
        var bc = new Inspector(pack).Run(Snapshot(
        [
            new EntityInfo { Handle = "T1", Layer = "0", Kind = EntityKind.Text, TextStyleName = "VNI_STYLE" },
            new EntityInfo { Handle = "T2", Layer = "0", Kind = EntityKind.Text, TextStyleName = "VNI_STYLE" },
            new EntityInfo { Handle = "D1", Layer = "0", Kind = EntityKind.Dimension, DimStyleName = "DIM_CU" },
        ]));
        var f = Tim(bc, "style-lech-chuan");
        Assert.NotNull(f);
        Assert.Equal(["T1", "T2", "D1"], f.Handles);
        Assert.Equal(["textstyle \"VNI_STYLE\": 2 đối tượng", "dimstyle \"DIM_CU\": 1 đối tượng"], f.ChiTiet);
    }

    [Fact]
    public void Phep14_khong_bao_style_chuan_va_style_duoc_chap_nhan()
    {
        var pack = PackBat("styleDeviation");
        var bc = new Inspector(pack).Run(Snapshot(
        [
            new EntityInfo { Handle = "T1", Layer = "0", Kind = EntityKind.Text, TextStyleName = "XBOSS-TEXT" },
            new EntityInfo { Handle = "T2", Layer = "0", Kind = EntityKind.Text, TextStyleName = "Standard" },
            new EntityInfo { Handle = "D1", Layer = "0", Kind = EntityKind.Dimension, DimStyleName = "XBOSS-DIM" },
            // Thực thể không phải text/dim (không mang tên style) → không bị đụng tới.
            new EntityInfo { Handle = "L1", Layer = "0", Kind = EntityKind.Curve, RawLength = 100 },
        ]));
        Assert.Null(Tim(bc, "style-lech-chuan"));
    }

    // ===== (15) Nhãn size lệch XData =====

    [Fact]
    public void Phep15_bat_nhan_lech_size_so_voi_XData_cua_tim()
    {
        var pack = PackBat("labelSizeMismatch");
        var bc = new Inspector(pack).Run(Snapshot(nhan:
        [
            new LabelLinkInfo { Handle = "N1", NoiDung = "300x200", TimHandle = "C1", SizeTheoXData = "400x200" },
        ]));
        var f = Tim(bc, "nhan-lech-xdata");
        Assert.NotNull(f);
        Assert.Equal(["N1"], f.Handles);
        Assert.Contains("400x200", Assert.Single(f.ChiTiet));
    }

    [Fact]
    public void Phep15_khop_theo_ranh_gioi_token_nen_DN100_khong_qua_duoc_size_DN10()
    {
        var pack = PackBat("labelSizeMismatch");
        var bc = new Inspector(pack).Run(Snapshot(nhan:
        [
            new LabelLinkInfo { Handle = "N1", NoiDung = "DN100", TimHandle = "C1", SizeTheoXData = "DN10" },
        ]));
        Assert.Equal(["N1"], Tim(bc, "nhan-lech-xdata")!.Handles);
    }

    [Fact]
    public void Phep15_tu_tat_khi_ban_ve_khong_co_du_lieu_M100_va_khong_bao_nhan_khop()
    {
        var pack = PackBat("labelSizeMismatch");

        // (a) Không có dữ liệu M100 (NhanLienKet null) → tự tắt, dù phép kiểm đang BẬT.
        Assert.Null(Tim(new Inspector(pack).Run(Snapshot()), "nhan-lech-xdata"));

        // (b) Có dữ liệu nhưng nhãn khớp (kể cả khi nhãn có thêm chữ/khoảng trắng), hoặc tim mất
        // XData size → không đoán, không báo.
        var bc = new Inspector(pack).Run(Snapshot(nhan:
        [
            new LabelLinkInfo { Handle = "N1", NoiDung = "Ống gió 300 x 200", TimHandle = "C1", SizeTheoXData = "300x200" },
            new LabelLinkInfo { Handle = "N2", NoiDung = "DN100", TimHandle = "C2", SizeTheoXData = "" },
        ]));
        Assert.Null(Tim(bc, "nhan-lech-xdata"));
    }

    // ===== (16) Đối tượng ngoài khung =====

    [Fact]
    public void Phep16_bat_doi_tuong_ve_nhap_de_quen_o_xa()
    {
        var pack = PackBat("strayObjects");
        var entities = ThucTheCoBao().Append(new EntityInfo
        {
            Handle = "RAC",
            Layer = "0",
            Kind = EntityKind.Other,
            BoundsMin = (500000, 500000),
            BoundsMax = (500100, 500100),
        }).ToList();

        var f = Tim(new Inspector(pack).Run(Snapshot(entities)), "doi-tuong-ngoai-khung");
        Assert.NotNull(f);
        Assert.Equal(["RAC"], f.Handles);
        Assert.Contains("cách bao chính", Assert.Single(f.ChiTiet));
    }

    [Fact]
    public void Phep16_khong_bao_khi_moi_thu_trong_bao_va_khi_qua_it_du_lieu()
    {
        var pack = PackBat("strayObjects");
        Assert.Null(Tim(new Inspector(pack).Run(Snapshot(ThucTheCoBao())), "doi-tuong-ngoai-khung"));

        // Ít hơn minEntitiesForExtents thực thể có hình bao → không đủ dữ liệu để nói đâu là bao chính.
        var itQua = ThucTheCoBao().Take(3).Append(new EntityInfo
        {
            Handle = "RAC", Layer = "0", Kind = EntityKind.Other,
            BoundsMin = (500000, 500000), BoundsMax = (500100, 500100),
        }).ToList();
        Assert.Null(Tim(new Inspector(pack).Run(Snapshot(itQua)), "doi-tuong-ngoai-khung"));
    }

    /// <summary>10 thực thể xếp thành cụm quanh gốc (bao chính ~1m) — nền cho phép kiểm 16.</summary>
    private static List<EntityInfo> ThucTheCoBao() =>
        Enumerable.Range(0, 10).Select(i => new EntityInfo
        {
            Handle = $"E{i}",
            Layer = "0",
            Kind = EntityKind.Other,
            BoundsMin = (i * 100, 0),
            BoundsMax = (i * 100 + 50, 50),
        }).ToList();
}
