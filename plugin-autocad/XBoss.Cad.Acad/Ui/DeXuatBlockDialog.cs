using System.Drawing;
using System.Windows.Forms;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Acad.Ui;

/// <summary>
/// Hộp thoại nhập metadata cho <c>XBOSS_VE_DEXUAT</c> (M103 §4): tên block (mặc định tên định
/// nghĩa, sửa được, kiểm trùng với manifest cache NGAY tại đây), loại (5 kind), hệ (từ
/// <c>layerMap.groups</c>, đoán sẵn theo layer của khối), item bóc tách (từ <c>takeoff.items</c>
/// measure=count), khổ giấy (chỉ khung tên) và ghi chú.
///
/// Thiếu trường bắt buộc → nút Gửi bị KHÓA kèm lý do tiếng Việt ngay dưới form; quy tắc "trường
/// nào bắt buộc" lấy từ <see cref="BlockDeXuatRules"/> (Core) — cùng bộ quy tắc server kiểm, để
/// hộp thoại không bao giờ cho gửi thứ mà server sẽ trả 422.
///
/// Bố cục tọa độ cố định (không auto-layout) cho giống các hộp thoại của AutoCAD và để chạy được
/// trên mọi DPI mặc định; màu bám <see cref="MauBang"/> như bảng điều khiển M102.
/// </summary>
internal sealed class DeXuatBlockDialog : Form
{
    private const int LeTrai = 16;
    private const int RongNhan = 130;
    private const int TraiO = 152;
    private const int RongO = 340;
    private const int CaoO = 26;

    private readonly IReadOnlyList<string> _tenBlockDaCo;
    private readonly IReadOnlyList<string> _heId;
    private readonly IReadOnlyList<string> _itemId;

    private readonly TextBox _ten = new();
    private readonly ComboBox _loai = new();
    private readonly ComboBox _he = new();
    private readonly ComboBox _item = new();
    private readonly ComboBox _kho = new();
    private readonly TextBox _ghiChu = new();
    private readonly Label _nhanKho = new();
    private readonly Label _lyDo = new();
    private readonly Button _gui = new();

    private bool _dangDungGiaoDien;

    private const string ChuaChon = "— chưa chọn —";

