using XBoss.Cad.Core.Ui;

namespace XBoss.Cad.Acad.Ui;

/// <summary>
/// Nội dung tab "Trạng thái" của bảng XBoss (M102) — WinForms UserControl gắn vào PaletteSet.
/// Toàn bộ NỘI DUNG do <see cref="BangDieuKhienModel"/> (Core, test được) quyết định; lớp này chỉ
/// vẽ: mỗi khối một THẺ gồm tiêu đề + các dòng "mục / nội dung" + nút hành động nhanh.
///
/// Hình thức dựng qua <see cref="ThanhPhan"/> — dùng chung với tab Quy trình
/// (<see cref="TrinhDanControl"/>) để hai tab không trôi cỡ chữ/lề/màu khỏi nhau. Bảng màu bám
/// theme tối của AutoCAD (không theo theme web — đây là cửa sổ trong AutoCAD).
/// </summary>
internal sealed class BangDieuKhienControl : UserControl
{
    /// <summary>Bề rộng ngắt dòng tối thiểu — palette bị bóp hẹp thì cuộn ngang, không vỡ chữ.</summary>
    private const int RongToiThieu = 240;

    /// <summary>Chừa cho thanh cuộn dọc + padding của <see cref="_flow"/>.</summary>
    private const int ChuaChoCuon = 40;

    private readonly FlowLayoutPanel _flow;
    private readonly Label _nhanNguCanh;

    /// <summary>Đang có một lượt hỏi server (đề xuất block) chạy dở — không xếp chồng lượt nữa.</summary>
    private bool _dangHoiDeXuat;

    internal BangDieuKhienControl()
    {
        BackColor = MauBang.Nen;
        ForeColor = MauBang.Chu;
        _flow = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoScroll = true,
            Padding = new Padding(8, 4, 8, 12),
            // Nền TƯỜNG MINH — trong PaletteSet, control con không kế thừa BackColor của
            // UserControl mà rơi về nền trắng hệ thống (thấy tận mắt trên AutoCAD 2026 ngày
            // 2026-08-26 ở tab Quy trình). Chữ theme tối trên nền trắng gần như không đọc được.
            BackColor = MauBang.Nen,
        };

        var (thanh, nutLamMoi, nhanNguCanh) = ThanhPhan.ThanhHanhDong();
        nutLamMoi.Click += (_, _) => LamMoi();
        _nhanNguCanh = nhanNguCanh;

