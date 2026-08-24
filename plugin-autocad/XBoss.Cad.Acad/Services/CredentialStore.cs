using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Lưu token thiết bị trong Windows Credential Manager (M99 NFR4 — KHÔNG ghi token ra
/// tệp phẳng). P/Invoke advapi32 CredRead/CredWrite/CredDelete, loại GENERIC.
/// </summary>
internal static class CredentialStore
{
    private const string Target = "XBoss.Cad.PluginToken";
    private const uint CredTypeGeneric = 1;
    private const uint CredPersistLocalMachine = 2;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NativeCredential
    {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string? Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string? TargetAlias;
        public string? UserName;
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CredWriteW")]
    private static extern bool CredWrite(ref NativeCredential credential, uint flags);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CredReadW")]
    private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CredDeleteW")]
    private static extern bool CredDelete(string target, uint type, uint flags);

    [DllImport("advapi32.dll")]
    private static extern void CredFree(IntPtr credentialPtr);

    /// <summary>Ghi token (đè bản cũ nếu có). Ném Win32Exception khi Credential Manager từ chối.</summary>
    internal static void GhiToken(string token)
    {
        var blob = Encoding.UTF8.GetBytes(token);
        var unmanaged = Marshal.AllocHGlobal(blob.Length);
        try
        {
            Marshal.Copy(blob, 0, unmanaged, blob.Length);
            var cred = new NativeCredential
            {
                Type = CredTypeGeneric,
                TargetName = Target,
                CredentialBlobSize = (uint)blob.Length,
                CredentialBlob = unmanaged,
                Persist = CredPersistLocalMachine,
                UserName = Environment.UserName,
            };
            if (!CredWrite(ref cred, 0))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Không ghi được token vào Windows Credential Manager");
        }
        finally
        {
            Marshal.FreeHGlobal(unmanaged);
        }
    }

    /// <summary>Đọc token đã lưu; null nếu chưa ghép thiết bị.</summary>
    internal static string? DocToken()
    {
        if (!CredRead(Target, CredTypeGeneric, 0, out var ptr)) return null;
        try
        {
            var cred = Marshal.PtrToStructure<NativeCredential>(ptr);
            if (cred.CredentialBlobSize == 0 || cred.CredentialBlob == IntPtr.Zero) return null;
            var blob = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, blob, 0, blob.Length);
            return Encoding.UTF8.GetString(blob);
        }
        finally
        {
            CredFree(ptr);
        }
    }

    /// <summary>Xoá token (XBOSS_LOGOUT). Trả false nếu vốn không có gì để xoá.</summary>
    internal static bool XoaToken() => CredDelete(Target, CredTypeGeneric, 0);
}
