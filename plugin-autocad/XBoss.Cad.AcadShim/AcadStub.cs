// ============================================================================================
// AcadStub.cs — KHAI BÁO GIẢ (stub) API AutoCAD, CHỈ để kiểm biên dịch mã Adapter trên Linux.
//
// ĐỌC README.md cạnh tệp này trước khi sửa. Tóm tắt:
//   • Đây KHÔNG phải AutoCAD. Không có hành vi, mọi thân hàm rỗng / trả giá trị vô nghĩa.
//   • Nhiệm vụ duy nhất: cho trình biên dịch kiểm CÚ PHÁP + CHỮ KÝ lời gọi API của Adapter.
//   • Thêm API mới ở đây phải đối chiếu tài liệu ObjectARX 2026 (tên kiểu, thứ tự/kiểu tham
//     số, kiểu trả về) — stub sai chữ ký thì cổng CI xanh giả, tệ hơn là không có cổng.
//
// `#nullable disable` là CỐ Ý và có ý nghĩa kỹ thuật, không phải để né cảnh báo:
// assembly AutoCAD thật (acdbmgd/acmgd/accoremgd) KHÔNG có chú thích nullable, nên với trình
// biên dịch mọi kiểu tham chiếu từ đó là "oblivious". Khai stub trong ngữ cảnh disable tái
// hiện đúng trạng thái đó — Adapter (vẫn `Nullable=enable`) do vậy nhận cùng bộ cảnh báo
// nullable như khi build thật trên Windows. Nếu bật enable ở đây, cổng sẽ đòi Adapter xử lý
// null ở những chỗ bản build thật không đòi → cảnh báo giả, khác bản thật.
#nullable disable

// Cảnh báo chỉ phát sinh từ chính lối viết stub (toán tử == không kèm Equals, trường không
// gán, ...). Suppress ĐÚNG TRONG TỆP NÀY, KHÔNG đặt vào <NoWarn> của csproj — để mã Adapter
// vẫn bị soi bằng đủ bộ cảnh báo (TreatWarningsAsErrors kế thừa từ Directory.Build.props).
#pragma warning disable CS0067, CS0649, CS0660, CS0661, CS1591, CS8981

using System;
using System.Collections;
using System.Collections.Generic;

namespace Autodesk.AutoCAD.Runtime
{
    [AttributeUsage(AttributeTargets.Method)]
    public sealed class CommandMethodAttribute : Attribute
    {
        public CommandMethodAttribute(string name) { }
        public CommandMethodAttribute(string name, CommandFlags flags) { }
    }

    [AttributeUsage(AttributeTargets.Assembly, AllowMultiple = true)]
    public sealed class CommandClassAttribute : Attribute
    {
        public CommandClassAttribute(Type t) { }
    }

    [AttributeUsage(AttributeTargets.Assembly)]
    public sealed class ExtensionApplicationAttribute : Attribute
    {
        public ExtensionApplicationAttribute(Type t) { }
    }

    [Flags]
    public enum CommandFlags { Modal = 0, Session = 1 }

    public interface IExtensionApplication
    {
        void Initialize();
        void Terminate();
    }

    public class Exception : System.Exception
    {
        public Exception(string m) : base(m) { }
    }
}

namespace Autodesk.AutoCAD.Geometry
{
    public struct Point2d
    {
        public Point2d(double x, double y) { X = x; Y = y; }
        public double X { get; }
        public double Y { get; }
        public double GetDistanceTo(Point2d other) => 0;
    }

    public struct Point3d
    {
        public static Point3d Origin => new Point3d(0, 0, 0);
        public Point3d(double x, double y, double z) { X = x; Y = y; Z = z; }
        public double X { get; }
        public double Y { get; }
        public double Z { get; }
        public Point3d TransformBy(Matrix3d m) => this;
        public double DistanceTo(Point3d other) => 0;
        public static Point3d operator +(Point3d p, Vector3d v) => p;
        public static Vector3d operator -(Point3d a, Point3d b) => new Vector3d();
    }

    public struct Vector3d
    {
        public Vector3d(double x, double y, double z) { X = x; Y = y; Z = z; }
        public double X { get; }
        public double Y { get; }
        public double Z { get; }
        public static Vector3d ZAxis => new Vector3d();
        public static Vector3d operator *(Vector3d v, double k) => v;
    }

    public struct Matrix3d
    {
        /// <summary>API thật: ma trận TỊNH TIẾN theo một vector — phép biến hình của lệnh nhân
        /// bản tầng (M111) là dời thuần túy, không xoay/không co giãn.</summary>
        public static Matrix3d Displacement(Vector3d v) => new Matrix3d();
    }

    public struct Scale3d
    {
        public Scale3d(double factor) { X = Y = Z = factor; }
        public Scale3d(double x, double y, double z) { X = x; Y = y; Z = z; }
        public double X { get; }
        public double Y { get; }
        public double Z { get; }
    }
}

namespace Autodesk.AutoCAD.Colors
{
    public enum ColorMethod { ByAci, ByLayer, ByBlock, ByColor }

    public struct EntityColor
    {
        public byte R { get; }
        public byte G { get; }
        public byte B { get; }
    }

    public class Color
    {
        public static Color FromColorIndex(ColorMethod m, short aci) => new Color();
        public static Color FromRgb(byte r, byte g, byte b) => new Color();
        public bool IsByLayer => true;
        public bool IsByBlock => false;
        public ColorMethod ColorMethod => ColorMethod.ByAci;
        public short ColorIndex => 7;
        public EntityColor ColorValue => new EntityColor();
    }

    public struct Transparency
    {
        public Transparency(byte alpha) { Alpha = alpha; IsByAlpha = true; }
        public byte Alpha { get; }
        // API thật: Alpha CHỈ hợp lệ khi IsByAlpha; ByLayer/ByBlock/Invalid thì đọc Alpha ném
        // eInvalidKey. Khai ở đây để mã Adapter buộc phải kiểm trước khi đọc (vấp thật 2026-08-27).
        public bool IsByAlpha { get; }
    }
}

namespace Autodesk.AutoCAD.DatabaseServices
{
    using Autodesk.AutoCAD.Colors;
    using Autodesk.AutoCAD.Geometry;

