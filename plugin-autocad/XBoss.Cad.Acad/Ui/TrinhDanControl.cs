using System.Drawing;
using System.Windows.Forms;
using XBoss.Cad.Core.Ui;

namespace XBoss.Cad.Acad.Ui;

/// <summary>
/// Tab "Quy trình" của bảng XBoss — TRÌNH DẪN 6 giai đoạn (M106 FR7/AC5): mỗi giai đoạn một khối
/// gồm số thứ tự + tên bước + trạng thái (✓ xong / ○ chưa / – không áp dụng) + nút chạy từng lệnh
/// của bước.
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
/// một PaletteSet; hộp thoại lệnh vẫn là WPF theo M106 PR1 (xem báo cáo PR2).
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
            Padding = new Padding(8),
            // Đặt nền TƯỜNG MINH cho từng control, KHÔNG dựa vào việc kế thừa màu từ control cha:
            // trong PaletteSet của AutoCAD, control con không nhận BackColor của UserControl mà rơi
            // về nền trắng hệ thống — chữ xám của theme tối trên nền trắng gần như không đọc được.
            // Đã thấy tận mắt trên AutoCAD 2026 ngày 2026-08-26. Áp cùng luật cho mọi nhãn/hàng nút.
            BackColor = MauBang.Nen,
        };
        Controls.Add(_flow);
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
        NgatDongLai(_flow);
    }

    private void NgatDongLai(Control cha)
    {
        var rong = BeRongNoiDung;
        foreach (Control con in cha.Controls)
        {
            if (con.MaximumSize.Width > 0) con.MaximumSize = new Size(rong, 0);
            if (con.HasChildren) NgatDongLai(con);
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

        var lamMoi = TaoNut("Làm mới trạng thái", MauBang.NenKhoi, MauBang.Chu);
        lamMoi.Click += (_, _) => LamMoi();
        _flow.Controls.Add(lamMoi);

        _flow.Controls.Add(TaoNhan(
            "Vòng đời một bản vẽ shop drawing. Bước chưa đủ điều kiện vẫn bấm được — đây là hướng dẫn, không phải khóa.",
            MauBang.ChuMo, 8.5f));

        foreach (var giaiDoan in QuyTrinh.CacGiaiDoan)
        {
            var tinhTrang = QuyTrinh.TinhTrang(giaiDoan.Buoc, dauHieu);

            _flow.Controls.Add(TaoNhan(
                $"{QuyTrinh.SoThuTu(giaiDoan.Buoc)}. {giaiDoan.Ten.ToUpperInvariant()}   " +
                $"{Dau(tinhTrang.TrangThai)} {QuyTrinh.Nhan(tinhTrang.TrangThai)}",
                MauCua(tinhTrang.TrangThai),
                9f,
                FontStyle.Bold,
                new Padding(2, 14, 2, 2)));

            _flow.Controls.Add(TaoNhan(
                tinhTrang.TrangThai == TrangThaiBuoc.Xong
                    ? $"Dấu hiệu: {giaiDoan.DauHieuXong}"
                    : $"Xong khi: {giaiDoan.DauHieuXong}",
                MauBang.ChuMo,
                8.5f));

            if (tinhTrang.LyDo is { } lyDo)
                _flow.Controls.Add(TaoNhan($"⚠ {lyDo}", MauBang.CanhBao, 8.5f));

            _flow.Controls.Add(HangNut(QuyTrinh.LenhCua(giaiDoan.Buoc), mo: tinhTrang.LyDo is not null));
        }

        _flow.ResumeLayout();
    }

    /// <summary>Một hàng nút của bước: mỗi lệnh một nút, đúng thứ tự dùng thật.</summary>
    private FlowLayoutPanel HangNut(IReadOnlyList<LenhInfo> cacLenh, bool mo)
    {
        var hang = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = true,
            AutoSize = true,
            MaximumSize = new Size(BeRongNoiDung, 0),
            Margin = new Padding(0, 2, 0, 2),
            BackColor = MauBang.Nen,
        };
        foreach (var lenh in cacLenh)
        {
            // Bước chưa đủ điều kiện: nền chìm + chữ mờ để mắt lướt qua, NHƯNG Enabled vẫn true —
            // khóa nút ở đây là biến hướng dẫn thành cổng chặn, trái §6.
            var nut = TaoNut(
                lenh.Nhan,
                mo ? MauBang.NenO : MauBang.NutChinh,
                mo ? MauBang.ChuMo : MauBang.Chu);
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

    private static Color MauCua(TrangThaiBuoc trangThai) => trangThai switch
    {
        TrangThaiBuoc.Xong => MauBang.Tot,
        TrangThaiBuoc.KhongApDung => MauBang.ChuMo,
        _ => MauBang.Chu,
    };

    private Label TaoNhan(
        string chu, Color mau, float coChu, FontStyle kieu = FontStyle.Regular, Padding? le = null) => new()
    {
        Text = chu,
        ForeColor = mau,
        BackColor = MauBang.Nen,
        Font = new Font("Segoe UI", coChu, kieu),
        AutoSize = true,
        MaximumSize = new Size(BeRongNoiDung, 0),
        Margin = le ?? new Padding(2, 2, 2, 2),
    };

    private static Button TaoNut(string chu, Color nen, Color chuMau) => new()
    {
        Text = chu,
        BackColor = nen,
        ForeColor = chuMau,
        FlatStyle = FlatStyle.Flat,
        AutoSize = true,
        Font = new Font("Segoe UI", 9f),
        Margin = new Padding(2, 4, 2, 2),
        Padding = new Padding(8, 4, 8, 4),
    };
}
