using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Cầu nối nhỏ giữa thực thể AutoCAD và mô hình thuần của Core cho bộ lệnh vẽ — khai MỘT lần,
/// mọi lệnh dùng chung (trước đây mỗi lệnh chép lại một bản, dễ lệch nhau khi sửa).
/// </summary>
internal static class VeThucThe
{
    /// <summary>Đỉnh + bulge của polyline dưới dạng mô hình thuần của Core.</summary>
    internal static List<DinhPolyline> DinhCua(Polyline pl)
    {
        var dinh = new List<DinhPolyline>(pl.NumberOfVertices);
        for (var i = 0; i < pl.NumberOfVertices; i++)
        {
            var p = pl.GetPoint2dAt(i);
            dinh.Add(new DinhPolyline(p.X, p.Y, pl.GetBulgeAt(i)));
        }
        return dinh;
    }

    /// <summary>
    /// Thêm thực thể vào một block record rồi MỚI đặt layer (tên layer chỉ tra được khi thực thể
    /// đã thuộc database — đặt trước AppendEntity là lỗi eNoDatabase kinh điển).
    /// </summary>
    internal static void Them(Transaction tr, BlockTableRecord noiChua, Entity ent, string layer)
    {
        noiChua.AppendEntity(ent);
        tr.AddNewlyCreatedDBObject(ent, true);
        ent.Layer = layer;
    }

    /// <summary>
    /// Dựng LWPOLYLINE 2D (Z=0) từ danh sách đỉnh + bulge của Core — dùng chung cho tuyến tim
    /// (<c>XBOSS_VE</c>) và nét biên dựng lại (<c>XBOSS_VE_DOI</c>).
    /// KHÔNG đặt layer ở đây: tên layer chỉ tra cứu được khi thực thể ĐÃ thuộc một database
    /// (đặt trước khi AppendEntity là nguồn lỗi eNoDatabase kinh điển) — caller đặt sau khi thêm
    /// (xem <see cref="Them"/>). Cũng KHÔNG gọi SetDatabaseDefaults: thực thể mới mặc định ByLayer,
    /// đúng chuẩn dự án (màu/nét lấy theo layer đích, không dính CECOLOR hiện hành của kỹ sư).
    /// </summary>
    internal static Polyline TaoPolyline(IReadOnlyList<DinhPolyline> dinh, bool kin)
    {
        var pl = new Polyline();
        for (var i = 0; i < dinh.Count; i++)
            pl.AddVertexAt(i, new Point2d(dinh[i].X, dinh[i].Y), dinh[i].Bulge, 0, 0);
        pl.Closed = kin;
        pl.Elevation = 0;
        pl.Normal = Vector3d.ZAxis;
        return pl;
    }

    // ===== Băm hình học để giữ công sửa tay của kỹ sư (M118 FR2) =====

    /// <summary>
    /// Chuỗi điểm ĐẠI DIỆN của một thực thể để băm hình học (M118 FR2) — tính CÙNG MỘT CÁCH lúc
    /// sinh và lúc kiểm ở lần chạy sau, nếu không thì băm luôn lệch và mọi thứ thành "đã sửa tay".
    ///
    /// Line/MText/khối chèn/bảng dùng điểm đặc trưng đọc lại được tất định; polyline dùng đỉnh.
    /// Còn lại (đáng kể nhất là <see cref="Wipeout"/> của ⑥ ngắt nét — đọc lại đỉnh qua
    /// <c>SetFrom</c> KHÔNG tất định) dùng 2 góc hộp bao, đúng cách <c>RevisionStore.DiemBam</c> đã
    /// làm cho mốc revision: dời đối tượng là hộp bao dời theo, đủ để nhận ra kỹ sư đã kéo tay.
    /// Rỗng = không lấy được điểm đại diện ⇒ coi như không có băm (đi đường cũ).
    /// </summary>
    internal static IReadOnlyList<Diem2> DiemBamCua(Entity ent)
    {
        switch (ent)
        {
            case Line l:
                return [new Diem2(l.StartPoint.X, l.StartPoint.Y), new Diem2(l.EndPoint.X, l.EndPoint.Y)];
            case MText t:
                return [new Diem2(t.Location.X, t.Location.Y)];
            // Table PHẢI đứng TRƯỚC BlockReference: AcDbTable kế thừa AcDbBlockReference (bảng là
            // một khối chèn đặc biệt mang định dạng), nên nhánh con phải khớp trước nhánh cha —
            // đảo thứ tự là CS8120 "case unreachable" thật trên máy có AutoCAD (không lộ qua cổng
            // CI cũ vì stub từng khai hai lớp là anh em, xem ghi chú tại AcadStub.cs).
            case Table tb:
                return [new Diem2(tb.Position.X, tb.Position.Y)];
            case BlockReference br:
                return [new Diem2(br.Position.X, br.Position.Y)];
            case Polyline pl:
                return DinhCua(pl).Select(d => new Diem2(d.X, d.Y)).ToList();
            default:
                return RevisionStore.BaoHinhCua(ent) is { } bao
                    ? [new Diem2(bao.MinX, bao.MinY), new Diem2(bao.MaxX, bao.MaxY)]
                    : [];
        }
    }

