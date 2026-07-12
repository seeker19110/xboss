import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import ReactPDF, { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { registerVietnameseFonts, FONT_REGULAR, FONT_BOLD } from "@/lib/pdf-fonts";
import { stageMissingList, type StageMissingItem } from "@/lib/constructionStages";
import { formatDateVN, todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";
registerVietnameseFonts();

const styles = StyleSheet.create({
  page: { fontFamily: FONT_REGULAR, fontSize: 9, padding: 32, color: "#1a1a1a" },
  title: { fontSize: 14, fontFamily: FONT_BOLD, textAlign: "center", marginBottom: 4 },
  code: { fontSize: 10, textAlign: "center", color: "#555", marginBottom: 16 },
  summaryRow: { flexDirection: "row", marginBottom: 14 },
  summaryCol: { flex: 1, textAlign: "center", border: "0.5 solid #ddd", padding: 6 },
  summaryNum: { fontSize: 16, fontFamily: FONT_BOLD },
  summaryLabel: { fontSize: 8, color: "#555" },
  note: { fontSize: 8, color: "#777", marginBottom: 14 },
  th: { fontFamily: FONT_BOLD, fontSize: 8 },
  tr: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.3 solid #eee" },
  colStage: { width: 70 },
  colFloor: { width: 60 },
  colStart: { width: 90 },
  colWait: { width: 90, textAlign: "right" },
});

function ReportDoc({
  today,
  projectName,
  items,
}: {
  today: string;
  projectName: string;
  items: StageMissingItem[];
}) {
  const cumulativeWaitDays = items.reduce((sum, it) => sum + it.waitingDays, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>BÁO CÁO CHỜ MẶT BẰNG THI CÔNG</Text>
        <Text style={styles.code}>
          {projectName} · Tính đến ngày {formatDateVN(today)}
        </Text>
        <Text style={styles.note}>
          Danh sách tầng chưa hoàn tất mặt bằng (công tác cuối trong chuỗi thi công chưa bàn giao)
          trong khi công việc đã đến hoặc sắp đến ngày bắt đầu theo kế hoạch — dùng làm bằng chứng
          xin gia hạn (EOT) với tổng thầu/CĐT.
        </Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryNum}>{items.length}</Text>
            <Text style={styles.summaryLabel}>Tầng chờ mặt bằng</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryNum}>{cumulativeWaitDays}</Text>
            <Text style={styles.summaryLabel}>Tổng số ngày chờ luỹ kế</Text>
          </View>
        </View>

        {items.length === 0 ? (
          <Text style={{ color: "#777", fontSize: 9 }}>Không có tầng nào đang chờ mặt bằng.</Text>
        ) : (
          <>
            <View style={[styles.tr, { backgroundColor: "#f8f8f8" }]}>
              <Text style={[styles.th, styles.colStage]}>Công tác</Text>
              <Text style={[styles.th, styles.colFloor]}>Tầng</Text>
              <Text style={[styles.th, styles.colStart]}>Ngày lẽ ra bắt đầu</Text>
              <Text style={[styles.th, styles.colWait]}>Số ngày chờ</Text>
            </View>
            {items
              .sort((a, b) => b.waitingDays - a.waitingDays)
              .map((it) => (
                <View key={it.floorStageFrontId} style={styles.tr}>
                  <Text style={styles.colStage}>{it.stageName}</Text>
                  <Text style={styles.colFloor}>{it.floorLabel}</Text>
                  <Text style={styles.colStart}>{formatDateVN(it.earliestStart)}</Text>
                  <Text style={styles.colWait}>{it.waitingDays} ngày</Text>
                </View>
              ))}
          </>
        )}
      </Page>
    </Document>
  );
}

// GET /api/work-fronts/report — báo cáo tầng chờ mặt bằng (bằng chứng EOT), Admin/PM.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "pm")
    return NextResponse.json({ error: "Chỉ Admin/PM được xuất báo cáo mặt bằng" }, { status: 403 });

  const items = await stageMissingList();
  const project = (await queryOne<{ name: string }>(
    `SELECT name FROM projects ORDER BY id LIMIT 1`,
  )) ?? { name: "XBoss" };
  const today = todayISO();

  const stream = await ReactPDF.renderToStream(
    <ReportDoc today={today} projectName={project.name} items={items} />,
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
      "Content-Disposition": `attachment; filename="mat-bang-eot-${today}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