    public enum OpenMode { ForRead, ForWrite, ForNotify }

    public enum FileOpenMode { OpenForReadAndAllShare, OpenForReadAndWriteNoShare, OpenForReadAndWriteShare, OpenTryForReadShare }

    public enum DuplicateRecordCloning { NotApplicable, Ignore, Replace, MangleName, Unmangle }

    public class Point3dCollection : IDisposable, IEnumerable<Point3d>
    {
        public int Count => 0;
        public Point3d this[int i] => new Point3d(0, 0, 0);
        public void Add(Point3d p) { }
        public IEnumerator<Point3d> GetEnumerator() => new List<Point3d>().GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
        public void Dispose() { }
    }

    /// <summary>
    /// API thật: một cặp "đối tượng nguồn ↔ bản sao" trong bảng ánh xạ của
    /// <see cref="Database.DeepCloneObjects"/>. <c>IsPrimary</c> = đối tượng nằm THẲNG trong tập
    /// yêu cầu chép (khác với đối tượng con bị kéo theo, vd attribute của khối chèn).
    /// </summary>
    public class IdPair
    {
        public ObjectId Key => new ObjectId();
        public ObjectId Value => new ObjectId();
        public bool IsPrimary => false;
        public bool IsCloned => false;
        public bool IsOwnerXlated => false;
    }

    /// <summary>
    /// API thật: <c>IdMapping</c> chỉ cài <see cref="IEnumerable"/> KHÔNG generic (mỗi phần tử là
    /// một <see cref="IdPair"/>) — giữ đúng như vậy để mã Adapter buộc phải khai kiểu tường minh
    /// trong <c>foreach</c>, y như khi biên dịch với assembly thật.
    /// </summary>
    public class IdMapping : IDisposable, IEnumerable
    {
        public IEnumerator GetEnumerator() => new List<IdPair>().GetEnumerator();
        public void Dispose() { }
    }

    public class ObjectIdCollection : IDisposable, IEnumerable<ObjectId>
    {
        public int Count => 0;
        public void Add(ObjectId id) { }
        public IEnumerator<ObjectId> GetEnumerator() => new List<ObjectId>().GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
        public void Dispose() { }
    }

    public enum DxfCode
    {
        Text = 1,
        Int16 = 70,
        ExtendedDataRegAppName = 1001,
        ExtendedDataAsciiString = 1000,
    }

    public enum LineWeight { ByLayer = -1 }

    public enum AttachmentPoint { TopLeft, TopCenter, TopRight, MiddleLeft, MiddleCenter, MiddleRight, BottomLeft, BottomCenter, BottomRight }

    public enum UnitsValue { Undefined = 0, Millimeters = 4 }

    public struct Handle
    {
        public Handle(long v) { }
        // API thật có override ToString() trả string (assembly không chú thích nullable).
        public override string ToString() => "";
    }

    public struct ObjectId
    {
        // API thật: `public static readonly ObjectId Null`. Khai property tương đương —
        // chỗ dùng duy nhất là truyền `ObjectId.Null` làm đối số (StandardizePipeline).
        public static ObjectId Null => new ObjectId();
        public bool IsNull => false;
        /// <summary>ObjectARX thật: đối tượng đã bị xóa — phải kiểm trước khi mở, mở ForWrite một
        /// id đã xóa là ném lỗi. Dùng khi khôi phục trạng thái khóa layer sau chuẩn hóa.</summary>
        public bool IsErased => false;
        public Handle Handle => new Handle(1);
        public DBObject GetObject(OpenMode mode) => null;
        public static bool operator ==(ObjectId a, ObjectId b) => true;
        public static bool operator !=(ObjectId a, ObjectId b) => false;
        public override bool Equals(object o) => true;
        public override int GetHashCode() => 0;
    }

    public struct TypedValue
    {
        public TypedValue(int code, object value) { TypeCode = (short)code; Value = value; }
        public short TypeCode { get; }
        public object Value { get; }
    }

    public class ResultBuffer : IDisposable
    {
        public ResultBuffer(params TypedValue[] values) { }
        public TypedValue[] AsArray() => new TypedValue[0];
        public void Dispose() { }
    }

    public class DBObject : IDisposable
    {
        public ObjectId ObjectId => new ObjectId();
        public Handle Handle => new Handle(1);
        public ResultBuffer XData { get; set; }
        public ResultBuffer GetXDataForApplication(string app) => null;
        public void UpgradeOpen() { }
        public void Erase() { }
        public void Dispose() { }
    }

    public enum Intersect { OnBothOperands, ExtendThis, ExtendArgument, ExtendBoth }

    public struct Extents3d
    {
        public Extents3d(Point3d min, Point3d max) { MinPoint = min; MaxPoint = max; }
        public Point3d MinPoint { get; }
        public Point3d MaxPoint { get; }
    }

    public class Entity : DBObject
    {
        public string Layer { get; set; }
        // ObjectARX thật có CẢ hai: Layer (tên) và LayerId (ObjectId của LayerTableRecord). Mã
        // Adapter lọc layer theo ObjectId (tên có thể bị bước chuẩn hóa đổi giữa chừng).
        public ObjectId LayerId => new ObjectId();
        public Color Color { get; set; }
        public Extents3d GeometricExtents => new Extents3d(new Point3d(0, 0, 0), new Point3d(0, 0, 0));
        /// <summary>Biến hình thực thể (dời/xoay/co giãn) — thực thể phải mở ForWrite.</summary>
        public void TransformBy(Matrix3d m) { }
        public void IntersectWith(Entity ent, Intersect type, Point3dCollection points, IntPtr thisGsMarker, IntPtr otherGsMarker) { }
    }

    public class Curve : Entity
    {
        public bool Closed { get; set; }
        public Point3d StartPoint => new Point3d(0, 0, 0);
        public Point3d EndPoint => new Point3d(0, 0, 0);
        public double Area => 0;
        public double EndParam => 0;
        public double GetDistanceAtParameter(double p) => 0;
        public Point3d GetClosestPointTo(Point3d p, bool extend) => p;
        public Vector3d GetFirstDerivative(Point3d p) => new Vector3d();
    }

