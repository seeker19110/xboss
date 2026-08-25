using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Thư viện block chuẩn của bộ lệnh vẽ (M100 §6.10, FR2/FR5/FR6, AC7/AC8).
///
/// Ba việc:
/// <list type="number">
/// <item><b>Cache cục bộ</b> tại <c>%APPDATA%\XBoss\block-lib\</c> (manifest.json + blocks.dwg +
/// etag) — đọc được khi offline, và luôn kiểm sha256 manifest↔tệp TRƯỚC khi dùng (§12: hash lệch
/// là từ chối thẳng, không "dùng tạm").</item>
/// <item><b>Tải từ server</b> qua <c>GET /api/engineering/cad/block-lib</c> bằng đúng token thiết
/// bị của <c>XBOSS_LOGIN</c> (Credential Manager) + ETag — 304 thì giữ nguyên cache (AC8).</item>
/// <item><b>Nhập định nghĩa block vào DWG một lần</b> (WblockClone từ tệp cache): bản vẽ tự chứa
/// định nghĩa, mở trên máy chưa cài plugin vẫn đúng hình. Định nghĩa nhập vào được đánh dấu XData
/// <c>XBOSS_VE</c> (vai trò <see cref="VaiTroVe.DinhNghiaBlock"/> + version thư viện) để lần chèn
/// sau biết định nghĩa đang có đến từ đâu — trùng tên mà khác nguồn thì HỎI, không ghi đè âm thầm
/// (AC7).</item>
/// </list>
/// </summary>
internal static class BlockLibraryService
{
    internal static string ThuMucCache => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "XBoss", "block-lib");

    internal static string ManifestPath => Path.Combine(ThuMucCache, "manifest.json");
    internal static string DwgPath => Path.Combine(ThuMucCache, "blocks.dwg");
    internal static string EtagPath => Path.Combine(ThuMucCache, "blocks.etag");

    private static BlockManifest? _cache;
    private static DateTime _thoiDiemCache;

    /// <summary>Thông điệp tiếng Việt chỉ đường khi máy chưa có thư viện (§6.10).</summary>
    private const string HuongDanLayThuVien =
        "Chưa có thư viện block trên máy. Chạy XBOSS_LOGIN (tự tải bản đang phát hành) " +
        "hoặc XBOSS_VE_THUVIEN để nạp tệp tay (manifest.json + tệp .dwg cạnh nhau).";

    // ===== Cache cục bộ =====

    /// <summary>
    /// Thư viện đang dùng được: manifest đã kiểm + hash tệp .dwg khớp. Trả (null, lý do tiếng Việt)
    /// khi chưa có/hỏng. Đọc lại khi tệp manifest đổi (vừa tải/nạp tay xong).
    /// </summary>
    internal static (BlockManifest? Manifest, string? Loi) HienHanh()
    {
        try
        {
            if (!File.Exists(ManifestPath) || !File.Exists(DwgPath)) return (null, HuongDanLayThuVien);
            var thoiDiem = File.GetLastWriteTimeUtc(ManifestPath);
            if (_cache is not null && thoiDiem == _thoiDiemCache) return (_cache, null);

            var manifest = BlockManifestLoader.Load(File.ReadAllText(ManifestPath));
            BlockManifestLoader.KiemTraHashTep(manifest, DwgPath); // ném khi lệch — không dùng tạm
            _cache = manifest;
            _thoiDiemCache = thoiDiem;
            return (manifest, null);
        }
        catch (BlockManifestException e)
        {
            _cache = null;
            return (null, $"Thư viện block trong cache KHÔNG dùng được: {e.Message}");
        }
        catch (IOException e)
        {
            _cache = null;
            return (null, $"Không đọc được thư viện block trong cache: {e.Message}");
        }
    }

    /// <summary>Thư viện hiện hành hoặc null kèm thông báo đã in ra dòng lệnh (dùng đầu mỗi lệnh).</summary>
    internal static BlockManifest? CanThuVien(Editor ed)
    {
        var (manifest, loi) = HienHanh();
        if (manifest is null) ed.WriteMessage($"\n[XBoss] {loi}\n");
        return manifest;
    }

    /// <summary>Ghi cặp manifest + .dwg vào cache (kiểm hash TRƯỚC, hợp lệ mới ghi đè).</summary>
    private static BlockManifest GhiCache(string manifestJson, byte[] dwg, string? etag)
    {
        var manifest = BlockManifestLoader.Load(manifestJson);
        BlockManifestLoader.KiemTraHashTep(manifest, dwg);

        Directory.CreateDirectory(ThuMucCache);
        File.WriteAllBytes(DwgPath, dwg);
        File.WriteAllText(ManifestPath, manifestJson);
        if (etag is null) DonEtag();
        else File.WriteAllText(EtagPath, etag);

        _cache = manifest;
        _thoiDiemCache = File.GetLastWriteTimeUtc(ManifestPath);
        return manifest;
    }

    private static void DonEtag()
    {
        try
        {
            if (File.Exists(EtagPath)) File.Delete(EtagPath);
        }
        catch (IOException) { /* etag mất chỉ tốn 1 lần tải lại */ }
    }

    private static string? EtagCu()
    {
        try
        {
            return File.Exists(EtagPath) ? File.ReadAllText(EtagPath) : null;
        }
        catch (IOException)
        {
            return null;
        }
    }

    // ===== Tải từ server =====

    /// <summary>
    /// Tải thư viện đang phát hành (AC8). Trả thông điệp tiếng Việt để lệnh gọi in ra — KHÔNG ném
    /// ra ngoài các lỗi "mềm" (chưa phát hành, mất mạng): thiếu thư viện chỉ chặn lệnh chèn block,
    /// không được làm hỏng luồng XBOSS_LOGIN.
    /// </summary>
    internal static async Task<string> TaiVeAsync(XBossApiClient client, string token)
    {
        try
        {
            var etag = EtagCu();
            var (json, etagMoi) = await client.FetchBlockLibManifestAsync(token, etag);
            if (json is null && File.Exists(ManifestPath) && File.Exists(DwgPath))
            {
                var (cu, loi) = HienHanh();
                return cu is not null
                    ? $"Thư viện block không đổi so với cache (version {cu.Version}, {cu.Blocks.Count} block)."
                    : $"Thư viện block không đổi trên server nhưng cache hỏng: {loi}";
            }

            // 304 mà cache khuyết tệp ⇒ hỏi lại từ đầu, không giữ etag rỗng nghĩa.
            if (json is null)
            {
                (json, etagMoi) = await client.FetchBlockLibManifestAsync(token);
                if (json is null) return "Server báo thư viện block không đổi nhưng máy chưa có cache — thử lại sau.";
            }

            var (dwg, _) = await client.FetchBlockLibDwgAsync(token);
            if (dwg is null || dwg.Length == 0) return "Server không trả được tệp .dwg thư viện block.";

            var manifest = GhiCache(json, dwg, etagMoi);
            return $"Đã tải thư viện block {manifest.Version} ({manifest.Blocks.Count} block) → {ThuMucCache}";
        }
        catch (BlockManifestException e)
        {
            return $"Thư viện block server trả về KHÔNG hợp lệ — giữ cache cũ: {e.Message}";
        }
        catch (XBossApiException e)
        {
            return $"Không tải được thư viện block: {e.Message}";
        }
        catch (HttpRequestException e)
        {
            return $"Không kết nối được server để tải thư viện block ({e.Message}) — dùng cache cục bộ nếu có.";
        }
        catch (IOException e)
        {
            return $"Không ghi được thư viện block vào cache: {e.Message}";
        }
        catch (UnauthorizedAccessException e)
        {
            // Lệnh gọi là async void (XBOSS_LOGIN) — ngoại lệ lọt ra sẽ hạ cả AutoCAD, nên bắt luôn.
            return $"Không có quyền ghi vào {ThuMucCache}: {e.Message}";
        }
    }

    /// <summary>
    /// Nạp thư viện từ tệp tay (XBOSS_VE_THUVIEN — đường dự phòng khi offline, như XBOSS_RULEPACK).
    /// Kiểm manifest + hash tệp .dwg TRƯỚC, đạt mới ghi đè cache. Trả thông điệp tiếng Việt.
    /// </summary>
    internal static (BlockManifest? Manifest, string ThongDiep) NapTay(string manifestPath, string dwgPath)
    {
        try
        {
            var manifest = GhiCache(File.ReadAllText(manifestPath), File.ReadAllBytes(dwgPath), etag: null);
            return (manifest,
                $"Đã nạp thư viện block {manifest.Version} ({manifest.Blocks.Count} block) từ tệp tay → {ThuMucCache}");
        }
        catch (BlockManifestException e)
        {
            return (null, $"Thư viện block KHÔNG hợp lệ — không nạp: {e.Message}");
        }
        catch (IOException e)
        {
            return (null, $"Không đọc/ghi được tệp thư viện block: {e.Message}");
        }
        catch (UnauthorizedAccessException e)
        {
            return (null, $"Không có quyền đọc/ghi tệp thư viện block: {e.Message}");
        }
    }

    // ===== Định nghĩa block trong bản vẽ =====

    /// <summary>Định nghĩa block cùng tên đang có trong bản vẽ đến từ đâu.</summary>
    internal enum NguonDinhNghia
    {
        /// <summary>Bản vẽ chưa có block tên này — cứ nhập từ thư viện.</summary>
        ChuaCo,
        /// <summary>Do plugin nhập từ ĐÚNG version thư viện đang dùng — tái dùng, không hỏi.</summary>
        DungThuVien,
        /// <summary>Do plugin nhập từ version thư viện KHÁC — hỏi (AC7).</summary>
        ThuVienKhacVersion,
        /// <summary>Có sẵn trong bản vẽ, không do plugin nhập — không xác minh được, hỏi (AC7).</summary>
        KhongRoNguon,
    }

    /// <summary>Nguồn của định nghĩa block cùng tên trong bản vẽ (transaction chỉ đọc).</summary>
    internal static (NguonDinhNghia Nguon, string? VersionTrongBanVe) KiemTraDinhNghia(
        Database db, Transaction tr, string tenBlock, string versionThuVien)
    {
        var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
        if (!bt.Has(tenBlock)) return (NguonDinhNghia.ChuaCo, null);

        var btr = (BlockTableRecord)tr.GetObject(bt[tenBlock], OpenMode.ForRead);
        var xd = VeXDataStore.Doc(btr);
        if (xd is null || xd.VaiTro != VaiTroVe.DinhNghiaBlock || xd.ThuVienVersion is null)
            return (NguonDinhNghia.KhongRoNguon, null);
        return string.Equals(xd.ThuVienVersion, versionThuVien, StringComparison.Ordinal)
            ? (NguonDinhNghia.DungThuVien, xd.ThuVienVersion)
            : (NguonDinhNghia.ThuVienKhacVersion, xd.ThuVienVersion);
    }

    /// <summary>
    /// Hỏi kỹ sư khi bản vẽ đã có block trùng tên mà không chắc cùng định nghĩa (AC7).
    /// Trả true = cập nhật theo thư viện (redefine), false = giữ định nghĩa trong bản vẽ,
    /// null = hủy lệnh.
    /// </summary>
    internal static bool? HoiKhiTrungTen(
        Editor ed, BlockDef def, NguonDinhNghia nguon, string? versionTrongBanVe, string versionThuVien)
    {
        var moTa = nguon == NguonDinhNghia.ThuVienKhacVersion
            ? $"do XBoss nhập từ thư viện version {versionTrongBanVe} (thư viện hiện tại: {versionThuVien})"
            : "đã có sẵn trong bản vẽ, KHÔNG do XBoss nhập — không xác minh được có đúng định nghĩa chuẩn không";
        ed.WriteMessage(
            $"\n[XBoss] ⚠ Bản vẽ đã có block \"{def.BlockName}\" {moTa}.\n" +
            "[XBoss]   GiuBanVe = giữ nguyên định nghĩa đang có (chèn thêm vẫn dùng định nghĩa cũ)\n" +
            "[XBoss]   CapNhat  = cập nhật định nghĩa theo thư viện chuẩn (mọi khối đã chèn đổi hình theo; UNDO được)\n");

        var hoi = new PromptKeywordOptions("\n[XBoss] Xử lý block trùng tên") { AllowNone = false };
        hoi.Keywords.Add("GiuBanVe", "GiuBanVe", "GiuBanVe");
        hoi.Keywords.Add("CapNhat", "CapNhat", "CapNhat");
        hoi.Keywords.Default = "GiuBanVe";
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return null;
        return kq.StringResult == "CapNhat";
    }

    /// <summary>
    /// Nhập định nghĩa block từ tệp thư viện trong cache vào bản vẽ.
    /// Gọi NGOÀI transaction của bản vẽ đích (WblockCloneObjects làm việc trực tiếp trên database);
    /// vẫn nằm trong CÙNG một lệnh nên UNDO một lần xóa cả định nghĩa lẫn khối vừa chèn.
    /// <paramref name="ghiDe"/> = true khi kỹ sư chọn cập nhật định nghĩa cũ (AC7).
    /// </summary>
    internal static void NhapDinhNghia(Database db, IReadOnlyList<string> tenBlock, bool ghiDe)
    {
        if (tenBlock.Count == 0) return;

        // Side database chỉ để đọc định nghĩa — cùng cách BatchProcessor (M99) mở tệp DWG ngoài.
        using var nguon = new Database(buildDefaultDrawing: false, noDocument: true);
        nguon.ReadDwgFile(DwgPath, FileOpenMode.OpenForReadAndAllShare, allowCPConversion: true, password: null);
        nguon.CloseInput(true); // nhả tệp thư viện ngay, không giữ khóa suốt phiên vẽ

        using var ids = new ObjectIdCollection();
        using (var tr = nguon.TransactionManager.StartTransaction())
        {
            var bt = (BlockTable)tr.GetObject(nguon.BlockTableId, OpenMode.ForRead);
            foreach (var ten in tenBlock)
            {
                if (!bt.Has(ten))
                {
                    tr.Abort();
                    throw new BlockManifestException(
                        $"Tệp thư viện block không chứa định nghĩa \"{ten}\" tuy manifest có khai — " +
                        "thư viện hỏng, tải lại bằng XBOSS_LOGIN hoặc phát hành lại trên web.");
                }
                ids.Add(bt[ten]);
            }
            tr.Commit();
        }

        using var anhXa = new IdMapping();
        nguon.WblockCloneObjects(
            ids, db.BlockTableId, anhXa,
            ghiDe ? DuplicateRecordCloning.Replace : DuplicateRecordCloning.Ignore,
            false);
    }

    /// <summary>Định nghĩa block đang có trong bản vẽ (chỉ đọc); ném khi không có.</summary>
    internal static BlockTableRecord MoDinhNghia(Database db, Transaction tr, string tenBlock)
    {
        var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
        if (!bt.Has(tenBlock))
        {
            throw new BlockManifestException(
                $"Không nhập được định nghĩa block \"{tenBlock}\" vào bản vẽ — thư viện hỏng hoặc bản vẽ bị khóa.");
        }
        return (BlockTableRecord)tr.GetObject(bt[tenBlock], OpenMode.ForRead);
    }

    /// <summary>
    /// Đánh dấu định nghĩa block vừa nhập là "lấy từ thư viện version X" (AC7) và trả chính nó
    /// để chèn khối. CHỈ gọi khi thật sự đã nhập/ghi đè từ thư viện — đánh dấu nhầm lên định nghĩa
    /// sẵn có của bản vẽ sẽ khiến lần sau tưởng là block chuẩn và không hỏi nữa.
    /// </summary>
    internal static BlockTableRecord DanhDauDinhNghia(
        Database db, Transaction tr, BlockDef def, string versionThuVien)
    {
        var btr = MoDinhNghia(db, tr, def.BlockName);
        btr.UpgradeOpen();
        VeXDataStore.Ghi(btr, new VeXDataInfo
        {
            VaiTro = VaiTroVe.DinhNghiaBlock,
            BlockId = def.Id,
            ThuVienVersion = versionThuVien,
        });
        return btr;
    }

    // ===== Chèn khối =====

    /// <summary>
    /// Gắn các thuộc tính (attribute) của định nghĩa block vào khối vừa chèn: giá trị lấy từ
    /// <paramref name="giaTri"/> theo TAG (không phân biệt hoa thường), thiếu thì giữ mặc định của
    /// ATTDEF. Khối phải đã được thêm vào bản vẽ (cần BlockTransform).
    /// </summary>
    internal static void ThemThuocTinh(
        Transaction tr, BlockReference khoi, BlockTableRecord dinhNghia, IDictionary<string, string> giaTri)
    {
        if (!dinhNghia.HasAttributeDefinitions) return;
        foreach (ObjectId id in dinhNghia)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not AttributeDefinition attDef || attDef.Constant) continue;

            var att = new AttributeReference();
            att.SetAttributeFromBlock(attDef, khoi.BlockTransform);
            if (giaTri.TryGetValue(attDef.Tag, out var v)) att.TextString = v;
            khoi.AttributeCollection.AppendAttribute(att);
            tr.AddNewlyCreatedDBObject(att, true);
        }
    }
}
