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
    private static readonly Color MauNen = Color.FromArgb(43, 43, 46);
    private static readonly Color MauNenKhoi = Color.FromArgb(55, 55, 60);
    private static readonly Color MauChu = Color.FromArgb(220, 220, 222);
    private static readonly Color MauChuMo = Color.FromArgb(160, 160, 165);
    private static readonly Color MauTot = Color.FromArgb(96, 200, 140);
    private static readonly Color MauCanhBao = Color.FromArgb(235, 170, 80);
    private static readonly Color MauNutChinh = Color.FromArgb(16, 124, 88);

    private readonly FlowLayoutPanel _flow;

    internal BangDieuKhienControl()
    {
        BackColor = MauNen;
        ForeColor = MauChu;
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

    /// <summary>Vẽ lại toàn bộ bảng theo trạng thái mới (gọi khi mở bảng + khi bấm Làm mới).</summary>
    internal void HienThi(TrangThaiPhien trangThai)
    {
        _flow.SuspendLayout();
        _flow.Controls.Clear();

        var lamMoi = TaoNut("Làm mới trạng thái", MauNenKhoi);
        lamMoi.Click += (_, _) => HienThi(TrangThaiGom.LayTrangThai());
        _flow.Controls.Add(lamMoi);

        foreach (var khoi in BangDieuKhienModel.Dung(trangThai))
        {
            _flow.Controls.Add(new Label
            {
                Text = khoi.TieuDe.ToUpperInvariant(),
                ForeColor = MauChuMo,
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
                        MucDo.Tot => MauTot,
                        MucDo.CanhBao => MauCanhBao,
                        _ => MauChu,
                    },
                    Font = new Font("Segoe UI", 9f),
                    AutoSize = true,
                    MaximumSize = new Size(300, 0), // xuống dòng thay vì tràn ngang palette
                    Margin = new Padding(2, 2, 2, 2),
                });
            }
            if (khoi.LenhGoiY is { } lenh)
            {
                var nut = TaoNut($"Chạy {lenh}", MauNutChinh);
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
        ForeColor = MauChu,
        FlatStyle = FlatStyle.Flat,
        AutoSize = true,
        Font = new Font("Segoe UI", 9f),
        Margin = new Padding(2, 6, 2, 2),
        Padding = new Padding(8, 4, 8, 4),
    };
}
