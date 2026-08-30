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
///
/// Thư viện ĐA TỆP (M104 §1): ứng viên CHỈ gộp block mới vào bản sao <c>blocks.dwg</c> nền — các
/// block thêm từ web (entry có <c>fileKey</c>) KHÔNG được nuốt vào tệp nền, chúng ở nguyên tệp .dwg
/// riêng của mình. Manifest ứng viên dựng thẳng trên chuỗi JSON manifest hiện hành nên giữ nguyên
/// mọi <c>fileKey</c>/<c>fileSha256</c>; máy chủ chặn đúng lỗi này
/// (<c>soSanhManifestUngVien</c> trong <c>lib/ky-thuat/cad/block-proposals.ts</c>: mất/đổi
/// <c>fileKey</c> là từ chối đề xuất).
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

    /// <summary>Một định nghĩa block đọc được khi quét toàn bản vẽ (M108 §6.1).</summary>
    /// <param name="LyDoBoQua">Null = nạp được; khác null = bị loại, kèm lý do tiếng Việt.</param>
    internal sealed record UngVienLo(
        ObjectId IdDinhNghia,
        string TenBlock,
        string Layer,
        int SoLanChen,
        string? LyDoBoQua);

    /// <summary>
    /// Quét TOÀN BỘ block table của bản vẽ thành danh sách ứng viên cho <c>XBOSS_VE_DEXUAT_LO</c>.
    ///
    /// Chỉ ĐỌC — transaction tự abort khi Dispose, bản vẽ của kỹ sư không đổi một byte nào.
    ///
    /// Luật loại bám đúng <see cref="DocDinhNghia"/> của M103 (một block) để hai đường không lệch:
    /// xref, block ẩn danh, layout đều bị loại KÈM LÝ DO ĐẾM ĐƯỢC — người dùng phải thấy vì sao
    /// một block không lên, chứ không phải nó biến mất im lặng.
    /// </summary>
    internal static IReadOnlyList<UngVienLo> QuetToanBoDinhNghia(Database db)
    {
        var ketQua = new List<UngVienLo>();
        using var tr = db.TransactionManager.StartTransaction();
        {
            var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
            foreach (ObjectId id in bt)
            {
                if (tr.GetObject(id, OpenMode.ForRead) is not BlockTableRecord btr) continue;

                string? lyDo = null;
                if (btr.IsFromExternalReference || btr.IsFromOverlayReference)
                    lyDo = "Là tham chiếu ngoài (xref), không phải block thư viện.";
                else if (btr.IsAnonymous)
                    lyDo = "Block ẩn danh (do hatch/khối động sinh ra) — không có tên để đưa vào thư viện.";
                else if (btr.IsLayout)
                    lyDo = "Là không gian layout, không phải block thư viện.";

                // Số lần chèn: đếm bản ghi tham chiếu tới định nghĩa. Chỉ để người dùng lọc, không
                // ảnh hưởng việc nạp — block chưa chèn vẫn là block hợp lệ của thư viện.
                var soChen = 0;
                if (lyDo is null)
                {
                    using var refs = btr.GetBlockReferenceIds(directOnly: true, forceValidity: false);
                    soChen = refs.Count;
                }

                // Layer của định nghĩa lấy từ thực thể đầu tiên — chỉ để đối chiếu bằng mắt.
                var layer = "";
                if (lyDo is null)
                {
                    foreach (ObjectId idCon in btr)
                    {
                        if (tr.GetObject(idCon, OpenMode.ForRead) is Entity e)
                        {
                            layer = e.Layer;
                            break;
                        }
                    }
                }

                ketQua.Add(new UngVienLo(id, btr.Name, layer, soChen, lyDo));
            }
        }
        return ketQua;
    }

    /// <summary>
    /// Dựng tệp lô: một database MỚI, rỗng, chứa đúng những định nghĩa block được chọn + sidecar DXF.
    ///
    /// Khác <see cref="Dung"/> (M103): KHÔNG dựng trên bản sao <c>blocks.dwg</c> của thư viện. Máy
    /// chủ đọc lô bằng cách liệt kê mọi định nghĩa block trong DXF, nên nếu lấy tệp thư viện làm
    /// nền thì mọi block đang có của thư viện cũng lọt vào lô rồi bị gạt vì "trùng tên" — đúng kết
    /// quả nhưng tốn công vô ích và làm danh sách bỏ qua đầy nhiễu.
    ///
    /// Bản vẽ nguồn chỉ được ĐỌC (tài liệu phải đang được khóa). Tệp tạm dọn trong <c>finally</c>.
    /// </summary>
    internal static TepUngVien DungLo(Database nguon, IReadOnlyList<ObjectId> idDinhNghias)
    {
        if (idDinhNghias.Count == 0)
            throw new BlockManifestException("Không có định nghĩa block nào được chọn để dựng lô.");

        var thuMucTam = Path.Combine(Path.GetTempPath(), $"xboss-dexuat-lo-{Guid.NewGuid():N}");
        try
        {
            Directory.CreateDirectory(thuMucTam);
            var duongDwg = Path.Combine(thuMucTam, "lo-block.dwg");
            var duongDxf = Path.Combine(thuMucTam, "lo-block.dxf");

            using (var lo = new Database(buildDefaultDrawing: true, noDocument: true))
            {
                using var ids = new ObjectIdCollection();
                foreach (var id in idDinhNghias) ids.Add(id);
                using var anhXa = new IdMapping();
                // Ignore: bản ghi phụ trùng tên (layer, kiểu chữ) giữ bản của tệp đích. Các định
                // nghĩa block đều là tên mới trong một database rỗng nên không có gì bị nuốt.
                nguon.WblockCloneObjects(ids, lo.BlockTableId, anhXa, DuplicateRecordCloning.Ignore, false);

                lo.SaveAs(duongDwg, lo.OriginalFileVersion);
                lo.DxfOut(duongDxf, 16, lo.OriginalFileVersion);
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
            using (BlockLibraryBootstrap.AcquireCacheLock(BlockLibraryService.ThuMucCache))
            {
                var manifest = BlockManifestLoader.Load(File.ReadAllText(BlockLibraryService.ManifestPath));
                BlockManifestLoader.KiemTraHashTep(manifest, BlockLibraryService.DwgPath);
                File.Copy(BlockLibraryService.DwgPath, duongDwg);
            }

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
