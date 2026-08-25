using XBoss.Cad.Acad.Commands;
using XBoss.Cad.Acad.Services;
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

        return new TrangThaiPhien
        {
            ServerUrl = serverUrl,
            DaGhepThietBi = daGhep,
            RulePackVersion = pack?.Version,
            SoQuyTacBoc = pack?.Takeoff.Items.Count ?? 0,
            SoNhomLayer = pack?.LayerMap.Groups.Count ?? 0,
            // Có cache mà không nạp được = cache hỏng → hiện đúng lý do; chưa có cache
            // ("chưa nạp") thì để model tự hiện thông điệp chuẩn của nó.
            LoiRulePack = pack is null && File.Exists(RulePackStore.CachePath) ? loiRulePack : null,
            TenBanVe = string.IsNullOrEmpty(tenTepDwg) ? null : Path.GetFileName(tenTepDwg),
            KetQuaGanNhat = ketQua,
        };
    }
}
