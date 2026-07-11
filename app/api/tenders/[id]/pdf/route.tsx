import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import ReactPDF, { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { registerVietnameseFonts, FONT_REGULAR, FONT_BOLD } from "@/lib/pdf-fonts";
import { getTender, comparisonTable, type TenderItemRow, type BidRow } from "@/lib/tender";
import { formatDateVN } from "@/lib/date";

export const dynamic = "force-dynamic";
registerVietnameseFonts();

const styles = StyleSheet.create({
  page: { fontFamily: FONT_REGULAR, fontSize: 8, padding: 28, color: "#1a1a1a" },
  title: { fontSize: 13, fontFamily: FONT_BOLD, textAlign: "center", marginBottom: 4 },
  code: { fontSize: 9, textAlign: "center", color: "#555", marginBottom: 14 },
  th: { flex: 1, fontFamily: FONT_BOLD, fontSize: 7, textAlign: "right" },
  thCode: { flex: 1.2, fontFamily: FONT_BOLD, fontSize: 7 },
  tr: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.3 solid #eee" },
  td: { flex: 1, fontSize: 7, textAlign: "right" },
  tdCode: { flex: 1.2, fontSize: 7 },
  totalRow: { flexDirection: "row", paddingVertical: 4, borderTop: "1 solid #333" },
  totalLabel: { flex: 1.2, fontFamily: FONT_BOLD, fontSize: 7 },
  totalVal: { flex: 1, fontFamily: FONT_BOLD, fontSize: 7, textAlign: "right" },
});

function fmtVND(n: number) {
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}

function TenderCompareDoc({
  tenderCode,
  tenderName,
  items,
  bids,
  today,
}: {
  tenderCode: string;
  tenderName: string;
  items: TenderItemRow[];
  bids: BidRow[];
  today: string;
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>BẢNG SO SÁNH BÁO GIÁ — {tenderName}</Text>
        <Text style={styles.code}>
          Số: {tenderCode} · Ngày lập: {today}
        </Text>

        <View style={[styles.tr, { backgroundColor: "#f8f8f8" }]}>
          <Text style={styles.thCode}>Mã / Tên</Text>
          {bids.map((b) => (
            <Text key={b.bidId} style={styles.th}>
              {b.supplierName}
            </Text>
          ))}
        </View>
        {items.map((it) => (
          <View key={it.boqItemId} style={styles.tr}>
            <Text style={styles.tdCode}>
              {it.code} — {it.name} ({it.unit})
            </Text>
            {bids.map((b) => (
              <Text key={b.bidId} style={styles.td}>
                {b.prices[it.boqItemId] != null ? fmtVND(b.prices[it.boqItemId]) : "—"}
              </Text>
            ))}
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Tổng (chào N/M dòng)</Text>
          {bids.map((b) => (
            <Text key={b.bidId} style={styles.totalVal}>
              {fmtVND(b.total)} ({b.quotedLines}/{b.totalLines})
            </Text>
          ))}
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
  if (!CAN.viewTenders(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem đấu thầu" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const tender = projectId != null ? await getTender(id, projectId) : undefined;
  if (!tender) return NextResponse.json({ error: "Không tìm thấy gói thầu" }, { status: 404 });
  const { items, bids } = await comparisonTable(id);
  const today = formatDateVN(new Date());

  const stream = await ReactPDF.renderToStream(
    <TenderCompareDoc
      tenderCode={tender.code}
      tenderName={tender.name}
      items={items}
      bids={bids}
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
      "Content-Disposition": `attachment; filename="${tender.code}-so-sanh.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
