using XBoss.Cad.Core.Ui;

namespace XBoss.Cad.Acad.Ui;

/// <summary>
/// Tab "Quy trình" của bảng XBoss — TRÌNH DẪN 6 giai đoạn (M106 FR7/AC5): mỗi giai đoạn một THẺ
/// gồm số thứ tự + tên bước + chip trạng thái (✓ Đã xong / ○ Chưa làm / – Không áp dụng) + dấu
/// hiệu hoàn thành + nút chạy từng lệnh của bước.
///
/// Ba luật của lớp này:
/// <list type="number">
/// <item>Thứ tự bước và danh sách lệnh LẤY TỪ <see cref="QuyTrinh"/>/<c>LenhCatalog</c>, không
/// chép tay — đổi quy trình ở Core là trình dẫn đổi theo, không bao giờ có hai thứ tự.</item>
/// <item>Trạng thái và lý do do <see cref="QuyTrinh.TinhTrang"/> quyết (Core, có test); lớp này
/// KHÔNG có điều kiện nghiệp vụ nào của riêng nó.</item>
/// <item>Nút của bước chưa đủ điều kiện chỉ bị LÀM MỜ kèm lý do — vẫn bấm được (§6: hướng dẫn,
/// không phải cổng chặn; ca hợp lệ là mở lại bản vẽ đã chuẩn hóa từ phiên trước). Bấm nút =
/// gõ đúng lệnh đó qua <see cref="RibbonBuilder.ThucThiLenh"/>, y hệt Ribbon — không có đường
/// nghiệp vụ thứ hai.</item>
/// </list>
///
/// WinForms, cùng công nghệ với <see cref="BangDieuKhienControl"/> (M102) vì hai tab nằm chung
/// một PaletteSet; hộp thoại lệnh vẫn là WPF theo M106 PR1 (xem báo cáo PR2). Mọi nhãn/nút/thẻ
/// dựng qua <see cref="ThanhPhan"/> để hai tab không trôi hình thức khỏi nhau.
/// </summary>
internal sealed class TrinhDanControl : UserControl
{
    /// <summary>
    /// Bề rộng ngắt dòng TỐI THIỂU. Bề rộng thật bám theo palette (xem <see cref="BeRongNoiDung"/>):
    /// hằng số cứng 300px làm chữ ngắt dòng vô lý khi kỹ sư kéo palette rộng ra — "2. CHUẨN HÓA /
    /// NỀN" tách hai dòng trong khi bên phải bỏ trống cả nghìn pixel (thấy trên AutoCAD 2026 ngày
    /// 2026-08-26). Neo dưới để palette bị bóp quá hẹp thì cuộn ngang, không vỡ chữ.
    /// </summary>
    private const int RongToiThieu = 240;

    /// <summary>Chừa cho thanh cuộn dọc + padding của <see cref="_flow"/>.</summary>
    private const int ChuaChoCuon = 40;

    private readonly FlowLayoutPanel _flow;
    private readonly Label _nhanNguCanh;