    /// <summary>
    /// XData kèm băm hình học lúc sinh khi (và chỉ khi) thực thể do <c>XBOSS_HOANTHIEN</c> sinh ra
    /// (M118 FR2/AC4). Gọi SAU khi thực thể đã vào database — điểm đại diện của hộp bao chỉ đọc
    /// được lúc đó.
    /// </summary>
    internal static VeXDataInfo KemBam(VeXDataInfo xd, Entity ent, string? giaiDoanM115) =>
        HoanThienKeHoach.BamKhiPipeline(giaiDoanM115, DiemBamCua(ent)) is { } bam
            ? xd with { BamHinhHoc = bam }
            : xd;

    /// <summary>Ứng viên cho đường dọn cũ giữ-tay của Core (M118 FR2) đọc từ một thực thể thật.</summary>
    internal static UngVienDonCu<ObjectId> UngVienDonCua(ObjectId id, Entity ent, VeXDataInfo? xd) =>
        new(id,
            xd?.NguonHoanThien,
            xd?.BamHinhHoc,
            RevisionSnapshot.BamHinhHoc(DiemBamCua(ent)),
            xd?.SuaTay ?? false);

    /// <summary>ObjectId từ chuỗi handle trong XData; null khi handle đã mục (đối tượng bị xóa).</summary>
    internal static ObjectId? TimTheoHandle(Database db, string? handle)
    {
        if (string.IsNullOrWhiteSpace(handle)) return null;
        try
        {
            return db.TryGetObjectId(new Handle(Convert.ToInt64(handle, 16)), out var id) ? id : null;
        }
        catch (FormatException)
        {
            return null; // XData bị sửa tay thành chuỗi không phải handle
        }
        catch (OverflowException)
        {
            return null;
        }
    }

