using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Cất token thiết bị vào Windows Credential Manager (M99 NFR4 — KHÔNG ghi token ra tệp
/// phẳng). P/Invoke advapi32 trực tiếp để không thêm phụ thuộc NuGet nào cho Adapter.
/// Target đặt theo server URL nên nhiều server (staging/production) giữ token riêng.
/// </summary>
internal static class CredentialStore
{
    private const int CRED_TYPE_GENERIC = 1;
    private const int CRED_PERSIST_LOCAL_MACHINE = 2;

    private static string Target(string serverUrl) => $"XBoss.Cad:{serverUrl.TrimEnd('/')}";

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIALW
    {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string? Comment;
        public long LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string? TargetAlias;
        public string? UserName;
    }

    [DllImport("advapi32", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredWrite(ref CREDENTIALW credential, uint flags);

    [DllImport("advapi32", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);

    [DllImport("advapi32", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredDelete(string target, uint type, uint flags);

    [DllImport("advapi32", EntryPoint = "CredFree")]
    private static extern void CredFree(IntPtr buffer);

    internal static void LuuToken(string serverUrl, string token)
    {
        var blob = Encoding.Unicode.GetBytes(token);
        var pBlob = Marshal.AllocHGlobal(blob.Length);
        try
        {
            Marshal.Copy(blob, 0, pBlob, blob.Length);
            var cred = new CREDENTIALW
            {
                Type = CRED_TYPE_GENERIC,
                TargetName = Target(serverUrl),
                UserName = Environment.UserName,
                CredentialBlob = pBlob,
                CredentialBlobSize = (uint)blob.Length,
                Persist = CRED_PERSIST_LOCAL_MACHINE,
            };
            if (!CredWrite(ref cred, 0))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Không ghi được token vào Credential Manager");
        }
        finally
        {
            Marshal.FreeHGlobal(pBlob);
        }
    }

    /// <summary>Token đã lưu cho server này, hoặc null khi chưa ghép.</summary>
    internal static string? DocToken(string serverUrl)
    {
        if (!CredRead(Target(serverUrl), CRED_TYPE_GENERIC, 0, out var pCred)) return null;
        try
        {
            var cred = Marshal.PtrToStructure<CREDENTIALW>(pCred);
            if (cred.CredentialBlobSize == 0 || cred.CredentialBlob == IntPtr.Zero) return null;
            return Marshal.PtrToStringUni(cred.CredentialBlob, (int)cred.CredentialBlobSize / 2);
        }
        finally
        {
            CredFree(pCred);
        }
    }

    internal static void XoaToken(string serverUrl) =>
        CredDelete(Target(serverUrl), CRED_TYPE_GENERIC, 0);
}
