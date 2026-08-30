using System.Text.Json;
using System.Text.Json.Serialization;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M105 PR2 — engine chia đốt MEPF bản C#. Khóa với engine web
/// <c>lib/ky-thuat/engineering-joint-segmentation.ts</c> bằng CHÍNH bộ test vector JSON dùng chung
/// <c>plugin-autocad/testdata/joint-segmentation/*.json</c> (M105 NFR1/AC12): cùng đầu vào phải ra
/// cùng từng con số. Kèm ca định mức phụ kiện (AC13), parser biểu thức (FR7), validator rule pack
/// (§12) và ca nạp <c>jointRules</c> THẬT từ rule pack v9 đang phát hành.
/// </summary>
public class JointSegmenterTests
{
    private static readonly JsonSerializerOptions Doc = new() { PropertyNameCaseInsensitive = true };

    /// <summary>Thư mục test vector dùng chung — cùng nguồn với test TS (không chép sang plugin).</summary>
    private static string ThuMucVector =>
        Path.Combine(
            Directory.GetParent(RepoPaths.DoiChungDir)!.FullName, "testdata", "joint-segmentation");

    private sealed class TestVector
    {
        public string Id { get; init; } = "";
        public string Ac { get; init; } = "";
        public string Note { get; init; } = "";
        public YeuCauChiaDot Input { get; init; } = new();
        public KyVong Expected { get; init; } = new();
    }

    private sealed class KyVong
    {
        public string JointType { get; init; } = "";
        public bool Overridden { get; init; }
        public string DivideMode { get; init; } = "";
        public double MaxLenMm { get; init; }
        public double JointGapMm { get; init; }
        public double MinPieceLenMm { get; init; }
        public double TotalLengthMm { get; init; }
        public int PieceCount { get; init; }
        public int JointCount { get; init; }
        public IReadOnlyList<DotKyVong> Pieces { get; init; } = [];
        public IReadOnlyList<string> Warnings { get; init; } = [];
        public IReadOnlyList<PhuKienKyVong> Hardware { get; init; } = [];
    }

    private sealed class DotKyVong
    {
        public int SegmentIndex { get; init; }
        public int PieceIndex { get; init; }
        public double LengthMm { get; init; }
        public string Tag { get; init; } = "";
    }

    private sealed class PhuKienKyVong
    {
        public string Item { get; init; } = "";
        public string Unit { get; init; } = "";
        public double Quantity { get; init; }
    }

    private static List<TestVector> NapVector() =>
        Directory.GetFiles(ThuMucVector, "*.json")
            .OrderBy(f => f, StringComparer.Ordinal)
            .Select(f => JsonSerializer.Deserialize<TestVector>(File.ReadAllText(f), Doc)
                ?? throw new InvalidOperationException($"Không đọc được test vector {f}"))
            .ToList();

    public static TheoryData<string> TenVector()
    {
        var data = new TheoryData<string>();
        foreach (var v in NapVector()) data.Add(v.Id);
        return data;
    }

    [Fact]
    public void Thu_muc_vector_co_du_bo_ca_bat_buoc_cua_dac_ta()
    {
        var ids = NapVector().Select(v => v.Id).ToList();
        foreach (var batBuoc in new[]
                 {
                     "duct-tdc-7200",             // AC1 + AC13
                     "duct-nepc-1180",            // AC2
                     "duct-nepc-1181",            // AC3
                     "duct-doan-ngan-150",        // AC4
                     "duct-ghi-de-bich-v-3500",   // AC5
                     "duct-tdc-2-doan",           // AC6
                     "pipe-grooved-14000",        // AC7
                     "tray-tamnoi-9000",          // AC8
                     "pipe-ren-11700-dot-le-ngan",// FR3 — dồn đốt lẻ
                 })
        {
            Assert.Contains(batBuoc, ids);
        }
    }

