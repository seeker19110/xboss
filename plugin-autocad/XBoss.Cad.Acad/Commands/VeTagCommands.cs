using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Draw;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.VeTagCommands))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// <c>XBOSS_VE_TAG</c> (M100 §6.9, FR9e, AC14): quét tag toàn bản vẽ (báo TRÙNG và NHẢY SỐ),
/// đánh lại tuần tự theo <c>sheetSetup.tagPattern</c>, và khóa/mở khóa tag không được đánh lại.
///
/// Toàn bộ luật (dựng tag, tách tag, quét trùng/nhảy số, thứ tự cấp số, bỏ qua số của tag đã
/// khóa) nằm ở Core <see cref="TagSchedule"/> — có test AC14; lệnh này chỉ đọc/ghi attribute.
/// Tầng nhập MỘT LẦN cho mỗi bản vẽ và nhớ trong chính bản vẽ (Xrecord ở Named Objects
/// Dictionary — mở lại bản vẽ vẫn nhớ, không phải biến RAM của phiên).
/// </summary>
public sealed class VeTagCommands
{
    /// <summary>Thẻ attribute mang tag thiết bị (M100 §11 — manifest bắt block thiết bị phải có).</summary>
    private const string TheTag = VeXDataStore.TheTag;

    /// <summary>Khóa mục trong Named Objects Dictionary giữ tầng của bản vẽ.</summary>
    private const string KhoaNodTang = "XBOSS_VE_TANG";

    [CommandMethod("XBOSS_VE_TAG")]
    public void Tag()
    {
        if (VeContext.SanSang() is not (var doc, var ed)) return;
        if (VeContext.CanDrawTools(ed) is not { } pack) return;
        var db = doc.Database;
        var mau = pack.SheetSetup.TagPattern;

        var hoi = new PromptKeywordOptions("\n[XBoss] Đánh tag thiết bị — làm gì?") { AllowNone = false };
        hoi.Keywords.Add("QUET", "QUET", "Quét trùng/nhảy số (chỉ báo, không sửa)");
        hoi.Keywords.Add("DANHLAI", "DANHLAI", "Đánh lại tuần tự");
        hoi.Keywords.Add("KHOA", "KHOA", "Khóa tag đang chọn (đánh lại không đổi)");
        hoi.Keywords.Add("MOKHOA", "MOKHOA", "Mở khóa tag đang chọn");
        hoi.Keywords.Default = "QUET";
        var kq = ed.GetKeywords(hoi);
        if (kq.Status != PromptStatus.OK) return;

        switch (kq.StringResult)
        {
            case "DANHLAI":
                DanhLai(doc, ed, db, mau);
                break;
            case "KHOA":
                DoiKhoa(doc, ed, db, khoa: true);
                break;
            case "MOKHOA":
                DoiKhoa(doc, ed, db, khoa: false);
                break;
            default:
                Quet(ed, db, mau);
                break;
        }
    }

    // ===== QUÉT =====

