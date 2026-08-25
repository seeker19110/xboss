using XBoss.Cad.Core.Draw;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M100 PR7 — đánh tag tuần tự + quét trùng/nhảy số (§6.9, FR9e, AC14).
/// </summary>
public class TagScheduleTests
{
    private const string Mau = "{type}-{floor}-{seq}";

    // ===== Dựng / tách =====

    [Fact]
    public void Dung_tag_dung_mau_rule_pack_hai_chu_so()
    {
        Assert.Equal("FCU-05-01", TagSchedule.Dung(Mau, "FCU", "05", 1));
        Assert.Equal("FCU-05-12", TagSchedule.Dung(Mau, "FCU", "05", 12));
        Assert.Equal("FCU-05-123", TagSchedule.Dung(Mau, "FCU", "05", 123));
        // Rule pack chưa khai pattern ⇒ dùng mẫu mặc định của M100 §6.9, không ném lỗi.
        Assert.Equal("AHU-B1-01", TagSchedule.Dung(null, "AHU", "B1", 1));
    }

    [Fact]
    public void Tach_tag_theo_mau_va_bo_qua_tag_tu_do()
    {
        var pt = TagSchedule.PhanTich(Mau, "FCU-05-07");

        Assert.NotNull(pt);
        Assert.Equal("FCU", pt!.Loai);
        Assert.Equal("05", pt.Tang);
        Assert.Equal(7, pt.Stt);

        Assert.Null(TagSchedule.PhanTich(Mau, "FCU05"));
        Assert.Null(TagSchedule.PhanTich(Mau, ""));
    }

    [Fact]
    public void Mau_khac_van_dung_duoc_khong_hard_code()
    {
        Assert.Equal("SPK.001", TagSchedule.Dung("{type}.{seq}", "SPK", "05", 1, soChuSo: 3));
        Assert.Equal(1, TagSchedule.PhanTich("{type}.{seq}", "SPK.001")!.Stt);
    }

    [Fact]
    public void Loai_thiet_bi_lay_tu_id_manifest()
    {
        Assert.Equal("FCU", TagSchedule.LoaiTuBlock("fcu-unit", "FCU"));
        Assert.Equal("AHU", TagSchedule.LoaiTuBlock(null, "AHU-01"));
        Assert.Equal("TB", TagSchedule.LoaiTuBlock(null, null));
    }

    // ===== AC14: quét trùng =====

    [Fact]
    public void AC14_hai_thiet_bi_trung_tag_thi_bao_dung_hai_doi_tuong()
    {
        List<TagHienCo> tags =
        [
            new("2A1", "FCU-05-01", "FCU", false),
            new("2A2", "FCU-05-01", "FCU", false),
            new("2A3", "FCU-05-02", "FCU", false),
        ];

        var kq = TagSchedule.Quet(Mau, tags);

        var trung = Assert.Single(kq.Trung);
        Assert.Equal(2, trung.Handles.Count);
        Assert.Equal(["2A1", "2A2"], trung.Handles);
        Assert.Empty(kq.NhaySo);
        Assert.Equal(3, kq.SoTag);
    }

    [Fact]
    public void Quet_bao_nhay_so_theo_tung_loai_va_tang()
    {
        List<TagHienCo> tags =
        [
            new("2A1", "FCU-05-01", "FCU", false),
            new("2A2", "FCU-05-03", "FCU", false),
            new("2A4", "AHU-05-01", "AHU", false),
        ];

        var kq = TagSchedule.Quet(Mau, tags);

        var nhay = Assert.Single(kq.NhaySo);
        Assert.Contains("FCU", nhay.MoTa);
        Assert.Contains("thiếu 2", nhay.MoTa);
    }

    [Fact]
    public void Tag_rong_va_tag_tu_do_duoc_liet_rieng_khong_bao_oan()
    {
        List<TagHienCo> tags =
        [
            new("2A1", "", "FCU", false),
            new("2A2", "FCU-CU-TAY", "FCU", false),
            new("2A3", "FCU-05-01", "FCU", false),
        ];

        var kq = TagSchedule.Quet(Mau, tags);

        Assert.Equal(["2A1"], kq.HandleTrong);
        Assert.Equal(["2A2"], kq.HandleKhacMau);
        Assert.Empty(kq.Trung);
        Assert.Empty(kq.NhaySo);
    }

    // ===== AC14: đánh lại =====

    [Fact]
    public void AC14_danh_lai_het_trung_va_giu_nguyen_tag_da_khoa()
    {
        List<TagHienCo> tags =
        [
            new("2A1", "FCU-05-01", "FCU", false),
            new("2A2", "FCU-05-01", "FCU", false),
            new("2A3", "FCU-05-02", "FCU", true), // kỹ sư đã khóa
        ];

        var gan = TagSchedule.DanhLai(Mau, "05", tags);

        // Tag đã khóa không được đụng tới…
        Assert.DoesNotContain(gan, g => g.Handle == "2A3");
        // …và số của nó (02) cũng không bị cấp lại cho khối khác.
        var moi = tags.ToDictionary(t => t.Handle, t => t.Tag);
        foreach (var g in gan) moi[g.Handle] = g.TagMoi;
        Assert.Equal("FCU-05-01", moi["2A1"]);
        Assert.Equal("FCU-05-03", moi["2A2"]);
        Assert.Equal("FCU-05-02", moi["2A3"]);
        Assert.Equal(3, moi.Values.Distinct(StringComparer.OrdinalIgnoreCase).Count());

        // Quét lại: sạch trùng.
        var lai = TagSchedule.Quet(Mau, tags.Select(t => t with { Tag = moi[t.Handle] }).ToList());
        Assert.Empty(lai.Trung);
    }

    [Fact]
    public void Danh_lai_moi_loai_mot_day_so_rieng_bat_dau_tu_1()
    {
        List<TagHienCo> tags =
        [
            new("2A1", "", "FCU", false),
            new("2A2", "", "AHU", false),
            new("2A3", "", "FCU", false),
        ];

        var gan = TagSchedule.DanhLai(Mau, "05", tags).ToDictionary(g => g.Handle, g => g.TagMoi);

        Assert.Equal("FCU-05-01", gan["2A1"]);
        Assert.Equal("FCU-05-02", gan["2A3"]);
        Assert.Equal("AHU-05-01", gan["2A2"]);
    }

    [Fact]
    public void Danh_lai_khong_tra_ve_khoi_giu_nguyen_tag_cu()
    {
        List<TagHienCo> tags = [new("2A1", "FCU-05-01", "FCU", false)];

        Assert.Empty(TagSchedule.DanhLai(Mau, "05", tags));
    }
}