    public class Polyline : Curve
    {
        public int NumberOfVertices => 0;
        public double Length => 0;
        public double Elevation { get; set; }
        public Vector3d Normal { get; set; }
        public void AddVertexAt(int index, Point2d pt, double bulge, double startWidth, double endWidth) { }
        public Point2d GetPoint2dAt(int i) => new Point2d(0, 0);
        public double GetBulgeAt(int i) => 0;
    }

    public class AttributeDefinition : Entity
    {
        public string Tag { get; set; }
        public string TextString { get; set; }
        public bool Constant => false;
    }

    // ObjectARX thật: AttributeReference KẾ THỪA DBText (không phải Entity trực tiếp). Giữ đúng
    // quan hệ này là bắt buộc, không phải chi tiết trang trí: `switch` có `case DBText` đứng trước
    // `case AttributeReference` là nhánh CHẾT (CS8120) trên bản build thật, mà stub khai sai cây
    // kế thừa thì cổng CI thấy hai nhánh rời nhau và cho qua — đã lọt thật xuống máy có AutoCAD
    // ngày 2026-08-26 (StandardizePipeline.cs). Thêm kiểu stub nào cũng phải tra đúng lớp cha.
    public class AttributeReference : DBText
    {
        public string Tag { get; set; }
        public void SetAttributeFromBlock(AttributeDefinition ad, Matrix3d blockTransform) { }
    }

    public class AttributeCollection : IEnumerable<ObjectId>
    {
        public int Count => 0;
        public ObjectId AppendAttribute(AttributeReference ar) => new ObjectId();
        public IEnumerator<ObjectId> GetEnumerator() => new List<ObjectId>().GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    public class BlockReference : Entity
    {
        public BlockReference(Point3d position, ObjectId blockTableRecord) { }
        public Point3d Position { get; set; }
        public double Rotation { get; set; }
        public Scale3d ScaleFactors { get; set; }
        public Matrix3d BlockTransform => new Matrix3d();
        public ObjectId DynamicBlockTableRecord => new ObjectId();

        /// <summary>Có setter đúng như API thật: bước chuẩn hóa 13 trỏ khối chèn sang định nghĩa
        /// block chuẩn mà giữ nguyên vị trí/xoay/tỉ lệ (M102 §6.2).</summary>
        public ObjectId BlockTableRecord { get; set; }
        public AttributeCollection AttributeCollection => new AttributeCollection();
    }

    public class MText : Entity
    {
        public string Contents { get; set; }
        public string Text => "";
        public Point3d Location { get; set; }
        public double TextHeight { get; set; }
        public double Rotation { get; set; }
        public AttachmentPoint Attachment { get; set; }
        public ObjectId TextStyleId { get; set; }
    }

    public class DBText : Entity
    {
        public string TextString { get; set; }
        public Point3d Position { get; set; }
        public double Height { get; set; }
        public ObjectId TextStyleId { get; set; }
    }

    public class Hatch : Entity
    {
        public double Area => 0;
        public double Elevation { get; set; }
        /// <summary>Tên mẫu hatch hiện tại (vd "ANSI31", "SOLID") — đổi qua SetHatchPattern, không gán trực tiếp.</summary>
        public string PatternName { get; set; }
        public double PatternScale { get; set; }
        /// <summary>true nếu hatch là tô gradient (không phải mẫu line pattern thường).</summary>
        public bool IsGradient { get; set; }
        public void SetHatchPattern(HatchPatternType patternType, string patternName) { }
        /// <summary>Dựng lại hình học hatch theo mẫu/tỉ lệ hiện tại; underestimateArea=true tính nhanh, kém chính xác.</summary>
        public void EvaluateHatch(bool underestimateArea) { }
    }

    public enum HatchPatternType { UserDefined, PreDefined, CustomDefined }

    /// <summary>Lớp cha của mọi loại dimension (RotatedDimension, AlignedDimension…).</summary>
    public class Dimension : Entity
    {
        /// <summary>Chuỗi override; rỗng hoặc "&lt;&gt;" = dùng số đo thật.</summary>
        public string DimensionText { get; set; }
        public Point3d TextPosition { get; set; }
        /// <summary>ObjectId của DimStyleTableRecord đang áp.</summary>
        public ObjectId DimensionStyle { get; set; }
    }

    public class Region : Entity
    {
        public double Area => 0;
    }

    // ===== M100 PR7: bảng (Table) =====

    public enum CellAlignment { TopLeft, TopCenter, TopRight, MiddleLeft, MiddleCenter, MiddleRight, BottomLeft, BottomCenter, BottomRight }

    public class Cell
    {
        public string TextString { get; set; }
        public double TextHeight { get; set; }
        public CellAlignment Alignment { get; set; }
    }

    public class Column
    {
        public double Width { get; set; }
    }

    public class ColumnsCollection : IEnumerable<Column>
    {
        public Column this[int i] => new Column();
        public int Count => 0;
        public IEnumerator<Column> GetEnumerator() => new List<Column>().GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    public class CellsCollection
    {
        public Cell this[int row, int col] => new Cell();
    }

    public class Table : Entity
    {
        public ObjectId TableStyle { get; set; }
        public Point3d Position { get; set; }
        public int Rows => 0;
        public int Columns_ => 0;
        public CellsCollection Cells => new CellsCollection();
        public ColumnsCollection Columns => new ColumnsCollection();
        public void SetSize(int rows, int columns) { }
        public void SetRowHeight(double height) { }
        public void SetColumnWidth(double width) { }
        public void GenerateLayout() { }
    }

    public class SymbolTableRecord : DBObject
    {
        public string Name { get; set; }

        /// <summary>
        /// ObjectARX thật: bản ghi đến từ XREF (layer/kiểu chữ/kiểu kích thước/block "TEP|TEN") —
        /// KHÔNG sửa được, mở ForWrite ném eInvalidKey. Khai ở LỚP CHA vì API thật đặt ở
        /// <c>AcDbSymbolTableRecord::isDependent()</c>: khai riêng cho LayerTableRecord thì mã bỏ
        /// qua xref cho kiểu chữ/kiểu kích thước/block sẽ không biên dịch được trên cổng dù bản
        /// thật chạy tốt (cây kế thừa của stub là một phần hợp đồng của cổng).
        /// </summary>
        public bool IsDependent { get; set; }
    }

