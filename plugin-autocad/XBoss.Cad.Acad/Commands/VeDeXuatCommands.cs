using System.Text.Json.Nodes;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui;
using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeDeXuatCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_DEXUAT</c> (M103 §4) — đề xuất một block trong bản vẽ vào THƯ VIỆN CHUẨN.
///
/// Đề xuất KHÔNG sửa thư viện: plugin dựng sẵn "thư viện ứng viên" (bản sao <c>blocks.dwg</c> của
/// cache + định nghĩa block mới + manifest mới + sidecar DXF) rồi gửi lên hàng chờ; Admin/PM duyệt
/// trên web thì server mới chép nguyên gói thành version thư viện mới (M103 §1).
///
/// Bốn chốt chặn, theo đúng thứ tự:
/// <list type="number">
/// <item>phải đã <c>XBOSS_LOGIN</c> (token thiết bị) — không có đường gửi nào khác;</item>
/// <item>bắt buộc tải thư viện mới nhất TRƯỚC: dựng trên bản cũ chắc chắn ăn 409 stale;</item>
/// <item>chọn đúng 1 BlockReference (chọn thứ khác thì AutoCAD nhắc lại);</item>
/// <item>metadata đủ theo loại — hộp thoại khóa nút Gửi, không đẩy việc kiểm sang server.</item>
/// </list>
/// <c>CommandFlags.Session</c> vì lệnh bất đồng bộ (chờ mạng không được chặn UI — NFR3); mọi thao
/// tác đọc bản vẽ đều nằm trong <c>doc.LockDocument()</c>.
/// </summary>
public sealed class VeDeXuatCommands
{
    [CommandMethod("XBOSS_VE_DEXUAT", CommandFlags.Session)]
    public async void DeXuatBlock()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;

        // (1) Token thiết bị — như XBOSS_UPLOAD (AC8: chỉ-cache thì CẤM gửi lên).
        var baseUrl = XBossLoginCommand.DocServerUrl();
        if (baseUrl is null)
        {
            ed.WriteMessage("\n[XBoss] Chưa cấu hình server — chạy XBOSS_LOGIN trước.\n");
            return;
        }
        if (CredentialStore.DocToken(baseUrl) is not { } token)
        {
            ed.WriteMessage($"\n[XBoss] Máy chưa ghép thiết bị với {baseUrl} — chạy XBOSS_LOGIN.\n");
            return;
        }

        // (2) Thư viện phải là bản MỚI NHẤT trên server (M103 §1) — lệch là dừng ngay tại đây.
        var client = new XBossApiClient(baseUrl);
        ed.WriteMessage("\n[XBoss] Đang đồng bộ thư viện block trước khi dựng đề xuất...\n");
        bool datThuVien;
        string thongDiepTai;
        try
        {
            (datThuVien, thongDiepTai) = await BlockLibraryService.TaiVeChiTietAsync(client, token);
        }
        catch (HttpRequestException e)
        {
            ed.WriteMessage($"\n[XBoss] Lỗi mạng khi đồng bộ thư viện block: {e.Message}\n");
            return;
        }
        ed.WriteMessage($"[XBoss] {thongDiepTai}\n");
        if (!datThuVien)
        {
            ed.WriteMessage(
                "[XBoss] DỪNG: đề xuất phải dựng trên thư viện block MỚI NHẤT, nếu không server sẽ từ chối " +
                "(409 stale). Xử lý lỗi trên rồi chạy lại XBOSS_VE_DEXUAT.\n");
            return;
        }
        if (BlockLibraryService.CanThuVien(ed) is not { } thuVien) return;