    [Theory]
    [MemberData(nameof(TenVector))]
    public void Vector_chung_voi_engine_TS_ra_dung_tung_so(string id)
    {
        var v = NapVector().Single(x => x.Id == id);
        var kq = JointSegmenter.ChiaTuyen(v.Input);

        Assert.Equal(v.Expected.JointType, kq.JointType);
        Assert.Equal(v.Expected.Overridden, kq.Overridden);
        Assert.Equal(JointRulesConfig.DocCheDo(v.Expected.DivideMode), kq.DivideMode);
        Assert.Equal(v.Expected.MaxLenMm, kq.MaxLenMm);
        Assert.Equal(v.Expected.JointGapMm, kq.JointGapMm);
        Assert.Equal(v.Expected.MinPieceLenMm, kq.MinPieceLenMm);
        Assert.Equal(v.Expected.TotalLengthMm, kq.TotalLengthMm, 3);
        Assert.Equal(v.Expected.PieceCount, kq.PieceCount);
        Assert.Equal(v.Expected.JointCount, kq.JointCount);
        Assert.Equal(v.Expected.Warnings, kq.Warnings.Select(c => c.Slug()).ToList());

        Assert.Equal(v.Expected.Pieces.Count, kq.Pieces.Count);
        for (var i = 0; i < kq.Pieces.Count; i++)
        {
            var dot = kq.Pieces[i];
            var mong = v.Expected.Pieces[i];
            Assert.Equal(mong.SegmentIndex, dot.SegmentIndex);
            Assert.Equal(mong.PieceIndex, dot.PieceIndex);
            Assert.Equal(mong.Tag, dot.Tag);
            Assert.True(
                Math.Abs(dot.LengthMm - mong.LengthMm) <= 0.05,
                $"đốt {i}: dài {dot.LengthMm} ≠ kỳ vọng {mong.LengthMm}");
        }

        // Bất biến FR2 trên từng đoạn — tính lại độc lập với engine.
        for (var segmentIndex = 0; segmentIndex < v.Input.Segments.Count; segmentIndex++)
        {
            var cua = kq.Pieces.Where(p => p.SegmentIndex == segmentIndex).ToList();
            var tong = cua.Sum(p => p.LengthMm) + (cua.Count - 1) * v.Expected.JointGapMm;
            Assert.True(
                Math.Abs(tong - v.Input.Segments[segmentIndex].LengthMm) <= JointSegmenter.SaiSoTongChieuDaiMm,
                $"đoạn {segmentIndex}: Σ đốt + khe = {tong} ≠ {v.Input.Segments[segmentIndex].LengthMm}");
        }

        var hardware = JointSegmenter.BungPhuKienMoiNoi(kq, v.Input.Rules);
        Assert.Equal(v.Expected.Hardware.Count, hardware.Count);
        for (var i = 0; i < hardware.Count; i++)
        {
            Assert.Equal(v.Expected.Hardware[i].Item, hardware[i].Item);
            Assert.Equal(v.Expected.Hardware[i].Unit, hardware[i].Unit);
            Assert.True(
                Math.Abs(hardware[i].Quantity - v.Expected.Hardware[i].Quantity) <= 0.001,
                $"phụ kiện {hardware[i].Item}: {hardware[i].Quantity} ≠ kỳ vọng {v.Expected.Hardware[i].Quantity}");
        }
    }

    // ===== Làm tròn: nửa lên RA XA 0, không phải làm tròn ngân hàng (NFR1) =====

    [Theory]
    [InlineData(0.25, 0.3)]   // ngân hàng cho 0,2 — sai
    [InlineData(0.35, 0.4)]
    [InlineData(1024.25, 1024.3)]
    [InlineData(590.55, 590.6)]
    [InlineData(-0.25, -0.3)]
    public void LamTron01_la_nua_len_ra_xa_0(double vao, double ra)
    {
        Assert.Equal(ra, JointSegmenter.LamTron01(vao), 6);
    }

    // ===== Chọn kiểu nối / parse cỡ (FR1) =====