    public class LayerTableRecord : SymbolTableRecord
    {
        public Color Color { get; set; }
        public bool IsLocked { get; set; }
        public bool IsOff { get; set; }
        public bool IsFrozen { get; set; }
        public bool IsPlottable { get; set; }
        public Transparency Transparency { get; set; }
        public LineWeight LineWeight { get; set; }
        /// <summary>Kiểu nét của layer (M105: layer vạch chia đốt lấy linetype từ rule pack).</summary>
        public ObjectId LinetypeObjectId { get; set; }
    }

    /// <summary>Một kiểu nét đã nạp trong bản vẽ (acdbmgd: LinetypeTableRecord).</summary>
    public class LinetypeTableRecord : SymbolTableRecord { }

    /// <summary>
    /// API thật: khung nhìn hiện hành lấy/đặt qua <c>Editor.GetCurrentView</c>/<c>SetCurrentView</c>
    /// (tâm theo hệ tọa độ hiển thị, bề rộng/chiều cao theo đơn vị bản vẽ).
    /// </summary>
    public class ViewTableRecord : SymbolTableRecord
    {
        public Point2d CenterPoint { get; set; }
        public double Width { get; set; }
        public double Height { get; set; }
    }

    public class RegAppTableRecord : SymbolTableRecord { }

    public class TextStyleTableRecord : SymbolTableRecord
    {
        /// <summary>Font TrueType (TypeFace); rỗng nghĩa là kiểu chữ dùng SHX theo FileName.</summary>
        public Autodesk.AutoCAD.GraphicsInterface.FontDescriptor Font { get; set; }
        /// <summary>Tên tệp font SHX (vd ".vntime.shx").</summary>
        public string FileName { get; set; }
        /// <summary>Chiều cao chữ cố định (0 = chữ có thể đổi chiều cao khi đặt text/dimension).</summary>
        public double TextSize { get; set; }
        /// <summary>Hệ số rộng (width factor).</summary>
        public double XScale { get; set; }
    }

    public class TextStyleTable : SymbolTable { }

    public class DimStyleTableRecord : SymbolTableRecord
    {
        /// <summary>Biến DIMTXSTY — ObjectId của TextStyleTableRecord mà dimension dùng.</summary>
        public ObjectId Dimtxsty { get; set; }
    }

    public class DimStyleTable : SymbolTable { }

    public class BlockTableRecord : SymbolTableRecord, IEnumerable<ObjectId>
    {
        public bool HasAttributeDefinitions => false;
        public bool IsAnonymous => false;
        public bool IsLayout => false;
        public bool IsFromExternalReference => false;
        public bool IsFromOverlayReference => false;
        /// <summary>Đường dẫn lưu của khối xref (chỉ có nghĩa khi IsFromExternalReference). Đọc/ghi được (relocate path).</summary>
        public string PathName { get; set; }
        /// <summary>Trạng thái nạp của xref — Resolved khi tệp tham chiếu tìm thấy và nạp được (chỉ đọc trên API thật).</summary>
        public XrefStatus XrefStatus => XrefStatus.Resolved;
        public ObjectId AppendEntity(Entity e) => new ObjectId();
        /// <summary>
        /// Mọi BlockReference đang trỏ tới định nghĩa này (M108 — đếm số lần chèn của một block).
        /// API thật trả tập rỗng khi block chưa được chèn ở đâu; stub luôn trả rỗng.
        /// </summary>
        public ObjectIdCollection GetBlockReferenceIds(bool directOnly, bool forceValidity) =>
            new ObjectIdCollection();
        public IEnumerator<ObjectId> GetEnumerator() => new List<ObjectId>().GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    public enum XrefStatus { NotAnXref, Resolved, Unresolved, FileNotFound, Unreferenced, Unloaded }

    public class SymbolTable : DBObject, IEnumerable<ObjectId>
    {
        public bool Has(string name) => false;
        public ObjectId this[string name] => new ObjectId();
        public ObjectId Add(SymbolTableRecord r) => new ObjectId();
        public IEnumerator<ObjectId> GetEnumerator() => new List<ObjectId>().GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    public class LayerTable : SymbolTable { }

    public class LinetypeTable : SymbolTable { }

    public class RegAppTable : SymbolTable { }

    public class BlockTable : SymbolTable { }

    public struct DBDictionaryEntry
    {
        public string Key => "";
        public ObjectId Value => new ObjectId();
    }

    public class DBDictionary : DBObject, IEnumerable<DBDictionaryEntry>
    {
        public bool Contains(string key) => false;
        public ObjectId GetAt(string key) => new ObjectId();
        public ObjectId SetAt(string key, DBObject obj) => new ObjectId();
        public void Remove(string key) { }
        public IEnumerator<DBDictionaryEntry> GetEnumerator() => new List<DBDictionaryEntry>().GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    // ===== M100 PR6: layout / page setup / viewport / hình cơ bản =====

    public class Circle : Curve
    {
        public Circle(Point3d center, Vector3d normal, double radius) { }
        public Point3d Center { get; set; }
        public double Radius { get; set; }
    }

    public class Arc : Curve
    {
        public double TotalAngle => 0;
        public Point3d Center { get; set; }
        public double Radius { get; set; }
    }

    public class Line : Curve
    {
        public Line(Point3d start, Point3d end) { }
        public new Point3d StartPoint { get; set; }
        public new Point3d EndPoint { get; set; }
        public double Length => 0;
    }

    /// <summary>
    /// Polyline "nặng" 2D (kiểu cũ) — duyệt được để đếm đỉnh (<see cref="Vertex2d"/>), bước chuẩn
    /// hóa 12 dùng để biết polyline có đủ 3 đỉnh mà đóng không (M102 §6.1).
    /// </summary>
    public class Polyline2d : Curve, IEnumerable<ObjectId>
    {
        public IEnumerator<ObjectId> GetEnumerator() => new List<ObjectId>().GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    /// <summary>Polyline 3D — duyệt được để lấy ObjectId của từng đỉnh (PolylineVertex3d).</summary>
    public class Polyline3d : Curve, IEnumerable<ObjectId>
    {
        public IEnumerator<ObjectId> GetEnumerator() => new List<ObjectId>().GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    public class Vertex : Entity { }

