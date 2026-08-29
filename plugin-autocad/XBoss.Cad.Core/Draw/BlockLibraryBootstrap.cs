namespace XBoss.Cad.Core.Draw;

/// <summary>
/// Khởi tạo cache thư viện block từ asset đóng kèm plugin khi máy chưa từng có thư viện.
/// Cache đã tồn tại luôn thắng để bản tải từ server hoặc bản nạp tay không bị hạ cấp.
/// </summary>
public static class BlockLibraryBootstrap
{
    public const string ManifestFileName = "manifest.json";
    public const string DwgFileName = "blocks.dwg";
    private const string LockFileName = ".cache-write.lock";
    private const string PendingFileName = ".cache-write.pending";
    private const string DwgBackupFileName = ".cache-write.dwg.bak";
    private const string ManifestBackupFileName = ".cache-write.manifest.bak";

    /// <summary>
    /// Khoá liên tiến trình dùng chung cho mọi writer của cặp manifest/DWG. Tệp khoá được giữ lại
    /// trong cache; quyền sở hữu nằm ở handle mở độc quyền, không dựa vào việc tệp có tồn tại.
    /// </summary>
    public static IDisposable AcquireCacheLock(string cacheDirectory)
    {
        // Lock phải nằm CÙNG phạm vi chia sẻ với cache (kể cả roaming/RDS/network share). Đặt trong
        // %TEMP% sẽ tạo khóa khác nhau giữa hai session dù chúng cùng ghi một cache roaming.
        Directory.CreateDirectory(cacheDirectory);
        var lockPath = Path.Combine(cacheDirectory, LockFileName);
        var deadline = DateTime.UtcNow.AddSeconds(10);
        FileStream handle;
        while (true)
        {
            try
            {
                // Tệp lock đã có chỉ cần quyền đọc để giữ handle độc quyền; nhờ vậy cache bị policy
                // chuyển read-only sau khi cài vẫn đọc được. Lần đầu mới cần quyền tạo tệp.
                handle = File.Exists(lockPath)
                    ? new FileStream(lockPath, FileMode.Open, FileAccess.Read, FileShare.None)
                    : new FileStream(
                        lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None,
                        bufferSize: 1, FileOptions.None);
                break;
            }
            catch (IOException) when (DateTime.UtcNow < deadline)
            {
                Thread.Sleep(25);
            }
        }
        try
        {
            // Recovery chạy ngoài vòng retry contention: journal lỗi cố định phải thất bại ngay,
            // không đóng băng UI 10 giây bằng cách đọc lại cùng một lỗi hàng trăm lần.
            RecoverInterruptedWrite(cacheDirectory);
            return handle;
        }
        catch
        {
            handle.Dispose();
            throw;
        }
    }

    /// <summary>
    /// Chép cặp manifest + DWG đã kiểm hash vào cache rỗng. Trả false khi cache đã có ít nhất
    /// một tệp — trạng thái đó phải được xử lý bằng XBOSS_LOGIN/XBOSS_VE_THUVIEN, không tự ghi đè.
    /// </summary>
    public static bool SeedIfAbsent(string sourceDirectory, string cacheDirectory)
    {
        var sourceManifest = Path.Combine(sourceDirectory, ManifestFileName);
        var sourceDwg = Path.Combine(sourceDirectory, DwgFileName);

        if (!File.Exists(sourceManifest))
            throw new BlockManifestException($"Thiếu manifest thư viện block đóng kèm: {sourceManifest}");
        if (!File.Exists(sourceDwg))
            throw new BlockManifestException($"Thiếu tệp DWG thư viện block đóng kèm: {sourceDwg}");

        var manifestJson = File.ReadAllText(sourceManifest);
        var dwg = File.ReadAllBytes(sourceDwg);
        return WriteCachePair(cacheDirectory, manifestJson, dwg, overwrite: false);
    }