    private static readonly JointRules RulesDuct = JointRulesConfig.Doc(
        """
        {
          "selection": [
            { "jointType": "nep_c",      "maxSideMm": 450,  "maxLenMm": 1180, "jointGapMm": 0 },
            { "jointType": "tdc",        "maxSideMm": 1500, "maxLenMm": 1110, "jointGapMm": 5 },
            { "jointType": "mat_bich_v", "maxSideMm": null, "maxLenMm": 1180, "jointGapMm": 5 }
          ],
          "divideMode": "deu",
          "minPieceLenMm": 200,
          "layerStyle": { "suffix": "JOINT", "color": 8, "linetype": "DASHED" },
          "hardware": {
            "nep_c": [
              { "item": "thanh-nep-c", "perJoint": "2*W", "unit": "m" },
              { "item": "thanh-s-slip", "perJoint": "2*H", "unit": "m" }
            ],
            "tdc": [
              { "item": "ke-goc-tdc", "perJoint": 4, "unit": "cái" },
              { "item": "bulong-m8", "perJoint": 8, "unit": "cái" },
              { "item": "gioang-tdc-m", "perJoint": "2*(W+H)", "unit": "m" }
            ],
            "mat_bich_v": [
              { "item": "thep-goc-v-m", "perJoint": "2*(W+H)", "unit": "m" },
              { "item": "bulong-m8", "perJoint": "ceil(2*(W+H)/100)", "unit": "cái" }
            ]
          }
        }
        """);

    private static KetQuaChiaDot ChayDuct(double lengthMm, string? ghiDe = null) =>
        JointSegmenter.ChiaTuyen(new YeuCauChiaDot
        {
            SystemId = "HVAC",
            ItemId = "duct-supp",
            Size = "800x400",
            SizeKind = "WxH",
            RunIndex = 1,
            OverrideJointType = ghiDe,
            Rules = RulesDuct,
            Segments = [new DoanTim { LengthMm = lengthMm }],
        });

    [Fact]
    public void ChonKieuNoi_tuyen_WxH_xet_canh_lon_muc_dau_khop_thang()
    {
        string? Kieu(string size) =>
            JointSegmenter.ChonKieuNoi(size, KieuCo.WxH, RulesDuct.Selection)?.JointType;

        Assert.Equal("nep_c", Kieu("300x200"));
        Assert.Equal("nep_c", Kieu("450x200"));   // biên trên
        Assert.Equal("tdc", Kieu("200x451"));     // cạnh lớn là CHIỀU CAO
        Assert.Equal("tdc", Kieu("800x400"));
        Assert.Equal("tdc", Kieu("1500x400"));    // biên trên
        Assert.Equal("mat_bich_v", Kieu("1600x400"));
        Assert.Equal("tdc", Kieu("800X400"));     // chữ X hoa
        Assert.Null(JointSegmenter.ChonKieuNoi("khong-phai-co", KieuCo.WxH, RulesDuct.Selection));
    }

    [Fact]
    public void ParseCo_doc_W_H_va_DN_lam_bien_bieu_thuc()
    {
        Assert.Equal(new CoTuyen(800, 400, null), JointSegmenter.ParseCo("800x400", KieuCo.WxH));
        Assert.Equal(new CoTuyen(800, 400, null), JointSegmenter.ParseCo(" 800 x 400 ", KieuCo.WxH));
        Assert.Equal(new CoTuyen(null, null, 80), JointSegmenter.ParseCo("dn80", KieuCo.DN));
        Assert.Null(JointSegmenter.ParseCo("", KieuCo.WxH));
        Assert.Null(JointSegmenter.ParseCo("0x400", KieuCo.WxH));
        Assert.Null(JointSegmenter.ParseCo("80", KieuCo.DN)); // thiếu tiền tố DN
    }

    // ===== Ghi đè kiểu nối (AC5) =====

