import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { DOC_CATEGORY_LABEL, DOC_CATEGORIES, type DocCategory } from "@/lib/qaqc";
import ReactPDF, { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { registerVietnameseFonts, FONT_REGULAR, FONT_BOLD } from "@/lib/pdf-fonts";

export const dynamic = "force-dynamic";
registerVietnameseFonts();

// Xuất "hồ sơ tầng" = danh mục PDF liệt kê hồ sơ chất lượng đã có (không đóng gói file
// gốc thành zip — cần quyết định thêm nếu công ty cần bản zip thật, xem M03-qaqc.md).
const styles = StyleSheet.create({
  page: { fontFamily: FONT_REGULAR, fontSize: 9, padding: 32, color: "#1a1a1a" },
  title: { fontSize: 13, fontFamily: FONT_BOLD, marginBottom: 2 },
  subtitle: { fontSize: 8, color: "#555", marginBottom: 14 },
  tr: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.3 solid #eee" },
  th: { flex: 1, fontFamily: FONT_BOLD, fontSize: 8 },
  thWide: { flex: 2, fontFamily: FONT_BOLD, fontSize: 8 },
  td: { flex: 1, fontSize: 8 },
  tdWide: { flex: 2, fontSize: 8 },
});

type DocRow = {
  taskCode: string;
  taskName: string;
  docCategory: string | null;
  originalName: string | null;
  caption: string | null;
  uploaderName: string | null;
  createdAt: string;
};

function fmt(v: string) {
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("vi-VN");
}

function IndexDoc({
  rows,
  floor,
  sheetType,
  projectName,
  today,
}: {
  rows: DocRow[];
  floor: string | null;
  sheetType: string | null;
  projectName: string;
  today: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>DANH MỤC HỒ SƠ CHẤT LƯỢNG</Text>
        <Text style={styles.subtitle}>
          {projectName} · Tầng: {floor ?? "Tất cả"} · Hệ: {sheetType ?? "Tất cả"} · Ngày xuất:{" "}
          {today}
        </Text>
        <View style={[styles.tr, { backgroundColor: "#f8f8f8" }]}>
          <Text style={styles.th}>Mã task</Text>
          <Text style={styles.thWide}>Tên công tác</Text>
          <Text style={styles.th}>Loại hồ sơ</Text>
          <Text style={styles.thWide}>Tên tệp / ghi chú</Text>
          <Text style={styles.th}>Người nộp</Text>
          <Text style={styles.th}>Ngày</Text>
        </View>
        {rows.length === 0 && (
          <Text style={{ fontSize: 8, color: "#999", marginTop: 8 }}>
            Không có hồ sơ phù hợp bộ lọc.
          </Text>
        )}
        {rows.map((r, i) => (
          <View key={i} style={styles.tr}>
            <Text style={styles.td}>{r.taskCode}</Text>
            <Text style={styles.tdWide}>{r.taskName}</Text>
            <Text style={styles.td}>
              {r.docCategory ? DOC_CATEGORY_LABEL[r.docCategory as DocCategory] : "—"}
            </Text>
            <Text style={styles.tdWide}>{r.caption || r.originalName || "—"}</Text>
            <Text style={styles.td}>{r.uploaderName ?? "—"}</Text>
            <Text style={styles.td}>{fmt(r.createdAt)}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.export(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được xuất hồ sơ" }, { status: 403 });

  const sheetTypeId = req.nextUrl.searchParams.get("sheetTypeId");
  const floor = req.nextUrl.searchParams.get("floor");
  const category = req.nextUrl.searchParams.get("category");
  if (category && !DOC_CATEGORIES.includes(category as DocCategory))
    return NextResponse.json({ error: "Loại hồ sơ không hợp lệ" }, { status: 422 });

  const conds: string[] = ["d.task_id IS NOT NULL"];
  const values: unknown[] = [];
  let sheetTypeCode: string | null = null;
  if (sheetTypeId) {
    conds.push("wp.sheet_type_id = ?");
    values.push(parseInt(sheetTypeId));
    sheetTypeCode =
      (
        await queryOne<{ code: string }>(
          `SELECT code FROM sheet_types WHERE id = ?`,
          parseInt(sheetTypeId),
        )
      )?.code ?? null;
  }
  if (floor) {
    conds.push("wp.floor_label = ?");
    values.push(floor);
  }
  if (category) {
    conds.push("d.doc_category = ?");
    values.push(category);
  }

  const rows = await query<DocRow>(
    `SELECT t.code AS "taskCode", t.name AS "taskName", d.doc_category AS "docCategory",
            d.original_name AS "originalName", d.caption, u.name AS "uploaderName",
            d.created_at AS "createdAt"
       FROM task_documents d
       JOIN tasks t ON t.id = d.task_id
       LEFT JOIN work_packages wp ON wp.id = t.package_id
       LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE ${conds.join(" AND ")}
      ORDER BY t.code`,
    ...values,
  );

  const project = await queryOne<{ name: string }>(`SELECT name FROM projects ORDER BY id LIMIT 1`);
  const today = new Date().toLocaleDateString("vi-VN");

  const stream = await ReactPDF.renderToStream(
    <IndexDoc
      rows={rows}
      floor={floor}
      sheetType={sheetTypeCode}
      projectName={project?.name ?? "XBoss"}
      today={today}
    />,
  );
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    (stream as NodeJS.ReadableStream).on("data", (c: Buffer) =>
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)),
    );
    (stream as NodeJS.ReadableStream).on("end", resolve);
    (stream as NodeJS.ReadableStream).on("error", reject);
  });

  return new NextResponse(Buffer.concat(chunks), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ho-so-chat-luong-${floor ?? "tat-ca"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
