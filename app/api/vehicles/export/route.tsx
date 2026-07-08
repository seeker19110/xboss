import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, daysFromTodayISO } from "@/lib/db";
import { getCurrentUser, isAdminOrPm } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import ReactPDF, { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { registerVietnameseFonts, FONT_REGULAR, FONT_BOLD } from "@/lib/pdf-fonts";

export const dynamic = "force-dynamic";
registerVietnameseFonts();

const styles = StyleSheet.create({
  page: { fontFamily: FONT_REGULAR, fontSize: 9, padding: 32, color: "#1a1a1a" },
  title: { fontSize: 14, fontFamily: FONT_BOLD, textAlign: "center", marginBottom: 4 },
  code: { fontSize: 10, textAlign: "center", color: "#555", marginBottom: 16 },
  th: { fontFamily: FONT_BOLD, fontSize: 8 },
  tr: { flexDirection: "row", paddingVertical: 4, borderBottom: "0.3 solid #eee" },
  colPlate: { width: 70 },
  colTime: { width: 60 },
  colSupplier: { flex: 1 },
  colCargo: { flex: 1 },
  colCrane: { width: 40, textAlign: "center" },
});

type VehicleRow = {
  plate: string;
  expectedAt: string;
  supplierName: string | null;
  cargo: string | null;
  gate: string | null;
  needsCrane: boolean;
};
type Project = { name: string; contractor: string | null };

function fmtTime(v: string) {
  return new Date(v).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function VehicleDoc({
  date,
  rows,
  project,
}: {
  date: string;
  rows: VehicleRow[];
  project: Project;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>DANH SÁCH XE RA VÀO CÔNG TRƯỜNG</Text>
        <Text style={styles.code}>
          {project.name} · Ngày {date}
        </Text>
        <View style={[styles.tr, { backgroundColor: "#f8f8f8" }]}>
          <Text style={[styles.th, styles.colTime]}>Giờ dự kiến</Text>
          <Text style={[styles.th, styles.colPlate]}>Biển số</Text>
          <Text style={[styles.th, styles.colSupplier]}>Nhà cung cấp</Text>
          <Text style={[styles.th, styles.colCargo]}>Hàng hoá</Text>
          <Text style={[styles.th, styles.colCrane]}>Cẩu</Text>
        </View>
        {rows.map((r, i) => (
          <View key={i} style={styles.tr}>
            <Text style={styles.colTime}>{fmtTime(r.expectedAt)}</Text>
            <Text style={styles.colPlate}>{r.plate}</Text>
            <Text style={styles.colSupplier}>{r.supplierName ?? "—"}</Text>
            <Text style={styles.colCargo}>{r.cargo ?? "—"}</Text>
            <Text style={styles.colCrane}>{r.needsCrane ? "X" : ""}</Text>
          </View>
        ))}
        {rows.length === 0 && (
          <Text style={{ marginTop: 10, color: "#777" }}>Không có xe đăng ký.</Text>
        )}
      </Page>
    </Document>
  );
}

// GET /api/vehicles/export?date=YYYY-MM-DD (mặc định ngày mai) → PDF gửi tổng thầu.
// Scoped theo dự án đang chọn (M22).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!isAdminOrPm(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được xuất danh sách" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để xuất danh sách" }, { status: 422 });

  const param = req.nextUrl.searchParams.get("date");
  const date = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : daysFromTodayISO(1);

  const rows = await query<VehicleRow>(
    `SELECT v.plate, v.expected_at AS "expectedAt", s.name AS "supplierName",
            v.cargo, v.gate, v.needs_crane AS "needsCrane"
       FROM vehicle_logs v
       LEFT JOIN suppliers s ON s.id = v.supplier_id
      WHERE v.expected_at::date = ? AND v.status <> 'cancelled' AND v.project_id = ?
      ORDER BY v.expected_at`,
    date,
    projectId,
  );

  const project = (await queryOne<Project>(
    `SELECT name, contractor FROM projects WHERE id = ?`,
    projectId,
  )) ?? { name: "XBoss", contractor: null };

  const stream = await ReactPDF.renderToStream(
    <VehicleDoc date={date} rows={rows} project={project} />,
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
      "Content-Disposition": `attachment; filename="xe-ra-vao-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