    [Fact]
    public void Ghi_de_kieu_noi_dung_tham_so_kieu_chon_tay_va_bat_co_overridden()
    {
        var tuDong = ChayDuct(3500);
        Assert.Equal("tdc", tuDong.JointType);
        Assert.False(tuDong.Overridden);

        var ghiDe = ChayDuct(3500, "mat_bich_v");
        Assert.Equal("mat_bich_v", ghiDe.JointType);
        Assert.True(ghiDe.Overridden);
        Assert.Equal(1180, ghiDe.MaxLenMm);

        // Ghi đè trùng đúng kiểu tự chọn thì KHÔNG coi là ghi đè.
        Assert.False(ChayDuct(3500, "tdc").Overridden);
    }

    [Fact]
    public void Ghi_de_kieu_noi_la_nem_loi_tieng_Viet_khong_doan_bua()
    {
        var loi = Assert.Throws<RulePackException>(() => ChayDuct(3500, "tdf-tu-gap"));
        Assert.Contains("không khai kiểu nối \"tdf-tu-gap\"", loi.Message);
    }

    [Fact]
    public void TagDot_theo_mau_D_itemId_tuyen_dot()
    {
        Assert.Equal("D-duct-supp-001-01", JointSegmenter.TagDot("duct-supp", 1, 1));
        Assert.Equal("D-chw-pipe-012-07", JointSegmenter.TagDot("chw-pipe", 12, 7));
        Assert.Equal("D-tray-pwr-128-103", JointSegmenter.TagDot("tray-pwr", 128, 103));
    }

    // ===== Phụ kiện mối nối (AC13) =====

    [Fact]
    public void AC13_QTO_phu_kien_TDC_800x400_dai_7200()
    {
        var kq = ChayDuct(7200);
        Assert.Equal(6, kq.JointCount);
        var hw = JointSegmenter.BungPhuKienMoiNoi(kq, RulesDuct);

        DongPhuKienMoiNoi Tra(string item) => hw.Single(d => d.Item == item);
        Assert.Equal(24, Tra("ke-goc-tdc").Quantity);
        Assert.Equal(48, Tra("bulong-m8").Quantity);
        // 2*(800+400) = 2400 mm = 2,4 m mỗi mối × 6 mối = 14,4 m (đơn vị "m" quy đổi mm→m).
        Assert.Equal(14.4, Tra("gioang-tdc-m").Quantity, 3);
        Assert.Equal("cái", Tra("ke-goc-tdc").Unit);
    }

    [Fact]
    public void Phu_kien_tuyen_0_moi_khong_phat_sinh_kieu_noi_thieu_dinh_muc_nem_loi()
    {
        var motDot = ChayDuct(1000);
        Assert.Equal(0, motDot.JointCount);
        Assert.Empty(JointSegmenter.BungPhuKienMoiNoi(motDot, RulesDuct));

        var loi = Assert.Throws<RulePackException>(() => JointSegmenter.BungPhuKienMoiNoi(
            "la_hoac", 3, new CoTuyen(800, 400, null), RulesDuct, "duct-supp"));
        Assert.Contains("thiếu định mức phụ kiện cho kiểu nối \"la_hoac\"", loi.Message);
    }

    // ===== Parser biểu thức định mức (FR7) =====

    [Theory]
    [InlineData("4", 4)]
    [InlineData("2*W", 1600)]
    [InlineData("2*(W+H)", 2400)]
    [InlineData("ceil(2*(W+H)/100)", 24)]
    [InlineData("W/H", 2)]
    [InlineData("W - H - 100", 300)]
    [InlineData("1 + 2*3", 7)]
    [InlineData("(1+2)*3", 9)]
    [InlineData("-2 + 10", 8)]
    public void Parser_bieu_thuc_dinh_muc_tinh_dung(string bieuThuc, double mong)
    {
        Assert.Equal(mong, JointRulesConfig.TinhBieuThucDinhMuc(bieuThuc, new CoTuyen(800, 400, null)), 6);
    }