        // Vùng cuộn add TRƯỚC, thanh hành động add SAU — xem ghi chú cùng chỗ trong TrinhDanControl.
        Controls.Add(_flow);
        Controls.Add(thanh);
    }

    /// <summary>Bề rộng ngắt dòng — bám palette, có sàn để palette bị bóp hẹp không vỡ chữ.</summary>
    private int BeRongNoiDung => Math.Max(RongToiThieu, ClientSize.Width - ChuaChoCuon);

    /// <summary>Kéo rộng/hẹp palette thì chỉ ngắt dòng lại, KHÔNG dựng lại bảng (dựng lại kéo theo
    /// một lượt hỏi server danh sách đề xuất block — xem <see cref="LamMoi"/>).</summary>
    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        NgatDongLai(_flow, BeRongNoiDung);
    }

    /// <summary>
    /// Hạ trần ngắt dòng xuống theo TỪNG CẤP: mỗi lần chui vào một control có lề trong (vỏ thẻ, mặt
    /// thẻ) thì trần hẹp lại đúng phần lề đó. Đặt cùng một trần cho mọi cấp — như bản đầu — thì chữ
    /// trong thẻ được phép rộng bằng cả palette và đẩy thẻ phình ra ngoài, sinh thanh cuộn ngang.
    /// </summary>
    private static void NgatDongLai(Control cha, int tran)
    {
        foreach (Control con in cha.Controls)
        {
            if (con.MaximumSize.Width > 0) con.MaximumSize = new Size(tran, 0);
            if (con.HasChildren) NgatDongLai(con, tran - con.Padding.Horizontal);
        }
    }

    /// <summary>
    /// Làm mới toàn bộ bảng: vẽ ngay bằng dữ liệu cục bộ (không chờ mạng), rồi hỏi server danh
    /// sách đề xuất block và vẽ lại khi có kết quả (M103 §4 — "refresh cùng nhịp panel").
    /// </summary>
    internal void LamMoi()
    {
        HienThi(TrangThaiGom.LayTrangThai());
        _ = HoiDeXuatRoiVeLai();
    }

    private async Task HoiDeXuatRoiVeLai()
    {
        if (_dangHoiDeXuat) return; // bấm Làm mới liên tục không đẻ ra nhiều lượt gọi API
        _dangHoiDeXuat = true;
        try
        {
            // Cả hai đều không ném — tự nuốt lỗi thành thông điệp/"chưa rõ" (M118 PR3).
            await Task.WhenAll(TrangThaiGom.LamMoiDeXuatAsync(), TrangThaiGom.LamMoiPhienBanPluginAsync());
            HienThi(TrangThaiGom.LayTrangThai());
        }
        finally
        {
            _dangHoiDeXuat = false;
        }
    }

    /// <summary>Vẽ lại toàn bộ bảng theo trạng thái mới (gọi khi mở bảng + khi bấm Làm mới).</summary>
    internal void HienThi(TrangThaiPhien trangThai)
    {
        _flow.SuspendLayout();
        _flow.Controls.Clear();

        var rong = BeRongNoiDung;
        var rongTrongThe = rong - ThanhPhan.LeTrongThe;
        var khoiTrangThai = BangDieuKhienModel.Dung(trangThai);

        // Thanh hành động nói ngay bản vẽ đang xét + số cảnh báo đang có: hai thứ quyết định kỹ sư
        // có phải cuộn xuống đọc tiếp hay không.
        var soCanhBao = khoiTrangThai.Sum(k => k.Dong.Count(d => d.MucDo == MucDo.CanhBao));
        _nhanNguCanh.Text =
            $"{trangThai.TenBanVe ?? "chưa mở bản vẽ nào"} · " +
            (soCanhBao == 0 ? "không có cảnh báo" : $"{soCanhBao} cảnh báo");

        foreach (var khoi in khoiTrangThai)
        {
            // Khối có cảnh báo được đánh vệt cam ở cạnh trái — nhưng chữ vẫn nói đủ nghĩa: mỗi
            // dòng cảnh báo mang sẵn ký hiệu ⚠, không truyền thông tin chỉ bằng màu.
            var coCanhBao = khoi.Dong.Any(d => d.MucDo == MucDo.CanhBao);
            var vo = ThanhPhan.The(rong, coCanhBao ? MauBang.CanhBao : MauBang.VienThe, out var the);

            the.Controls.Add(ThanhPhan.TieuDeThe(khoi.TieuDe, rongTrongThe));

            foreach (var dong in khoi.Dong)
            {
                the.Controls.Add(ThanhPhan.NhanPhu(dong.Muc, rongTrongThe, new Padding(0, 6, 0, 0)));
                the.Controls.Add(ThanhPhan.Nhan(
                    $"{ThanhPhan.KyHieuCua(dong.MucDo)} {dong.NoiDung}",
                    rongTrongThe,
                    ThanhPhan.MauCua(dong.MucDo),
                    le: new Padding(0, 0, 0, 0)));
            }

            if (khoi.LenhGoiY is { } lenh)
            {
                var hang = ThanhPhan.HangNut(rongTrongThe);
                var nut = ThanhPhan.Nut(khoi.NhanLenh ?? $"Chạy {lenh}", KieuNut.Chinh);
                nut.Click += (_, _) => RibbonBuilder.ThucThiLenh(lenh);
                hang.Controls.Add(nut);
                the.Controls.Add(hang);
            }

            _flow.Controls.Add(vo);
        }

        _flow.ResumeLayout();
    }
}