    internal TrinhDanControl()
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
            // Đặt nền TƯỜNG MINH cho từng control, KHÔNG dựa vào việc kế thừa màu từ control cha:
            // trong PaletteSet của AutoCAD, control con không nhận BackColor của UserControl mà rơi
            // về nền trắng hệ thống — chữ xám của theme tối trên nền trắng gần như không đọc được.
            // Đã thấy tận mắt trên AutoCAD 2026 ngày 2026-08-26. Áp cùng luật cho mọi nhãn/thẻ/nút.
            BackColor = MauBang.Nen,
        };

        var (thanh, nutLamMoi, nhanNguCanh) = ThanhPhan.ThanhHanhDong();
        nutLamMoi.Click += (_, _) => LamMoi();
        _nhanNguCanh = nhanNguCanh;

        // Vùng cuộn add TRƯỚC, thanh hành động add SAU: WinForms xếp docking theo z-order ngược,
        // control add sau chiếm chỗ trước rồi phần còn lại mới là vùng Fill. Nhờ vậy nút "Làm mới"
        // DÍNH ở đầu tab — trước đây nó nằm trong vùng cuộn nên cuộn xuống là mất hút.
        Controls.Add(_flow);
        Controls.Add(thanh);
    }

    /// <summary>Bề rộng ngắt dòng hiện tại — bám theo palette, không nhỏ hơn <see cref="RongToiThieu"/>.</summary>
    private int BeRongNoiDung => Math.Max(RongToiThieu, ClientSize.Width - ChuaChoCuon);

    /// <summary>
    /// Kéo rộng/hẹp palette thì ngắt dòng lại theo bề rộng mới. Chỉ sửa <c>MaximumSize</c> của các
    /// control đã dựng — KHÔNG dựng lại toàn bộ: dựng lại sẽ đọc lại bản vẽ (quét model space) mỗi
    /// lần kéo chuột, đúng thứ phải tránh ở công trường.
    /// </summary>
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

    /// <summary>Đọc lại dấu hiệu từ phiên + bản vẽ hiện hành rồi vẽ lại (mở bảng, đổi bản vẽ, bấm Làm mới).</summary>
    internal void LamMoi() => HienThi(QuyTrinhGom.LayDauHieu());

    /// <summary>Vẽ trình dẫn theo một bộ dấu hiệu — tách khỏi <see cref="LamMoi"/> để chỉ có đúng
    /// một chỗ chạm AutoCAD, phần vẽ thì thuần dữ liệu.</summary>
    internal void HienThi(DauHieuQuyTrinh dauHieu)
    {
        _flow.SuspendLayout();
        _flow.Controls.Clear();

        var rong = BeRongNoiDung;
        var tinhTrangs = QuyTrinh.TinhTrangTatCa(dauHieu);
        var soXong = tinhTrangs.Count(t => t.TrangThai == TrangThaiBuoc.Xong);

        // Thanh hành động nói NGAY tiến độ vòng đời + bản vẽ đang xét: hai câu hỏi đầu tiên của
        // kỹ sư khi mở bảng ("đang ở đâu", "đang nói về bản vẽ nào").
        _nhanNguCanh.Text = $"Đã xong {soXong}/{tinhTrangs.Count} bước · " +
            (dauHieu.CoBanVe ? "đang xét bản vẽ hiện hành" : "chưa mở bản vẽ nào");

        _flow.Controls.Add(ThanhPhan.NhanPhu(
            "Vòng đời một bản vẽ shop drawing. Bước chưa đủ điều kiện vẫn bấm được — đây là hướng dẫn, không phải khóa.",
            rong,
            new Padding(2, 6, 2, 2)));

        foreach (var giaiDoan in QuyTrinh.CacGiaiDoan)
        {
            var tinhTrang = QuyTrinh.TinhTrang(giaiDoan.Buoc, dauHieu);
            var rongTrongThe = rong - ThanhPhan.LeTrongThe;

            var vo = ThanhPhan.The(rong, VetCua(tinhTrang.TrangThai), out var the);

            the.Controls.Add(ThanhPhan.Chip(
                $"{Dau(tinhTrang.TrangThai)} {QuyTrinh.Nhan(tinhTrang.TrangThai)}",
                NenChipCua(tinhTrang.TrangThai),
                ChuChipCua(tinhTrang.TrangThai)));

            the.Controls.Add(ThanhPhan.TieuDeThe(
                $"{QuyTrinh.SoThuTu(giaiDoan.Buoc)}. {giaiDoan.Ten}", rongTrongThe));

            the.Controls.Add(ThanhPhan.NhanPhu(
                tinhTrang.TrangThai == TrangThaiBuoc.Xong
                    ? $"Dấu hiệu: {giaiDoan.DauHieuXong}"
                    : $"Xong khi: {giaiDoan.DauHieuXong}",
                rongTrongThe));

            if (tinhTrang.LyDo is { } lyDo)
                the.Controls.Add(ThanhPhan.Nhan(
                    $"⚠ {lyDo}", rongTrongThe, MauBang.CanhBao, 8.5f, FontStyle.Regular, new Padding(0, 6, 0, 0)));

            the.Controls.Add(HangNut(QuyTrinh.LenhCua(giaiDoan.Buoc), rongTrongThe, mo: tinhTrang.LyDo is not null));
            _flow.Controls.Add(vo);
        }

        _flow.ResumeLayout();
    }

    /// <summary>Một hàng nút của bước: mỗi lệnh một nút, đúng thứ tự dùng thật.</summary>
    private static FlowLayoutPanel HangNut(IReadOnlyList<LenhInfo> cacLenh, int rongToiDa, bool mo)
    {
        var hang = ThanhPhan.HangNut(rongToiDa);
        foreach (var lenh in cacLenh)
        {
            // Bước chưa đủ điều kiện: nút CHÌM để mắt lướt qua, NHƯNG Enabled vẫn true — khóa nút
            // ở đây là biến hướng dẫn thành cổng chặn, trái §6.
            var nut = ThanhPhan.Nut(lenh.Nhan, mo ? KieuNut.Chim : KieuNut.Chinh);
            nut.Click += (_, _) => RibbonBuilder.ThucThiLenh(lenh.Ten);
            hang.Controls.Add(nut);
        }
        return hang;
    }

    /// <summary>Ký hiệu trạng thái — đi KÈM chữ, không bao giờ chỉ dựa vào màu.</summary>
    private static string Dau(TrangThaiBuoc trangThai) => trangThai switch
    {
        TrangThaiBuoc.Xong => "✓",
        TrangThaiBuoc.KhongApDung => "–",
        _ => "○",
    };

    /// <summary>Màu vệt trái của thẻ — chỉ nhấn mạnh thứ chip đã nói bằng chữ.</summary>
    private static Color VetCua(TrangThaiBuoc trangThai) => trangThai switch
    {
        TrangThaiBuoc.Xong => MauBang.Tot,
        TrangThaiBuoc.KhongApDung => MauBang.VienKhoa,
        _ => MauBang.VienThe,
    };

    private static Color NenChipCua(TrangThaiBuoc trangThai) => trangThai switch
    {
        TrangThaiBuoc.Xong => MauBang.NutChinh,
        _ => MauBang.NenO,
    };

    private static Color ChuChipCua(TrangThaiBuoc trangThai) => trangThai switch
    {
        TrangThaiBuoc.Xong => MauBang.Chu,
        TrangThaiBuoc.KhongApDung => MauBang.ChuKhoa,
        _ => MauBang.ChuMo,
    };
}