    private DeXuatBlockDialog(
        string tenMacDinh,
        IReadOnlyList<string> tenBlockDaCo,
        IReadOnlyList<(string Id, string Nhan)> he,
        string? heDoan,
        IReadOnlyList<(string Id, string Nhan)> item,
        string? itemDoan,
        IReadOnlyList<string> khoGiay)
    {
        _tenBlockDaCo = tenBlockDaCo;
        _heId = he.Select(h => h.Id).ToList();
        _itemId = item.Select(i => i.Id).ToList();

        _dangDungGiaoDien = true;

        Text = "XBoss — Đề xuất block vào thư viện";
        BackColor = MauBang.Nen;
        ForeColor = MauBang.Chu;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MaximizeBox = false;
        MinimizeBox = false;
        ClientSize = new Size(520, 392);

        var y = 16;
        ThemNhan("Tên block", y);
        _ten.Text = tenMacDinh;
        DatO(_ten, y);
        _ten.TextChanged += (_, _) => CapNhat();
        y += 34;

        ThemNhan("Loại block", y);
        foreach (var k in BlockDeXuatRules.CacLoai) _loai.Items.Add(BlockDeXuatRules.Nhan(k));
        _loai.SelectedIndex = 0;
        DatCombo(_loai, y);
        y += 34;

        ThemNhan("Hệ (layerMap)", y);
        NapCombo(_he, he.Select(h => $"{h.Id} — {h.Nhan}"), IndexCua(_heId, heDoan));
        DatCombo(_he, y);
        y += 34;

        ThemNhan("Item bóc tách", y);
        NapCombo(_item, item.Select(i => $"{i.Id} — {i.Nhan}"), IndexCua(_itemId, itemDoan));
        DatCombo(_item, y);
        y += 34;

        _nhanKho.Text = "Khổ giấy";
        ThemNhan(_nhanKho, y);
        // Khổ giấy: danh mục lấy từ sheetSetup.paperSizes, nhưng rule pack có thể chưa khai khối
        // sheetSetup ⇒ để gõ tay được, không chặn kỹ sư vì một danh mục rỗng.
        foreach (var k in khoGiay) _kho.Items.Add(k);
        _kho.DropDownStyle = ComboBoxStyle.DropDown;
        _kho.Text = "";
        DatO(_kho, y);
        _kho.TextChanged += (_, _) => CapNhat();
        y += 34;

        ThemNhan("Ghi chú", y);
        _ghiChu.Multiline = true;
        _ghiChu.Location = new Point(TraiO, y);
        _ghiChu.Size = new Size(RongO, 64);
        DatMauO(_ghiChu);
        y += 74;

        _lyDo.AutoSize = false;
        _lyDo.Location = new Point(LeTrai, y);
        _lyDo.Size = new Size(488, 44);
        _lyDo.Font = new Font("Segoe UI", 9f);
        Controls.Add(_lyDo);

        _gui.Text = "Gửi đề xuất";
        _gui.DialogResult = DialogResult.OK;
        _gui.Location = new Point(276, 348);
        _gui.Size = new Size(128, 32);
        _gui.BackColor = MauBang.NutChinh;
        _gui.ForeColor = MauBang.Chu;
        _gui.FlatStyle = FlatStyle.Flat;
        Controls.Add(_gui);

        var huy = new Button
        {
            Text = "Hủy",
            DialogResult = DialogResult.Cancel,
            Location = new Point(412, 348),
            Size = new Size(92, 32),
            BackColor = MauBang.NenKhoi,
            ForeColor = MauBang.Chu,
            FlatStyle = FlatStyle.Flat,
        };
        Controls.Add(huy);
        AcceptButton = _gui;
        CancelButton = huy;

        _loai.SelectedIndexChanged += (_, _) => CapNhat();
        _he.SelectedIndexChanged += (_, _) => CapNhat();
        _item.SelectedIndexChanged += (_, _) => CapNhat();

        _dangDungGiaoDien = false;
        CapNhat();
    }

    /// <summary>
    /// Mở hộp thoại; trả metadata đã điền, hoặc null khi kỹ sư bấm Hủy (lệnh dừng, chưa gửi gì).
    /// </summary>
    internal static BlockDeXuat? Hoi(
        string tenMacDinh,
        IReadOnlyList<string> tenBlockDaCo,
        IReadOnlyList<(string Id, string Nhan)> he,
        string? heDoan,
        IReadOnlyList<(string Id, string Nhan)> item,
        string? itemDoan,
        IReadOnlyList<string> khoGiay)
    {
        using var form = new DeXuatBlockDialog(tenMacDinh, tenBlockDaCo, he, heDoan, item, itemDoan, khoGiay);
        // ShowModalDialog của AutoCAD (không Form.ShowDialog): AutoCAD làm chủ cửa sổ cha và
        // ngừng vòng lặp lệnh trong lúc hộp thoại mở.
        var kq = Autodesk.AutoCAD.ApplicationServices.Application.ShowModalDialog(form);
        return kq == DialogResult.OK ? form.DocMeta() : null;
    }

    /// <summary>Metadata theo đúng những gì đang hiện trên form (dùng cho cả kiểm lẫn kết quả).</summary>
    private BlockDeXuat DocMeta()
    {
        var kind = BlockDeXuatRules.CacLoai[Math.Max(0, _loai.SelectedIndex)];
        return new BlockDeXuat
        {
            BlockName = (_ten.Text ?? "").Trim(),
            Kind = kind,
            SystemId = BlockDeXuatRules.CanHe(kind) ? GiaTri(_he, _heId) : null,
            TakeoffItemId = BlockDeXuatRules.CanItemBocTach(kind) ? GiaTri(_item, _itemId) : null,
            PaperSize = BlockDeXuatRules.CanKhoGiay(kind) && (_kho.Text ?? "").Trim().Length > 0
                ? _kho.Text!.Trim()
                : null,
            Note = (_ghiChu.Text ?? "").Trim(),
        };
    }

