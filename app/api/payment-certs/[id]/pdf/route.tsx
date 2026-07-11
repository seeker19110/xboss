import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import ReactPDF, { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { registerVietnameseFonts, FONT_REGULAR, FONT_BOLD } from "@/lib/pdf-fonts";
import { getCert, certTotals, type PaymentCertRow, type CertTotals } from "@/lib/paymentcerts";
import { formatDateVN } from "@/lib/date";

export const dynamic = "force-dynamic";
registerVietnameseFonts();

const styles = StyleSheet.create({
  page: { fontFamily: FONT_REGULAR, fontSize: 9, padding: 32, color: "#1a1a1a" },
  title: { fontSize: 14, fontFamily: FONT_BOLD, textAlign: "center", marginBottom: 4 },
  code: { fontSize: 10, textAlign: "center", color: "#555", marginBottom: 16 },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { width: 140, fontFamily: FONT_BOLD },
  value: { flex: 1 },
  section: { marginTop: 14, marginBottom: 8 },
  sectionHead: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    marginBottom: 5,
    borderBottom: "0.5 solid #ccc",
    paddingBottom: 2,
  },
  th: { flex: 1, fontFamily: FONT_BOLD, fontSize: 8, textAlign: "right" },
  thCode: { flex: 1.2, fontFamily: FONT_BOLD, fontSize: 8 },
  thName: { flex: 2.5, fontFamily: FONT_BOLD, fontSize: 8 },
  tr: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.3 solid #eee" },
  td: { flex: 1, fontSize: 8, textAlign: "right" },
  tdCode: { flex: 1.2, fontSize: 8 },
  tdName: { flex: 2.5, fontSize: 8 },
  totalsBox: { marginTop: 16, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", width: 260, justifyContent: "space-between", marginBottom: 3 },
  totalsLabel: { fontSize: 9 },
  totalsValue: { fontSize: 9, fontFamily: FONT_BOLD },
  grandRow: {
    flexDirection: "row",
    width: 260,
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 4,
    borderTop: "1 solid #333",
  },
  grandLabel: { fontSize: 10, fontFamily: FONT_BOLD },
  grandValue: { fontSize: 11, fontFamily: FONT_BOLD },
  sigRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 50 },
  sigBox: { width: "30%", alignItems: "center" },
});

function fmtVND(n: number) {
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}
function fmtQty(n: number) {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 3 });
}

function IpcDoc({
  cert,
  totals,
  today,
}: {
  cert: PaymentCertRow;
  totals: CertTotals;
  today: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          BẢNG KHỐI LƯỢNG NGHIỆM THU — THANH TOÁN ĐỢT {cert.periodNo}
        </Text>
        <Text style={styles.code}>
          Số: {cert.code} · Ngày lập: {today}
        </Text>

        <View style={styles.row}>
          <Text style={styles.label}>Hợp đồng:</Text>
          <Text style={styles.value}>
            {cert.contractCode} — {cert.contractTitle}
          </Text>
        </View>
        {cert.periodLabel && (
          <View style={styles.row}>
            <Text style={styles.label}>Kỳ thanh toán:</Text>
            <Text style={styles.value}>{cert.periodLabel}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionHead}>Khối lượng nghiệm thu ({cert.items.length} dòng)</Text>
          <View style={[styles.tr, { backgroundColor: "#f8f8f8" }]}>
            <Text style={styles.thCode}>Mã</Text>
            <Text style={styles.thName}>Tên công tác</Text>
            <Text style={styles.th}>Đơn giá</Text>
            <Text style={styles.th}>KL đợt này</Text>
            <Text style={styles.th}>Luỹ kế</Text>
            <Text style={styles.th}>Thành tiền đợt</Text>
          </View>
          {cert.items.map((it) => (
            <View key={it.id} style={styles.tr}>
              <Text style={styles.tdCode}>{it.boqCode}</Text>
              <Text style={styles.tdName}>
                {it.boqName} ({it.boqUnit})
              </Text>
              <Text style={styles.td}>{fmtVND(it.unitPrice)}</Text>
              <Text style={styles.td}>{fmtQty(it.qtyPeriod)}</Text>
              <Text style={styles.td}>{fmtQty(it.qtyCumulative)}</Text>
              <Text style={styles.td}>{fmtVND(it.qtyPeriod * it.unitPrice)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Giá trị đợt này</Text>
            <Text style={styles.totalsValue}>{fmtVND(totals.periodValue)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Trừ tạm ứng</Text>
            <Text style={styles.totalsValue}>-{fmtVND(totals.advanceDeduct)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Trừ giữ lại bảo hành</Text>
            <Text style={styles.totalsValue}>-{fmtVND(totals.retentionDeduct)}</Text>
          </View>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>GIÁ TRỊ ĐỀ NGHỊ THANH TOÁN</Text>
            <Text style={styles.grandValue}>{fmtVND(totals.approvedValue)}</Text>
          </View>
        </View>

        <View style={styles.sigRow}>
          <View style={styles.sigBox}>
            <Text style={{ fontSize: 8, fontFamily: FONT_BOLD, textTransform: "uppercase" }}>
              Đơn vị lập
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
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem đợt thanh toán" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const cert = await getCert(id);
  if (!cert) return NextResponse.json({ error: "Không tìm thấy đợt thanh toán" }, { status: 404 });
  const totals = await certTotals(id);
  const today = formatDateVN(new Date());

  const stream = await ReactPDF.renderToStream(
    <IpcDoc cert={cert} totals={totals} today={today} />,
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
      "Content-Disposition": `attachment; filename="${cert.code}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
