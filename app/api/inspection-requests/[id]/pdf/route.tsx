import { NextRequest, NextResponse } from "next/server";
import { queryOne, query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import ReactPDF, { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { registerVietnameseFonts, FONT_REGULAR, FONT_BOLD } from "@/lib/pdf-fonts";

export const dynamic = "force-dynamic";
registerVietnameseFonts();

// Chưa có mẫu phiếu YCNT chính thức của công ty — dùng bố cục phổ biến (kính gửi TVGS,
// hạng mục đề nghị nghiệm thu, 3 ô ký). Thay layout này nếu công ty cung cấp mẫu riêng.
const styles = StyleSheet.create({
  page: { fontFamily: FONT_REGULAR, fontSize: 9, padding: 32, color: "#1a1a1a" },
  title: { fontSize: 14, fontFamily: FONT_BOLD, textAlign: "center", marginBottom: 4 },
  code: { fontSize: 10, textAlign: "center", color: "#555", marginBottom: 16 },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { width: 130, fontFamily: FONT_BOLD },
  value: { flex: 1 },
  section: { marginTop: 14, marginBottom: 8 },
  sectionHead: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    marginBottom: 5,
    borderBottom: "0.5 solid #ccc",
    paddingBottom: 2,
  },
  th: { flex: 1, fontFamily: FONT_BOLD, fontSize: 8 },
  thWide: { flex: 3, fontFamily: FONT_BOLD, fontSize: 8 },
  tr: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.3 solid #eee" },
  td: { flex: 1, fontSize: 8 },
  tdWide: { flex: 3, fontSize: 8 },
  sigRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 50 },
  sigBox: { width: "30%", alignItems: "center" },
});

type ReqDetail = {
  code: string;
  scheduledAt: string;
  note: string | null;
  createdByName: string | null;
};
type TaskRow = { code: string; name: string; sheetType: string | null };
type Project = { name: string; investor: string | null; contractor: string | null };

function fmtDateTime(v: string) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("vi-VN")} ${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
}

function YcntDoc({
  reqRow,
  tasks,
  project,
  today,
}: {
  reqRow: ReqDetail;
  tasks: TaskRow[];
  project: Project;
  today: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>PHIẾU YÊU CẦU NGHIỆM THU</Text>
        <Text style={styles.code}>
          Số: {reqRow.code} · Ngày lập: {today}
        </Text>

        <View style={styles.row}>
          <Text style={styles.label}>Dự án:</Text>
          <Text style={styles.value}>{project.name}</Text>
        </View>
        {project.investor && (
          <View style={styles.row}>
            <Text style={styles.label}>Chủ đầu tư:</Text>
            <Text style={styles.value}>{project.investor}</Text>
          </View>
        )}
        {project.contractor && (
          <View style={styles.row}>
            <Text style={styles.label}>Nhà thầu:</Text>
            <Text style={styles.value}>{project.contractor}</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.label}>Kính gửi:</Text>
          <Text style={styles.value}>Tư vấn giám sát (TVGS) công trình</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Thời gian đề nghị:</Text>
          <Text style={styles.value}>{fmtDateTime(reqRow.scheduledAt)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Người đề nghị:</Text>
          <Text style={styles.value}>{reqRow.createdByName ?? "—"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHead}>Hạng mục đề nghị nghiệm thu ({tasks.length})</Text>
          <View style={[styles.tr, { backgroundColor: "#f8f8f8" }]}>
            <Text style={styles.th}>Mã</Text>
            <Text style={styles.thWide}>Tên công tác</Text>
            <Text style={styles.th}>Hệ</Text>
          </View>
          {tasks.map((t, i) => (
            <View key={i} style={styles.tr}>
              <Text style={styles.td}>{t.code}</Text>
              <Text style={styles.tdWide}>{t.name}</Text>
              <Text style={styles.td}>{t.sheetType ?? "—"}</Text>
            </View>
          ))}
        </View>

        {reqRow.note && (
          <View style={styles.section}>
            <Text style={styles.sectionHead}>Ghi chú</Text>
            <Text style={{ fontSize: 8 }}>{reqRow.note}</Text>
          </View>
        )}

        <View style={styles.sigRow}>
          <View style={styles.sigBox}>
            <Text style={{ fontSize: 8, fontFamily: FONT_BOLD, textTransform: "uppercase" }}>
              Nhà thầu
            </Text>
            <Text style={{ fontSize: 7, color: "#777", marginTop: 2 }}>(Ký, ghi rõ họ tên)</Text>
          </View>
          <View style={styles.sigBox}>
            <Text style={{ fontSize: 8, fontFamily: FONT_BOLD, textTransform: "uppercase" }}>
              Tư vấn giám sát
            </Text>
            <Text style={{ fontSize: 7, color: "#777", marginTop: 2 }}>(Ký, ghi rõ họ tên)</Text>
          </View>
          <View style={styles.sigBox}>
            <Text style={{ fontSize: 8, fontFamily: FONT_BOLD, textTransform: "uppercase" }}>
              Chủ đầu tư
            </Text>
            <Text style={{ fontSize: 7, color: "#777", marginTop: 2 }}>(Ký, ghi rõ họ tên)</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const reqRow = await queryOne<ReqDetail>(
    `SELECT r.code, r.scheduled_at AS "scheduledAt", r.note, cu.name AS "createdByName"
       FROM inspection_requests r
       LEFT JOIN users cu ON cu.id = r.created_by
      WHERE r.id = ?`,
    id,
  );
  if (!reqRow) return NextResponse.json({ error: "Không tìm thấy phiếu YCNT" }, { status: 404 });

  const tasks = await query<TaskRow>(
    `SELECT t.code, t.name, st.code AS "sheetType"
       FROM inspection_request_tasks rt
       JOIN tasks t ON t.id = rt.task_id
       LEFT JOIN work_packages wp ON wp.id = t.package_id
       LEFT JOIN sheet_types st ON st.id = wp.sheet_type_id
      WHERE rt.request_id = ? ORDER BY t.code`,
    id,
  );

  const project = (await queryOne<Project>(
    `SELECT name, investor, contractor FROM projects ORDER BY id LIMIT 1`,
  )) ?? { name: "XBoss", investor: null, contractor: null };

  const today = new Date().toLocaleDateString("vi-VN");

  const stream = await ReactPDF.renderToStream(
    <YcntDoc reqRow={reqRow} tasks={tasks} project={project} today={today} />,
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
      "Content-Disposition": `attachment; filename="${reqRow.code}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
