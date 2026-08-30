using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Reporting;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M105 PR2 (tầng Adapter) — phần hình học + trình bày mà lệnh <c>XBOSS_VE_CHIADOT</c> dựa vào:
/// cắt polyline tim thành đoạn (mỗi vertex là ranh giới đốt — FR4), vị trí vạch chia CỘNG DỒN có
/// cộng khe mối nối (FR5), chiều dài vạch theo nhóm hệ, bảng đốt trong bản vẽ và mục chia đốt của
/// báo cáo phiên vẽ.
///
/// Lệnh AutoCAD không chạy được trên CI nên mọi thứ có thể sai về SỐ đều đẩy xuống Core và kẹp ở
/// đây; phần còn lại của Adapter chỉ là đổ kết quả vào <c>Line</c>/<c>MText</c>.
/// </summary>
public class JointMarkPlacementTests
{
    // Tuyến ống gió: nẹp C ≤450 (đốt 1180, khe 0) · TDC ≤1500 (đốt 1110, khe 5) · bích V (1180, khe 5).
    private static JointRules RulesDuct() => JointRulesConfig.Doc(
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
            "nep_c":      [{ "item": "thanh-nep-c", "unit": "m", "perJoint": "2*W" }],
            "tdc":        [{ "item": "ke-goc-tdc", "unit": "cái", "perJoint": 4 }],
            "mat_bich_v": [{ "item": "thep-goc-v", "unit": "m", "perJoint": "2*(W+H)" }]
          }
        }
        """);

    /// <summary>Tuyến nằm ngang, các đỉnh cách nhau đúng <paramref name="doDai"/> (đơn vị bản vẽ).</summary>
    private static List<DinhPolyline> TimNgang(params double[] doDai)
    {
        var dinh = new List<DinhPolyline> { new(0, 0, 0) };
        var x = 0.0;
        foreach (var d in doDai)
        {
            x += d;
            dinh.Add(new DinhPolyline(x, 0, 0));
        }
        return dinh;
    }

    // ===== Cắt tim thành đoạn (FR4) =====

    [Fact]
    public void Moi_cap_dinh_lien_nhau_la_mot_doan_chia_doc_lap()
    {
        var doan = JointMarkPlacement.DoanTuTim(TimNgang(2000, 3000, 1500), kin: false, toMm: 1);

        Assert.Equal(3, doan.Count);
        Assert.Equal([2000, 3000, 1500], doan.Select(d => d.Doan.LengthMm));
        Assert.Equal([0, 1, 2], doan.Select(d => d.ChiSoDoanTim));
        // Mốc dọc tuyến của đầu mỗi đoạn — vạch chia của đoạn sau phải cộng thêm mốc này.
        Assert.Equal([0, 2000, 5000], doan.Select(d => d.OffsetDoc));
        Assert.All(doan, d => Assert.False(d.Doan.HasBulge));
    }

    [Fact]
    public void Doan_suy_bien_bi_loai_nhung_van_giu_dung_moc_doc_tuyen()
    {
        // Đỉnh trùng nhau (0 chiều dài) — engine từ chối chiều dài 0 nên phải LOẠI khỏi đầu vào,
        // nhưng chỉ số đoạn gốc và mốc dọc tuyến của đoạn sau không được lệch.
        var doan = JointMarkPlacement.DoanTuTim(TimNgang(1000, 0, 2000), kin: false, toMm: 1);

        Assert.Equal(2, doan.Count);
        Assert.Equal([0, 2], doan.Select(d => d.ChiSoDoanTim));
        Assert.Equal([0, 1000], doan.Select(d => d.OffsetDoc));
    }

    [Fact]
    public void Doan_cong_mang_co_bulge_de_engine_tu_choi_chia()
    {
        var dinh = new List<DinhPolyline> { new(0, 0, 0.5), new(1000, 0, 0), new(2000, 0, 0) };

        var doan = JointMarkPlacement.DoanTuTim(dinh, kin: false, toMm: 1);

        Assert.True(doan[0].Doan.HasBulge);
        Assert.False(doan[1].Doan.HasBulge);
        // Đoạn cung dài hơn dây cung ⇒ mốc của đoạn sau phải theo chiều dài CUNG, không phải dây.
        Assert.True(doan[1].OffsetDoc > 1000);
    }

    [Fact]
    public void Tuyen_kin_co_them_doan_khep_kin_ve_dinh_dau()
    {
        var dinh = new List<DinhPolyline> { new(0, 0, 0), new(1000, 0, 0), new(1000, 1000, 0) };

        var ho = JointMarkPlacement.DoanTuTim(dinh, kin: false, toMm: 1);
        var kin = JointMarkPlacement.DoanTuTim(dinh, kin: true, toMm: 1);

        Assert.Equal(2, ho.Count);
        Assert.Equal(3, kin.Count);
    }

    [Fact]
    public void Doi_don_vi_ban_ve_quy_ra_mm_dung()
    {
        // Bản vẽ đơn vị cm (toMm = 10): đoạn 120 đơn vị = 1200 mm.
        var doan = JointMarkPlacement.DoanTuTim(TimNgang(120), kin: false, toMm: 10);

        Assert.Equal(1200, doan[0].Doan.LengthMm);
    }

    // ===== Vị trí vạch chia + tag (FR5) =====

    [Fact]
    public void Vi_tri_vach_chia_cong_don_chieu_dai_dot_VA_khe_moi_noi()
    {
        // Duct 800x400 (cạnh lớn 800 → TDC: đốt ≤1110, khe 5), chia đều 3000mm:
        // n = ceil(3000/1115) = 3 → (3000 − 2×5)/3 = 996,7 mỗi đốt.
        var tim = TimNgang(3000);
        var doan = JointMarkPlacement.DoanTuTim(tim, kin: false, toMm: 1);
        var kq = JointSegmenter.ChiaTuyen(new YeuCauChiaDot
        {
            SystemId = "HVAC",
            ItemId = "duct-supp",
            Size = "800x400",
            SizeKind = "WxH",
            RunIndex = 1,
            Rules = RulesDuct(),
            Segments = doan.Select(d => d.Doan).ToList(),
        });

        Assert.Equal("tdc", kq.JointType);
        Assert.Equal(3, kq.PieceCount);
        Assert.Equal(5, kq.JointGapMm);

        var boTri = JointMarkPlacement.BoTri(kq, doan, tim, kin: false, toMm: 1);

        // 2 mối nối: vạch 1 tại 996,7; vạch 2 tại 996,7 + 5 (khe) + 996,7 = 1998,4.
        // Quên cộng khe thì vạch 2 rơi vào 1993,4 — sai 5mm và sai dồn thêm ở mọi vạch sau.
        Assert.Equal(2, boTri.Vach.Count);
        Assert.Equal(996.7, boTri.Vach[0].KhoangCachDoc, 3);
        Assert.Equal(1998.4, boTri.Vach[1].KhoangCachDoc, 3);
        Assert.Equal(996.7, boTri.Vach[0].Diem.X, 3);
        Assert.Equal(0, boTri.Vach[0].Diem.Y, 6);
        // Vạch vuông góc tuyến ngang ⇒ hướng vạch là ±90°.
        Assert.Equal(Math.PI / 2, Math.Abs(boTri.Vach[0].GocVuongGoc), 6);
        // Đốt đứng trước mối nối (để dò ngược từ vạch về đốt).
        Assert.Equal([1, 2], boTri.Vach.Select(v => v.ChiSoDotTruoc));

        // Tag đặt tại TRUNG ĐIỂM từng đốt, cũng theo mốc đã cộng khe.
        Assert.Equal(3, boTri.Nhan.Count);
        Assert.Equal(996.7 / 2, boTri.Nhan[0].KhoangCachDoc, 3);
        Assert.Equal(996.7 + 5 + 996.7 / 2, boTri.Nhan[1].KhoangCachDoc, 3);
        Assert.Equal(["D-duct-supp-001-01", "D-duct-supp-001-02", "D-duct-supp-001-03"],
            boTri.Nhan.Select(n => n.NoiDung));
    }

    [Fact]
    public void Polyline_nhieu_dinh_chia_tung_doan_va_vach_bam_dung_doan()
    {
        // 2 đoạn: 1000 (1 đốt, 0 mối) và 2500 (nẹp C 1180 khe 0 → 3 đốt, 2 mối).
        var tim = TimNgang(1000, 2500);
        var doan = JointMarkPlacement.DoanTuTim(tim, kin: false, toMm: 1);
        var kq = JointSegmenter.ChiaTuyen(new YeuCauChiaDot
        {
            SystemId = "HVAC",
            ItemId = "duct-supp",
            Size = "400x300", // cạnh lớn 400 → nẹp C, khe 0
            SizeKind = "WxH",
            RunIndex = 7,
            Rules = RulesDuct(),
            Segments = doan.Select(d => d.Doan).ToList(),
        });

        Assert.Equal("nep_c", kq.JointType);
        Assert.Equal(4, kq.PieceCount);
        Assert.Equal(2, kq.JointCount); // vertex KHÔNG phải mối nối — nó là ranh giới đốt

        var boTri = JointMarkPlacement.BoTri(kq, doan, tim, kin: false, toMm: 1);

        Assert.Equal(2, boTri.Vach.Count);
        Assert.All(boTri.Vach, v => Assert.Equal(1, v.ChiSoDoan)); // đều thuộc đoạn thứ hai
        // Khe 0 ⇒ vạch tại 1000 + 833,3 và 1000 + 1666,6 (mốc đoạn 2 = 1000).
        Assert.Equal(1833.3, boTri.Vach[0].KhoangCachDoc, 3);
        Assert.Equal(2666.6, boTri.Vach[1].KhoangCachDoc, 3);
        // Số đốt đánh liên tục toàn tuyến ⇒ tag không trùng giữa 2 đoạn.
        Assert.Equal(
            ["D-duct-supp-007-01", "D-duct-supp-007-02", "D-duct-supp-007-03", "D-duct-supp-007-04"],
            boTri.Nhan.Select(n => n.NoiDung));
    }

    [Fact]
    public void Vach_chia_bam_dung_hinh_hoc_khi_tuyen_gap_khuc()
    {
        // Đoạn 1 ngang 1000, đoạn 2 đi LÊN 2000 (nẹp C khe 0 → 2 đốt 1000).
        var tim = new List<DinhPolyline> { new(0, 0, 0), new(1000, 0, 0), new(1000, 2000, 0) };
        var doan = JointMarkPlacement.DoanTuTim(tim, kin: false, toMm: 1);
        var kq = JointSegmenter.ChiaTuyen(new YeuCauChiaDot
        {
            SystemId = "HVAC",
            ItemId = "duct-supp",
            Size = "400x300",
            SizeKind = "WxH",
            RunIndex = 1,
            Rules = RulesDuct(),
            Segments = doan.Select(d => d.Doan).ToList(),
        });

        var boTri = JointMarkPlacement.BoTri(kq, doan, tim, kin: false, toMm: 1);

        var vach = Assert.Single(boTri.Vach);
        Assert.Equal(1000, vach.Diem.X, 6);
        Assert.Equal(1000, vach.Diem.Y, 6); // giữa đoạn đứng, KHÔNG phải trên phần kéo dài đoạn ngang
        var (dau, cuoi) = vach.HaiDau(400);
        // Vạch nằm NGANG vì tuyến đang đi đứng — 2 đầu cách tim 200 về mỗi bên.
        Assert.Equal(800, Math.Min(dau.X, cuoi.X), 6);
        Assert.Equal(1200, Math.Max(dau.X, cuoi.X), 6);
        Assert.Equal(1000, dau.Y, 6);
        Assert.Equal(1000, cuoi.Y, 6);
    }

    [Fact]
    public void Hai_dau_vach_doi_xung_qua_tim_va_dai_dung_bang_be_rong()
    {
        var vach = new ViTriVachChia(0, 1, 500, new Diem2(500, 0), 0);

        var (dau, cuoi) = vach.HaiDau(800);

        Assert.Equal(800, Math.Sqrt(Math.Pow(cuoi.X - dau.X, 2) + Math.Pow(cuoi.Y - dau.Y, 2)), 6);
        Assert.Equal(500, (dau.X + cuoi.X) / 2, 6);
        Assert.Equal(0, (dau.Y + cuoi.Y) / 2, 6);
    }

    // ===== Chiều dài vạch theo nhóm hệ (FR5) =====

    [Fact]
    public void Tuyen_co_net_bien_thi_vach_dai_dung_be_rong_W()
    {
        Assert.Equal(800, JointMarkPlacement.ChieuDaiVachMm("double", new CoTuyen(800, 400, null)));
        Assert.Equal(200, JointMarkPlacement.ChieuDaiVachMm("double", new CoTuyen(200, 100, null)));
    }

    [Fact]
    public void Tuyen_khong_net_bien_dung_tick_2_lan_ban_kinh_toi_thieu_100()
    {
        // DN200 → 2 × (200/2) = 200mm.
        Assert.Equal(200, JointMarkPlacement.ChieuDaiVachMm("none", new CoTuyen(null, null, 200)));
        // DN25 → 25mm < ngưỡng ⇒ 100mm cho nhìn thấy được khi in.
        Assert.Equal(JointMarkPlacement.ChieuDaiTickToiThieuMm,
            JointMarkPlacement.ChieuDaiVachMm("none", new CoTuyen(null, null, 25)));
    }

    // ===== Bảng đốt trong bản vẽ =====

    [Fact]
    public void Bang_dot_gop_theo_he_tuyen_co_kieu_noi_va_cong_dung_so_lieu()
    {
        var bang = ThongKeTable.ChiaDot(
        [
            new DotThongKe("HVAC", "duct-supp", "800x400", "tdc", 7, 6, 7200),
            new DotThongKe("HVAC", "duct-supp", "800x400", "tdc", 3, 2, 3000),
            new DotThongKe("HVAC", "duct-supp", "400x300", "nep_c", 2, 1, 2000),
            new DotThongKe("FIREFIGHTING", "sprn-pipe", "DN80", "grooved", 3, 2, 14000),
        ]);

        Assert.Equal(LoaiBangThongKe.ChiaDot, bang.Loai);
        Assert.Equal(["STT", "HỆ", "TUYẾN", "CỠ", "KIỂU NỐI", "SỐ ĐỐT", "SỐ MỐI", "TỔNG DÀI (mm)"], bang.Cot);
        Assert.Equal(3, bang.Dong.Count); // 2 dòng duct-supp cùng cỡ/kiểu nối gộp làm một
        Assert.Contains("15 đốt", bang.TieuDe);
        Assert.Contains("11 mối", bang.TieuDe);

        Assert.Equal("FIREFIGHTING", bang.Dong[0][1]); // xếp theo mã hệ
        Assert.Equal(["1", "2", "3"], bang.Dong.Select(d => d[0]));

        var tdc = bang.Dong.Single(d => d[4] == "tdc");
        Assert.Equal("800x400", tdc[3]);
        Assert.Equal("10", tdc[5]); // 7 + 3 đốt
        Assert.Equal("8", tdc[6]);  // 6 + 2 mối
        Assert.Equal("10,200.0", tdc[7]);
    }

    [Fact]
    public void Ma_bang_dot_di_ve_khong_mat_nghia_va_khong_dung_2_bang_cu()
    {
        Assert.Equal("chiadot", ThongKeTable.Ma(LoaiBangThongKe.ChiaDot));
        Assert.Equal(LoaiBangThongKe.ChiaDot, ThongKeTable.TuMa("chiadot"));
        Assert.Equal("thietbi", ThongKeTable.Ma(LoaiBangThongKe.ThietBi));
        Assert.Equal("khoiluong", ThongKeTable.Ma(LoaiBangThongKe.KhoiLuong));
    }

    // ===== XData chia đốt (FR6) =====

    [Fact]
    public void XData_chia_dot_di_ve_khong_mat_du_lieu()
    {
        var tim = new VeXDataInfo
        {
            VaiTro = VaiTroVe.Tim,
            HeId = "HVAC",
            ItemId = "duct-supp",
            Size = "800x400",
            RulePackVersion = "v9",
            KieuNoi = "tdc",
            KieuNoiGhiDe = true,
            SoDot = 7,
            SoMoiNoi = 6,
            TongDaiDotMm = 7200.5,
        };

        var lai = VeXData.GiaiMa(VeXData.MaHoa(tim));

        Assert.NotNull(lai);
        Assert.Equal("tdc", lai!.KieuNoi);
        Assert.True(lai.KieuNoiGhiDe);
        Assert.Equal(7, lai.SoDot);
        Assert.Equal(6, lai.SoMoiNoi);
        Assert.Equal(7200.5, lai.TongDaiDotMm!.Value, 6);

        var vach = new VeXDataInfo
        {
            VaiTro = VaiTroVe.VachChia,
            HeId = "HVAC",
            ItemId = "duct-supp",
            RulePackVersion = "v9",
            HandleTim = "2A9",
            ChiSoDot = 3,
        };
        var vachLai = VeXData.GiaiMa(VeXData.MaHoa(vach));
        Assert.Equal(VaiTroVe.VachChia, vachLai!.VaiTro);
        Assert.Equal("2A9", vachLai.HandleTim);
        Assert.Equal(3, vachLai.ChiSoDot);

        var nhanLai = VeXData.GiaiMa(VeXData.MaHoa(vach with { VaiTro = VaiTroVe.NhanDot }));
        Assert.Equal(VaiTroVe.NhanDot, nhanLai!.VaiTro);
    }

    [Fact]
    public void Tim_chua_chia_dot_thi_khong_co_dau_chia_dot()
    {
        var lai = VeXData.GiaiMa(VeXData.MaHoa(new VeXDataInfo
        {
            VaiTro = VaiTroVe.Tim,
            HeId = "HVAC",
            ItemId = "duct-supp",
            Size = "800x400",
            RulePackVersion = "v9",
        }));

        Assert.Null(lai!.KieuNoi);
        Assert.Null(lai.SoDot);
        Assert.False(lai.KieuNoiGhiDe);
    }

    // ===== Mục chia đốt trong báo cáo phiên vẽ =====

    [Fact]
    public void Bao_cao_phien_ve_tach_tuyen_da_chia_va_tuyen_chua_chia()
    {
        VeXDataInfo Tim(string item, string size, string? kieuNoi, int soDot = 0, bool ghiDe = false) => new()
        {
            VaiTro = VaiTroVe.Tim,
            HeId = "HVAC",
            ItemId = item,
            Size = size,
            RulePackVersion = "v9",
            KieuNoi = kieuNoi,
            KieuNoiGhiDe = ghiDe,
            SoDot = kieuNoi is null ? null : soDot,
            SoMoiNoi = kieuNoi is null ? null : soDot - 1,
            TongDaiDotMm = kieuNoi is null ? null : 1000.0 * soDot,
        };

        var bc = VeSessionReport.Dung(
            [
                Tim("duct-supp", "800x400", "tdc", 7),
                Tim("duct-supp", "800x400", "tdc", 3),
                Tim("duct-retn", "300x200", null),
                new VeXDataInfo { VaiTro = VaiTroVe.VachChia, HeId = "HVAC", RulePackVersion = "v9" },
                new VeXDataInfo { VaiTro = VaiTroVe.NhanDot, HeId = "HVAC", RulePackVersion = "v9" },
            ],
            new VeSessionMeta
            {
                RulePackVersion = "v9",
                TenBanVe = "AVIO-A-SHOP-01.dwg",
                NgayIso = "2026-08-26",
            });

        var cum = Assert.Single(bc.ChiaDot);
        Assert.Equal("tdc", cum.KieuNoi);
        Assert.Equal(2, cum.SoTuyen);
        Assert.Equal(10, cum.SoDot);
        Assert.Equal(8, cum.SoMoi);
        Assert.Equal(10_000, cum.TongDaiMm, 6);
        Assert.False(cum.GhiDe);

        var chua = Assert.Single(bc.ChiaDotBoQua);
        Assert.Equal("duct-retn", chua.ItemId);
        Assert.Equal(1, chua.SoTuyen);

        // Vạch/tag được đếm riêng, không lẫn vào số nhãn size của XBOSS_VE_NHAN.
        var he = Assert.Single(bc.HeThong);
        Assert.Equal(1, he.SoVachChia);
        Assert.Equal(1, he.SoNhanDot);
        Assert.Equal(0, he.SoNhan);

        // Bản vẽ đã chia một phần ⇒ phải kêu lên, không im lặng.
        Assert.Contains(bc.CanhBao, c => c.Contains("CHƯA chia đốt"));
        Assert.Contains("Chia đốt — tuyến ĐÃ chia", bc.ToVietnameseText());
    }

    [Fact]
    public void Bao_cao_canh_bao_khi_ky_su_ghi_de_kieu_noi()
    {
        var bc = VeSessionReport.Dung(
            [
                new VeXDataInfo
                {
                    VaiTro = VaiTroVe.Tim,
                    HeId = "HVAC",
                    ItemId = "duct-supp",
                    Size = "800x400",
                    RulePackVersion = "v9",
                    KieuNoi = "mat_bich_v",
                    KieuNoiGhiDe = true,
                    SoDot = 7,
                    SoMoiNoi = 6,
                    TongDaiDotMm = 7200,
                },
            ],
            new VeSessionMeta { RulePackVersion = "v9", TenBanVe = "x.dwg", NgayIso = "2026-08-26" });

        Assert.True(bc.ChiaDot[0].GhiDe);
        Assert.Contains(bc.CanhBao, c => c.Contains("GHI ĐÈ TAY"));
        Assert.Empty(bc.ChiaDotBoQua);
        // Chưa chia gì cả thì KHÔNG cảnh báo "chưa chia" — tránh nhiễu ở bản vẽ chưa chạy lệnh.
        Assert.DoesNotContain(bc.CanhBao, c => c.Contains("CHƯA chia đốt"));
    }
}
