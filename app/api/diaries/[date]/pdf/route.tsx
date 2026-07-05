import { NextRequest, NextResponse } from "next/server";
import { queryOne, query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import ReactPDF, { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { registerVietnameseFonts, FONT_REGULAR, FONT_BOLD } from "@/lib/pdf-fonts";

export const dynamic = "force-dynamic";
registerVietnameseFonts();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const styles = StyleSheet.create({
  page: { fontFamily: FONT_REGULAR, fontSize: 9, padding: 32, color: "#1a1a1a" },
  title: { fontSize: 14, fontFamily: FONT_BOLD, textAlign: "center", marginBottom: 4 },
  code: { fontSize: 10, textAlign: "center", color: "#555", marginBottom: 16 },
  section: { marginBottom: 10 },
  label: { fontFamily: FONT_BOLD, fontSize: 9, marginBottom: 2 },
  value: { fontSize: 9, lineHeight: 1.4 },
  row: { flexDirection: "row", marginBottom: 6 },
  col: { flex: 1 },
  th: { fontFamily: FONT_BOLD, fontSize: 8 },
  tr: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.3 solid #eee" },
  colCrew: { flex: 1 },
  colCount: { width: 70, textAlign: "center" },
  colNote: { flex: 1.5 },
  sign: { flexDirection: "row", marginTop: 24 },
  signCol: { flex: 1, textAlign: "center" },
});

type DiaryRow = {
  diaryDate: string;
  weatherAm: string | null;
  weatherPm: string | null;
  workDone: string | null;
  obstacles: string | null;
  safetyNote: string | null;
  status: string;
  lockedByName: string | null;
  lockedAt: string | null;
};
type Manpower = { crew: string; headcount: number; note: string | null };
type Project = { name: string; contractor: string | null };

function DiaryDoc({
  diary,
  manpower,
  project,
}: {
  diary: DiaryRow;
  manpower: Manpower[];
  project: Project;
}) {
  const totalHeadcount = manpower.reduce((s, m) => s + m.headcount, 0);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>NHẬT KÝ THI CÔNG</Text>
        <Text style={styles.code}>
          {project.name} · Ngày {diary.diaryDate}
        </Text>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Thời tiết sáng</Text>
            <Text style={styles.value}>{diary.weatherAm ?? "—"}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Thời tiết chiều</Text>
            <Text style={styles.value}>{diary.weatherPm ?? "—"}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Công việc thực hiện</Text>
          <Text style={styles.value}>{diary.workDone || "—"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Nhân lực (tổng {totalHeadcount} người)</Text>
          <View style={[styles.tr, { backgroundColor: "#f8f8f8" }]}>
            <Text style={[styles.th, styles.colCrew]}>Tổ đội</Text>
            <Text style={[styles.th, styles.colCount]}>Số người</Text>
            <Text style={[styles.th, styles.colNote]}>Ghi chú</Text>
          </View>
          {manpower.map((m, i) => (
            <View key={i} style={styles.tr}>
              <Text style={styles.colCrew}>{m.crew}</Text>
              <Text style={styles.colCount}>{m.headcount}</Text>
              <Text style={styles.colNote}>{m.note ?? "—"}</Text>
            </View>
          ))}
          {manpower.length === 0 && (
            <Text style={{ marginTop: 6, color: "#777" }}>Chưa ghi nhân lực.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Vướng mắc / chỉ đạo</Text>
          <Text style={styles.value}>{diary.obstacles || "—"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>An toàn lao động</Text>
          <Text style={styles.value}>{diary.safetyNote || "—"}</Text>
        </View>

        {diary.status === "locked" && (
          <Text style={{ fontSize: 8, color: "#777", marginTop: 4 }}>
            Đã khoá bởi {diary.lockedByName ?? "—"} lúc{" "}
            {diary.lockedAt ? new Date(diary.lockedAt).toLocaleString("vi-VN") : "—"}
          </Text>
        )}

        <View style={styles.sign}>
          <Text style={styles.signCol}>Nhà thầu</Text>
          <Text style={styles.signCol}>Tư vấn giám sát</Text>
          <Text style={styles.signCol}>Chủ đầu tư</Text>
        </View>
      </Page>
    </Document>
  );
}

// GET /api/diaries/:date/pdf → PDF nhật ký theo mẫu in ký (mọi user đăng nhập được xuất).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ date: string }> },
) {
  const { date } = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!DATE_RE.test(date))
    return NextResponse.json({ error: "Ngày không hợp lệ (YYYY-MM-DD)" }, { status: 422 });

  const diary = await queryOne<DiaryRow>(
    `SELECT sd.diary_date AS "diaryDate", sd.weather_am AS "weatherAm", sd.weather_pm AS "weatherPm",
            sd.work_done AS "workDone", sd.obstacles, sd.safety_note AS "safetyNote", sd.status,
            u.name AS "lockedByName", sd.locked_at AS "lockedAt"
       FROM site_diaries sd
       LEFT JOIN users u ON u.id = sd.locked_by
      WHERE sd.diary_date = ?`,
    date,
  );
  if (!diary) return NextResponse.json({ error: "Chưa có nhật ký ngày này" }, { status: 404 });

  const manpower = await query<Manpower>(
    `SELECT dm.crew, dm.headcount, dm.note
       FROM diary_manpower dm JOIN site_diaries sd ON sd.id = dm.diary_id
      WHERE sd.diary_date = ? ORDER BY dm.crew`,
    date,
  );

  const project = (await queryOne<Project>(
    `SELECT name, contractor FROM projects ORDER BY id LIMIT 1`,
  )) ?? { name: "XBoss", contractor: null };

  const stream = await ReactPDF.renderToStream(
    <DiaryDoc diary={diary} manpower={manpower} project={project} />,
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
      "Content-Disposition": `attachment; filename="nhat-ky-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
