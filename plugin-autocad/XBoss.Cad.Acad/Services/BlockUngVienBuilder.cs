using Autodesk.AutoCAD.DatabaseServices;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Dựng "thư viện ứng viên" cho <c>XBOSS_VE_DEXUAT</c> (M103 §1) — phần chạm AutoCAD.
///
/// Nguyên tắc: KHÔNG đụng bản vẽ đang mở. Toàn bộ việc gộp diễn ra trên BẢN SAO tệp
/// <c>blocks.dwg</c> trong cache thư viện, mở bằng side database; bản vẽ của kỹ sư chỉ được ĐỌC
/// (nguồn của <c>WblockCloneObjects</c>). Tệp tạm dọn trong <c>finally</c> — kể cả khi lỗi.
///
/// Phần thuần (manifest ứng viên, quy tắc metadata) nằm ở <see cref="BlockUngVien"/> bên Core.
/// </summary>
internal static class BlockUngVienBuilder
{
    /// <summary>Những gì đọc được từ khối kỹ sư chọn trên màn hình.</summary>
    internal sealed record ThongTinBlock(
        ObjectId IdDinhNghia,
        string TenBlock,
        string Layer,
        IReadOnlyList<string> ThuocTinh,
        bool LaBlockDong);

    /// <summary>Gói tệp ứng viên đã sẵn sàng gửi (đọc hết vào bộ nhớ, tệp tạm đã dọn).</summary>
    internal sealed record TepUngVien(byte[] Dwg, byte[] Dxf, string Sha256);

    /// <summary>
    /// Đọc định nghĩa của khối được chọn (chỉ đọc, một transaction). Trả (null, lý do tiếng Việt)
    /// với các khối không đề xuất được: xref và block ẩn danh không phải block thư viện.
    /// </summary>
    internal static (ThongTinBlock? Info, string? Loi) DocDinhNghia(Database db, ObjectId idKhoi)
    {
        // Chỉ ĐỌC: mọi lối ra sớm để transaction tự abort khi Dispose (không đổi gì trong bản vẽ).
        using var tr = db.TransactionManager.StartTransaction();
        {
            if (tr.GetObject(idKhoi, OpenMode.ForRead) is not BlockReference khoi)
                return (null, "Đối tượng vừa chọn không phải KHỐI (block reference) — chọn lại.");

            // Khối động: BlockTableRecord trỏ tới bản ẩn danh "*U…", định nghĩa GỐC nằm ở
            // DynamicBlockTableRecord — gửi định nghĩa gốc mới có nghĩa với thư viện.
            var idDinhNghia = khoi.DynamicBlockTableRecord;
            var laDong = idDinhNghia != khoi.BlockTableRecord;
            if (tr.GetObject(idDinhNghia, OpenMode.ForRead) is not BlockTableRecord btr)
                return (null, "Không mở được định nghĩa của khối vừa chọn.");

            if (btr.IsFromExternalReference || btr.IsFromOverlayReference)
            {
                return (null,
                    "Khối vừa chọn là THAM CHIẾU NGOÀI (xref), không phải block — " +
                    "xref không đưa vào thư viện block được.");
            }
            if (btr.IsAnonymous)
            {
                return (null,
                    "Khối vừa chọn là block ẩn danh (do hatch/khối động sinh ra) — không có tên để đưa vào thư viện.");
            }
            if (btr.IsLayout)
                return (null, "Khối vừa chọn là không gian layout, không phải block thư viện.");

            var thuocTinh = new List<string>();
            if (btr.HasAttributeDefinitions)
            {
                foreach (ObjectId id in btr)
                {
                    // Attribute cố định không nhập được lúc chèn ⇒ không khai vào manifest.
                    if (tr.GetObject(id, OpenMode.ForRead) is AttributeDefinition att && !att.Constant &&
                        !string.IsNullOrWhiteSpace(att.Tag))
                    {
                        thuocTinh.Add(att.Tag.Trim().ToUpperInvariant());
                    }
                }
            }

            var info = new ThongTinBlock(idDinhNghia, btr.Name, khoi.Layer, thuocTinh, laDong);
            tr.Commit();
            return (info, null);
        }
    }