    public class PolylineVertex3d : Vertex
    {
        public Point3d Position { get; set; }
    }

    /// <summary>Đỉnh của <see cref="Polyline2d"/> — Adapter chỉ dùng để nhận dạng khi đếm đỉnh.</summary>
    public class Vertex2d : Vertex
    {
        public Point3d Position { get; set; }
    }

    public enum PlotPaperUnit { Inches, Millimeters, Pixels }

    public enum PlotType { Display, Extents, Limits, View, Window, Layout }

    public enum PlotRotation { Degrees000, Degrees090, Degrees180, Degrees270 }

    public enum StdScaleType { ScaleToFit, StdScale1To1 }

    public class PlotSettings : DBObject
    {
        public string PlotConfigurationName => "";
        public string CanonicalMediaName => "";
        public string CurrentStyleSheet => "";
        public Point2d PlotPaperSize => new Point2d(841, 594);
    }

    public class PlotSettingsValidator
    {
        public static PlotSettingsValidator Current => new PlotSettingsValidator();
        public void SetPlotConfigurationName(PlotSettings ps, string device, string media) { }
        public void RefreshLists(PlotSettings ps) { }
        public System.Collections.Specialized.StringCollection GetCanonicalMediaNameList(PlotSettings ps) =>
            new System.Collections.Specialized.StringCollection();
        public System.Collections.Specialized.StringCollection GetPlotStyleSheetList() =>
            new System.Collections.Specialized.StringCollection();
        public void SetCanonicalMediaName(PlotSettings ps, string media) { }
        public void SetPlotPaperUnits(PlotSettings ps, PlotPaperUnit unit) { }
        public void SetPlotType(PlotSettings ps, PlotType type) { }
        public void SetPlotRotation(PlotSettings ps, PlotRotation rotation) { }
        public void SetPlotCentered(PlotSettings ps, bool centered) { }
        public void SetUseStandardScale(PlotSettings ps, bool use) { }
        public void SetStdScaleType(PlotSettings ps, StdScaleType type) { }
        public void SetCurrentStyleSheet(PlotSettings ps, string styleSheet) { }
    }

    public class Layout : PlotSettings
    {
        public string LayoutName => "";
        public ObjectId BlockTableRecordId => new ObjectId();
        public int TabOrder { get; set; }
    }

    public class LayoutManager
    {
        public static LayoutManager Current => new LayoutManager();
        public ObjectId CreateLayout(string name) => new ObjectId();
        public ObjectId CreateAndMakeLayoutCurrent(string name) => new ObjectId();
        public void DeleteLayout(string name) { }
        public void RenameLayout(string oldName, string newName) { }
        public bool LayoutExists(string name) => false;
        public ObjectId GetLayoutId(string name) => new ObjectId();
        public string CurrentLayout { get; set; }
    }

    public class Viewport : Entity
    {
        public Point3d CenterPoint { get; set; }
        public double Width { get; set; }
        public double Height { get; set; }
        public Point2d ViewCenter { get; set; }
        public double ViewHeight { get; set; }
        public double CustomScale { get; set; }
        public bool On { get; set; }
        public bool Locked { get; set; }
        public int Number => 2;
        public void FreezeLayersInViewport(IEnumerator ids) { }
    }

    public class Xrecord : DBObject
    {
        public ResultBuffer Data { get; set; }
    }

    public class Transaction : IDisposable
    {
        public DBObject GetObject(ObjectId id, OpenMode mode) => null;
        public void AddNewlyCreatedDBObject(DBObject obj, bool add) { }
        public void Commit() { }
        public void Abort() { }
        public void Dispose() { }
    }

    public class TransactionManager
    {
        public Transaction StartTransaction() => new Transaction();
    }

    public class Database : IDisposable
    {
        public Database() { }
        public Database(bool buildDefaultDrawing, bool noDocument) { }
        public void ReadDwgFile(string fileName, FileOpenMode mode, bool allowCPConversion, string password) { }
        public void CloseInput(bool value) { }
        public void SaveAs(string fileName, DwgVersion version) { }
        /// <summary>DXFOUT: precision = số chữ số thập phân (tối đa 16).</summary>
        public void DxfOut(string fileName, int precision, DwgVersion version) { }
        public DwgVersion OriginalFileVersion => DwgVersion.Current;
        /// <summary>Lọc TẠI CHỖ: sau lời gọi, collection chỉ còn id purge được (API thật cũng vậy).</summary>
        public void Purge(ObjectIdCollection ids) { }
        public Point3d Extmin => new Point3d(0, 0, 0);
        public Point3d Extmax => new Point3d(0, 0, 0);
        public void WblockCloneObjects(ObjectIdCollection ids, ObjectId owner, IdMapping idMap, DuplicateRecordCloning dup, bool deferXlation) { }
        /// <summary>Nhân bản đối tượng TRONG CÙNG database (M111): bảng ánh xạ nguồn → bản sao trả
        /// về qua <paramref name="idMap"/>.</summary>
        public void DeepCloneObjects(ObjectIdCollection ids, ObjectId owner, IdMapping idMap, bool deferXlation) { }
        public ObjectId Tablestyle { get; set; }
        public void Dispose() { }
        public TransactionManager TransactionManager => new TransactionManager();
        public ObjectId LayerTableId => new ObjectId();
        public ObjectId LinetypeTableId => new ObjectId();
        public ObjectId BlockTableId => new ObjectId();
        public ObjectId RegAppTableId => new ObjectId();
        public ObjectId NamedObjectsDictionaryId => new ObjectId();
        public ObjectId LayoutDictionaryId => new ObjectId();
        public ObjectId TextStyleTableId => new ObjectId();
        public ObjectId DimStyleTableId => new ObjectId();
        /// <summary>Nhập nội dung xref vào bản vẽ (insertBind=true dùng tiền tố "$0$", false dùng kiểu bind truyền thống).</summary>
        public void BindXrefs(ObjectIdCollection xrefIds, bool insertBind) { }
        public ObjectId Insert(string blockName, Database source, bool preserveSourceDatabase) => new ObjectId();
        public ObjectId Insert(string destinationBlockName, string sourceBlockName, Database source, bool preserveSourceDatabase) => new ObjectId();
        public ObjectId Clayer { get; set; }
        public UnitsValue Insunits => UnitsValue.Millimeters;
        public string Filename => "";
        public bool TryGetObjectId(Handle h, out ObjectId id) { id = new ObjectId(); return false; }
    }

