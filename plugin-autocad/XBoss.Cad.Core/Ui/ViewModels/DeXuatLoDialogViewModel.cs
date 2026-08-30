namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>Một block ứng viên hiện trong bảng xem trước của hộp thoại nạp lô.</summary>
/// <param name="TenBlock">Tên định nghĩa block trong bản vẽ.</param>
/// <param name="Layer">Layer của định nghĩa (chỉ để người xem đối chiếu).</param>
/// <param name="SoLanChen">Số lần block được chèn trong model space — 0 = định nghĩa không dùng.</param>
/// <param name="LyDoBoQua">Null = nạp được; khác null = bị loại, kèm lý do tiếng Việt.</param>
public sealed record UngVienLoItem(string TenBlock, string Layer, int SoLanChen, string? LyDoBoQua)
{
    public bool NapDuoc => LyDoBoQua is null;
}

/// <summary>
/// Hộp thoại của <c>XBOSS_VE_DEXUAT_LO</c> (M108 §6.1) — nạp HÀNG LOẠT block vào hàng chờ duyệt.
///
/// Khác <see cref="DeXuatBlockDialogViewModel"/> (M103, một block): ở đây kỹ sư KHÔNG khai metadata
/// cho từng block — máy chủ tự đề xuất phân loại rồi Admin/PM duyệt theo lô trên web. Hộp thoại này
/// chỉ có việc: cho xem tệp có những block nào, cái nào bị loại và vì sao, rồi xác nhận gửi.
///
/// Vì thế nút OK chỉ khóa đúng một trường hợp: không còn block nào nạp được. Mọi lựa chọn phân
/// loại đều thuộc về bảng duyệt trên web, cố tình KHÔNG lặp lại ở đây — hai chỗ cùng hỏi một câu
/// là hai chỗ để lệch nhau.
/// </summary>
public sealed class DeXuatLoDialogViewModel : DialogViewModelBase
{
    private bool _chiBlockDangDung;

    /// <param name="ungVien">Toàn bộ định nghĩa block đọc được từ bản vẽ, kèm lý do loại nếu có.</param>
    /// <param name="tranMoiLo">Trần số block một lô mà máy chủ nhận (M108 NFR4).</param>
    public DeXuatLoDialogViewModel(IReadOnlyList<UngVienLoItem> ungVien, int tranMoiLo)
    {
        TatCa = ungVien;
        TranMoiLo = tranMoiLo;
        KiemLai();
    }

    public IReadOnlyList<UngVienLoItem> TatCa { get; }

    public int TranMoiLo { get; }

    /// <summary>
    /// Chỉ gửi block ĐANG ĐƯỢC CHÈN trong bản vẽ.
    ///
    /// Tệp thư viện tổng hợp hay mang theo hàng chục định nghĩa "để dành" chưa chèn ở đâu; lọc
    /// được thì lô gọn hơn và không tốn công phân loại thứ chưa dùng. Mặc định TẮT vì với đúng
    /// tệp thư viện tổng hợp thì phần lớn block chưa chèn — bật sẵn sẽ lọc mất gần hết.
    /// </summary>
    public bool ChiBlockDangDung
    {
        get => _chiBlockDangDung;
        set
        {
            if (!Dat(ref _chiBlockDangDung, value)) return;
            Bao(nameof(SoSeGui), nameof(TomTat));
            KiemLai();
        }
    }

    /// <summary>Những dòng thật sự sẽ gửi lên, sau mọi bộ lọc.</summary>
    public IReadOnlyList<UngVienLoItem> SeGui =>
        [.. TatCa.Where(u => u.NapDuoc && (!_chiBlockDangDung || u.SoLanChen > 0)).Take(TranMoiLo)];

    public int SoSeGui => SeGui.Count;

    public int SoBoQua => TatCa.Count - SoSeGui;

    /// <summary>Một dòng tóm tắt hiện trên hộp thoại, đủ để quyết định mà không phải đọc cả bảng.</summary>
    public string TomTat =>
        $"Tệp có {TatCa.Count} định nghĩa block · sẽ gửi {SoSeGui} · bỏ qua {SoBoQua}.";

    public override string TieuDe => "XBOSS_VE_DEXUAT_LO — Nạp block hàng loạt";

    public override string MoTa =>
        "Gửi mọi block trong bản vẽ này lên hàng chờ duyệt. Máy chủ tự đề xuất phân loại, " +
        "Admin/PM duyệt theo lô trên web — bản vẽ của bạn KHÔNG bị sửa gì.";

    protected override IReadOnlyList<string> Kiem() =>
        SoSeGui == 0
            ? [
                TatCa.Count == 0
                    ? "Bản vẽ không có định nghĩa block nào để nạp."
                    : "Không còn block nào nạp được sau khi lọc — bỏ bớt bộ lọc hoặc kiểm lại lý do bỏ qua bên dưới.",
            ]
            : [];

    protected override IReadOnlyList<string> KiemCanhBao()
    {
        var canhBao = new List<string>();
        // Trần là của máy chủ; cắt ở đây thì phải NÓI RA, không được im lặng gửi thiếu.
        var duocPhep = TatCa.Count(u => u.NapDuoc && (!_chiBlockDangDung || u.SoLanChen > 0));
        if (duocPhep > TranMoiLo)
        {
            canhBao.Add(
                $"Có {duocPhep} block nạp được nhưng một lô chỉ nhận {TranMoiLo} — lần này gửi " +
                $"{TranMoiLo} block đầu, {duocPhep - TranMoiLo} block còn lại phải nạp ở lô sau.");
        }
        return canhBao;
    }
}
