using Autodesk.AutoCAD.Colors;
using Autodesk.AutoCAD.DatabaseServices;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;

// Bí danh vì `UseWindowsForms` kéo theo implicit using `System.Drawing` (xem MarkService.cs).
using AcadColor = Autodesk.AutoCAD.Colors.Color;
using AcadTransparency = Autodesk.AutoCAD.Colors.Transparency;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Layer cho bộ lệnh vẽ (M100 FR9): tạo layer đích đúng màu/lineweight, và khóa + làm mờ layer
/// nền của <c>XBOSS_VE_NEN</c> — có hoàn nguyên.
///
/// Trạng thái trước khi làm nền được cất trong **Xrecord ở Named Objects Dictionary** của chính
/// bản vẽ (không phải biến RAM): đóng bản vẽ mở lại vẫn hoàn nguyên đúng, và mỗi bản vẽ một
/// trạng thái riêng. KHÔNG đụng đối tượng nền — chỉ thuộc tính khóa/độ mờ của bảng layer.
/// </summary>
internal static class VeLayerService
{
    /// <summary>
    /// Đọc độ mờ của một layer AN TOÀN. <c>Transparency.Alpha</c> CHỈ hợp lệ khi giá trị là
    /// <c>ByAlpha</c>; layer để <c>ByLayer</c>/<c>ByBlock</c>/không hợp lệ thì đọc <c>Alpha</c> ném
    /// <c>eInvalidKey</c> và kéo cả lệnh rollback — bản vẽ nhập từ DXF gần như luôn có layer như
    /// vậy, nên đây là lỗi chết lệnh trên đúng loại bản vẽ kỹ sư nhận từ CĐT/TVTK (vấp thật
    /// 2026-08-27: <c>XBOSS_VE_NEN</c> và <c>XBOSS_VE_NHAN</c> cùng chết vì hai chỗ đọc Alpha).
    ///
    /// Không phải ByAlpha nghĩa là layer KHÔNG bị làm mờ ⇒ trả 255 (đục hoàn toàn) là đúng
    /// nghiệp vụ, không phải giá trị vá víu.
    /// </summary>
    private static byte AlphaAnToan(AcadTransparency doMo) => doMo.IsByAlpha ? doMo.Alpha : (byte)255;

    /// <summary>Khóa mục trong Named Objects Dictionary giữ trạng thái layer trước khi làm nền.</summary>
    internal const string KhoaNOD = "XBOSS_VE_NEN";

    /// <summary>Phiên bản định dạng bản ghi trạng thái (đọc trước, khác thì từ chối hoàn nguyên mù).</summary>
    private const string PhienBanTrangThai = "1";

    internal sealed record LayerCu(string Ten, bool Khoa, byte Alpha);

    internal sealed record TrangThaiNen(string HeId, string ClayerCu, IReadOnlyList<LayerCu> Layer);

    // ===== Trạng thái nền trong NOD =====

    internal static TrangThaiNen? DocTrangThai(Database db, Transaction tr)
    {
        var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForRead);
        if (!nod.Contains(KhoaNOD)) return null;
        if (tr.GetObject(nod.GetAt(KhoaNOD), OpenMode.ForRead) is not Xrecord xrec) return null;
        var data = xrec.Data;
        if (data is null) return null;

        var gt = data.AsArray().Select(tv => tv.Value?.ToString() ?? "").ToList();
        if (gt.Count < 3 || gt[0] != PhienBanTrangThai) return null;