    /// <summary>
    /// Bản sao tệp thư viện + định nghĩa block mới clone vào + sidecar DXF + sha256.
    /// <paramref name="nguon"/> = database bản vẽ đang mở (chỉ đọc; tài liệu phải đang được KHÓA).
    /// <paramref name="tenGoc"/> = tên định nghĩa trong bản vẽ, <paramref name="tenMoi"/> = tên kỹ
    /// sư chốt trong hộp thoại; khác nhau thì bản CLONE (trong tệp ứng viên) được đổi tên theo —
    /// bản vẽ của kỹ sư không đụng tới. Tên trong tệp .dwg/.dxf phải khớp tên khai trong manifest,
    /// lệch là máy chủ từ chối ("DXF sidecar không có định nghĩa block đó").
    /// Ném <see cref="BlockManifestException"/> với thông điệp tiếng Việt khi không dựng được.
    /// </summary>
    internal static TepUngVien Dung(Database nguon, ObjectId idDinhNghia, string tenGoc, string tenMoi)
    {
        var thuMucTam = Path.Combine(Path.GetTempPath(), $"xboss-dexuat-{Guid.NewGuid():N}");
        try
        {
            Directory.CreateDirectory(thuMucTam);
            var duongDwg = Path.Combine(thuMucTam, "blocks.dwg");
            var duongDxf = Path.Combine(thuMucTam, "blocks.dxf");
            File.Copy(BlockLibraryService.DwgPath, duongDwg);

            using (var ungVien = new Database(buildDefaultDrawing: false, noDocument: true))
            {
                ungVien.ReadDwgFile(duongDwg, FileOpenMode.OpenForReadAndWriteNoShare, allowCPConversion: true, password: null);
                ungVien.CloseInput(true); // nhả tệp để SaveAs ghi đè được

                using (var tr = ungVien.TransactionManager.StartTransaction())
                {
                    var bt = (BlockTable)tr.GetObject(ungVien.BlockTableId, OpenMode.ForRead);
                    var trungTenMoi = bt.Has(tenMoi);
                    var trungTenGoc = !string.Equals(tenGoc, tenMoi, StringComparison.OrdinalIgnoreCase) &&
                                      bt.Has(tenGoc);
                    tr.Commit();
                    if (trungTenMoi)
                    {
                        // Manifest không khai nhưng tệp .dwg đã có định nghĩa cùng tên: ghi đè ở đây
                        // là âm thầm đổi một block của thư viện đang phát hành (AC7) — từ chối thẳng.
                        throw new BlockManifestException(
                            $"Tệp thư viện đã chứa định nghĩa block \"{tenMoi}\" — đổi tên block rồi đề xuất lại.");
                    }
                    if (trungTenGoc)
                    {
                        // Clone theo kiểu Ignore sẽ IM LẶNG bỏ qua khi trùng tên ⇒ tệp ứng viên
                        // không có định nghĩa nào mới. Chặn trước, nói rõ phải làm gì.
                        throw new BlockManifestException(
                            $"Thư viện đã có block trùng tên với block gốc trong bản vẽ (\"{tenGoc}\") nên không sao " +
                            "chép được định nghĩa sang tệp ứng viên — đổi tên block TRONG BẢN VẼ (lệnh RENAME) rồi thử lại.");
                    }
                }

                using var ids = new ObjectIdCollection();
                ids.Add(idDinhNghia);
                using var anhXa = new IdMapping();
                // Ignore (không Replace): hai tên trên đã kiểm là chưa có; các bản ghi phụ đi kèm
                // (layer, kiểu chữ, block lồng cùng tên…) thì GIỮ bản của thư viện, không để bản vẽ
                // của một người ghi đè chuẩn chung.
                nguon.WblockCloneObjects(ids, ungVien.BlockTableId, anhXa, DuplicateRecordCloning.Ignore, false);

                if (!string.Equals(tenGoc, tenMoi, StringComparison.Ordinal)) DoiTen(ungVien, tenGoc, tenMoi);

                // Giữ nguyên đời tệp DWG của thư viện: bản ứng viên khi được duyệt sẽ thành thư
                // viện phát hành cho mọi máy, không tự nâng đời định dạng.
                var doiTep = ungVien.OriginalFileVersion;
                ungVien.SaveAs(duongDwg, doiTep);
                ungVien.DxfOut(duongDxf, 16, doiTep);
            }

            var dwg = File.ReadAllBytes(duongDwg);
            return new TepUngVien(dwg, File.ReadAllBytes(duongDxf), BlockManifestLoader.TinhSha256(dwg));
        }
        finally
        {
            try
            {
                if (Directory.Exists(thuMucTam)) Directory.Delete(thuMucTam, true);
            }
            catch (IOException) { /* tệp tạm — Windows tự dọn %TEMP%, không làm hỏng lệnh */ }
            catch (UnauthorizedAccessException) { /* nt */ }
        }
    }

    /// <summary>Đổi tên định nghĩa block VỪA CLONE trong tệp ứng viên (không đụng bản vẽ gốc).</summary>
    private static void DoiTen(Database ungVien, string tenGoc, string tenMoi)
    {
        using var tr = ungVien.TransactionManager.StartTransaction();
        var bt = (BlockTable)tr.GetObject(ungVien.BlockTableId, OpenMode.ForRead);
        if (!bt.Has(tenGoc))
        {
            tr.Abort();
            throw new BlockManifestException(
                $"Không thấy định nghĩa \"{tenGoc}\" trong tệp ứng viên sau khi sao chép — AutoCAD không clone được block này.");
        }
        var btr = (BlockTableRecord)tr.GetObject(bt[tenGoc], OpenMode.ForWrite);
        btr.Name = tenMoi;
        tr.Commit();
    }
}