    private static void Quet(Editor ed, Database db, string mau)
    {
        List<TagHienCo> tags;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            tags = DocTag(db, tr).Select(t => t.Tag).ToList();
            tr.Commit();
        }
        InKetQuaQuet(ed, TagSchedule.Quet(mau, tags), tags.Count);
    }

    private static void InKetQuaQuet(Editor ed, KetQuaQuetTag kq, int tong)
    {
        ed.WriteMessage($"\n[XBoss] ===== QUÉT TAG — {tong} khối có thẻ {TheTag} =====\n");
        if (kq.Trung.Count == 0) ed.WriteMessage("[XBoss] ✔ Không có tag trùng.\n");
        foreach (var v in kq.Trung)
            ed.WriteMessage($"[XBoss] ✘ {v.MoTa} — handle: {string.Join(", ", v.Handles)}\n");

        if (kq.NhaySo.Count == 0) ed.WriteMessage("[XBoss] ✔ Không có nhảy số.\n");
        foreach (var v in kq.NhaySo) ed.WriteMessage($"[XBoss] ⚠ {v.MoTa}\n");

        if (kq.HandleTrong.Count > 0)
        {
            ed.WriteMessage(
                $"[XBoss] ⚠ {kq.HandleTrong.Count} khối chưa có tag — handle: " +
                $"{string.Join(", ", kq.HandleTrong.Take(20))}{(kq.HandleTrong.Count > 20 ? "…" : "")}\n");
        }
        if (kq.HandleKhacMau.Count > 0)
        {
            ed.WriteMessage(
                $"[XBoss] {kq.HandleKhacMau.Count} tag không theo mẫu rule pack (tag cũ đánh tay) — " +
                "chạy DANHLAI nếu muốn chuẩn hóa.\n");
        }
    }

    // ===== ĐÁNH LẠI =====

    private static void DanhLai(
        Autodesk.AutoCAD.ApplicationServices.Document doc, Editor ed, Database db, string mau)
    {
        var pham = new PromptKeywordOptions("\n[XBoss] Đánh lại tag trong phạm vi nào?") { AllowNone = false };
        pham.Keywords.Add("ToanBo", "ToanBo", "Toàn bộ model space");
        pham.Keywords.Add("ChonVung", "ChonVung", "Chọn vùng");
        pham.Keywords.Default = "ToanBo";
        var kqPham = ed.GetKeywords(pham);
        if (kqPham.Status != PromptStatus.OK) return;

        IReadOnlyList<ObjectId>? loc = null;
        if (kqPham.StringResult == "ChonVung")
        {
            var chon = ed.GetSelection();
            if (chon.Status != PromptStatus.OK) return;
            loc = chon.Value.GetObjectIds();
        }

        var tang = HoiTang(ed, db);
        if (tang is null) return;

        List<(TagHienCo Tag, ObjectId IdAtt)> hienCo;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            hienCo = DocTag(db, tr, loc);
            tr.Commit();
        }
        if (hienCo.Count == 0)
        {
            ed.WriteMessage($"\n[XBoss] Không thấy khối nào có thẻ {TheTag} trong phạm vi đã chọn.\n");
            return;
        }

        var gan = TagSchedule.DanhLai(mau, tang, hienCo.Select(h => h.Tag).ToList());
        if (gan.Count == 0)
        {
            ed.WriteMessage("\n[XBoss] Tag đã đúng thứ tự — không đổi cái nào.\n");
            return;
        }

        foreach (var g in gan)
            ed.WriteMessage($"[XBoss]   {(g.TagCu.Length == 0 ? "(trống)" : g.TagCu)} → {g.TagMoi}\n");
        var xacNhan = new PromptKeywordOptions($"\n[XBoss] Áp dụng {gan.Count} tag mới?") { AllowNone = false };
        xacNhan.Keywords.Add("DongY", "DongY", "Đồng ý");
        xacNhan.Keywords.Add("Huy", "Huy", "Hủy");
        xacNhan.Keywords.Default = "DongY";
        var kq = ed.GetKeywords(xacNhan);
        if (kq.Status != PromptStatus.OK || kq.StringResult != "DongY")
        {
            ed.WriteMessage("\n[XBoss] Đã hủy — bản vẽ không thay đổi.\n");
            return;
        }

        var theoHandle = hienCo.ToDictionary(h => h.Tag.Handle, h => h.IdAtt, StringComparer.OrdinalIgnoreCase);
        var soDoi = 0;
        using (var khoa = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                foreach (var g in gan)
                {
                    if (!theoHandle.TryGetValue(g.Handle, out var idAtt)) continue;
                    if (tr.GetObject(idAtt, OpenMode.ForWrite) is not AttributeReference att) continue;
                    att.TextString = g.TagMoi;
                    soDoi++;
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage(
                    $"\n[XBoss] LỖI khi ghi tag — đã rollback, bản vẽ nguyên trạng: {e.Message}\n");
                return;
            }
        }

        // Quét lại ngay để kỹ sư thấy kết quả thật, không phải tin lời lệnh.
        List<TagHienCo> sau;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            sau = DocTag(db, tr).Select(t => t.Tag).ToList();
            tr.Commit();
        }
        ed.WriteMessage($"\n[XBoss] Đã đánh lại {soDoi} tag (tầng {tang}). Hoàn tác: UNDO 1 lần.\n");
        InKetQuaQuet(ed, TagSchedule.Quet(mau, sau), sau.Count);
    }

    // ===== KHÓA / MỞ KHÓA =====

    private static void DoiKhoa(
        Autodesk.AutoCAD.ApplicationServices.Document doc, Editor ed, Database db, bool khoa)
    {
        ed.WriteMessage(
            $"\n[XBoss] Chọn các thiết bị cần {(khoa ? "KHÓA" : "MỞ KHÓA")} tag " +
            "(tag đã khóa không bị đổi khi chạy DANHLAI).\n");
        var chon = ed.GetSelection();
        if (chon.Status != PromptStatus.OK) return;

        var so = 0;
        using (var khoaTaiLieu = doc.LockDocument())
        using (var tr = db.TransactionManager.StartTransaction())
        {
            try
            {
                VeXDataStore.DangKyApp(db, tr);
                foreach (var id in chon.Value.GetObjectIds())
                {
                    if (tr.GetObject(id, OpenMode.ForRead) is not BlockReference br) continue;
                    if (VeXDataStore.TagCua(tr, br) is null) continue;

                    // Giữ NGUYÊN mọi trường XData khác (block id, hệ, liên kết tim…) — chỉ đổi cờ khóa.
                    var xd = VeXDataStore.Doc(br) ?? new VeXDataInfo { VaiTro = VaiTroVe.ThietBi };
                    br.UpgradeOpen();
                    VeXDataStore.Ghi(br, xd with { TagKhoa = khoa });
                    so++;
                }
                tr.Commit();
            }
            catch (Autodesk.AutoCAD.Runtime.Exception e)
            {
                tr.Abort();
                ed.WriteMessage($"\n[XBoss] LỖI khi ghi cờ khóa — đã rollback: {e.Message}\n");
                return;
            }
        }
        ed.WriteMessage($"\n[XBoss] Đã {(khoa ? "khóa" : "mở khóa")} tag của {so} thiết bị. Hoàn tác: UNDO 1 lần.\n");
    }

    // ===== Đọc/ghi bản vẽ =====

    /// <summary>
    /// Mọi khối có thẻ <c>TAG</c> (kể cả khối không do plugin chèn — quét trùng phải nhìn TOÀN bản
    /// vẽ, M100 §6.9), kèm ObjectId của chính attribute để ghi lại tag mới.
    /// </summary>
    private static List<(TagHienCo Tag, ObjectId IdAtt)> DocTag(
        Database db, Transaction tr, IReadOnlyList<ObjectId>? loc = null)
    {
        var ra = new List<(TagHienCo, ObjectId)>();
        // Cùng một cửa liệt kê model space với XBOSS_BOCKL (M99) — không viết lại vòng lặp thứ hai.
        var nguon = loc ?? TakeoffScanner.ModelSpaceIds(db, tr).ToList();

        foreach (var id in nguon)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not BlockReference br) continue;
            if (VeXDataStore.TagCua(tr, br) is not { } att) continue;

            var xd = VeXDataStore.Doc(br);
            var btr = (BlockTableRecord)tr.GetObject(br.DynamicBlockTableRecord, OpenMode.ForRead);
            var loai = TagSchedule.LoaiTuBlock(xd?.BlockId, btr.Name);
            ra.Add((
                new TagHienCo(br.Handle.ToString(), att.TextString ?? "", loai, xd?.TagKhoa ?? false),
                att.ObjectId));
        }
        return ra;
    }

    /// <summary>Attribute mang thẻ TAG của một khối; null khi khối không có thẻ đó.</summary>

    /// <summary>Tầng của bản vẽ: hỏi một lần, nhớ trong chính bản vẽ (§6.9).</summary>
    private static string? HoiTang(Editor ed, Database db)
    {
        string? cu;
        using (var tr = db.TransactionManager.StartTransaction())
        {
            cu = DocTang(db, tr);
            tr.Commit();
        }

        var kq = ed.GetString(new PromptStringOptions(
            $"\n[XBoss] Tầng của bản vẽ (điền vào {{floor}} của tag){(string.IsNullOrEmpty(cu) ? "" : $" <{cu}>")}: ")
        {
            AllowSpaces = false,
        });
        if (kq.Status != PromptStatus.OK) return null;
        var tang = kq.StringResult.Trim();
        if (tang.Length == 0) tang = cu ?? "";
        if (tang.Length == 0)
        {
            ed.WriteMessage("\n[XBoss] Chưa có tầng — tag sẽ thiếu phần {floor}. Nhập lại rồi chạy tiếp.\n");
            return null;
        }

        if (!string.Equals(tang, cu, StringComparison.Ordinal))
        {
            using var tr = db.TransactionManager.StartTransaction();
            GhiTang(db, tr, tang);
            tr.Commit();
        }
        return tang;
    }

    private static string? DocTang(Database db, Transaction tr)
    {
        var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForRead);
        if (!nod.Contains(KhoaNodTang)) return null;
        if (tr.GetObject(nod.GetAt(KhoaNodTang), OpenMode.ForRead) is not Xrecord xrec) return null;
        var data = xrec.Data;
        var gt = data?.AsArray();
        return gt is { Length: > 0 } ? gt[0].Value?.ToString() : null;
    }

    private static void GhiTang(Database db, Transaction tr, string tang)
    {
        var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForWrite);
        var xrec = new Xrecord { Data = new ResultBuffer(new TypedValue((int)DxfCode.Text, tang)) };
        nod.SetAt(KhoaNodTang, xrec);
        tr.AddNewlyCreatedDBObject(xrec, true);
    }
}