    [Fact]
    public void Parser_bieu_thuc_dinh_muc_so_thap_phan_va_ceil_lam_tron_len()
    {
        Assert.Equal(40, JointRulesConfig.TinhBieuThucDinhMuc("0.5*DN", new CoTuyen(null, null, 80)), 6);
        Assert.Equal(25, JointRulesConfig.TinhBieuThucDinhMuc(
            "ceil(2*(W+H)/100)", new CoTuyen(805, 400, null)), 6);
    }

    [Theory]
    [InlineData("process.exit(1)")]  // truy cập toàn cục
    [InlineData("require('fs')")]    // gọi hàm ngoài danh sách
    [InlineData("W ** 2")]           // toán tử không hỗ trợ
    [InlineData("Math.max(W,H)")]    // hàm không hỗ trợ
    [InlineData("X + 1")]            // biến không xác định
    [InlineData("DN + 1")]           // tuyến WxH không có DN
    [InlineData("2*(W+H")]           // thiếu đóng ngoặc
    [InlineData("2*")]               // thiếu vế
    [InlineData("W 800")]            // thừa token
    [InlineData("W/0")]              // chia cho 0
    [InlineData("")]                 // rỗng
    public void Parser_bieu_thuc_la_phai_nem_loi_khong_bao_gio_thuc_thi_ma(string bieuThuc)
    {
        Assert.Throws<RulePackException>(
            () => JointRulesConfig.TinhBieuThucDinhMuc(bieuThuc, new CoTuyen(800, 400, null)));
    }

    [Fact]
    public void Parser_bao_loi_du_de_ky_su_sua_rule_pack()
    {
        var co = new CoTuyen(800, 400, null);
        Assert.Contains("không hợp lệ: \"X\"",
            Assert.Throws<RulePackException>(() => JointRulesConfig.TinhBieuThucDinhMuc("X + 1", co)).Message);
        Assert.Contains("biến \"DN\" mà cỡ tuyến không có giá trị",
            Assert.Throws<RulePackException>(() => JointRulesConfig.TinhBieuThucDinhMuc("DN + 1", co)).Message);
    }

    // ===== Bất biến số học FR2 & ca biên (FR3/FR4) =====

    [Fact]
    public void Bat_bien_FR2_tong_dot_cong_khe_bang_chieu_dai_doan_o_moi_che_do()
    {
        var cacRule = new[]
        {
            (1110d, 5d), (1180d, 0d), (5800d, 3d), (2500d, 0d),
        };
        foreach (var (maxLen, gap) in cacRule)
        {
            foreach (var mode in new[] { CheDoChiaDot.Deu, CheDoChiaDot.CayNguyen })
            {
                var rule = new JointSelectionRow { JointType = "x", MaxLenMm = maxLen, JointGapMm = gap };
                for (var L = 210d; L <= 30000; L += 137)
                {
                    var kq = JointSegmenter.ChiaDoan(L, rule, mode, 200);
                    var tong = kq.Pieces.Sum() + (kq.Pieces.Count - 1) * gap;
                    Assert.True(Math.Abs(tong - L) <= JointSegmenter.SaiSoTongChieuDaiMm,
                        $"{mode} L={L} maxLen={maxLen}: Σ={tong}");
                    Assert.DoesNotContain(CanhBaoChiaDot.SaiLechTongChieuDai, kq.Warnings);
                    Assert.True(kq.Pieces.All(p => p <= maxLen + 0.5), $"{mode} L={L}: có đốt dài quá đốt tối đa");
                }
            }
        }
    }

    [Fact]
    public void Cay_nguyen_phan_du_nho_hon_ca_khe_moi_noi_khong_sinh_dot_dai_0_hoac_am()
    {
        var rule = new JointSelectionRow { JointType = "x", MaxLenMm = 5800, JointGapMm = 3 };
        foreach (var min in new[] { 0d, 300d })
        {
            var kq = JointSegmenter.ChiaDoan(5802, rule, CheDoChiaDot.CayNguyen, min);
            Assert.All(kq.Pieces, p => Assert.True(p > 0, $"min={min}: đốt dài {p}"));
            var tong = kq.Pieces.Sum() + (kq.Pieces.Count - 1) * 3;
            Assert.True(Math.Abs(tong - 5802) <= JointSegmenter.SaiSoTongChieuDaiMm);
        }
    }

