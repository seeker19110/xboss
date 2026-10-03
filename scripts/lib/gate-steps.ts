// scripts/lib/gate-steps.ts — Đọc danh sách cổng tĩnh từ .github/workflows/ci.yml cho `npm run gate`.
//
// VÌ SAO ĐỌC TỪ ci.yml thay vì chép danh sách: quy ước "merge ngay khi CI xanh" chỉ an toàn khi
// bước tự kiểm cục bộ CHẠY ĐÚNG những gì CI chạy. Danh sách chép tay sẽ trôi (CI thêm cổng mới,
// gate cục bộ không biết). Parser cố ý đơn giản — chỉ nhận dạng đúng mẫu repo đang dùng:
//   `      - name: <tên>` rồi `        run: npm run <script>` (1 dòng) trong job được chỉ định.
// Bước `run: |` nhiều dòng (npm audit có retry) và `npm ci` bị bỏ qua có chủ đích.

export interface BuocGate {
  ten: string;
  script: string;
}

export function docBuocCi(yaml: string, job = "static"): BuocGate[] {
  const dong = yaml.replace(/\r\n/g, "\n").split("\n");
  const batDau = dong.findIndex((d) => d === `  ${job}:`);
  if (batDau < 0) throw new Error(`Không thấy job "${job}" trong ci.yml`);
  const ra: BuocGate[] = [];
  let tenHienTai: string | null = null;
  for (let i = batDau + 1; i < dong.length; i++) {
    const d = dong[i];
    if (/^ {2}[A-Za-z][\w-]*:\s*$/.test(d)) break; // sang job kế tiếp
    const ten = d.match(/^ {6}- name:\s*(.+?)\s*$/);
    if (ten) {
      tenHienTai = ten[1].replace(/^["']|["']$/g, "");
      continue;
    }
    const run = d.match(/^ {8}run:\s*npm run ([\w:-]+)\s*$/);
    if (run && tenHienTai) {
      ra.push({ ten: tenHienTai, script: run[1] });
      tenHienTai = null;
    }
  }
  return ra;
}