    /// <summary>Bật/tắt ô theo loại block rồi kiểm lại toàn bộ — nút Gửi khóa kèm lý do.</summary>
    private void CapNhat()
    {
        if (_dangDungGiaoDien) return;
        _dangDungGiaoDien = true;
        try
        {
            var kind = BlockDeXuatRules.CacLoai[Math.Max(0, _loai.SelectedIndex)];

            _he.Enabled = BlockDeXuatRules.CanHe(kind);
            _item.Enabled = BlockDeXuatRules.CanItemBocTach(kind);
            // Khổ giấy CHỈ có nghĩa với khung tên (M103 §2) — ẩn hẳn cho khỏi điền nhầm.
            _kho.Visible = BlockDeXuatRules.CanKhoGiay(kind);
            _nhanKho.Visible = _kho.Visible;

            if (!_he.Enabled) _he.SelectedIndex = 0;
            if (!_item.Enabled) _item.SelectedIndex = 0;
            if (!_kho.Visible) _kho.Text = "";
        }
        finally
        {
            _dangDungGiaoDien = false;
        }

        var lyDo = BlockDeXuatRules.LyDoChuaGui(DocMeta(), _tenBlockDaCo);
        _gui.Enabled = lyDo is null;
        _lyDo.Text = lyDo ?? "Đủ thông tin — bấm Gửi để đưa block vào hàng chờ duyệt (Admin/PM duyệt trên web).";
        _lyDo.ForeColor = lyDo is null ? MauBang.Tot : MauBang.CanhBao;
    }

    // ===== Dựng giao diện =====

    private void ThemNhan(string chu, int y) => ThemNhan(new Label { Text = chu }, y);

    private void ThemNhan(Label nhan, int y)
    {
        nhan.AutoSize = false;
        nhan.Location = new Point(LeTrai, y + 4);
        nhan.Size = new Size(RongNhan, 20);
        nhan.ForeColor = MauBang.ChuMo;
        nhan.Font = new Font("Segoe UI", 9f);
        Controls.Add(nhan);
    }

    private void DatO(Control o, int y)
    {
        o.Location = new Point(TraiO, y);
        o.Size = new Size(RongO, CaoO);
        DatMauO(o);
    }

    private void DatCombo(ComboBox o, int y)
    {
        o.DropDownStyle = ComboBoxStyle.DropDownList; // chỉ chọn trong danh mục, không gõ tự do
        DatO(o, y);
    }

    private void DatMauO(Control o)
    {
        o.BackColor = MauBang.NenO;
        o.ForeColor = MauBang.Chu;
        o.Font = new Font("Segoe UI", 9f);
        Controls.Add(o);
    }

    /// <summary>Nạp combo có mục "— chưa chọn —" đứng đầu để trường bắt buộc bỏ trống là thấy ngay.</summary>
    private static void NapCombo(ComboBox combo, IEnumerable<string> muc, int chonIndex)
    {
        combo.Items.Add(ChuaChon);
        foreach (var m in muc) combo.Items.Add(m);
        combo.SelectedIndex = chonIndex > 0 ? chonIndex : 0;
    }

    /// <summary>Giá trị id ứng với mục đang chọn; null khi đang ở "— chưa chọn —".</summary>
    private static string? GiaTri(ComboBox combo, IReadOnlyList<string> id)
    {
        var i = combo.SelectedIndex - 1; // trừ mục "— chưa chọn —"
        return i >= 0 && i < id.Count ? id[i] : null;
    }

    /// <summary>Vị trí trong combo (đã tính mục "— chưa chọn —") của giá trị đoán sẵn; 0 = không đoán được.</summary>
    private static int IndexCua(IReadOnlyList<string> id, string? can)
    {
        if (can is null) return 0;
        for (var i = 0; i < id.Count; i++)
        {
            if (string.Equals(id[i], can, StringComparison.Ordinal)) return i + 1;
        }
        return 0;
    }
}