    [Fact]
    public void ChiaDoan_dau_vao_vo_ly_nem_loi_ngay()
    {
        var rule = new JointSelectionRow { JointType = "x", MaxLenMm = 1110, JointGapMm = 5 };
        Assert.Throws<ArgumentException>(() => JointSegmenter.ChiaDoan(0, rule, CheDoChiaDot.Deu, 200));
        Assert.Throws<ArgumentException>(() => JointSegmenter.ChiaDoan(-5, rule, CheDoChiaDot.Deu, 200));
        Assert.Throws<ArgumentException>(() => JointSegmenter.ChiaDoan(
            1000, new JointSelectionRow { JointType = "x", MaxLenMm = 0 }, CheDoChiaDot.Deu, 200));
        Assert.Throws<ArgumentException>(() => JointSegmenter.ChiaDoan(
            1000, new JointSelectionRow { JointType = "x", MaxLenMm = 100, JointGapMm = -1 },
            CheDoChiaDot.Deu, 200));
    }

    [Fact]
    public void FR4_doan_co_cung_tron_khong_chia_giu_nguyen_1_dot_kem_canh_bao()
    {
        var kq = JointSegmenter.ChiaTuyen(new YeuCauChiaDot
        {
            SystemId = "HVAC",
            ItemId = "duct-supp",
            Size = "800x400",
            SizeKind = "WxH",
            RunIndex = 1,
            Rules = RulesDuct,
            Segments =
            [
                new DoanTim { LengthMm = 4000, HasBulge = true },
                new DoanTim { LengthMm = 2000 },
            ],
        });
        Assert.Equal(["doan_cong_khong_chia_duoc"], kq.Warnings.Select(c => c.Slug()));
        Assert.Single(kq.Pieces, p => p.SegmentIndex == 0);
        Assert.Equal(2, kq.Pieces.Count(p => p.SegmentIndex == 1));
        Assert.Equal(1, kq.JointCount); // đoạn không chia không sinh mối nối
        // pieceIndex chạy LIÊN TỤC toàn tuyến (không reset theo đoạn).
        Assert.Equal([1, 2, 3], kq.Pieces.Select(p => p.PieceIndex));
    }

    // ===== Validator rule pack (§12) =====

    private static JointRules RulesTuJson(string json) => JointRulesConfig.Doc(json);

    [Fact]
    public void Validate_bat_selection_khong_phu_kin()
    {
        var rules = RulesTuJson(
            """
            { "selection": [ { "jointType": "tdc", "maxSideMm": 1500, "maxLenMm": 1110, "jointGapMm": 5 } ],
              "divideMode": "deu", "minPieceLenMm": 200,
              "layerStyle": { "suffix": "JOINT" },
              "hardware": { "tdc": [ { "item": "ke", "perJoint": 4, "unit": "cái" } ] } }
            """);
        var loi = Assert.Throws<RulePackException>(
            () => JointRulesConfig.Validate(rules, KieuCo.WxH, "tuyến thử"));
        Assert.Contains("không phủ kín", loi.Message);
    }

    [Fact]
    public void Validate_bat_dai_selection_chong_nhau()
    {
        var rules = RulesTuJson(
            """
            { "selection": [
                { "jointType": "nep_c", "maxSideMm": 1500, "maxLenMm": 1180, "jointGapMm": 0 },
                { "jointType": "tdc",   "maxSideMm": 450,  "maxLenMm": 1110, "jointGapMm": 5 },
                { "jointType": "bich",  "maxSideMm": null, "maxLenMm": 1180, "jointGapMm": 5 } ],
              "divideMode": "deu", "minPieceLenMm": 200,
              "layerStyle": { "suffix": "JOINT" },
              "hardware": { "nep_c": [ { "item": "a", "perJoint": 1, "unit": "cái" } ],
                            "tdc":   [ { "item": "b", "perJoint": 1, "unit": "cái" } ],
                            "bich":  [ { "item": "c", "perJoint": 1, "unit": "cái" } ] } }
            """);
        Assert.Contains("chồng nhau",
            Assert.Throws<RulePackException>(
                () => JointRulesConfig.Validate(rules, KieuCo.WxH, "tuyến thử")).Message);
    }

