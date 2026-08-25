using XBoss.Cad.Acad.Commands;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.Ui;
using AcadApp = Autodesk.AutoCAD.ApplicationServices.Application;

namespace XBoss.Cad.Acad.Ui;

/// <summary>
/// Gom trạng thái phiên cho bảng điều khiển (M102): server/token (CredentialStore),
/// rule pack (RulePackStore), bản vẽ hiện hành + tóm tắt các sidecar JSON cạnh DWG.
/// Chỉ ĐỌC — không đụng bản vẽ, không gọi mạng; logic dựng bảng nằm ở Core
/// (<see cref="BangDieuKhienModel"/>) nên phần này chỉ là lớp dịch dữ liệu thô.
/// </summary>
internal static class TrangThaiGom
{
    // Đề xuất block phải hỏi SERVER nên không lấy được trong hàm đồng bộ này: bảng vẽ ngay bằng
    // bản gần nhất, rồi LamMoiDeXuatAsync cập nhật và vẽ lại (xem BangDieuKhienControl.LamMoi).
    private static IReadOnlyList<XBossApiClient.DeXuatTomTat> _deXuat = [];
    private static bool _laNguoiDuyet;
    private static string? _loiDeXuat = "Đang hỏi server...";

    internal static TrangThaiPhien LayTrangThai()
    {
        var serverUrl = XBossLoginCommand.DocServerUrl();
        var daGhep = serverUrl is not null && CredentialStore.DocToken(serverUrl) is not null;

        var (pack, loiRulePack) = RulePackStore.HienHanh();

        var tenTepDwg = AcadApp.DocumentManager.MdiActiveDocument?.Database.Filename;
        var ketQua = new List<DongTrangThai>();
        if (!string.IsNullOrEmpty(tenTepDwg))
        {
            foreach (var (duoiTep, nhan) in SidecarSummary.CacLoai)
            {
                var duongDan = tenTepDwg + duoiTep;
                if (!File.Exists(duongDan)) continue;
                try
                {
                    if (SidecarSummary.TomTat(nhan, File.ReadAllText(duongDan)) is { } dong)
                        ketQua.Add(dong);
                }
                catch (IOException)
                {
                    // Sidecar đang bị khóa/không đọc được — bỏ qua, bảng vẫn hiện phần còn lại.
                }
            }
        }

        var (thuVien, loiThuVien) = BlockLibraryService.HienHanh();

        return new TrangThaiPhien
        {
            ServerUrl = serverUrl,
            DaGhepThietBi = daGhep,
            RulePackVersion = pack?.Version,
            SoQuyTacBoc = pack?.Takeoff.Items.Count ?? 0,
            SoNhomLayer = pack?.LayerMap.Groups.Count ?? 0,
            ThuVienVersion = thuVien?.Version,
            SoBlockThuVien = thuVien?.Blocks.Count ?? 0,
            LoiThuVien = thuVien is null ? loiThuVien : null,
            DeXuat = _deXuat,
            LaNguoiDuyet = _laNguoiDuyet,
            LoiDeXuat = _loiDeXuat,
            // Có cache mà không nạp được = cache hỏng → hiện đúng lý do; chưa có cache
            // ("chưa nạp") thì để model tự hiện thông điệp chuẩn của nó.
            LoiRulePack = pack is null && File.Exists(RulePackStore.CachePath) ? loiRulePack : null,
            TenBanVe = string.IsNullOrEmpty(tenTepDwg) ? null : Path.GetFileName(tenTepDwg),
            KetQuaGanNhat = ketQua,
        };
    }

    /// <summary>
    /// Hỏi server danh sách đề xuất block của tôi (M103 §4) rồi cất vào bộ nhớ cho lần vẽ bảng kế
    /// tiếp. KHÔNG bao giờ ném: bảng điều khiển chỉ là màn hình trạng thái, mất mạng thì hiện lý do
    /// chứ không được làm sập palette.
    /// </summary>
    internal static async Task LamMoiDeXuatAsync()
    {
        var serverUrl = XBossLoginCommand.DocServerUrl();
        if (serverUrl is null || CredentialStore.DocToken(serverUrl) is not { } token)
        {
            _deXuat = [];
            _laNguoiDuyet = false;
            _loiDeXuat = "Chưa ghép thiết bị — chạy XBOSS_LOGIN để xem/gửi đề xuất";
            return;
        }
        try
        {
            var kq = await new XBossApiClient(serverUrl).LayDeXuatBlockAsync(token);
            _deXuat = kq.DeXuat;
            _laNguoiDuyet = kq.LaNguoiDuyet;
            _loiDeXuat = null;
        }
        catch (XBossApiException e)
        {
            _loiDeXuat = $"Không lấy được danh sách: {e.Message}";
        }
        catch (HttpRequestException e)
        {
            _loiDeXuat = $"Không kết nối được server ({e.Message})";
        }
        catch (TaskCanceledException)
        {
            _loiDeXuat = "Server phản hồi quá lâu — thử Làm mới lại";
        }
    }
}
