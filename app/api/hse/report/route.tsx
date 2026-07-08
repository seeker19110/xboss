import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import ReactPDF, { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { registerVietnameseFonts, FONT_REGULAR, FONT_BOLD } from "@/lib/pdf-fonts";
import { HSE_KIND_LABEL, HSE_SEVERITY_LABEL, type HseRow } from "@/lib/hse";

export const dynamic = "force-dynamic";
registerVietnameseFonts();

const MONTH_RE = /^\d{4}-\d{2}$/;

const styles = StyleSheet.create({
  page: { fontFamily: FONT_REGULAR, fontSize: 9, padding: 32, color: "#1a1a1a" },
  title: { fontSize: 14, fontFamily: FONT_BOLD, textAlign: "center", marginBottom: 4 },
  code: { fontSize: 10, textAlign: "center", color: "#555", marginBottom: 16 },
  summaryRow: { flexDirection: "row", marginBottom: 14 },
  summaryCol: { flex: 1, textAlign: "center", border: "0.5 solid #ddd", padding: 6 },
  summaryNum: { fontSize: 16, fontFamily: FONT_BOLD },
  summaryLabel: { fontSize: 8, color: "#555" },
  section: { marginBottom: 10 },
  sectionTitle: { fontFamily: FONT_BOLD, fontSize: 10, marginBottom: 4 },
  th: { fontFamily: FONT_BOLD, fontSize: 8 },
  tr: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.3 solid #eee" },
  colDate: { width: 60 },
  colFloor: { width: 50 },
  colDesc: { flex: 2 },
  colSeverity: { width: 60 },
});

function ReportDoc({
  month,
  projectName,
  records,
}: {
  month: string;
  projectName: string;
  records: HseRow[];
}) {
  const byKind = (kind: string) => records.filter((r) => r.kind === kind);
  const incidents = byKind("incident");
  const nearMisses = byKind("near_miss");
  const inspections = byKind("inspection");
  const toolboxes = byKind("toolbox");
  const permits = byKind("permit");
  const openActions = records.filter((r) => r.actionStatus === "open");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>BÁO CÁO HSE THÁNG {month}</Text>
        <Text style={styles.code}>{projectName}</Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryNum}>{incidents.length}</Text>
            <Text style={styles.summaryLabel}>Sự cố</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryNum}>{nearMisses.length}</Text>
            <Text style={styles.summaryLabel}>Cận nguy</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryNum}>{inspections.length}</Text>
            <Text style={styles.summaryLabel}>Kiểm tra</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryNum}>{toolboxes.length}</Text>
            <Text style={styles.summaryLabel}>Toolbox talk</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryNum}>{openActions.length}</Text>
            <Text style={styles.summaryLabel}>Action đang mở</Text>
          </View>
        </View>

        {[
          { title: `Sự cố (${incidents.length})`, rows: incidents },
          { title: `Cận nguy (${nearMisses.length})`, rows: nearMisses },
          { title: `Kiểm tra định kỳ (${inspections.length})`, rows: inspections },
          { title: `Toolbox talk (${toolboxes.length})`, rows: toolboxes },
          { title: `Giấy phép làm việc đặc biệt (${permits.length})`, rows: permits },
        ].map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.rows.length === 0 ? (
              <Text style={{ color: "#777", fontSize: 8 }}>Không có ghi nhận.</Text>
            ) : (
              <>
                <View style={[styles.tr, { backgroundColor: "#f8f8f8" }]}>
                  <Text style={[styles.th, styles.colDate]}>Ngày</Text>
                  <Text style={[styles.th, styles.colFloor]}>Tầng</Text>
                  <Text style={[styles.th, styles.colDesc]}>Mô tả</Text>
                  <Text style={[styles.th, styles.colSeverity]}>Mức độ</Text>
                </View>
                {section.rows.map((r) => (
                  <View key={r.id} style={styles.tr}>
                    <Text style={styles.colDate}>{r.recordDate}</Text>
                    <Text style={styles.colFloor}>{r.floorLabel ?? "—"}</Text>
                    <Text style={styles.colDesc}>{r.description}</Text>
                    <Text style={styles.colSeverity}>
                      {r.severity ? HSE_SEVERITY_LABEL[r.severity] : "—"}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </View>
        ))}
      </Page>
    </Document>
  );
}

// GET /api/hse/report?month=YYYY-MM — báo cáo HSE tháng nộp tổng thầu (Admin/PM).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "pm")
    return NextResponse.json({ error: "Chỉ Admin/PM được xuất báo cáo HSE" }, { status: 403 });

  const month = req.nextUrl.searchParams.get("month")?.trim() ?? "";
  if (!MONTH_RE.test(month))
    return NextResponse.json({ error: "Tháng không hợp lệ (YYYY-MM)" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để xuất báo cáo HSE" }, { status: 422 });

  const records = await query<HseRow>(
    `SELECT h.id, h.kind, h.record_date AS "recordDate", h.floor_label AS "floorLabel",
            h.area, h.description, h.severity, h.permit_type AS "permitType",
            h.permit_from AS "permitFrom", h.permit_to AS "permitTo",
            h.action_required AS "actionRequired", h.action_assignee AS "actionAssignee",
            u.name AS "actionAssigneeName", h.action_due AS "actionDue",
            h.action_status AS "actionStatus", h.created_by AS "createdBy", h.created_at AS "createdAt"
       FROM hse_records h LEFT JOIN users u ON u.id = h.action_assignee
      WHERE to_char(h.record_date, 'YYYY-MM') = ? AND h.project_id = ?
      ORDER BY h.kind, h.record_date`,
    month,
    projectId,
  );

  const project = (await queryOne<{ name: string }>(
    `SELECT name FROM projects WHERE id = ?`,
    projectId,
  )) ?? {
    name: "XBoss",
  };

  const stream = await ReactPDF.renderToStream(
    <ReportDoc month={month} projectName={project.name} records={records} />,
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
      "Content-Disposition": `attachment; filename="hse-${month}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