    /// <summary>
    /// Vạch chia + tag đốt (<c>XBOSS_VE_CHIADOT</c> — M105) nhóm theo handle tuyến tim mà chúng
    /// bám vào. Quét MỘT lần cho cả lệnh: <c>XBOSS_VE_CHIADOT</c> dùng để chạy lại không nhân đôi,
    /// <c>XBOSS_VE_DOI</c> dùng để dọn vạch cũ khi cỡ tuyến đổi (số đốt phụ thuộc cỡ).
    /// </summary>
    internal static Dictionary<string, List<ObjectId>> ChiaDotTheoTim(Database db, Transaction tr)
    {
        var ra = new Dictionary<string, List<ObjectId>>(StringComparer.OrdinalIgnoreCase);
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            var xd = VeXDataStore.Doc(ent);
            if (xd is null || xd.VaiTro is not (VaiTroVe.VachChia or VaiTroVe.NhanDot)) continue;
            if (xd.HandleTim is not { Length: > 0 } tim) continue;
            if (!ra.TryGetValue(tim, out var ds)) ra[tim] = ds = [];
            ds.Add(id);
        }
        return ra;
    }

    /// <summary>
    /// Xóa vạch chia + tag đốt của MỘT tuyến (dùng chung cho "chạy lại chia đốt" và "đổi cỡ tuyến").
    /// Tự mở khóa layer của chính đối tượng sắp xóa — sau <c>XBOSS_VE_NEN</c> mọi layer đang khóa,
    /// mở theo layer thật của đối tượng thì không phải tra ngược hậu tố layer trong rule pack.
    /// </summary>
    internal static int XoaChiaDotCua(
        Database db, Transaction tr, IReadOnlyDictionary<string, List<ObjectId>> theoTim, string handleTim) =>
        XoaChiaDotGiuTay(db, tr, theoTim, handleTim, giuTayM115: false).SoXoa;

    /// <summary>
    /// Như <see cref="XoaChiaDotCua"/> nhưng có đường GIỮ-TAY của M118 FR2: <paramref name="giuTayM115"/>
    /// true (chỉ khi <c>XBOSS_HOANTHIEN</c> gọi) thì vạch chia/nhãn đốt mang dấu <c>nguon=M115</c> mà
    /// kỹ sư đã dời tay được giữ nguyên thay vì xóa-sinh lại. Chạy tay lệnh lẻ truyền false ⇒ hành vi
    /// Y HỆT trước M118 (bất biến AC3). Quyết định giữ/xóa tính ở Core
    /// (<see cref="HoanThienKeHoach.LocDonCu{T}"/>, có test).
    /// </summary>
    internal static (int SoXoa, int SoGiu) XoaChiaDotGiuTay(
        Database db, Transaction tr, IReadOnlyDictionary<string, List<ObjectId>> theoTim, string handleTim,
        bool giuTayM115)
    {
        if (!theoTim.TryGetValue(handleTim, out var ids)) return (0, 0);

        var ungVien = new List<UngVienDonCu<ObjectId>>();
        foreach (var id in ids)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity doc) continue;
            ungVien.Add(UngVienDonCua(id, doc, VeXDataStore.Doc(doc)));
        }

        var kq = HoanThienKeHoach.LocDonCu(ungVien, giuTayM115);
        var soXoa = 0;
        foreach (var id in kq.CanXoa)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity doc) continue;
            VeLayerService.MoKhoaNeuCo(db, tr, doc.Layer);
            if (tr.GetObject(id, OpenMode.ForWrite) is not Entity ghi) continue;
            ghi.Erase();
            soXoa++;
        }
        return (soXoa, kq.GiuViSuaTay.Count);
    }

    /// <summary>
    /// Xóa các nét biên cũ của MỘT tim (dùng chung cho <c>XBOSS_VE_DOI</c> và
    /// <c>XBOSS_VE_NHANTUYEN</c> — cỡ đổi thì nét biên cũ sai bề rộng, giữ lại là để nét sai nằm
    /// trên bản vẽ nộp).
    ///
    /// CHỈ xóa đối tượng thật sự là nét biên CỦA CHÍNH tim đó (XData vai trò
    /// <see cref="VaiTroVe.Bien"/> + handle tim khớp): handle trong XData có thể đã mục (kỹ sư xóa
    /// tay, hoặc AutoCAD cấp lại handle cho đối tượng khác) — xóa mù theo handle là cách chắc chắn
    /// nhất để mất một đối tượng vô can.
    /// </summary>
    internal static int XoaNetBienCua(
        Database db, Transaction tr, IReadOnlyList<string> handleBien, string handleTim)
    {
        var soXoa = 0;
        foreach (var handle in handleBien)
        {
            if (TimTheoHandle(db, handle) is not { } id) continue;
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity doc) continue;
            var xd = VeXDataStore.Doc(doc);
            if (xd is null || xd.VaiTro != VaiTroVe.Bien) continue;
            if (!string.Equals(xd.HandleTim, handleTim, StringComparison.Ordinal)) continue;
            VeLayerService.MoKhoaNeuCo(db, tr, doc.Layer);
            if (tr.GetObject(id, OpenMode.ForWrite) is not Entity ghi) continue;
            ghi.Erase();
            soXoa++;
        }
        return soXoa;
    }

    // ===== Ngắt nét giao chéo (M109) =====
    //
    // GUARDRAIL M109 §2 guardrail 1 — TIM LÀ BẤT KHẢ XÂM PHẠM: mọi hàm dưới đây chỉ TẠO thực thể
    // mới hoặc XÓA thực thể do chính M109 tạo (vai trò NgatNet). Không hàm nào mở polyline tim ở
    // chế độ ghi, không hàm nào gọi AddVertexAt/RemoveVertexAt/Erase lên tim. Cắt tim = bóc thiếu
    // chiều dài ở XBOSS_BOCKL (M100 FR4) — đây là chỗ dễ phạm nhất của cả tính năng.

    /// <summary>
    /// Dựng <see cref="Wipeout"/> từ đa giác biên do Core tính (<see cref="CrossingGeometry.VungChe"/>).
    /// KHÔNG tính lại hình học ở đây — chỉ đổi <see cref="Diem2"/> sang <see cref="Point2d"/>.
    ///
    /// Biên được ĐÓNG KÍN bằng cách lặp lại đỉnh đầu ở cuối: <c>AcDbWipeout::setFrom</c> hiểu mảng
    /// đỉnh là một vòng kín, và biên do chính lệnh WIPEOUT của AutoCAD sinh ra cũng có đỉnh cuối
    /// trùng đỉnh đầu — truyền biên hở là ca dễ ném <c>eInvalidInput</c>.
    /// Không gọi <c>SetDatabaseDefaults()</c>: thực thể mới mặc định ByLayer, đúng chuẩn dự án
    /// (cùng lý do với <see cref="TaoPolyline"/>).
    /// </summary>
    internal static Wipeout TaoWipeout(IReadOnlyList<Diem2> dinh)
    {
        var diem = new Point2dCollection();
        foreach (var d in dinh) diem.Add(new Point2d(d.X, d.Y));
        diem.Add(new Point2d(dinh[0].X, dinh[0].Y));

        var wipeout = new Wipeout();
        wipeout.SetFrom(diem, Vector3d.ZAxis);
        return wipeout;
    }

    /// <summary>
    /// Dựng cung cầu vượt (M109 FR4 phương án C) từ kết quả Core
    /// (<see cref="CrossingGeometry.CauVuot"/>): polyline 2 đỉnh, đỉnh đầu mang <c>bulge</c> nên cả
    /// đoạn là MỘT cung tròn đúng bán kính <c>jogRadiusMm</c>.
    /// </summary>
    internal static Polyline TaoCungCauVuot(KetQuaCauVuot cauVuot) =>
        TaoPolyline(
            [
                new DinhPolyline(cauVuot.Dau.X, cauVuot.Dau.Y, cauVuot.Bulge),
                new DinhPolyline(cauVuot.Cuoi.X, cauVuot.Cuoi.Y, 0),
            ],
            kin: false);

    /// <summary>Một đối tượng ngắt nét đang có trong bản vẽ (vai trò <see cref="VaiTroVe.NgatNet"/>).</summary>
    internal readonly record struct DoiTuongNgatNet(
        ObjectId Id, string HandleTim, string? HandleTimGiao, bool DaoTay);

    /// <summary>
    /// Mọi đối tượng ngắt nét giao chéo đang có trong model space. Quét MỘT lần cho cả lệnh
    /// (bản vẽ shop có hàng nghìn thực thể): <c>XBOSS_VE_NGATNET</c> dùng để dọn kết quả cũ của
    /// đúng các tuyến sắp vẽ lại (FR6) và để đọc lại các cặp ĐÃ ĐẢO TAY (FR7/AC5);
    /// <c>XBOSS_VE_NGATNET_XOA</c> dùng để gỡ sạch (FR8).
    /// </summary>
    internal static List<DoiTuongNgatNet> NgatNetTrongBanVe(Database db, Transaction tr)
    {
        var ra = new List<DoiTuongNgatNet>();
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            var xd = VeXDataStore.Doc(ent);
            if (xd is null || xd.VaiTro != VaiTroVe.NgatNet) continue;
            if (xd.HandleTim is not { Length: > 0 } tim) continue;
            ra.Add(new DoiTuongNgatNet(id, tim, xd.HandleTimGiao, xd.DaoTay));
        }
        return ra;
    }

    /// <summary>
    /// Xóa các đối tượng ngắt nét đã chọn sẵn. Tự mở khóa layer của chính đối tượng sắp xóa (sau
    /// <c>XBOSS_VE_NEN</c> mọi layer đang khóa) — cùng cách <see cref="XoaChiaDotCua"/> làm.
    /// Kiểm lại vai trò XData ngay trước khi xóa: danh sách dựng ở transaction TRƯỚC, giữa hai lần
    /// đó bản vẽ có thể đã đổi.
    /// </summary>
    internal static int XoaNgatNet(Database db, Transaction tr, IEnumerable<ObjectId> ids)
    {
        var soXoa = 0;
        foreach (var id in ids)
        {
            if (XoaMotNgatNet(db, tr, id)) soXoa++;
        }
        return soXoa;
    }

    /// <summary>
    /// Như <see cref="XoaNgatNet"/> nhưng có đường GIỮ-TAY của M118 FR2 (chỉ <c>XBOSS_HOANTHIEN</c>
    /// gọi): đối tượng ngắt nét mang dấu <c>nguon=M115</c> mà kỹ sư đã dời tay được giữ nguyên.
    /// Lệnh lẻ <c>XBOSS_VE_NGATNET</c> và <c>XBOSS_VE_NGATNET_XOA</c> vẫn đi <see cref="XoaNgatNet"/>
    /// nên hành vi của chúng không đổi (bất biến AC3 — riêng lệnh gỡ sạch thì PHẢI gỡ được tất).
    /// </summary>
    internal static (int SoXoa, int SoGiu) XoaNgatNetGiuTay(
        Database db, Transaction tr, IEnumerable<ObjectId> ids)
    {
        var ungVien = new List<UngVienDonCu<ObjectId>>();
        foreach (var id in ids)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity doc) continue;
            ungVien.Add(UngVienDonCua(id, doc, VeXDataStore.Doc(doc)));
        }

        var kq = HoanThienKeHoach.LocDonCu(ungVien, giuTayM115: true);
        var soXoa = 0;
        foreach (var id in kq.CanXoa)
        {
            if (XoaMotNgatNet(db, tr, id)) soXoa++;
        }
        return (soXoa, kq.GiuViSuaTay.Count);
    }

    /// <summary>
    /// Xóa MỘT đối tượng ngắt nét sau khi kiểm lại vai trò XData (<c>VaiTro: VaiTroVe.NgatNet</c>) —
    /// danh sách id dựng ở transaction TRƯỚC, giữa hai lần đó bản vẽ có thể đã đổi. Đây là chỗ DUY
    /// NHẤT của M109 gọi <c>Erase()</c> (guardrail M109 §2).
    /// </summary>
    private static bool XoaMotNgatNet(Database db, Transaction tr, ObjectId id)
    {
        if (tr.GetObject(id, OpenMode.ForRead) is not Entity doc) return false;
        if (VeXDataStore.Doc(doc) is not { VaiTro: VaiTroVe.NgatNet }) return false;
        VeLayerService.MoKhoaNeuCo(db, tr, doc.Layer);
        if (tr.GetObject(id, OpenMode.ForWrite) is not Entity ghi) return false;
        ghi.Erase();
        return true;
    }

    /// <summary>
    /// Đẩy một nhóm thực thể lên TRÊN CÙNG thứ tự vẽ của block record đang chứa chúng (M109 —
    /// wipeout sai thứ tự vẽ thì che nhầm tuyến hoặc không che gì).
    /// Danh sách rỗng thì không mở bảng thứ tự vẽ (không tạo thay đổi thừa trong nhóm UNDO).
    /// </summary>
    internal static void DayLenTrenCung(Transaction tr, BlockTableRecord noiChua, IEnumerable<ObjectId> ids)
    {
        var tap = new ObjectIdCollection();
        var co = false;
        foreach (var id in ids)
        {
            tap.Add(id);
            co = true;
        }
        if (!co) return;
        if (tr.GetObject(noiChua.DrawOrderTableId, OpenMode.ForWrite) is DrawOrderTable bang) bang.MoveToTop(tap);
    }

    /// <summary>Một khối do bộ lệnh vẽ chèn và đang bám vào một tuyến tim.</summary>
    /// <remarks>
    /// Ba trường cuối (dấu <c>nguon</c>, băm lúc sinh, cờ sửa tay) đủ để giai đoạn ④ giá đỡ đếm khối
    /// kỹ sư đã dời tay (M118 FR2) mà không phải quét bản vẽ thêm một lượt nữa.
    /// </remarks>
    internal readonly record struct KhoiBamTim(
        VaiTroVe VaiTro, Diem2 Diem, string? BlockId, string? NguonHoanThien, string? BamHinhHoc, bool SuaTay);

    /// <summary>
    /// Mọi khối do bộ lệnh vẽ chèn, nhóm theo handle của tim mà nó bám vào (phụ kiện, thiết bị,
    /// giá đỡ, lỗ chờ, mũi tên hướng dốc). Quét MỘT lần cho cả lệnh — bản vẽ shop có hàng nghìn
    /// khối, quét lại theo từng tuyến là chậm thấy rõ.
    /// </summary>
    internal static Dictionary<string, List<KhoiBamTim>> KhoiTheoTim(Database db, Transaction tr)
    {
        var ra = new Dictionary<string, List<KhoiBamTim>>(StringComparer.OrdinalIgnoreCase);
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not BlockReference br) continue;
            var xd = VeXDataStore.Doc(br);
            if (xd?.HandleTim is not { Length: > 0 } tim) continue;
            if (!ra.TryGetValue(tim, out var ds)) ra[tim] = ds = [];
            ds.Add(new KhoiBamTim(
                xd.VaiTro, new Diem2(br.Position.X, br.Position.Y), xd.BlockId,
                xd.NguonHoanThien, xd.BamHinhHoc, xd.SuaTay));
        }
        return ra;
    }
}
