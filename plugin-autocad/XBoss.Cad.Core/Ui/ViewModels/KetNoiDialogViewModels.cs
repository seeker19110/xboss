namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>Tham số <c>XBOSS_LOGIN</c> — đúng thứ duy nhất đường dòng lệnh hỏi: địa chỉ server.</summary>
public sealed record KetQuaLogin(string BaseUrl);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_LOGIN</c> (M106 §7.2).
///
/// <b>Lệch có chủ đích với bảng §7.2</b>: bảng ghi "URL server, email, mật khẩu, ghi nhớ thiết bị",
/// nhưng lệnh THẬT dùng device pairing flow (xin mã → kỹ sư duyệt trên web → plugin nhận token cất
/// vào Credential Manager) nên KHÔNG có email/mật khẩu để hỏi, và token luôn được nhớ. Thêm hai ô
/// đó là dựng một đường đăng nhập thứ hai mà lệnh không có (§2.4) — hộp thoại chỉ hỏi đúng địa chỉ
/// server, phần còn lại hiện dạng CHỈ ĐỌC (FR6).
/// </summary>
public sealed class LoginDialogViewModel : DialogViewModelBase
{
    private string _baseUrl;

    /// <param name="baseUrlDaNho">Địa chỉ server nhớ trong máy (server.json); rỗng = chưa từng ghép.</param>
    public LoginDialogViewModel(string? baseUrlDaNho)
    {
        _baseUrl = (baseUrlDaNho ?? "").Trim();
        KiemLai();
    }

    public override string TieuDe => "XBOSS_LOGIN — Ghép thiết bị với server XBoss";

    public override string MoTa =>
        "Nhập địa chỉ server rồi bấm OK; plugin sẽ hiện mã ghép để bạn duyệt trên web.";

    /// <summary>Địa chỉ server (https://…, hoặc localhost khi dev).</summary>
    public string BaseUrl
    {
        get => _baseUrl;
        set
        {
            if (!Dat(ref _baseUrl, (value ?? "").Trim())) return;
            KiemLai();
        }
    }

    /// <summary>Các bước lệnh sẽ tự làm sau khi bấm OK — CHỈ ĐỌC (FR6).</summary>
    public string MoTaCacBuoc =>
        "Sau khi bấm OK: xin mã ghép → bạn nhập mã trên trang /engineering/thiet-bi-cad và bấm Duyệt → " +
        "plugin nhận token, cất vào Windows Credential Manager, rồi tải rule pack + thư viện block.";

    /// <summary>Tham số để lệnh chạy; null khi form chưa hợp lệ.</summary>
    public KetQuaLogin? KetQua() => CoTheOk ? new KetQuaLogin(ChuanHoaUrl(_baseUrl)) : null;

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_baseUrl.Length == 0)
        {
            loi.Add("Chưa nhập địa chỉ server XBoss (vd https://xboss.congty.vn).");
            return loi;
        }
        // Cùng luật với lệnh: token đi qua đường này nên chỉ nhận https, trừ loopback cho dev.
        if (!Uri.TryCreate(ChuanHoaUrl(_baseUrl), UriKind.Absolute, out var uri))
        {
            loi.Add($"\"{_baseUrl}\" không phải một địa chỉ hợp lệ — nhập dạng https://ten-mien.");
            return loi;
        }
        if (uri.Scheme != "https" && !uri.IsLoopback)
            loi.Add("Địa chỉ phải là https:// (hoặc localhost khi dev) — token không đi qua http.");
        return loi;
    }

    /// <summary>Bỏ dấu "/" cuối như lệnh vẫn làm trước khi lưu server.json.</summary>
    private static string ChuanHoaUrl(string url) => url.TrimEnd('/');
}

/// <summary>Tham số <c>XBOSS_UPLOAD</c> — đúng 2 câu hỏi của đường dòng lệnh.</summary>
public sealed record KetQuaUpload(string MaBanVe, string Rev);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_UPLOAD</c> (M106 §7.2): bản vẽ đích + rev, kèm danh sách sidecar
/// sẽ gửi kèm ở dạng CHỈ ĐỌC (FR6 — Adapter dò tệp cạnh DWG rồi truyền vào, hộp thoại không chạm
/// đĩa).
///
/// <b>Lệch có chủ đích với bảng §7.2</b>: bảng ghi thêm ô "ghi chú", nhưng lệnh thật không gửi ghi
/// chú nào lên server — thêm ô đó là hộp thoại thu thứ không ai dùng.
/// </summary>
public sealed class UploadDialogViewModel : DialogViewModelBase
{
    private readonly string _tenDwg;
    private readonly IReadOnlyList<string> _sidecar;

    private string _maBanVe = "";
    private string _rev = "";

    /// <param name="tenDwg">Tên tệp DWG đang mở (chỉ để hiện).</param>
    /// <param name="sidecar">Mô tả các sidecar sẽ gửi kèm (báo cáo chuẩn hóa, KL bóc…).</param>
    public UploadDialogViewModel(string tenDwg, IReadOnlyList<string> sidecar)
    {
        _tenDwg = tenDwg;
        _sidecar = sidecar;
        KiemLai();
    }

    public override string TieuDe => "XBOSS_UPLOAD — Tải bản vẽ lên XBoss";

    public override string MoTa =>
        $"Gửi {_tenDwg} + DXF sidecar lên server để kiểm định và tạo revision mới.";

    /// <summary>Số bản vẽ trong sổ (drawings.code), hoặc <c>#&lt;mã số&gt;</c>.</summary>
    public string MaBanVe
    {
        get => _maBanVe;
        set
        {
            if (!Dat(ref _maBanVe, (value ?? "").Trim())) return;
            KiemLai();
        }
    }

    public string Rev
    {
        get => _rev;
        set
        {
            if (!Dat(ref _rev, (value ?? "").Trim())) return;
            KiemLai();
        }
    }

    /// <summary>Sidecar sẽ gửi kèm — CHỈ ĐỌC (FR6).</summary>
    public IReadOnlyList<string> Sidecar => _sidecar;

    public string MoTaSidecar =>
        _sidecar.Count == 0
            ? "Không có sidecar nào cạnh DWG — cân nhắc chạy XBOSS_CHUANHOA / XBOSS_BOCKL_XUAT trước."
            : $"Gửi kèm {_sidecar.Count} sidecar: {string.Join(", ", _sidecar)}.";

    public KetQuaUpload? KetQua() => CoTheOk ? new KetQuaUpload(_maBanVe, _rev) : null;

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_maBanVe.Length == 0)
            loi.Add("Chưa nhập số bản vẽ trong sổ XBoss (vd ACMV-SD-T05-001, hoặc #12 khi biết mã số).");
        if (_rev.Length == 0) loi.Add("Chưa nhập rev (vd A, B, C).");
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao() =>
        _sidecar.Count == 0
            ? ["Chưa thấy báo cáo chuẩn hóa/KL cạnh DWG — vẫn tải lên được, nhưng người duyệt sẽ thiếu căn cứ."]
            : [];
}