    /// <summary>
    /// Ghi một cặp manifest/DWG đã kiểm hash dưới cùng khóa liên tiến trình. Journal + backup giữ
    /// cache cũ dùng được nếu tiến trình chết giữa hai lần publish; lần lấy khóa kế tiếp tự phục hồi.
    /// </summary>
    public static bool WriteCachePair(
        string cacheDirectory, string manifestJson, byte[] dwg, bool overwrite, Action? afterCommit = null)
    {
        var manifest = BlockManifestLoader.Load(manifestJson);
        BlockManifestLoader.KiemTraHashTep(manifest, dwg);

        Directory.CreateDirectory(cacheDirectory);
        using var cacheLock = AcquireCacheLock(cacheDirectory);
        var destinationManifest = Path.Combine(cacheDirectory, ManifestFileName);
        var destinationDwg = Path.Combine(cacheDirectory, DwgFileName);

        // Phải kiểm lại SAU khi lấy khoá: writer server/nạp tay có thể đã thắng trong lúc asset
        // đóng gói được đọc và kiểm hash. Cache đã có dù chỉ một nửa luôn được giữ nguyên.
        if (!overwrite && (File.Exists(destinationManifest) || File.Exists(destinationDwg))) return false;

        var suffix = $".tmp-{Guid.NewGuid():N}";
        var temporaryManifest = destinationManifest + suffix;
        var temporaryDwg = destinationDwg + suffix;
        var pending = Path.Combine(cacheDirectory, PendingFileName);
        var backupManifest = Path.Combine(cacheDirectory, ManifestBackupFileName);
        var backupDwg = Path.Combine(cacheDirectory, DwgBackupFileName);
        try
        {
            File.WriteAllBytes(temporaryDwg, dwg);
            File.WriteAllText(temporaryManifest, manifestJson);

            var hadDwg = File.Exists(destinationDwg);
            var hadManifest = File.Exists(destinationManifest);
            if (hadDwg) WriteDurableFile(backupDwg, File.ReadAllBytes(destinationDwg));
            else TryDelete(backupDwg);
            if (hadManifest) WriteDurableFile(backupManifest, File.ReadAllBytes(destinationManifest));
            else TryDelete(backupManifest);

            WritePending(pending, hadDwg, hadManifest);
            File.Move(temporaryDwg, destinationDwg, overwrite: true);
            File.Move(temporaryManifest, destinationManifest, overwrite: true);

            // Xóa journal là commit point. Backup chỉ xóa sau đó để recovery luôn có đủ dữ liệu.
            File.Delete(pending);
            afterCommit?.Invoke();
            TryDelete(backupDwg);
            TryDelete(backupManifest);
            return true;
        }
        catch (Exception original)
        {
            TryDelete(temporaryManifest);
            TryDelete(temporaryDwg);
            try
            {
                RecoverInterruptedWrite(cacheDirectory);
            }
            catch (Exception recovery)
            {
                throw new AggregateException(
                    "Ghi cache thư viện block thất bại và không hoàn nguyên được giao dịch.",
                    original, recovery);
            }
            throw;
        }
    }

    /// <summary>
    /// Ghi một tệp cache qua tệp tạm durable rồi publish bằng rename nguyên tử. Caller chịu trách
    /// nhiệm giữ <see cref="AcquireCacheLock"/> khi tệp thuộc một bộ cache nhiều thành phần.
    /// </summary>
    public static void WriteAtomicFile(string path, byte[] content)
    {
        var directory = Path.GetDirectoryName(path);
        if (string.IsNullOrWhiteSpace(directory))
            throw new ArgumentException("Đường dẫn tệp cache phải có thư mục cha.", nameof(path));
        Directory.CreateDirectory(directory);
        WriteDurableFile(path, content);
    }

    private static void WritePending(string path, bool hadDwg, bool hadManifest)
    {
        WriteDurableFile(path, [
            hadDwg ? (byte)'1' : (byte)'0',
            hadManifest ? (byte)'1' : (byte)'0']);
    }