    public static class SymbolUtilityServices
    {
        public static ObjectId GetBlockModelSpaceId(Database db) => new ObjectId();
    }

    /// <summary>Phiên bản định dạng tệp DWG/DXF khi ghi (`Current` = phiên bản của AutoCAD đang chạy).</summary>
    public enum DwgVersion { Current, Newest, AC1032 }

    /// <summary>
    /// Dịch vụ mức host. Adapter chỉ dùng WorkingDatabase — Audit/Purge trên side database
    /// đòi WorkingDatabase phải trỏ đúng db đang xử lý (xem Services/BatchProcessor.cs).
    /// </summary>
    public static class HostApplicationServices
    {
        public static Database WorkingDatabase { get; set; }
    }
}

/// <summary>
/// Chỉ đủ cho FontDescriptor — Adapter đặt font TrueType cho TextStyleTableRecord qua kiểu này.
/// </summary>
namespace Autodesk.AutoCAD.GraphicsInterface
{
    public class FontDescriptor
    {
        public FontDescriptor(string typeface, bool bold, bool italic, int charset, int pitchAndFamily)
        {
            TypeFace = typeface;
        }

        public string TypeFace { get; }
    }
}

namespace Autodesk.AutoCAD.EditorInput
{
    using Autodesk.AutoCAD.DatabaseServices;
    using Autodesk.AutoCAD.Geometry;

    public enum PromptStatus { OK, Cancel, Error, Keyword, None, Modeless, Other }

    public class KeywordCollection
    {
        public void Add(string global) { }
        public void Add(string global, string local) { }
        public void Add(string global, string local, string display) { }
        public string Default { get; set; }
    }

    public class PromptOptions
    {
        public string Message { get; set; }
        public KeywordCollection Keywords => new KeywordCollection();
        public bool AllowNone { get; set; }
    }

    public class PromptKeywordOptions : PromptOptions
    {
        public PromptKeywordOptions(string message) { }
    }

    public class PromptStringOptions : PromptOptions
    {
        public PromptStringOptions(string message) { }
        public bool AllowSpaces { get; set; }
    }

    public class PromptPointOptions : PromptOptions
    {
        public PromptPointOptions(string message) { }
        public bool UseBasePoint { get; set; }
        public Point3d BasePoint { get; set; }
        public bool UseDashedLine { get; set; }
    }

    public class PromptAngleOptions : PromptOptions
    {
        public PromptAngleOptions(string message) { }
        public bool UseBasePoint { get; set; }
        public Point3d BasePoint { get; set; }
        public bool UseDefaultValue { get; set; }
        public double DefaultValue { get; set; }
        public bool UseDashedLine { get; set; }
    }

    public class PromptEntityOptions : PromptOptions
    {
        public PromptEntityOptions(string message) { }
        public void SetRejectMessage(string m) { }
        public void AddAllowedClass(Type t, bool exact) { }
    }

    public class PromptResult
    {
        public PromptStatus Status => PromptStatus.OK;
        public string StringResult => "";
    }

    public class PromptPointResult : PromptResult
    {
        public Point3d Value => new Point3d(0, 0, 0);
    }

    public class PromptDoubleResult : PromptResult
    {
        public double Value => 0;
    }

    public class PromptEntityResult : PromptResult
    {
        public ObjectId ObjectId => new ObjectId();
        public Point3d PickedPoint => new Point3d(0, 0, 0);
    }

    public class SelectionSet
    {
        public ObjectId[] GetObjectIds() => new ObjectId[0];
        public int Count => 0;
    }

    public class PromptSelectionResult
    {
        public PromptStatus Status => PromptStatus.OK;
        public SelectionSet Value => new SelectionSet();
    }

    public class Editor
    {
        public void WriteMessage(string s) { }
        public void WriteMessage(string s, params object[] args) { }
        public PromptResult GetKeywords(PromptKeywordOptions o) => new PromptResult();
        public PromptResult GetString(PromptStringOptions o) => new PromptResult();
        public PromptPointResult GetPoint(PromptPointOptions o) => new PromptPointResult();
        public PromptEntityResult GetEntity(PromptEntityOptions o) => new PromptEntityResult();
        public PromptDoubleResult GetAngle(PromptAngleOptions o) => new PromptDoubleResult();
        public PromptSelectionResult GetSelection() => new PromptSelectionResult();
        /// <summary>Khung nhìn hiện hành (bản sao KHÔNG thuộc database — gọi xong phải Dispose).</summary>
        public ViewTableRecord GetCurrentView() => new ViewTableRecord();
        public void SetCurrentView(ViewTableRecord view) { }
        public Matrix3d CurrentUserCoordinateSystem { get; set; }
        public void Command(params object[] args) { }
    }
}

namespace Autodesk.AutoCAD.ApplicationServices
{
    using System.Collections;
    using Autodesk.AutoCAD.DatabaseServices;
    using Autodesk.AutoCAD.EditorInput;

    public class DocumentLock : IDisposable
    {
        public void Dispose() { }
    }

    public class Document
    {
        public Editor Editor => new Editor();
        public Database Database => new Database();
        public DocumentLock LockDocument() => new DocumentLock();
        public void SendStringToExecute(string command, bool activate, bool wrapUpInactiveDoc, bool echoCommand) { }
    }

    /// <summary>acmgd: đối số của các sự kiện cấp tài liệu (DocumentCreated/Activated/…).</summary>
    public class DocumentCollectionEventArgs : EventArgs
    {
        public Document Document => new Document();
    }

    public delegate void DocumentCollectionEventHandler(object sender, DocumentCollectionEventArgs e);

