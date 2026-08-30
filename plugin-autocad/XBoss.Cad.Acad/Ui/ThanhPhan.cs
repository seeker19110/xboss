using XBoss.Cad.Core.Ui;

namespace XBoss.Cad.Acad.Ui;

/// <summary>Kiểu nút trên bảng XBoss — quyết định bộ màu nền/chữ và cả 3 trạng thái rê/nhấn.</summary>
internal enum KieuNut
{
    /// <summary>Hành động chính của khối (emerald) — mỗi khối nhiều nhất MỘT nút loại này.</summary>
    Chinh,

    /// <summary>Hành động phụ ngang hàng (nền nổi, viền rõ).</summary>
    Phu,

    /// <summary>Hành động của bước chưa đủ điều kiện — chìm đi để mắt lướt qua, VẪN bấm được.</summary>
    Chim,
}

/// <summary>
/// Bộ thành phần WinForms dùng chung cho hai tab của bảng XBoss (<see cref="TrinhDanControl"/> —
/// Quy trình, <see cref="BangDieuKhienControl"/> — Trạng thái). Tách ra ở đợt thiết kế lại giao
/// diện plugin để hai tab KHÔNG còn tự dựng nhãn/nút mỗi nơi một kiểu (trước đó mỗi lớp có
/// <c>TaoNhan</c>/<c>TaoNut</c> riêng, lệch nhau cỡ chữ, lề và cả bộ màu).
///
/// Ba luật của lớp này:
/// <list type="number">
/// <item><b>Chỉ vẽ, không có nghiệp vụ.</b> Mọi quyết định nội dung vẫn nằm ở
/// <see cref="BangDieuKhienModel"/>/<see cref="QuyTrinh"/> bên Core (test được, không cần AutoCAD).</item>
/// <item><b>Nền TƯỜNG MINH cho mọi control.</b> Trong PaletteSet của AutoCAD, control con không kế
/// thừa <c>BackColor</c> của cha mà rơi về nền trắng hệ thống (thấy tận mắt trên AutoCAD 2026 ngày
/// 2026-08-26). Mọi hàm dựng ở đây đều đặt <c>BackColor</c>.</item>
/// <item><b>Nút phải tự khai màu rê chuột/nhấn.</b> <c>FlatStyle.Flat</c> mặc định vẽ trạng thái rê
/// bằng màu xanh nhạt của Windows — mảng sáng giữa bảng tối. Bám ADR-0010: nền accent ĐẬM dần khi
/// rê, không sáng dần, để giữ tương phản với chữ.</item>
/// </list>
/// </summary>
internal static class ThanhPhan
{
    /// <summary>
    /// Tổng lề ngang mà một thẻ ăn mất (vỏ 3+1 + lề trong 10+10) — trần ngắt dòng của chữ NẰM
    /// TRONG thẻ phải trừ đi đúng chừng này, nếu không chữ rộng bằng cả palette và đẩy thẻ phình
    /// ra ngoài, sinh thanh cuộn ngang.
    /// </summary>
    internal const int LeTrongThe = 24;

    /// <summary>Chiều cao tối thiểu của nút: vùng chạm thoải mái cả khi kỹ sư dùng máy màn cảm ứng.</summary>
    private const int CaoNut = 30;

    private const string PhongChu = "Segoe UI";

    // ===== Nhãn =====

    /// <summary>Chữ THƯỜNG trong thẻ (nội dung chính kỹ sư đọc).</summary>
    internal static Label Nhan(string chu, int rongToiDa, Color? mau = null, float coChu = 9f,
        FontStyle kieu = FontStyle.Regular, Padding? le = null) => new()
    {
        Text = chu,
        ForeColor = mau ?? MauBang.Chu,
        BackColor = MauBang.NenThe,
        Font = new Font(PhongChu, coChu, kieu),
        AutoSize = true,
        MaximumSize = new Size(rongToiDa, 0),
        Margin = le ?? new Padding(0, 2, 0, 0),
    };