    [Fact]
    public void Validate_bat_maxLen_khong_lon_hon_minPieceLen_va_thieu_dinh_muc()
    {
        var ngan = RulesTuJson(
            """
            { "selection": [ { "jointType": "tam_noi", "maxSideMm": null, "maxLenMm": 250, "jointGapMm": 0 } ],
              "divideMode": "cay_nguyen", "minPieceLenMm": 300,
              "layerStyle": { "suffix": "JOINT" },
              "hardware": { "tam_noi": [ { "item": "a", "perJoint": 2, "unit": "cái" } ] } }
            """);
        Assert.Contains("phải lớn hơn",
            Assert.Throws<RulePackException>(
                () => JointRulesConfig.Validate(ngan, KieuCo.WxH, "tuyến thử")).Message);

        var thieuDinhMuc = RulesTuJson(
            """
            { "selection": [ { "jointType": "tam_noi", "maxSideMm": null, "maxLenMm": 2500, "jointGapMm": 0 } ],
              "divideMode": "cay_nguyen", "minPieceLenMm": 300,
              "layerStyle": { "suffix": "JOINT" }, "hardware": {} }
            """);
        Assert.Contains("thiếu định mức cho kiểu nối \"tam_noi\"",
            Assert.Throws<RulePackException>(
                () => JointRulesConfig.Validate(thieuDinhMuc, KieuCo.WxH, "tuyến thử")).Message);
    }

    [Fact]
    public void Validate_bat_divideMode_la_va_bieu_thuc_dinh_muc_sai_cu_phap()
    {
        var modeLa = RulesTuJson(
            """
            { "selection": [ { "jointType": "a", "maxSideMm": null, "maxLenMm": 2500, "jointGapMm": 0 } ],
              "divideMode": "toi_thich_the", "minPieceLenMm": 300,
              "layerStyle": { "suffix": "JOINT" },
              "hardware": { "a": [ { "item": "x", "perJoint": 1, "unit": "cái" } ] } }
            """);
        Assert.Contains("divideMode không hợp lệ",
            Assert.Throws<RulePackException>(
                () => JointRulesConfig.Validate(modeLa, KieuCo.WxH, "tuyến thử")).Message);

        var btSai = RulesTuJson(
            """
            { "selection": [ { "jointType": "a", "maxSideMm": null, "maxLenMm": 2500, "jointGapMm": 0 } ],
              "divideMode": "deu", "minPieceLenMm": 300,
              "layerStyle": { "suffix": "JOINT" },
              "hardware": { "a": [ { "item": "x", "perJoint": "Math.max(W,H)", "unit": "cái" } ] } }
            """);
        Assert.Throws<RulePackException>(() => JointRulesConfig.Validate(btSai, KieuCo.WxH, "tuyến thử"));
    }

