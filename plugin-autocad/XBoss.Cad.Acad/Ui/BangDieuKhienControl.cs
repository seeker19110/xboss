using System.Drawing;
using System.Windows.Forms;
using XBoss.Cad.Core.Ui;

namespace XBoss.Cad.Acad.Ui;

/// <summary>
/// Nội dung bảng điều khiển XBoss (M102) — WinForms UserControl gắn vào PaletteSet.
/// Toàn bộ NỘI DUNG do <see cref="BangDieuKhienModel"/> (Core, test được) quyết định;
/// lớp này chỉ vẽ: mỗi khối 1 tiêu đề + các dòng trạng thái + nút hành động nhanh.
/// Bảng màu bám theme tối của AutoCAD (không theo theme web — đây là cửa sổ trong AutoCAD).
/// </summary>
internal sealed class BangDieuKhienControl : UserControl
{
    private readonly FlowLayoutPanel _flow;

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
            Padding = new Padding(8),
        };
        Controls.Add(_flow);
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
            await TrangThaiGom.LamMoiDeXuatAsync(); // không ném — tự nuốt lỗi thành thông điệp
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

        var lamMoi = TaoNut("Làm mới trạng thái", MauBang.NenKhoi);
        lamMoi.Click += (_, _) => LamMoi();
        _flow.Controls.Add(lamMoi);

        foreach (var khoi in BangDieuKhienModel.Dung(trangThai))
        {
            _flow.Controls.Add(new Label
            {
                Text = khoi.TieuDe.ToUpperInvariant(),
                ForeColor = MauBang.ChuMo,
                Font = new Font("Segoe UI", 8f, FontStyle.Bold),
                AutoSize = true,
                Margin = new Padding(2, 12, 2, 2),
            });
            foreach (var dong in khoi.Dong)
            {
                _flow.Controls.Add(new Label
                {
                    Text = $"{dong.Muc}: {dong.NoiDung}",
                    ForeColor = dong.MucDo switch
                    {
                        MucDo.Tot => MauBang.Tot,
                        MucDo.CanhBao => MauBang.CanhBao,
                        _ => MauBang.Chu,
                    },
                    Font = new Font("Segoe UI", 9f),
                    AutoSize = true,
                    MaximumSize = new Size(300, 0), // xuống dòng thay vì tràn ngang palette
                    Margin = new Padding(2, 2, 2, 2),
                });
            }
            if (khoi.LenhGoiY is { } lenh)
            {
                var nut = TaoNut(khoi.NhanLenh ?? $"Chạy {lenh}", MauBang.NutChinh);
                nut.Click += (_, _) => RibbonBuilder.ThucThiLenh(lenh);
                _flow.Controls.Add(nut);
            }
        }

        _flow.ResumeLayout();
    }

    private static Button TaoNut(string chu, Color nen) => new()
    {
        Text = chu,
        BackColor = nen,
        ForeColor = MauBang.Chu,
        FlatStyle = FlatStyle.Flat,
        AutoSize = true,
        Font = new Font("Segoe UI", 9f),
        Margin = new Padding(2, 6, 2, 2),
        Padding = new Padding(8, 4, 8, 4),
    };
}