    /// <summary>Chữ PHỤ (giải thích, dấu hiệu, thời điểm cập nhật) — mờ hơn, cỡ nhỏ hơn.</summary>
    internal static Label NhanPhu(string chu, int rongToiDa, Padding? le = null) =>
        Nhan(chu, rongToiDa, MauBang.ChuMo, 8.5f, FontStyle.Regular, le);

    /// <summary>Tiêu đề khối/bước: in hoa, đậm, cỡ nhỏ — bậc chữ trên cùng của một thẻ.</summary>
    internal static Label TieuDeThe(string chu, int rongToiDa) =>
        Nhan(chu.ToUpperInvariant(), rongToiDa, MauBang.Chu, 9f, FontStyle.Bold, new Padding(0, 0, 0, 2));

    // ===== Thẻ =====

    /// <summary>
    /// Thẻ (card) một khối nội dung: vệt màu bên trái (3px) + nền nổi hơn nền bảng.
    /// Trả về panel VỎ (thứ phải add vào bảng); panel NỘI DUNG xếp dọc trả qua
    /// <paramref name="noiDung"/> để bên gọi nhồi nhãn/nút vào.
    /// </summary>
    /// <param name="vetTrai">Màu vệt trái — mã hóa trạng thái của khối, luôn ĐI KÈM chữ/ký hiệu
    /// (không bao giờ chỉ dựa vào màu).</param>
    internal static FlowLayoutPanel The(int rongToiDa, Color vetTrai, out FlowLayoutPanel noiDung)
    {
        noiDung = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoSize = true,
            BackColor = MauBang.NenThe,
            Padding = new Padding(10, 8, 10, 10),
            Margin = new Padding(0),
            MaximumSize = new Size(Math.Max(0, rongToiDa - 4), 0),
        };

