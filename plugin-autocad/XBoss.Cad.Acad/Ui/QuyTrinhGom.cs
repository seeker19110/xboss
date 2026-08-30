using Autodesk.AutoCAD.DatabaseServices;
using XBoss.Cad.Acad.Commands;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui;
using AcadApp = Autodesk.AutoCAD.ApplicationServices.Application;

namespace XBoss.Cad.Acad.Ui;

/// <summary>
/// Gom <b>dấu hiệu</b> cho trình dẫn quy trình (M106 FR8): token/rule pack, sidecar cạnh DWG,
/// XData trên bản vẽ hiện hành. Song song với <see cref="TrangThaiGom"/> (bảng trạng thái M102),
/// tách riêng vì đây là phép ĐỌC BẢN VẼ, nặng hơn hẳn phép đọc tệp cấu hình của bảng trạng thái.
///
/// Chỉ ĐỌC và chỉ DỊCH dữ liệu thô: mọi quy tắc "bước nào xong, vì sao chưa vào được" nằm ở
/// <see cref="QuyTrinh.TinhTrang"/> bên Core, có test. Lớp này không được có nhánh <c>if</c> nào
/// mang nghĩa nghiệp vụ.
/// </summary>
internal static class QuyTrinhGom
{
    internal static DauHieuQuyTrinh LayDauHieu()
    {
        var serverUrl = XBossLoginCommand.DocServerUrl();
        var coToken = serverUrl is not null && CredentialStore.DocToken(serverUrl) is not null;
        var (pack, _) = RulePackStore.HienHanh();

        var db = AcadApp.DocumentManager.MdiActiveDocument?.Database;
        var tepDwg = db?.Filename;

        // Chưa mở/chưa lưu bản vẽ: mọi dấu hiệu bước 2..6 đều đọc từ bản vẽ nên để nguyên mặc
        // định — Core sẽ trả "không áp dụng" kèm lý do, không phải "chưa làm".
        if (db is null || string.IsNullOrEmpty(tepDwg))
            return new DauHieuQuyTrinh { CoTokenThietBi = coToken, CoRulePack = pack is not null };

        // Mẫu tên layout trang in nằm ở khối sheetSetup (rule pack v4) — đọc im lặng, thiếu thì
        // SheetSetup tự dùng mẫu mặc định.
        var mauTenLayout = VeContext.DrawToolsHienHanh().Pack?.SheetSetup.LayoutNamePattern ?? "";
        var quet = QuetBanVe(db, pack?.Takeoff.XdataAppName, mauTenLayout);

        return new DauHieuQuyTrinh
        {
            CoTokenThietBi = coToken,
            CoRulePack = pack is not null,
            CoBanVe = true,
            SoLoiKiemTra = DocSoLoiKiemTra(tepDwg),
            CoTuyen = quet.Tuyen,
            CoChiaDot = quet.ChiaDot,
            CoGiaDo = quet.GiaDo,
            CoTag = quet.Tag,
            CoBangThongKe = quet.BangThongKe,
            CoTrangIn = quet.TrangIn,
            CoDauBoc = quet.DauBoc,
            CoSidecarBocKl = File.Exists(tepDwg + XBossCommands.TenSidecarBocKL),
        };
    }

    /// <summary>Số lỗi của báo cáo kiểm tra gần nhất; null = chưa có/không đọc được sidecar.</summary>
    private static int? DocSoLoiKiemTra(string tepDwg)
    {
        var duongDan = tepDwg + SidecarSummary.DuoiKiemTra;
        if (!File.Exists(duongDan)) return null;
        try
        {
            return SidecarSummary.SoLoiKiemTra(File.ReadAllText(duongDan));
        }
        catch (IOException)
        {
            // Sidecar đang bị khoá — coi như chưa biết, y hệt bảng trạng thái M102 làm.
            return null;
        }
    }

    private readonly record struct KetQuaQuet(
        bool Tuyen, bool ChiaDot, bool GiaDo, bool Tag, bool BangThongKe, bool TrangIn, bool DauBoc);

    /// <summary>
    /// Quét model space MỘT lượt, gom mọi dấu hiệu của bước 3–6 (XData <c>XBOSS_VE</c>, thẻ TAG,
    /// dấu bóc) rồi soi danh sách layout cho bước 5. Đọc thuần, không mở khoá tài liệu, không sửa
    /// gì; lỗi AutoCAD (bản vẽ đang bận, tài liệu vừa đóng) → trả toàn <c>false</c> vì bảng điều
    /// khiển tuyệt đối không được làm sập AutoCAD, và "chưa" là phía an toàn của một trình dẫn.
    ///
    /// Quét cả model space chỉ để vẽ một bảng nghe nặng, nhưng: mỗi lần chỉ đọc XData (rẻ hơn
    /// hẳn XBOSS_KIEMTRA/XBOSS_BOCKL vốn còn dựng hình học), thoát sớm ngay khi đủ 6 dấu hiệu, và
    /// chỉ chạy khi bảng ĐANG HIỆN (mở bảng / đổi bản vẽ / bấm Làm mới).
    /// </summary>
    private static KetQuaQuet QuetBanVe(Database db, string? appBoc, string mauTenLayout)
    {
        bool tuyen = false, chiaDot = false, giaDo = false, tag = false, bangThongKe = false, dauBoc = false;
        var trangIn = false;
        try
        {
            using var tr = db.TransactionManager.StartTransaction();
            foreach (var id in TakeoffScanner.ModelSpaceIds(db, tr))
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;

                if (VeXDataStore.Doc(ent) is { } xd)
                {
                    switch (xd.VaiTro)
                    {
                        case VaiTroVe.Tim:
                            tuyen = true;
                            // Tóm tắt chia đốt nằm ngay trên tim (M105) — đọc lại được sau khi
                            // đóng/mở bản vẽ, kể cả khi vạch chia bị xoá tay.
                            if (xd.KieuNoi is not null) chiaDot = true;
                            break;
                        case VaiTroVe.VachChia:
                        case VaiTroVe.NhanDot:
                            chiaDot = true;
                            break;
                        case VaiTroVe.GiaDo:
                            giaDo = true;
                            break;
                        case VaiTroVe.BangThongKe:
                            bangThongKe = true;
                            break;
                    }
                }

                if (!tag && ent is BlockReference br &&
                    VeXDataStore.TagCua(tr, br) is { TextString.Length: > 0 })
                {
                    tag = true;
                }

                if (!dauBoc && appBoc is not null && MarkService.ReadMark(ent, appBoc) is not null)
                    dauBoc = true;

                if (tuyen && chiaDot && giaDo && tag && bangThongKe && dauBoc) break; // đủ dấu hiệu, thôi quét
            }

            var layout = (DBDictionary)tr.GetObject(db.LayoutDictionaryId, OpenMode.ForRead);
            foreach (DBDictionaryEntry muc in layout)
            {
                if (!SheetSetup.LaTenLayoutTrangIn(mauTenLayout, muc.Key)) continue;
                trangIn = true;
                break;
            }

            tr.Commit();
        }
        catch (Autodesk.AutoCAD.Runtime.Exception)
        {
            return default;
        }

        return new KetQuaQuet(tuyen, chiaDot, giaDo, tag, bangThongKe, trangIn, dauBoc);
    }
}