    [Fact]
    public void FR5_hau_to_layer_vach_chia_khong_duoc_khop_takeoff()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));
        var hvac = pack.DrawTools.Systems.Single(s => s.Id == "HVAC");
        var line = hvac.Lines.Single(l => l.ItemId == "duct-supp");
        var rules = line.JointRules!;

        // Hậu tố đang phát hành ("JOINT", không gạch nối) là an toàn.
        JointRulesConfig.KiemLayerVachChia(line.Layer, rules, pack.RulePack.Takeoff.Items, "duct-supp");
        Assert.Equal(line.Layer + "JOINT", JointSegmenter.LayerVachChia(line.Layer, rules.LayerStyle));

        // Hậu tố "-JOINT" LÀ cái bẫy: dấu '-' là ranh giới token nên layer vẫn khớp mục bóc.
        var bay = JointRulesConfig.Doc(
            $$"""
              { "selection": {{JsonSerializer.Serialize(new[]
                  { new { jointType = "tdc", maxSideMm = (double?)null, maxLenMm = 1110.0, jointGapMm = 5.0 } })}},
                "divideMode": "deu", "minPieceLenMm": 200,
                "layerStyle": { "suffix": "-JOINT" },
                "hardware": { "tdc": [ { "item": "x", "perJoint": 1, "unit": "cái" } ] } }
              """);
        Assert.Contains("bị bóc trùng",
            Assert.Throws<RulePackException>(() => JointRulesConfig.KiemLayerVachChia(
                line.Layer, bay, pack.RulePack.Takeoff.Items, "duct-supp")).Message);
    }

    // ===== Nạp jointRules THẬT từ rule pack v9 đang phát hành (AC10) =====

    [Fact]
    public void Rule_pack_v9_moi_tuyen_ve_duoc_deu_khai_jointRules_dung_va_chia_dot_duoc()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));
        Assert.Equal("v9", pack.RulePack.Version);

        var soTuyen = 0;
        foreach (var sys in pack.DrawTools.Systems)
        {
            foreach (var line in sys.Lines)
            {
                var rules = line.JointRules;
                Assert.True(rules is not null, $"tuyến {sys.Id}/{line.ItemId} thiếu jointRules");
                soTuyen += 1;

                var kieuCo = JointRulesConfig.DocKieuCo(line.SizeKind);
                // Validator đã chạy trong DrawToolsConfig.Load — gọi lại để khẳng định không ném.
                JointRulesConfig.Validate(rules!, kieuCo, $"{sys.Id}/{line.ItemId}");

                // Mọi cỡ khai sẵn phải chọn được kiểu nối, chia được đốt và bóc được phụ kiện.
                foreach (var size in line.Sizes)
                {
                    Assert.True(
                        JointSegmenter.ChonKieuNoi(size, kieuCo, rules!.Selection) is not null,
                        $"{line.ItemId}: cỡ {size} không chọn được kiểu nối");
                    var kq = JointSegmenter.ChiaTuyen(new YeuCauChiaDot
                    {
                        SystemId = sys.Id,
                        ItemId = line.ItemId,
                        Size = size,
                        SizeKind = line.SizeKind,
                        RunIndex = 1,
                        Rules = rules,
                        Segments = [new DoanTim { LengthMm = 12345 }],
                    });
                    Assert.True(kq.PieceCount > 0);
                    Assert.NotEmpty(JointSegmenter.BungPhuKienMoiNoi(kq, rules));
                }
            }
        }
        Assert.Equal(9, soTuyen); // 3 ống gió + 4 ống nước/PCCC + 2 máng cáp
    }

    [Fact]
    public void Rule_pack_v9_thong_so_chia_dot_dung_nhu_dac_ta()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));
        var duct = pack.DrawTools.Systems.Single(s => s.Id == "HVAC")
            .Lines.Single(l => l.ItemId == "duct-supp").JointRules!;
        Assert.Equal("deu", duct.DivideMode);
        Assert.Equal(200, duct.MinPieceLenMm);
        Assert.Equal("tdc", JointSegmenter.ChonKieuNoi("800x400", KieuCo.WxH, duct.Selection)!.JointType);

        var chw = pack.DrawTools.Systems.Single(s => s.Id == "PIPING")
            .Lines.Single(l => l.ItemId == "chw-pipe").JointRules!;
        Assert.Equal("cay_nguyen", chw.DivideMode);
        Assert.Equal("grooved", JointSegmenter.ChonKieuNoi("DN80", KieuCo.DN, chw.Selection)!.JointType);
    }

    [Fact]
    public void Rule_pack_v8_khong_khai_jointRules_thi_bo_qua_tuyen_chu_khong_doan_mac_dinh()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v8.json")));
        Assert.All(pack.DrawTools.Systems.SelectMany(s => s.Lines), l => Assert.Null(l.JointRules));
    }
}