        // Vỏ chỉ để lộ 3px màu ở cạnh trái + 1px viền ba cạnh còn lại: rẻ hơn nhiều so với tự vẽ
        // (OnPaint/GraphicsPath), mà vẫn cho ra ranh giới thẻ rõ ràng ở mọi DPI.
        var vo = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            AutoSize = true,
            BackColor = vetTrai,
            Padding = new Padding(3, 1, 1, 1),
            Margin = new Padding(0, 6, 0, 0),
            MaximumSize = new Size(rongToiDa, 0),
        };
        vo.Controls.Add(noiDung);
        return vo;
    }

    // ===== Chip trạng thái =====

    /// <summary>
    /// Chip trạng thái nhỏ: ký hiệu + chữ trên nền đặc. Luôn có CHỮ, không bao giờ chỉ có màu —
    /// cùng luật với web (không truyền tải thông tin chỉ bằng màu).
    /// </summary>
    internal static Label Chip(string chu, Color nen, Color chuMau) => new()
    {
        Text = $"  {chu}  ",
        ForeColor = chuMau,
        BackColor = nen,
        Font = new Font(PhongChu, 8f, FontStyle.Bold),
        AutoSize = true,
        Margin = new Padding(0, 1, 0, 4),
        Padding = new Padding(2, 2, 2, 2),
    };

    // ===== Nút =====

    /// <summary>Nút hành động — tự khai đủ 3 trạng thái (thường / rê / nhấn).</summary>
    internal static Button Nut(string chu, KieuNut kieu)
    {
        var (nen, chuMau, nenRe, nenNhan) = kieu switch
        {
            KieuNut.Chinh => (MauBang.NutChinh, MauBang.Chu, MauBang.NutChinhRe, MauBang.NutChinhNhan),
            KieuNut.Chim => (MauBang.NenO, MauBang.ChuMo, MauBang.NenKhoa, MauBang.NenO),
            _ => (MauBang.NenKhoi, MauBang.Chu, MauBang.NenRe, MauBang.NenO),
        };

        var nut = new Button
        {
            Text = chu,
            BackColor = nen,
            ForeColor = chuMau,
            FlatStyle = FlatStyle.Flat,
            AutoSize = true,
            MinimumSize = new Size(0, CaoNut),
            Font = new Font(PhongChu, 9f),
            Margin = new Padding(0, 6, 6, 0),
            Padding = new Padding(10, 5, 10, 5),
            UseVisualStyleBackColor = false,
        };
        // Không khai 3 dòng này thì WinForms vẽ trạng thái rê/nhấn bằng màu hệ thống (xanh nhạt) —
        // mảng sáng lòi ra giữa bảng tối, đúng lớp lỗi đã gặp ở hộp thoại WPF (M106 PR4).
        nut.FlatAppearance.BorderSize = kieu == KieuNut.Phu ? 1 : 0;
        nut.FlatAppearance.BorderColor = MauBang.Vien;
        nut.FlatAppearance.MouseOverBackColor = nenRe;
        nut.FlatAppearance.MouseDownBackColor = nenNhan;
        return nut;
    }

    /// <summary>Hàng nút xếp ngang, tự xuống dòng khi palette hẹp.</summary>
    internal static FlowLayoutPanel HangNut(int rongToiDa) => new()
    {
        FlowDirection = FlowDirection.LeftToRight,
        WrapContents = true,
        AutoSize = true,
        BackColor = MauBang.NenThe,
        MaximumSize = new Size(rongToiDa, 0),
        Margin = new Padding(0, 2, 0, 0),
    };

    // ===== Thanh hành động (neo trên, không cuộn theo nội dung) =====

    /// <summary>
    /// Thanh hành động dính đầu tab: nút "Làm mới" + dòng ngữ cảnh (đang xét bản vẽ nào, còn mấy
    /// bước/cảnh báo). Trước đây nút Làm mới nằm trong vùng cuộn nên cuộn xuống là mất — kỹ sư phải
    /// cuộn ngược lên mới bấm lại được.
    ///
    /// <c>AutoSize</c> + <c>Dock=Top</c> (không đặt <c>Height</c> cố định): chiều cao tự bám cỡ chữ
    /// hệ thống nên đúng ở cả màn hình DPI cao lẫn khi người dùng phóng to chữ Windows.
    /// </summary>
    internal static (Control Thanh, Button NutLamMoi, Label NhanNguCanh) ThanhHanhDong()
    {
        var thanh = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoSize = true,
            // Thanh CHÌM hơn nền bảng, nút Phụ (mặt NenKhoi) nổi lên trên — đủ tách hai lớp mà
            // không phải thêm bậc xám thứ ba.
            BackColor = MauBang.NenO,
            Padding = new Padding(8, 8, 8, 8),
        };

        var nut = Nut("⟳  Làm mới", KieuNut.Phu);
        nut.Margin = new Padding(0, 0, 0, 0);

        var nhan = new Label
        {
            ForeColor = MauBang.ChuMo,
            BackColor = MauBang.NenO,
            Font = new Font(PhongChu, 8.5f),
            AutoSize = true,
            // Trần cố định: thanh nằm NGOÀI vùng cuộn nên không đi qua bước ngắt dòng lại khi kéo
            // palette. 400px đủ cho câu dài nhất mà không kéo palette rộng ra theo.
            MaximumSize = new Size(400, 0),
            Margin = new Padding(0, 6, 0, 0),
        };

        thanh.Controls.Add(nut);
        thanh.Controls.Add(nhan);
        return (thanh, nut, nhan);
    }

    // ===== Ánh xạ màu =====

    /// <summary>Màu chữ theo mức độ của một dòng trạng thái.</summary>
    internal static Color MauCua(MucDo mucDo) => mucDo switch
    {
        MucDo.Tot => MauBang.Tot,
        MucDo.CanhBao => MauBang.CanhBao,
        _ => MauBang.Chu,
    };

    /// <summary>Ký hiệu đi kèm màu của một dòng trạng thái (không dựa vào riêng màu).</summary>
    internal static string KyHieuCua(MucDo mucDo) => mucDo switch
    {
        MucDo.Tot => "✓",
        MucDo.CanhBao => "⚠",
        _ => "•",
    };
}