        var layer = new List<LayerCu>();
        for (var i = 3; i + 2 < gt.Count; i += 3)
        {
            // Đọc hỏng thì coi như layer vốn KHÔNG mờ (255) — thà bỏ sót độ mờ còn hơn
            // hoàn nguyên thành trong suốt hoàn toàn.
            var alpha = byte.TryParse(gt[i + 2], out var a) ? a : (byte)255;
            layer.Add(new LayerCu(gt[i], gt[i + 1] == "1", alpha));
        }
        return new TrangThaiNen(gt[1], gt[2], layer);
    }

    internal static void GhiTrangThai(Database db, Transaction tr, TrangThaiNen tt)
    {
        var gt = new List<TypedValue>
        {
            new((int)DxfCode.Text, PhienBanTrangThai),
            new((int)DxfCode.Text, tt.HeId),
            new((int)DxfCode.Text, tt.ClayerCu),
        };
        foreach (var l in tt.Layer)
        {
            gt.Add(new TypedValue((int)DxfCode.Text, l.Ten));
            gt.Add(new TypedValue((int)DxfCode.Text, l.Khoa ? "1" : "0"));
            gt.Add(new TypedValue((int)DxfCode.Text, l.Alpha.ToString()));
        }

        var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForWrite);
        var xrec = new Xrecord { Data = new ResultBuffer(gt.ToArray()) };
        nod.SetAt(KhoaNOD, xrec);
        tr.AddNewlyCreatedDBObject(xrec, true);
    }

    internal static void XoaTrangThai(Database db, Transaction tr)
    {
        var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForWrite);
        if (nod.Contains(KhoaNOD)) nod.Remove(KhoaNOD);
    }

    // ===== Khóa + làm mờ nền =====

    /// <summary>
    /// Khóa và làm mờ MỌI layer hiện có; trả trạng thái cũ để cất vào NOD. Layer đích của hệ
    /// được mở khóa lại ngay sau đó bằng <see cref="DamBaoLayer"/> — vẫn nằm trong bản ghi trạng
    /// thái nên hoàn nguyên trả đúng khóa/độ mờ ban đầu của chúng.
    ///
    /// BỎ QUA layer phụ thuộc xref (<c>IsDependent</c>): AutoCAD KHÔNG cho sửa symbol table record
    /// của xref, mở ForWrite là ném <c>eInvalidKey</c> và cả lệnh rollback — bản vẽ MEP thật gần
    /// như luôn có xref kiến trúc/kết cấu, nên không bỏ qua là lệnh chết trên đúng loại bản vẽ nó
    /// sinh ra để phục vụ (thấy trên bản vẽ AEC thật ngày 2026-08-26). Layer xref vốn đã là nền
    /// tham chiếu, không phải thứ kỹ sư vẽ đè lên, nên bỏ qua cũng đúng nghiệp vụ.
    ///
    /// Mỗi layer bọc try/catch riêng vì cùng lý do: một layer khó tính (bị AEC/ứng dụng thứ ba
    /// giữ) không được phép làm hỏng cả lệnh — layer nào không khóa được thì để nguyên, ghi vào
    /// <paramref name="boQua"/> để lệnh báo lại cho kỹ sư biết vùng nào chưa được bảo vệ.
    /// </summary>
    internal static List<LayerCu> KhoaVaLamMo(
        Database db, Transaction tr, int doMoPhanTram, List<string>? boQua = null)
    {
        var alpha = (byte)Math.Clamp(Math.Round(255.0 * (100 - doMoPhanTram) / 100.0), 0, 255);
        var cu = new List<LayerCu>();
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        foreach (ObjectId id in lt)
        {
            var ltr = (LayerTableRecord)tr.GetObject(id, OpenMode.ForRead);
            if (ltr.IsDependent)
            {
                boQua?.Add(ltr.Name);
                continue;
            }
            // ĐỌC trạng thái cũ TRƯỚC khi đổi (đọc sau là ghi lại chính giá trị vừa đặt ⇒ hoàn
            // nguyên sẽ khóa vĩnh viễn nền của kỹ sư), nhưng chỉ GHI vào danh sách sau khi đổi
            // thành công — layer nào không đụng được thì không có gì để hoàn nguyên.
            var khoaCu = ltr.IsLocked;
            var alphaCu = AlphaAnToan(ltr.Transparency);
            try
            {
                ltr.UpgradeOpen();
                ltr.IsLocked = true;
                ltr.Transparency = new AcadTransparency(alpha);
                cu.Add(new LayerCu(ltr.Name, khoaCu, alphaCu));
            }
            catch (Autodesk.AutoCAD.Runtime.Exception)
            {
                boQua?.Add(ltr.Name);
            }
        }
        return cu;
    }

    // ===== Mở khóa TẠM để sửa hàng loạt (XBOSS_CHUANHOA / XBOSS_BATCH) =====

    /// <summary>Một layer vừa được <see cref="MoKhoaTam"/> mở khóa — nhớ theo ObjectId chứ không
    /// theo tên, vì bước 2 của pipeline chuẩn hóa có thể ĐỔI TÊN chính layer đó trước khi khóa lại.</summary>
    internal readonly record struct LayerDaMoKhoa(ObjectId Id, string Ten);

    /// <summary>
    /// Mở khóa TẠM mọi layer đang khóa và KHÔNG thuộc xref, trả danh sách để <see cref="KhoaLai"/>
    /// trả nguyên trạng. Bản vẽ MEP thật luôn có layer khóa (nền kiến trúc, layer của hệ khác), mà
    /// mở một thực thể trên layer khóa ForWrite là ném <c>eOnLockedLayer</c> ⇒ cả lệnh chuẩn hóa
    /// chết trên đúng loại bản vẽ nó sinh ra để phục vụ (thấy thật ngày 2026-08-26).
    ///
    /// <para>CHỈ đụng cờ khóa: tắt/đóng băng KHÔNG chặn sửa qua API nên không có lý do đổi, mà đổi
    /// là làm hiện lên nét kỹ sư cố ý giấu. Layer vốn đã mở khóa thì không ghi vào danh sách —
    /// không có gì để hoàn nguyên.</para>
    ///
    /// <para>Layer phụ thuộc xref bị BỎ QUA HẲN (xem <see cref="KhoaVaLamMo"/>: mở ForWrite ném
    /// <c>eInvalidKey</c>) và KHÔNG tính vào <paramref name="boQua"/>: bản vẽ chủ không đặt được
    /// thực thể lên layer của xref, nên mở khóa chúng chẳng để làm gì. <paramref name="boQua"/> chỉ
    /// nhận layer thật sự CẦN mở mà không mở được — thứ duy nhất đáng báo cho kỹ sư.</para>
    ///
    /// <para><paramref name="chiLayer"/> (tùy chọn) thu hẹp về ĐÚNG những layer cần mở: lệnh chỉ
    /// ghi lên một nhúm thực thể (bóc/gỡ dấu khối lượng) thì không có lý do mở khóa cả bản vẽ —
    /// càng ít layer đụng tới, càng ít thứ để trả sai nếu lệnh chết giữa chừng. Bỏ trống = mọi
    /// layer đang khóa (pipeline chuẩn hóa sửa khắp bản vẽ nên cần đúng nghĩa đó).</para>
    /// </summary>
    internal static List<LayerDaMoKhoa> MoKhoaTam(
        Database db, Transaction tr, List<string>? boQua = null, IReadOnlySet<ObjectId>? chiLayer = null)
    {
        var daMo = new List<LayerDaMoKhoa>();
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        foreach (ObjectId id in lt)
        {
            var ltr = (LayerTableRecord)tr.GetObject(id, OpenMode.ForRead);
            if (ltr.IsDependent) continue;
            if (!ltr.IsLocked) continue;
            if (chiLayer is not null && !chiLayer.Contains(id)) continue;
            try
            {
                ltr.UpgradeOpen();
                ltr.IsLocked = false;
                daMo.Add(new LayerDaMoKhoa(id, ltr.Name));
            }
            catch (Autodesk.AutoCAD.Runtime.Exception)
            {
                // Layer bị AEC/ứng dụng thứ ba giữ — để nguyên khóa, thực thể trên đó không sửa được.
                boQua?.Add(ltr.Name);
            }
        }
        return daMo;
    }

    /// <summary>
    /// Khóa lại ĐÚNG những layer <see cref="MoKhoaTam"/> vừa mở — bản vẽ của kỹ sư phải rời lệnh
    /// với nguyên trạng thái khóa như lúc vào. Layer đã bị bước purge xóa thì bỏ qua (không còn gì
    /// để khóa, không phải lỗi); layer khóa lại không được thì trả tên vào <paramref name="thatBai"/>
    /// để lệnh BÁO, không im lặng.
    /// </summary>
    internal static int KhoaLai(
        Transaction tr, IReadOnlyList<LayerDaMoKhoa> daMo, List<string>? thatBai = null)
    {
        var so = 0;
        foreach (var l in daMo)
        {
            if (l.Id.IsErased) continue;
            try
            {
                if (tr.GetObject(l.Id, OpenMode.ForWrite) is not LayerTableRecord ltr) continue;
                ltr.IsLocked = true;
                so++;
            }
            catch (Autodesk.AutoCAD.Runtime.Exception)
            {
                thatBai?.Add(l.Ten);
            }
        }
        return so;
    }

    /// <summary>
    /// Trả layer về đúng trạng thái khóa/độ mờ đã lưu (layer đã bị xóa thì bỏ qua).
    ///
    /// Mỗi layer bọc try/catch riêng — ĐỐI XỨNG với <see cref="KhoaVaLamMo"/> và quan trọng hơn
    /// nó: một layer khó tính làm cả lệnh rollback nghĩa là bản vẽ KẸT VĨNH VIỄN ở trạng thái nền
    /// (mọi layer khóa + mờ, chạy lại lệnh lại chết đúng chỗ đó). Thà trả được 99/100 layer và báo
    /// tên layer còn lại, hơn là không trả được layer nào.
    /// </summary>
    internal static int HoanNguyen(
        Database db, Transaction tr, TrangThaiNen tt, List<string>? thatBai = null)
    {
        var soTra = 0;
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        foreach (var l in tt.Layer)
        {
            if (!lt.Has(l.Ten)) continue;
            try
            {
                var ltr = (LayerTableRecord)tr.GetObject(lt[l.Ten], OpenMode.ForWrite);
                ltr.IsLocked = l.Khoa;
                ltr.Transparency = new AcadTransparency(l.Alpha);
                soTra++;
            }
            catch (Autodesk.AutoCAD.Runtime.Exception)
            {
                thatBai?.Add(l.Ten);
            }
        }
        // Trả layer hiện hành; layer đóng băng KHÔNG được đặt làm hiện hành (AutoCAD từ chối).
        if (lt.Has(tt.ClayerCu) &&
            tr.GetObject(lt[tt.ClayerCu], OpenMode.ForRead) is LayerTableRecord cu && !cu.IsFrozen)
        {
            db.Clayer = cu.ObjectId;
        }
        return soTra;
    }

    // ===== Layer đích =====

    /// <summary>
    /// Bảo đảm layer tồn tại, mở khóa, không bị mờ, đang bật và không đóng băng — trả ObjectId.
    /// Layer mới: đặt màu ACI + lineweight theo bảng CTB của rule pack. Layer đã có: KHÔNG đổi
    /// màu/lineweight (không đụng quy ước sẵn có của bản vẽ), chỉ mở khóa để vẽ được.
    /// </summary>
    internal static ObjectId DamBaoLayer(
        Database db, Transaction tr, string ten, int aci, LineweightMapSection bangNet, out bool vuaTao)
    {
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        if (lt.Has(ten))
        {
            vuaTao = false;
            var co = (LayerTableRecord)tr.GetObject(lt[ten], OpenMode.ForWrite);
            if (co.IsLocked) co.IsLocked = false;
            if (co.IsOff) co.IsOff = false;
            // Bỏ đóng băng để nét vẽ ra nhìn thấy được (AutoCAD chỉ cấm ĐÓNG BĂNG layer hiện
            // hành, không cấm bỏ đóng băng).
            if (co.IsFrozen) co.IsFrozen = false;
            if (AlphaAnToan(co.Transparency) != 255) co.Transparency = new AcadTransparency(255);
            return co.ObjectId;
        }

        vuaTao = true;
        var moi = new LayerTableRecord
        {
            Name = ten,
            Color = AcadColor.FromColorIndex(ColorMethod.ByAci, (short)aci),
        };
        if (VeLayerStyle.LineweightMm(bangNet, aci) is { } mm)
            moi.LineWeight = (LineWeight)(int)Math.Round(mm * 100); // như bước 7 của XBOSS_CHUANHOA
        lt.UpgradeOpen();
        var id = lt.Add(moi);
        tr.AddNewlyCreatedDBObject(moi, true);
        return id;
    }

    /// <summary>
    /// Đặt kiểu nét cho một layer VỪA TẠO, chỉ khi kiểu nét đó đã có sẵn trong bản vẽ (M105 FR5 —
    /// <c>jointRules.layerStyle.linetype</c>). CỐ Ý không tự nạp từ tệp .lin: tệp kiểu nét là quy
    /// ước của từng công ty/máy (acad.lin, acadiso.lin, tệp riêng), đoán sai đường dẫn thì lệnh vẽ
    /// chết giữa chừng vì một thứ chỉ là thể hiện. Trả false = bản vẽ chưa nạp kiểu nét đó
    /// (caller báo kỹ sư chạy LINETYPE một lần), layer vẫn dùng nét liền.
    /// </summary>
    internal static bool DatKieuNetNeuCo(Database db, Transaction tr, ObjectId layerId, string tenKieuNet)
    {
        if (string.IsNullOrWhiteSpace(tenKieuNet)) return false;
        var bang = (LinetypeTable)tr.GetObject(db.LinetypeTableId, OpenMode.ForRead);
        if (!bang.Has(tenKieuNet)) return false;
        if (tr.GetObject(layerId, OpenMode.ForWrite) is not LayerTableRecord ltr) return false;
        ltr.LinetypeObjectId = bang[tenKieuNet];
        return true;
    }

    /// <summary>
    /// Mở khóa + bật + bỏ đóng băng một layer ĐANG CÓ, để sửa được đối tượng nằm trên nó
    /// (<c>XBOSS_VE_DOI</c> phải sửa tim/nét biên/nhãn trên layer NGUỒN, mà sau <c>XBOSS_VE_NEN</c>
    /// thì mọi layer đều đang khóa). Khác <see cref="DamBaoLayer"/> ở chỗ KHÔNG tạo layer mới:
    /// tuyến không có nét biên thì không được đẻ ra layer <c>…EDGE</c> rỗng; và KHÔNG đụng độ mờ —
    /// làm mờ là trạng thái nền do <c>XBOSS_VE_NEN</c> quản, không phải việc của lệnh đổi tuyến.
    /// </summary>
    internal static void MoKhoaNeuCo(Database db, Transaction tr, string ten)
    {
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        if (!lt.Has(ten)) return;
        var ltr = (LayerTableRecord)tr.GetObject(lt[ten], OpenMode.ForWrite);
        if (ltr.IsLocked) ltr.IsLocked = false;
        if (ltr.IsOff) ltr.IsOff = false;
        if (ltr.IsFrozen) ltr.IsFrozen = false;
    }

    /// <summary>Layer đã có đối tượng trong model space chưa (M100 §18: cảnh báo layer đích có nội dung cũ).</summary>
    internal static bool CoThucThe(Database db, Transaction tr, string tenLayer)
    {
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            if (string.Equals(ent.Layer, tenLayer, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }
}
