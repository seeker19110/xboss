using Autodesk.AutoCAD.DatabaseServices;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Một cửa duy nhất trả lời câu hỏi "cái này có thuộc xref không" — quy tắc dự án chốt
/// 2026-08-26: <b>plugin KHÔNG đụng bất cứ thứ gì thuộc xref</b>. Lý do kép:
///
/// <para>· Nghiệp vụ — xref là bản vẽ THAM CHIẾU: sửa ở bản vẽ chủ thì không lưu được về tệp gốc
/// và mất trắng ở lần reload sau; nét xref là nền tham chiếu chứ không phải đối tượng kỹ sư vẽ.</para>
///
/// <para>· Kỹ thuật — AutoCAD chặn thẳng: mở symbol table record phụ thuộc xref
/// (<c>SymbolTableRecord.IsDependent</c>) ở chế độ ghi là ném <c>eInvalidKey</c> và kéo cả lệnh
/// rollback (đã chết thật trên bản vẽ MEP có xref kiến trúc, 2026-08-26).</para>
///
/// Bản ghi bảng ký hiệu thì kiểm thẳng <c>IsDependent</c> tại chỗ; riêng khối chèn cần dò ngược
/// định nghĩa nên đi qua đây.
/// </summary>
internal static class ThuocXref
{
    /// <summary>
    /// Thực thể là KHỐI CHÈN của một xref (block reference trỏ tới định nghĩa
    /// <c>IsFromExternalReference</c>/overlay)? Đọc định nghĩa qua <c>DynamicBlockTableRecord</c>
    /// đúng như <see cref="TakeoffScanner"/>: với block ĐỘNG, <c>BlockTableRecord</c> trỏ định
    /// nghĩa nặc danh sinh theo tham số, không phải định nghĩa gốc.
    /// </summary>
    internal static bool KhoiChen(Transaction tr, Entity ent) =>
        ent is BlockReference br &&
        tr.GetObject(br.DynamicBlockTableRecord, OpenMode.ForRead) is BlockTableRecord btr &&
        (btr.IsFromExternalReference || btr.IsFromOverlayReference);
}
