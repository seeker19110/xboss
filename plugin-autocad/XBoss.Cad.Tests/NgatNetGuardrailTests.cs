using System.Text.RegularExpressions;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M109 AC2 — bất biến quan trọng nhất của cả tính năng: <b>polyline tim không bao giờ bị cắt,
/// chia hay đổi tọa độ đỉnh</b>. Cắt tim là bóc thiếu chiều dài ở <c>XBOSS_BOCKL</c> (M100 FR4),
/// tức là sai khối lượng đưa ra công trường.
///
/// <para><b>Giới hạn của test này — đọc kỹ trước khi tin:</b> AC2 thật sự chỉ chứng minh được trên
/// AutoCAD (chụp <c>LIST</c> tọa độ từng đỉnh trước/sau + so số bóc của <c>XBOSS_BOCKL</c>), và
/// mục đó nằm trong <c>VERIFY-VA-PHAT-HANH.md</c> như một ca verify TAY BẮT BUỘC. CI Linux không
/// có AutoCAD nên không dựng nổi một bản vẽ để so tọa độ.</para>
///
/// <para><b>Vậy test này canh cái gì:</b> canh chính CÁCH THIẾT KẾ đảm bảo bất biến — mã M109 chỉ
/// TẠO thực thể mới và chỉ XÓA thực thể do chính nó tạo, không có một đường nào mở tim ở chế độ
/// ghi. Đây là bất biến đọc được từ mã nguồn nên kiểm được bằng máy: ai đó sửa về sau mà thêm một
/// lời gọi sửa hình học polyline (hoặc mở <c>ForWrite</c> một thứ không phải model space / bảng thứ
/// tự vẽ / đối tượng ngắt nét) là test đỏ NGAY, không phải chờ tới lượt verify tay. Cùng cách
/// <c>LenhCatalogTests</c> đọc mã Adapter để canh danh mục lệnh.</para>
/// </summary>
public sealed class NgatNetGuardrailTests
{
    private static string AdapterDir =>
        Path.Combine(Path.GetDirectoryName(RepoPaths.DoiChungDir)!, "XBoss.Cad.Acad");

    private static string DocTep(params string[] duongDan) =>
        File.ReadAllText(Path.Combine(new[] { AdapterDir }.Concat(duongDan).ToArray()));

    private static string MaLenh => DocTep("Commands", "VeNgatNetCommands.cs");

    private static string MaThucThe => DocTep("Services", "VeThucThe.cs");

    /// <summary>API sửa hình học/độ dài của một đường có sẵn — tuyệt đối không được xuất hiện.</summary>
    private static readonly string[] ApiSuaHinhHoc =
    [
        "AddVertexAt", "RemoveVertexAt", "SetPointAt", "SetBulgeAt", "SetStartWidthAt",
        "GetSplitCurves", "Explode", "ReverseCurve", "TransformBy", "Move", "Offset",
    ];

    [Fact]
    public void Lenh_ngat_net_khong_goi_bat_ky_api_sua_hinh_hoc_nao()
    {
        var ma = MaLenh;
        foreach (var api in ApiSuaHinhHoc)
        {
            Assert.False(
                ma.Contains(api + "(", StringComparison.Ordinal),
                $"VeNgatNetCommands.cs gọi {api}() — M109 guardrail 1 cấm mọi thao tác sửa hình học " +
                "đường có sẵn. Ngắt nét CHỈ được tạo thực thể hiển thị mới.");
        }
    }

    [Fact]
    public void Moi_lan_mo_ForWrite_trong_lenh_ngat_net_deu_la_muc_tieu_hop_le()
    {
        // Ba đích ghi hợp lệ duy nhất: model space (để thêm thực thể mới), bảng thứ tự vẽ, và
        // chính đối tượng vai trò NgatNet sắp bị xóa (nằm ở VeThucThe.XoaNgatNet, không ở đây).
        var hopLe = new[] { "GetBlockModelSpaceId", "DrawOrderTableId" };
        var soDong = 0;
        foreach (var dong in MaLenh.Split('\n'))
        {
            // Bỏ dòng chú thích: chính đoạn tài liệu guardrail ở đầu tệp có nhắc "OpenMode.ForWrite".
            if (dong.TrimStart().StartsWith("//", StringComparison.Ordinal)) continue;
            if (!dong.Contains("OpenMode.ForWrite", StringComparison.Ordinal)) continue;
            soDong++;
            Assert.True(
                hopLe.Any(h => dong.Contains(h, StringComparison.Ordinal)),
                $"VeNgatNetCommands.cs mở ForWrite một đối tượng lạ — nếu đó là tuyến tim thì " +
                $"M109 guardrail 1 đã vỡ. Dòng: {dong.Trim()}");
        }
        Assert.True(soDong > 0, "Không tìm thấy chỗ nào mở ForWrite — test đang dò nhầm tệp?");
    }

    [Fact]
    public void Chi_xoa_doi_tuong_mang_vai_tro_NgatNet()
    {
        // Lệnh không tự gọi Erase(): mọi lần xóa đi qua VeThucThe.XoaNgatNet, và hàm đó kiểm lại
        // vai trò XData ngay trước khi mở ForWrite.
        Assert.DoesNotContain("Erase()", MaLenh, StringComparison.Ordinal);

        var than = Regex.Match(
            MaThucThe,
            @"internal static int XoaNgatNet\(.*?\n    \}",
            RegexOptions.Singleline);
        Assert.True(than.Success, "Không đọc được thân VeThucThe.XoaNgatNet — test đang dò nhầm tệp?");
        Assert.Contains("VaiTro: VaiTroVe.NgatNet", than.Value, StringComparison.Ordinal);
    }

    [Fact]
    public void Dung_dung_ham_hinh_hoc_cua_Core_khong_tinh_lai_o_Adapter()
    {
        // Vùng che và cầu vượt đều phải đến từ CrossingGeometry (Core, có test) — Adapter tính lại
        // là mở đường cho hai bộ hình học lệch nhau, đúng rủi ro số 1 của M99.
        var ma = MaLenh;
        Assert.Contains("CrossingGeometry.VungChe(", ma, StringComparison.Ordinal);
        Assert.Contains("CrossingGeometry.CauVuot(", ma, StringComparison.Ordinal);
        Assert.Contains("CrossingGeometry.DuGocDeNgat(", ma, StringComparison.Ordinal);
        Assert.Contains("Segment2D.GiaoDiemGiuaHaiChuoi(", ma, StringComparison.Ordinal);
        Assert.DoesNotContain("Math.Atan2", ma, StringComparison.Ordinal);
        Assert.DoesNotContain("Math.Sqrt", ma, StringComparison.Ordinal);
    }
}