        // (3) Chọn khối trên màn hình. AddAllowedClass(exact) + SetRejectMessage ⇒ chọn nhầm loại
        //     đối tượng thì chính AutoCAD nhắc lại, không thoát lệnh.
        var hoi = new PromptEntityOptions("\n[XBoss] Chọn KHỐI cần đề xuất vào thư viện: ");
        hoi.SetRejectMessage(
            "\n[XBoss] Chỉ chọn được KHỐI (block reference) — bấm vào một khối đã chèn trong bản vẽ.\n");
        hoi.AddAllowedClass(typeof(BlockReference), true);
        var chon = ed.GetEntity(hoi);
        if (chon.Status != PromptStatus.OK)
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — chưa gửi đề xuất nào.\n");
            return;
        }

        BlockUngVienBuilder.ThongTinBlock info;
        using (doc.LockDocument())
        {
            var (docDuoc, loiDoc) = BlockUngVienBuilder.DocDinhNghia(db, chon.ObjectId);
            if (docDuoc is null)
            {
                ed.WriteMessage($"\n[XBoss] {loiDoc}\n");
                return;
            }
            info = docDuoc;
        }
        if (info.LaBlockDong)
        {
            ed.WriteMessage(
                $"\n[XBoss] ⚠ \"{info.TenBlock}\" là KHỐI ĐỘNG — đề xuất gửi ĐỊNH NGHĨA GỐC, không kèm trạng thái " +
                "tham số của khối đang chọn.\n");
        }
        ed.WriteMessage(
            $"\n[XBoss] Block: {info.TenBlock} · layer {info.Layer}" +
            $"{(info.ThuocTinh.Count > 0 ? $" · thuộc tính: {string.Join(", ", info.ThuocTinh)}" : " · không có thuộc tính")}\n");

        // (4) Hộp thoại metadata (đoán sẵn hệ theo layer, item theo tên block).
        var meta = DeXuatBlockDialog.Hoi(
            info.TenBlock,
            thuVien.Blocks.Select(b => b.BlockName).ToList(),
            pack.RulePack.LayerMap.Groups.Select(g => (Id: g.Id, Nhan: NhanHe(pack, g.Id))).ToList(),
            BlockUngVien.DoanHeTheoLayer(pack.RulePack.LayerMap, info.Layer),
            ItemDem(pack.RulePack.Takeoff),
            BlockUngVien.DoanItemTheoTenBlock(pack.RulePack.Takeoff, info.TenBlock),
            pack.SheetSetup.PaperSizes);
        if (meta is null)
        {
            ed.WriteMessage("\n[XBoss] Đã hủy hộp thoại — chưa gửi đề xuất nào.\n");
            return;
        }

        // (5) Dựng thư viện ứng viên trên side database (KHÔNG đụng bản vẽ đang mở).
        BlockUngVienBuilder.TepUngVien tep;
        JsonObject manifestUngVien;
        try
        {
            using (doc.LockDocument())
            {
                tep = BlockUngVienBuilder.Dung(db, info.IdDinhNghia, info.TenBlock, meta.BlockName);
            }
            manifestUngVien = BlockUngVien.DungManifest(
                BlockLibraryService.ManifestJson(), meta, info.ThuocTinh, tep.Sha256);
        }
        catch (BlockManifestException e)
        {
            ed.WriteMessage($"\n[XBoss] Không dựng được thư viện ứng viên: {e.Message}\n");
            return;
        }
        catch (Autodesk.AutoCAD.Runtime.Exception e)
        {
            ed.WriteMessage($"\n[XBoss] AutoCAD không sao chép được định nghĩa block sang tệp ứng viên: {e.Message}\n");
            return;
        }
        catch (IOException e)
        {
            ed.WriteMessage($"\n[XBoss] Lỗi tệp khi dựng thư viện ứng viên: {e.Message}\n");
            return;
        }
        catch (UnauthorizedAccessException e)
        {
            ed.WriteMessage($"\n[XBoss] Không có quyền ghi tệp tạm khi dựng thư viện ứng viên: {e.Message}\n");
            return;
        }

        // (6) Gửi.
        ed.WriteMessage(
            $"\n[XBoss] Đang gửi đề xuất \"{meta.BlockName}\" ({tep.Dwg.Length / 1024} KB) lên {baseUrl}...\n");
        try
        {
            var kq = await client.GuiDeXuatBlockAsync(token, new DeXuatBlockGoi
            {
                Meta = meta,
                BaseLibVersion = thuVien.Version,
                CandidateManifest = manifestUngVien,
                Sha256 = tep.Sha256,
                CandidateDwg = tep.Dwg,
                SidecarDxf = tep.Dxf,
            });

            if (!kq.DuocNhan)
            {
                ed.WriteMessage("\n[XBoss] ❌ SERVER TỪ CHỐI đề xuất (thư viện KHÔNG đổi):\n");
                foreach (var l in kq.LoiKiemDinh) ed.WriteMessage($"[XBoss]   • {l}\n");
                if (kq.ThongDiep is { Length: > 0 } td) ed.WriteMessage($"[XBoss] {td}\n");
                return;
            }

            ed.WriteMessage(kq.Idempotent
                ? $"\n[XBoss] ✔ Đề xuất này đã gửi trước đó — vẫn là đề xuất #{kq.Id} (không tạo bản đôi).\n"
                : $"\n[XBoss] ✔ Đã gửi đề xuất #{kq.Id} cho block \"{meta.BlockName}\" — đang CHỜ Admin/PM duyệt.\n");
            if (!kq.CoPreview)
                ed.WriteMessage("[XBoss] ⚠ Server chưa dựng được ảnh xem trước từ DXF — người duyệt vẫn xem được metadata.\n");
            ed.WriteMessage(
                "[XBoss] Thư viện CHƯA đổi: chỉ khi được duyệt mới sinh version mới, lúc đó chạy XBOSS_LOGIN " +
                "(hoặc XBOSS_VE_THUVIEN) để tải về. Theo dõi trạng thái ở bảng XBOSS_BANG.\n");
            if (await DuocThemTrucTiepAsync(client, token))
            {
                ed.WriteMessage(
                    "[XBoss] Tài khoản của bạn CÒN được thêm block thẳng vào thư viện trên WEB (không qua hàng " +
                    "chờ duyệt): /engineering/chuan-hoa-ban-ve → Thư Viện Block. Cần gấp thì đi đường đó — " +
                    "AutoCAD chỉ có đường đề xuất.\n");
            }
        }
        catch (XBossApiException e)
        {
            ed.WriteMessage($"\n[XBoss] {e.Message}\n");
        }
        catch (HttpRequestException e)
        {
            ed.WriteMessage($"\n[XBoss] Lỗi mạng khi gửi đề xuất: {e.Message}\n");
        }
    }

    /// <summary>
    /// Vai trò này có được thêm block THẲNG vào thư viện trên web không — hỏi SERVER (cờ
    /// <c>duocThemTrucTiep</c> của <c>GET /block-proposals</c>, M104 §3), KHÔNG suy từ vai trò
    /// nhớ trong máy: quyền là việc của server, đoán ở client là chỉ đường sai cho kỹ sư.
    ///
    /// Chỉ để ĐỔI THÔNG ĐIỆP sau khi đề xuất đã gửi xong — hỏi được thì nói thêm một câu, hỏi
    /// không được (mất mạng, server cũ chưa có cờ, token vừa bị thu hồi) thì im lặng giữ nguyên
    /// thông điệp cũ. Không bao giờ ném: đề xuất đã gửi thành công rồi, một cú GET phụ không được
    /// phép biến kết quả đó thành dòng lỗi đỏ.
    /// </summary>
    private static async Task<bool> DuocThemTrucTiepAsync(XBossApiClient client, string token)
    {
        try
        {
            return (await client.LayDeXuatBlockAsync(token)).DuocThemTrucTiep;
        }
        catch (XBossApiException)
        {
            return false;
        }
        catch (HttpRequestException)
        {
            return false;
        }
        catch (TaskCanceledException)
        {
            return false;
        }
    }

    /// <summary>Tên hệ hiện trong combo: lấy tên tiếng Việt của drawTools nếu có, không thì chính id.</summary>
    private static string NhanHe(DrawToolsPack pack, string heId) =>
        pack.DrawTools.Systems.FirstOrDefault(s => string.Equals(s.Id, heId, StringComparison.Ordinal))?.Name ?? heId;

    /// <summary>Item bóc tách ĐẾM ĐƯỢC (measure=count) — chỉ loại này mới gắn với một block.</summary>
    private static IReadOnlyList<(string Id, string Nhan)> ItemDem(TakeoffSection takeoff) =>
        takeoff.Items
            .Where(i => i.MeasureKind == TakeoffMeasure.Count)
            .Select(i => (Id: i.Id, Nhan: $"{i.Name} ({i.Unit})"))
            .ToList();
}