    public class DocumentCollection : IEnumerable
    {
        public Document MdiActiveDocument => new Document();
        public IEnumerator GetEnumerator() => new List<Document>().GetEnumerator();

        /// <summary>
        /// acmgd: <c>public event DocumentCollectionEventHandler DocumentActivated</c> — bắn trên
        /// luồng chính khi kỹ sư chuyển sang tab bản vẽ khác (M106: bảng điều khiển tính lại).
        /// </summary>
        public event DocumentCollectionEventHandler DocumentActivated { add { } remove { } }
    }

    public static class Application
    {
        public static DocumentCollection DocumentManager => new DocumentCollection();
        public static object GetSystemVariable(string name) => "25.1";

        /// <summary>
        /// acmgd: <c>public static DialogResult ShowModalDialog(Form formToShow)</c> — mở hộp thoại
        /// WinForms modal do AutoCAD làm chủ cửa sổ cha (M103: hộp thoại đề xuất block).
        /// </summary>
        public static System.Windows.Forms.DialogResult ShowModalDialog(System.Windows.Forms.Form formToShow) =>
            System.Windows.Forms.DialogResult.Cancel;

        /// <summary>
        /// acmgd: <c>public static bool? ShowModalWindow(System.Windows.Window window)</c> — bản WPF
        /// của ShowModalDialog, AutoCAD tự đặt cửa sổ chính làm chủ (M106 FR3). Trả
        /// <c>Window.DialogResult</c>, nên <c>null</c> = cửa sổ bị đóng mà không đặt kết quả.
        /// </summary>
        public static bool? ShowModalWindow(System.Windows.Window window) => null;
    }

    namespace Core
    {
        public static class Application
        {
            public static object GetSystemVariable(string name) => "25.1";
        }
    }
}

namespace Autodesk.AutoCAD.Windows
{
    public class SaveFileDialog
    {
        [Flags]
        public enum SaveFileDialogFlags { NoFlags = 0, DoNotWarnIfFileExists = 1, AllowAnyExtension = 2 }

        public SaveFileDialog(string title, string defaultName, string extension, string dialogName, SaveFileDialogFlags flags) { }
        public string Filename => "";
        public System.Windows.Forms.DialogResult ShowDialog() => System.Windows.Forms.DialogResult.Cancel;
    }

    public class OpenFileDialog
    {
        [Flags]
        public enum OpenFileDialogFlags { NoFlags = 0, DefaultIsFolder = 1, AllowMultiple = 2 }

        public OpenFileDialog(string title, string defaultName, string extension, string dialogName, OpenFileDialogFlags flags) { }
        public string Filename => "";
        public System.Windows.Forms.DialogResult ShowDialog() => System.Windows.Forms.DialogResult.Cancel;
    }
}

namespace Autodesk.AutoCAD.Windows2
{
}

// PaletteSet (bảng điều khiển M102) — nằm trong acmgd.dll, namespace Autodesk.AutoCAD.Windows.
namespace Autodesk.AutoCAD.Windows
{
    [Flags]
    public enum PaletteSetStyles
    {
        NameEditable = 1, ShowPropertiesMenu = 2, ShowAutoHideButton = 4, ShowCloseButton = 8,
        Snappable = 16, SingleColDock = 32, SingleRowDock = 64, NoTitleBar = 128, UsePaletteNameAsTitleForSingle = 256,
    }

    public class PaletteSet
    {
        public PaletteSet(string name) { }
        public PaletteSet(string name, Guid toolId) { }
        public PaletteSetStyles Style { get; set; }
        public System.Drawing.Size MinimumSize { get; set; }
        public System.Drawing.Size Size { get; set; }
        public bool Visible { get; set; }
        public int Add(string name, System.Windows.Forms.Control control) => 0;
    }
}

// Ribbon API (M102) — AdWindows.dll, namespace Autodesk.Windows (xây trên WPF).
namespace Autodesk.Windows
{
    using System.Collections.ObjectModel;

    public enum RibbonItemSize { Standard, Large }

    public class RibbonItemEventArgs : EventArgs
    {
        public RibbonItem Item => null;
    }

    public class RibbonItem
    {
        public string Id { get; set; }
        public string Text { get; set; }
        public bool ShowText { get; set; }
        public bool ShowImage { get; set; }
        public RibbonItemSize Size { get; set; }
        public object ToolTip { get; set; }
        public System.Windows.Input.ICommand CommandHandler { get; set; }
        public object CommandParameter { get; set; }
    }

    public class RibbonButton : RibbonItem { }

    public class RibbonPanelSource
    {
        public string Title { get; set; }
        public Collection<RibbonItem> Items { get; } = new Collection<RibbonItem>();
    }

    public class RibbonPanel
    {
        public RibbonPanelSource Source { get; set; }
    }

    public class RibbonTab
    {
        public string Id { get; set; }
        public string Title { get; set; }
        public bool IsVisible { get; set; }
        public Collection<RibbonPanel> Panels { get; } = new Collection<RibbonPanel>();
    }

    public class RibbonControl
    {
        public Collection<RibbonTab> Tabs { get; } = new Collection<RibbonTab>();
        public RibbonTab FindTab(string id) => null;
    }

    public static class ComponentManager
    {
        public static RibbonControl Ribbon => null;
        public static event EventHandler<RibbonItemEventArgs> ItemInitialized { add { } remove { } }
    }
}

// Adapter thật build với <UseWindowsForms>true</UseWindowsForms> nên có sẵn WinForms; project
// stub chạy trên Linux (net8.0, không WinForms) nên phải tự khai đúng phần Adapter chạm tới.
namespace System.Windows.Forms
{
    public enum DialogResult { None, OK, Cancel, Abort, Retry, Ignore, Yes, No }

    public class FolderBrowserDialog : IDisposable
    {
        public string Description { get; set; }
        public bool ShowNewFolderButton { get; set; }
        public string SelectedPath => "";
        public DialogResult ShowDialog() => DialogResult.Cancel;
        public void Dispose() { }
    }

    // ── Control cho bảng điều khiển M102 (BangDieuKhienControl) ──
    // Chỉ khai đúng phần Adapter chạm tới; Color/Size/Point lấy từ System.Drawing.Primitives
    // (có sẵn trong net8), riêng Font/FontStyle stub ở namespace System.Drawing bên dưới.

