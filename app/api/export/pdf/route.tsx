import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import ReactPDF, { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { registerVietnameseFonts, FONT_REGULAR, FONT_BOLD } from "@/lib/pdf-fonts";
import { formatDateVN } from "@/lib/date";
import { groupDelayedTasks } from "@/lib/delayed-groups";

export const dynamic = "force-dynamic";
registerVietnameseFonts();

const styles = StyleSheet.create({
  page: { fontFamily: FONT_REGULAR, fontSize: 9, padding: 28, color: "#1a1a1a" },
  title: { fontSize: 14, fontFamily: FONT_BOLD, marginBottom: 2 },
  subtitle: { fontSize: 8, color: "#555", marginBottom: 16 },
  section: { marginBottom: 12 },
  sectionHead: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    marginBottom: 5,
    borderBottom: "0.5 solid #ccc",
    paddingBottom: 2,
  },
  row: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.3 solid #eee" },
  th: { fontFamily: FONT_BOLD, fontSize: 8 },
  label: { fontSize: 8, color: "#666" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  kpiCard: { border: "0.5 solid #ccc", borderRadius: 4, padding: 6, minWidth: 80 },
  kpiVal: { fontSize: 16, fontFamily: FONT_BOLD },
  kpiLbl: { fontSize: 7, color: "#777", marginTop: 1 },
  bar: { height: 6, borderRadius: 2, marginTop: 2 },
  sigRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  sigBox: { width: "40%", alignItems: "center" },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 28,
    right: 28,
    fontSize: 7,
    color: "#aaa",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

type KPI = { sheetType: string; total: number; avgProgress: number; delayed: number };
type DelayedTask = {
  id: number;
  name: string;
  status: string;
  endDate: string;
  progressPercent: number;
  floorLabel: string;
  sheetType: string;
};
function fmt(d: string | null) {
  return formatDateVN(d);
}
function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function ReportDoc({
  projectName,
  kpi,
  delayed,
  today,
}: {
  projectName: string;
  kpi: KPI[];
  delayed: DelayedTask[];
  today: string;
}) {
  const totalDelayed = kpi.reduce((s, k) => s + k.delayed, 0);
  const delayedGroups = groupDelayedTasks(delayed);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Tiêu đề */}
        <Text style={styles.title}>BÁO CÁO TIẾN ĐỘ THI CÔNG ACMV</Text>
        <Text style={styles.subtitle}>
          {projectName} · Ngày: {today}
        </Text>

        {/* KPI tổng */}
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { borderColor: "#fca5a5" }]}>
            <Text style={[styles.kpiVal, { color: "#dc2626" }]}>{totalDelayed}</Text>
            <Text style={styles.kpiLbl}>Tầng trễ</Text>
          </View>
          {kpi.map((k) => (
            <View key={k.sheetType} style={styles.kpiCard}>
              <Text style={styles.kpiVal}>{pct(k.avgProgress ?? 0)}</Text>
              <Text style={styles.kpiLbl}>{k.sheetType}</Text>
              <Text style={[styles.kpiLbl, { color: k.delayed > 0 ? "#dc2626" : "#999" }]}>
                {k.delayed} hạng mục trễ / {k.total} task
              </Text>
            </View>
          ))}
        </View>

        {/* Tiến độ theo hệ */}
        <View style={styles.section}>
          <Text style={styles.sectionHead}>1. Tiến độ theo hệ</Text>
          {kpi.map((k) => {
            const p = Math.round((k.avgProgress ?? 0) * 100);
            return (
              <View
                key={k.sheetType}
                style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}
              >
                <Text style={{ width: 80, fontSize: 8 }}>{k.sheetType}</Text>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "#f0f0f0",
                    height: 6,
                    borderRadius: 2,
                    overflow: "hidden",
                    marginHorizontal: 4,
                  }}
                >
                  <View
                    style={[
                      styles.bar,
                      { width: `${p}%`, backgroundColor: k.delayed > 0 ? "#f59e0b" : "#10b981" },
                    ]}
                  />
                </View>
                <Text style={{ width: 28, textAlign: "right", fontSize: 8, fontFamily: FONT_BOLD }}>
                  {p}%
                </Text>
                <Text
                  style={{
                    width: 46,
                    textAlign: "right",
                    fontSize: 7,
                    color: k.delayed > 0 ? "#dc2626" : "#aaa",
                  }}
                >
                  {k.delayed > 0 ? `${k.delayed} hạng mục trễ` : "—"}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Danh sách hạng mục trễ (gom theo sheet + tầng) */}
        <View style={styles.section}>
          <Text style={styles.sectionHead}>2. Danh sách hạng mục trễ ({delayedGroups.length})</Text>
          <View style={[styles.row, { backgroundColor: "#f8f8f8" }]}>
            {["Hạng mục", "Sheet", "Tầng", "Số CT", "Hạn sớm nhất", "Trễ", "%"].map((h) => (
              <Text key={h} style={[styles.th, { flex: h === "Hạng mục" ? 3 : 1 }]}>
                {h}
              </Text>
            ))}
          </View>
          {delayedGroups.length === 0 && (
            <Text style={{ fontSize: 8, color: "#999", marginTop: 6 }}>
              Không có công việc trễ.
            </Text>
          )}
          {delayedGroups.map((g) => (
            <View key={g.key} style={styles.row}>
              <Text style={{ flex: 3, fontSize: 8 }}>{g.name}</Text>
              <Text style={{ flex: 1, fontSize: 8 }}>{g.sheetType}</Text>
              <Text style={{ flex: 1, fontSize: 8 }}>{g.floorLabel || "—"}</Text>
              <Text style={{ flex: 1, fontSize: 8 }}>{g.count}</Text>
              <Text style={{ flex: 1, fontSize: 8, color: "#dc2626" }}>
                {fmt(g.earliestEndDate)}
              </Text>
              <Text style={{ flex: 1, fontSize: 8, color: "#dc2626" }}>{g.maxDaysOverdue}</Text>
              <Text style={{ flex: 1, fontSize: 8 }}>{pct(g.avgProgress)}</Text>
            </View>
          ))}
        </View>

        {/* Ký tên */}
        <View style={styles.sigRow}>
          <View style={styles.sigBox}>
            <Text style={{ fontSize: 8, fontFamily: FONT_BOLD, textTransform: "uppercase" }}>
              Người lập báo cáo
            </Text>
            <Text style={{ fontSize: 7, color: "#777", marginTop: 2 }}>(Ký, ghi rõ họ tên)</Text>
          </View>
          <View style={styles.sigBox}>
            <Text style={{ fontSize: 8, fontFamily: FONT_BOLD, textTransform: "uppercase" }}>
              Trưởng dự án
            </Text>
            <Text style={{ fontSize: 7, color: "#777", marginTop: 2 }}>(Ký, ghi rõ họ tên)</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Xuất từ XBoss · Hệ thống quản lý thi công MEP</Text>
          <Text render={({ pageNumber, totalPages }) => `Trang ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.export(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được xuất báo cáo" }, { status: 403 });

  // Lấy dữ liệu
  const [kpiRows, delayedRows, project] = await Promise.all([
    query<KPI>(`
      SELECT st.code AS "sheetType",
             COUNT(t.id)::int AS total,
             AVG(t.progress_percent) AS "avgProgress",
             COUNT(DISTINCT wp.floor_label) FILTER (WHERE t.status = 'tre')::int AS delayed
        FROM sheet_types st
        LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
        LEFT JOIN tasks t ON t.package_id = wp.id
       GROUP BY st.id, st.code ORDER BY st.id`),
    query<DelayedTask>(`
      SELECT t.id, t.name, t.status, t.end_date AS "endDate",
             t.progress_percent AS "progressPercent",
             COALESCE(wp.floor_label, '') AS "floorLabel",
             st.code AS "sheetType"
        FROM tasks t
        JOIN work_packages wp ON t.package_id = wp.id
        JOIN sheet_types st ON wp.sheet_type_id = st.id
       WHERE t.status = 'tre' ORDER BY t.end_date NULLS LAST LIMIT 200`),
    queryOne<{ name: string }>(`SELECT name FROM projects LIMIT 1`).catch(() => null),
  ]);

  const today = formatDateVN(new Date());
  const projectName = project?.name ?? "XBoss";

  const stream = await ReactPDF.renderToStream(
    <ReportDoc projectName={projectName} kpi={kpiRows} delayed={delayedRows} today={today} />,
  );

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    (stream as NodeJS.ReadableStream).on("data", (c: Buffer) =>
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)),
    );
    (stream as NodeJS.ReadableStream).on("end", resolve);
    (stream as NodeJS.ReadableStream).on("error", reject);
  });

  const filename = `bao-cao-tien-do-${today.replace(/\//g, "-")}.pdf`;
  return new NextResponse(Buffer.concat(chunks), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