    private static void RecoverInterruptedWrite(string cacheDirectory)
    {
        var pending = Path.Combine(cacheDirectory, PendingFileName);
        var backupDwg = Path.Combine(cacheDirectory, DwgBackupFileName);
        var backupManifest = Path.Combine(cacheDirectory, ManifestBackupFileName);
        if (!File.Exists(pending))
        {
            // Không có journal thì cache live là trạng thái commit. Không đụng backup rác ở đường
            // đọc để thư mục cache read-only vẫn dùng được; writer thành công sẽ tự dọn backup.
            return;
        }

        var state = File.ReadAllBytes(pending);
        if (state.Length != 2 || (state[0] is not ((byte)'0') and not ((byte)'1')) ||
            (state[1] is not ((byte)'0') and not ((byte)'1')))
        {
            // Journal do code này tạo được flush rồi rename nguyên tử, nên journal hỏng là dữ liệu
            // ngoài giao thức. Chỉ tự dọn khi cặp live hoặc backup tự chứng minh hash.
            if (PairIsValid(cacheDirectory, DwgFileName, ManifestFileName))
            {
                File.Delete(pending);
                TryDelete(backupDwg);
                TryDelete(backupManifest);
                return;
            }
            if (PairIsValid(cacheDirectory, DwgBackupFileName, ManifestBackupFileName))
            {
                Restore(cacheDirectory, backupDwg, DwgFileName, existed: true);
                Restore(cacheDirectory, backupManifest, ManifestFileName, existed: true);
                File.Delete(pending);
                TryDelete(backupDwg);
                TryDelete(backupManifest);
                return;
            }
            File.Delete(pending);
            TryDelete(backupDwg);
            TryDelete(backupManifest);
            return; // cache live (nếu hỏng) sẽ bị validator từ chối nhưng đường tải/nạp vẫn sửa được
        }

        if (state[0] == (byte)'1' && state[1] == (byte)'1' &&
            !PairIsValid(cacheDirectory, DwgBackupFileName, ManifestBackupFileName))
        {
            // Nếu cặp mới đã commit hợp lệ thì chỉ còn journal chưa xóa; giữ cặp mới. Nếu không,
            // tuyệt đối không chép backup hỏng lên cache live.
            if (PairIsValid(cacheDirectory, DwgFileName, ManifestFileName))
            {
                File.Delete(pending);
                TryDelete(backupDwg);
                TryDelete(backupManifest);
                return;
            }
            // Cả live lẫn backup đều hỏng: bỏ journal để XBOSS_LOGIN/XBOSS_VE_THUVIEN còn có thể
            // ghi đè sửa cache. Giữ journal rồi ném sẽ chặn chính mọi đường phục hồi về sau.
            File.Delete(pending);
            TryDelete(backupDwg);
            TryDelete(backupManifest);
            return;
        }

        if ((state[0] == (byte)'1' && !File.Exists(backupDwg)) ||
            (state[1] == (byte)'1' && !File.Exists(backupManifest)))
        {
            // Không thể rollback đúng, nhưng giữ journal sẽ chặn cả đường nạp lại. Bỏ giao dịch;
            // validator vẫn từ chối cache live hỏng và writer kế tiếp có thể sửa bằng dữ liệu mới.
            File.Delete(pending);
            TryDelete(backupDwg);
            TryDelete(backupManifest);
            return;
        }

        Restore(cacheDirectory, backupDwg, DwgFileName, state[0] == (byte)'1');
        Restore(cacheDirectory, backupManifest, ManifestFileName, state[1] == (byte)'1');
        File.Delete(pending);
        TryDelete(backupDwg);
        TryDelete(backupManifest);
    }

    private static void Restore(string cacheDirectory, string backup, string fileName, bool existed)
    {
        var destination = Path.Combine(cacheDirectory, fileName);
        if (!existed)
        {
            TryDelete(destination);
            return;
        }
        if (!File.Exists(backup))
            throw new IOException($"Thiếu backup để phục hồi cache thư viện block: {backup}");

        var temporary = destination + $".restore-{Guid.NewGuid():N}";
        try
        {
            File.Copy(backup, temporary);
            File.Move(temporary, destination, overwrite: true);
        }
        finally
        {
            TryDelete(temporary);
        }
    }

    private static bool PairIsValid(string directory, string dwgFileName, string manifestFileName)
    {
        try
        {
            var dwgPath = Path.Combine(directory, dwgFileName);
            var manifestPath = Path.Combine(directory, manifestFileName);
            if (!File.Exists(dwgPath) || !File.Exists(manifestPath)) return false;
            var manifest = BlockManifestLoader.Load(File.ReadAllText(manifestPath));
            BlockManifestLoader.KiemTraHashTep(manifest, dwgPath);
            return true;
        }
        catch (BlockManifestException) { return false; }
        catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
    }

    private static void WriteDurableFile(string path, byte[] content)
    {
        var temporary = path + $".write-{Guid.NewGuid():N}";
        try
        {
            using (var stream = new FileStream(
                temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                bufferSize: 81920, FileOptions.WriteThrough))
            {
                stream.Write(content);
                stream.Flush(flushToDisk: true);
            }
            File.Move(temporary, path, overwrite: true);
        }
        finally
        {
            TryDelete(temporary);
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}