    public enum DockStyle { None, Top, Bottom, Left, Right, Fill }
    public enum FlowDirection { LeftToRight, TopDown, RightToLeft, BottomUp }
    public enum FlatStyle { Flat, Popup, Standard, System }

    public struct Padding
    {
        public Padding(int all) { }
        public Padding(int left, int top, int right, int bottom) { }
    }

    public class Control : IDisposable
    {
        // Duyệt được: mã Adapter lặp `foreach (Control con in cha.Controls)` để ngắt dòng lại theo
        // bề rộng palette. Stub không duyệt được thì cổng đỏ giả ở một tính năng chạy đúng.
        public class ControlCollection : IEnumerable<Control>
        {
            public void Add(Control value) { }
            public void Clear() { }
            public IEnumerator<Control> GetEnumerator() => new List<Control>().GetEnumerator();
            IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
        }

        public ControlCollection Controls { get; } = new ControlCollection();
        public System.Drawing.Size ClientSize { get; set; }
        public bool HasChildren => false;
        public System.Drawing.Color BackColor { get; set; }
        public System.Drawing.Color ForeColor { get; set; }
        public DockStyle Dock { get; set; }
        public string Text { get; set; }
        public System.Drawing.Font Font { get; set; }
        public bool AutoSize { get; set; }
        public bool Enabled { get; set; }
        public bool Visible { get; set; }
        public System.Drawing.Point Location { get; set; }
        public System.Drawing.Size Size { get; set; }
        public Padding Margin { get; set; }
        public Padding Padding { get; set; }
        public System.Drawing.Size MaximumSize { get; set; }
        public event EventHandler Click { add { } remove { } }
        public event EventHandler TextChanged { add { } remove { } }
        public void SuspendLayout() { }
        public void ResumeLayout() { }
        public void Dispose() { }

        /// <summary>WinForms thật: <c>protected virtual void OnResize(EventArgs)</c> — Adapter
        /// override để ngắt dòng lại khi kỹ sư kéo rộng/hẹp palette.</summary>
        protected virtual void OnResize(EventArgs e) { }
    }

    public class ScrollableControl : Control
    {
        public bool AutoScroll { get; set; }
    }

    /// <summary>WinForms thật: <c>ContainerControl : ScrollableControl</c>, cha của Form/UserControl.</summary>
    public class ContainerControl : ScrollableControl { }

    public class UserControl : ContainerControl { }
    public class Label : Control { }

    /// <summary>WinForms thật: nút hành động của Form (AcceptButton/CancelButton nhận kiểu này).</summary>
    public interface IButtonControl
    {
        DialogResult DialogResult { get; set; }
        void NotifyDefault(bool value);
        void PerformClick();
    }

    public class Button : Control, IButtonControl
    {
        public FlatStyle FlatStyle { get; set; }
        public DialogResult DialogResult { get; set; }
        public void NotifyDefault(bool value) { }
        public void PerformClick() { }
    }

    public class Panel : ScrollableControl { }

    public class FlowLayoutPanel : Panel
    {
        public FlowDirection FlowDirection { get; set; }
        public bool WrapContents { get; set; }
    }

    // ── Hộp thoại đề xuất block (M103): Form + ô nhập ──

    public enum FormBorderStyle { None, FixedSingle, Fixed3D, FixedDialog, Sizable, FixedToolWindow, SizableToolWindow }

    public enum FormStartPosition { Manual, CenterScreen, WindowsDefaultLocation, WindowsDefaultBounds, CenterParent }

    public enum ComboBoxStyle { Simple, DropDown, DropDownList }

    public class Form : ContainerControl
    {
        public FormBorderStyle FormBorderStyle { get; set; }
        public FormStartPosition StartPosition { get; set; }
        public bool MaximizeBox { get; set; }
        public bool MinimizeBox { get; set; }
        public IButtonControl AcceptButton { get; set; }
        public IButtonControl CancelButton { get; set; }
        public DialogResult DialogResult { get; set; }
        public DialogResult ShowDialog() => DialogResult.Cancel;
        public void Close() { }
    }

    public class TextBoxBase : Control
    {
        public bool Multiline { get; set; }
        public bool ReadOnly { get; set; }
    }

    public class TextBox : TextBoxBase { }

    public class ListControl : Control { }

    public class ComboBox : ListControl
    {
        /// <summary>WinForms thật: <c>ComboBox.ObjectCollection</c> — Add trả về chỉ số của mục.</summary>
        public class ObjectCollection : IEnumerable<object>
        {
            public int Count => 0;
            public object this[int i] => null;
            public int Add(object item) => 0;
            public void Clear() { }
            public IEnumerator<object> GetEnumerator() => new List<object>().GetEnumerator();
            IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
        }

        public ObjectCollection Items { get; } = new ObjectCollection();
        public ComboBoxStyle DropDownStyle { get; set; }
        public int SelectedIndex { get; set; }
        public object SelectedItem { get; set; }
        public event EventHandler SelectedIndexChanged { add { } remove { } }
    }
}

// Font không nằm trong System.Drawing.Primitives (net8 Linux) — stub riêng cho bảng M102.
namespace System.Drawing
{
    public enum FontStyle { Regular = 0, Bold = 1, Italic = 2, Underline = 4, Strikeout = 8 }

    public class Font
    {
        public Font(string familyName, float emSize) { }
        public Font(string familyName, float emSize, FontStyle style) { }
    }

    // Brush/Pen KHÔNG được mã Adapter dùng tới — stub ở đây chỉ để TÁI HIỆN CẶP TÊN TRÙNG giữa
    // System.Drawing (WinForms) và System.Windows.Media (WPF). Không có chúng, cổng CI chỉ thấy
    // một nửa bộ implicit using của bản build thật và bỏ lọt CS0104 "ambiguous reference" — đúng
    // lỗi đã lọt xuống máy có AutoCAD ngày 2026-08-26 (MauBangWpf.cs). Xóa 2 lớp này = mở lại lỗ.
    public abstract class Brush { }

    public class Pen { }
}
