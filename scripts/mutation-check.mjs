#!/usr/bin/env node
// C4 §4 — "Mutation test chọn mẫu cho delayed/progress/money/RBAC/RLS/idempotency/risk/gates;
// CHỨNG MINH TEST FAIL KHI ĐỔI INVARIANT."
//
// VẤN ĐỀ ĐANG CÓ: một bộ test xanh chỉ chứng minh "code hiện tại không làm test đỏ". Nó
// KHÔNG chứng minh test sẽ bắt được khi ai đó phá đúng cái bất biến mà test tưởng là đang
// canh. Test kiểu đó (chạy qua code nhưng không assert đúng chỗ) trông y hệt test tốt cho
// tới ngày có người sửa nhầm và CI vẫn xanh.
//
// CÁCH LÀM: với mỗi bất biến, cố ý SỬA SAI code một chỗ, chạy đúng những file test được cho
// là canh nó, rồi đòi hỏi chúng phải ĐỎ. Mutation nào "sống sót" (test vẫn xanh) là một lỗ
// hổng có thật trong bộ test — báo tên ra, không im lặng.
//
// KHÔNG thêm thư viện mutation testing (Stryker...): ADR-0001/nguyên tắc #7 của roadmap là
// không thêm hạ tầng khi chưa cần. Ở đây chỉ cần thay chuỗi + chạy lại đúng vài file test,
// nên viết tay ~150 dòng là đủ và chạy nhanh hơn nhiều (chỉ chạy file liên quan, không quét
// toàn repo).
//
// Chạy: `npm run test:mutation` (cần TEST_DATABASE_URL cho các bất biến chạm DB).
// Mỗi mutation luôn được HOÀN NGUYÊN, kể cả khi lỗi giữa chừng (xem khối finally).

import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { CO_MOCK_MODULE } from "./test-flags.mjs";

const tsxLoader = "./" + join("node_modules", "tsx", "dist", "loader.mjs");

/**
 * Mỗi mutation: đổi ĐÚNG MỘT chỗ trong `file`, rồi đòi các file trong `tests` phải đỏ.
 * `find` phải là chuỗi xuất hiện DUY NHẤT trong file — script tự kiểm và báo lỗi nếu không,
 * để mutation không lặng lẽ trượt sang chỗ khác khi code đổi.
 */
const MUTATIONS = [
  {
    key: "progress: 199/200 không được thành 100%",
    file: "lib/tien-do/recompute.ts",
    find: "Math.min(0.99, Math.round((checked / total) * 100) / 100)",
    replace: "Math.round((checked / total) * 100) / 100",
    tests: ["tests/recompute.test.ts"],
    why: "Bỏ trần 0.99 → 199/200 làm tròn lên 1.00, mở khoá nghiệm thu sai khi còn ô chưa tick.",
  },
  {
    key: "delayed: quá hạn mà chưa xong phải là 'tre'",
    file: "lib/tien-do/recompute.ts",
    find: 'if (endDate && endDate < todayISO()) return "tre";',
    replace: 'if (endDate && endDate < todayISO()) return "dang_thi_cong";',
    tests: ["tests/recompute.test.ts"],
    why: "Task trễ không còn được đánh dấu trễ → dashboard/cảnh báo/Pareto mất sạch việc trễ.",
  },
  {
    key: "nghiệm thu không bao giờ bị hạ cấp tự động",
    file: "lib/tien-do/recompute.ts",
    find: 'if (current === "nghiem_thu") return "nghiem_thu";',
    replace: 'if (false) return "nghiem_thu";',
    tests: ["tests/recompute.test.ts"],
    why: "Task đã nghiệm thu bị tính lại về trạng thái khác — mất dấu nghiệm thu đã ký.",
  },
  {
    key: "RBAC: chỉ Admin/PM được duyệt nghiệm thu",
    file: "lib/bao-mat/auth.ts",
    find: 'approve: (r?: Role) => r === "admin" || r === "pm",',
    replace: 'approve: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",',
    // Bất biến này được canh ở permissions.test.ts (map `CAN` + override theo vai trò),
    // KHÔNG phải auth.test.ts. Bản đầu trỏ nhầm sang auth.test.ts và mutation "sống sót" —
    // hoá ra là lỗi bản đồ của chính script, không phải lỗ hổng của bộ test. Giữ ghi chú
    // này để lần sau đọc kết quả không kết luận vội.
    tests: ["tests/permissions.test.ts"],
    why: "Nới quyền duyệt cho engineer — leo thang quyền ở đúng chỗ nhạy cảm nhất.",
  },
  {
    key: "risk: an toàn là tuyệt đối (critical bất kể yếu tố khác)",
    file: "lib/ky-thuat/engineering-workflow.ts",
    find: 'if (i.safetyRisk) return "critical";',
    replace: 'if (i.safetyRisk) return "high";',
    tests: ["tests/engineering-workflow.test.ts"],
    why: "Hạ rủi ro an toàn xuống high → đổi profile duyệt, bớt gate cho đúng loại việc nguy hiểm nhất.",
  },
  {
    key: "gates: profile C phải có đủ 2 gate",
    file: "lib/ky-thuat/engineering-workflow.ts",
    find: "      return [GATE_1, GATE_2];",
    replace: "      return [GATE_1];",
    tests: ["tests/engineering-workflow.test.ts"],
    why: "Bớt một cửa ký duyệt — separation of duties bị phá âm thầm.",
  },
  {
    key: "idempotency: cùng key + body KHÁC phải 409",
    file: "app/api/v1/engineering/ingest/route.ts",
    find: "if (prior.requestSha256 !== requestSha256)",
    replace: "if (false)",
    tests: ["tests/engineering-ingest.test.ts", "tests/engineering-contract.test.ts"],
    why: "Dùng lại Idempotency-Key cho payload khác được trả về response cũ — client tưởng đã ghi, thực ra không.",
  },
  {
    key: "RLS: withProjectScope mặc định CHỈ ĐỌC",
    file: "lib/db/index.ts",
    find: "const readOnly = opts?.readOnly ?? true;",
    replace: "const readOnly = opts?.readOnly ?? false;",
    tests: ["tests/rls.test.ts"],
    why: "Mặc định thành ghi được → mọi đường đọc bọc scope bỗng có quyền ghi ngoài ý muốn.",
  },
  {
    key: "money: nhân hệ số phải làm tròn nửa lên",
    file: "lib/nen/money.ts",
    find: "return roundHalfUpNum(Number(v) * rate);",
    replace: "return BigInt(Math.floor(Number(v) * rate));",
    tests: ["tests/money.test.ts"],
    why: "Đổi cách làm tròn tiền → lệch từng đồng dồn lại trên hoá đơn/IPC, sai lệch tài chính.",
  },
  // QUALITY-FINAL-1 S10a: đường IPC exact. `moiFile` = MỖI file test phải đỏ (không chỉ 1) — mỗi
  // lớp (utility golden, route golden, DTO/export) canh bất biến độc lập, lớp nào im là có lỗ.
  {
    key: "money: mulRatio làm tròn nửa xa 0 (tạm ứng IPC)",
    file: "lib/nen/money.ts",
    find: "return divRoundHalfUp(minor * numerator, denominator);",
    replace: "return (minor * numerator) / denominator;",
    tests: [
      "tests/money-exact-golden.test.ts",
      "tests/money-ipc-golden-route.test.ts",
      "tests/payment-certs-money-dto.test.ts",
    ],
    moiFile: true,
    why: "Chặt cụt thay vì làm tròn → tạm ứng 10,25% × 94,00 ra 9,63 thay 9,64; lệch xu trên IPC/phiếu thanh toán.",
  },
  {
    key: "money: ipc-sum-v1 cộng rồi mới round tổng",
    file: "lib/nen/money.ts",
    find: "const periodValue = sumMoneyProductsExact(products, IPC_QTY_SCALE);",
    replace:
      "const periodValue = products.reduce((s, p) => s + sumMoneyProductsExact([p], IPC_QTY_SCALE), 0n);",
    tests: [
      "tests/money-exact-golden.test.ts",
      "tests/money-ipc-golden-route.test.ts",
      "tests/payment-certs-money-dto.test.ts",
    ],
    moiFile: true,
    why: "Round từng dòng trước khi cộng (trái A3-FR05) → 2 dòng 0,005 thành 0,02 thay 0,01; giá trị đợt sai.",
  },
  // QUALITY-FINAL-1 S13c: quyết định IPC (A5-FR06/FR07).
  {
    key: "IPC: cảnh báo vượt HĐ phải được xác nhận đúng bản hiện tại",
    file: "lib/tai-chinh/ipc-quyet-dinh.ts",
    find: "if (!xn.acknowledged || !xn.reason || xn.warningVersion == null)",
    replace: "if (false)",
    tests: ["tests/s13a-chuoi-ipc-thanh-toan.test.ts", "tests/s13c-ipc-quyet-dinh.test.ts"],
    moiFile: true,
    why: "Duyệt đợt luỹ kế vượt khối lượng hợp đồng mà không ai xác nhận cảnh báo — sinh phiếu thanh toán tiền thật.",
  },
  {
    key: "IPC: decide tính lại luỹ kế dưới khoá",
    file: "app/api/payment-certs/[id]/decide/route.ts",
    find: "      await tinhLaiLuyKeDot(id);",
    replace: "",
    tests: ["tests/s13c-ipc-quyet-dinh.test.ts"],
    why: "Duyệt bằng luỹ kế lưu lúc trình/nháp (đã cũ) → luỹ kế chốt sai và mất cảnh báo vượt HĐ (A5-FR06).",
  },
  {
    key: "IPC: không duyệt kỳ trước khi kỳ sau đã duyệt",
    file: "app/api/payment-certs/[id]/decide/route.ts",
    find: "        if (sau)",
    replace: "        if (sau && false)",
    tests: ["tests/s13a-chuoi-ipc-thanh-toan.test.ts"],
    why: "Duyệt ngược kỳ → lịch sử luỹ kế lệch, không đối soát (A5-FR06).",
  },
  // QUALITY-FINAL-1 S13d: ngưỡng duyệt IPC theo giá trị đợt HIỆN TẠI.
  {
    key: "IPC: decide chốt lại amount cũ trước khi engine chọn bước",
    file: "app/api/payment-certs/[id]/decide/route.ts",
    find: "            await kiemAmountTruocKhiDuyet({",
    replace: "            void ({",
    tests: ["tests/s13d-ipc-con-lai.test.ts"],
    why: "Request trình trước bản vá S10a mang amount lúc lập nháp → engine bỏ qua bước duyệt cấp cao theo min_amount.",
  },
  // QUALITY-FINAL-1 S13e: cùng bất biến cho đề xuất + phát sinh (VO).
  {
    key: "Đề xuất: decide chốt lại amount cũ trước khi engine chọn bước",
    file: "app/api/proposals/[id]/decide/route.ts",
    find: "          await kiemAmountTruocKhiDuyet({",
    replace: "          void ({",
    tests: ["tests/s13e-de-xuat-vo-quyet-dinh.test.ts"],
    why: "Đề xuất trình trước S13d mang số tiền lúc lập → engine bỏ qua bước duyệt cấp cao theo min_amount.",
  },
  {
    key: "VO: decide chốt lại amount cũ trước khi engine chọn bước",
    file: "app/api/variations/[id]/decide/route.ts",
    find: "          await kiemAmountTruocKhiDuyet({",
    replace: "          void ({",
    tests: ["tests/s13e-de-xuat-vo-quyet-dinh.test.ts"],
    why: "VO lập trước S13e mang amount từ SUM float → engine chọn cấp duyệt theo số xấp xỉ/cũ.",
  },
  // QUALITY-FINAL-1 S05: mở khoá vault phải kiểm lại TOÀN BỘ manifest với quyền hiện hành.
  {
    key: "vault: unlock trả khoá dù tài nguyên trong manifest đã bị thu hồi",
    file: "lib/bao-mat/offline-vault.ts",
    find: "  if (!duocPhep(m)) return null;",
    replace: "  void duocPhep;",
    tests: ["tests/offline-vault-route.test.ts"],
    why: "Thu hồi phân công/quyền một task vẫn mở được DEK của manifest chứa task đó (Q-AC02, A2-AC09).",
  },
  // QUALITY-FINAL-1 S06: receipt + precondition ở endpoint hàng đợi offline thật.
  {
    key: "receipt: cùng Idempotency-Key mà payload khác phải 409",
    file: "lib/bao-mat/offline-receipt.ts",
    find: "  if (r.kind !== pv.kind || r.hash !== pv.hash)",
    replace: "  if (false)",
    tests: ["tests/offline-receipt-route.test.ts"],
    why: "Gửi lại key cũ với nội dung đã sửa được ACK như thao tác cũ — client tưởng đã lưu bản mới (A2-AC04).",
  },
  {
    key: "receipt: replay không được chạy lại mutation",
    file: "app/api/dimensions/[id]/route.ts",
    find: "        if (replay) return { replay } as const;",
    replace: "        void replay;",
    tests: ["tests/offline-receipt-route.test.ts"],
    why: "Mất ACK rồi gửi lại tick cũ hồi sinh ô người dùng đã bỏ tick sau đó (A2-AC04).",
  },
  {
    key: "nhật ký: If-Match lệch phiên bản phải 412",
    file: "app/api/diaries/[date]/route.ts",
    find: "      if (!dieuKienThoa(dk.dieuKien, existing)) return { lechPhienBan: true } as const;",
    replace: "      void dieuKienThoa;",
    tests: ["tests/offline-receipt-route.test.ts"],
    why: "PUT full-replace dựa trên bản cũ đè mất nhật ký người khác vừa lưu (A2-FR11, A2-AC10).",
  },
  {
    key: "ảnh: ghi metadata lỗi phải dọn file đã đặt",
    file: "app/api/tasks/[id]/photos/route.ts",
    find: "    await donFileStaging(user, fileName);\n    return traLoiOfflineHoacNem(e);",
    replace: "    return traLoiOfflineHoacNem(e);",
    tests: ["tests/offline-receipt-route.test.ts"],
    why: "File ảnh nằm lại trên storage không ai tham chiếu, không đối soát được (A2-AC10).",
  },
  // QUALITY-FINAL-1 S07: hàng đợi offline v2 (vault + IndexedDB nguyên tử).
  {
    key: "hàng đợi: lưu nhật ký online chỉ bỏ bản nháp form đã nạp",
    file: "app/components/offlineQueue/index.ts",
    find: "          chon.has(o.rec.operationId) &&",
    replace: "          true &&",
    tests: ["tests/offline-queue-vault.test.ts"],
    why: "Lưu online xoá cả bản nháp offline (kể cả conflict) mà form chưa từng nạp — mất nhật ký người dùng không hề thấy.",
  },
  {
    key: "hàng đợi: gia hạn lease trong lúc chờ mạng",
    file: "app/components/offlineQueue/logic.ts",
    find: "        d.store.giaHanLease(chu, d.holder, lease.token, now()).catch(() => false);",
    replace: "        void 0;",
    tests: ["tests/offline-queue-vault.test.ts"],
    why: "Upload lâu hơn TTL → tab khác giành lease và gửi lại song song cùng key (A2-AC04).",
  },
  {
    key: "hàng đợi: 409 context_* khoá vault",
    file: "app/components/offlineQueue/index.ts",
    find: "        if (kq.loiContext) {",
    replace: "        if (false) {",
    tests: ["tests/offline-queue-vault.test.ts"],
    why: "Quyền/thiết bị đã đổi mà tab vẫn dùng context + DEK cũ tới hết lease (tới 8 giờ).",
  },
  {
    key: "hàng đợi: 409/412/428 phải giữ op ở trạng thái conflict",
    file: "app/components/offlineQueue/logic.ts",
    find: '  if (s === 409 || s === 412 || s === 428) return { loai: "conflict" };',
    replace: '  if (s === 409 || s === 412 || s === 428) return { loai: "xong" };',
    tests: ["tests/offline-queue.test.ts", "tests/offline-queue-vault.test.ts"],
    why: "Flush xoá bản nhật ký nhập offline khi server báo phiên bản lệch — mất dữ liệu người dùng (A2-FR10).",
  },
  {
    key: "hàng đợi: 2xx chỉ xoá op khi receipt khớp operationId",
    file: "app/components/offlineQueue/logic.ts",
    find: '    return kq.receiptOperationId === rec.operationId ? { loai: "xong" } : { loai: "conflict" };',
    replace: '    return { loai: "xong" };',
    tests: ["tests/offline-queue.test.ts"],
    why: "2xx không có receipt (proxy/cache/endpoint cũ) bị coi là đã lưu — xoá op chưa chắc server ghi.",
  },
  {
    key: "hàng đợi: chỉ gộp op CHƯA TỪNG gửi",
    file: "app/components/offlineQueue/logic.ts",
    find: '  return r.state === "pending" && r.tries === 0;',
    replace: '  return r.state !== "rejected";',
    tests: ["tests/offline-queue.test.ts", "tests/offline-queue-vault.test.ts"],
    why: "Ghi đè payload của op server có thể đã nhận (mất ACK) → gửi lại cùng Idempotency-Key với nội dung khác → 409 idempotency_conflict, mất thao tác mới.",
  },
  {
    key: "hàng đợi: Idempotency-Key cố định = operationId",
    file: "app/components/offlineQueue/logic.ts",
    find: '    "Idempotency-Key": rec.operationId,',
    replace: '    "Idempotency-Key": crypto.randomUUID(),',
    tests: ["tests/offline-queue.test.ts", "tests/offline-queue-vault.test.ts"],
    why: "Mỗi lần retry một key mới → server không dedup được, mất ACK là ghi 2 lần (A2-AC04).",
  },
  {
    key: "hàng đợi: nhật ký gửi If-Match từ etag lúc enqueue",
    file: "app/components/offlineQueue/logic.ts",
    find: '  if (body.baseVersion) headers["If-Match"] = body.baseVersion;',
    replace: "  if (body.baseVersion) void 0;",
    tests: ["tests/offline-queue.test.ts"],
    why: "Bản nhật ký offline ghi đè bản người khác đã sửa trên server (lost update, điều kiện chặn S06).",
  },
  {
    key: "hàng đợi: FIFO theo tài nguyên — op bị chặn chặn op sau",
    file: "app/components/offlineQueue/logic.ts",
    find: "    for (const t of taiNguyen) biChan.add(t);",
    replace: "    void taiNguyen;",
    tests: ["tests/offline-queue.test.ts", "tests/offline-queue-vault.test.ts"],
    why: "Tick sau vượt lên trước tick đang conflict/backoff của cùng ô — trạng thái cuối trên server sai thứ tự.",
  },
  {
    key: "vault: không giải mã op của chủ khác",
    file: "app/components/offlineQueue/vault.ts",
    find: '    if (!cungChu(rec, chu)) throw new LoiVault("owner");',
    replace: "    void cungChu;",
    tests: ["tests/offline-queue-vault.test.ts"],
    why: "Op của user/tổ chức/thiết bị khác bị giải mã và gửi bằng phiên hiện tại (A2-AC02).",
  },
  {
    key: "IDB: chỉ báo đã lưu khi transaction complete",
    file: "app/components/offlineQueue/store.ts",
    find: "          ketQua = { v };",
    replace: "          ketQua = { v };\n          resolve(v);",
    tests: ["tests/audit-offline-store-commit.test.ts"],
    why: "Báo 'đã lưu' rồi transaction abort (quota/lỗi đĩa) → người dùng tưởng đã lưu, thao tác mất (A2-AC05).",
  },
  {
    key: "lease: không chiếm lease còn hạn của tab khác",
    file: "app/components/offlineQueue/store.ts",
    find: "      if (cu && cu.holder !== holder && cu.expiresAt > now) return null;",
    replace: "      if (false) return null;",
    tests: ["tests/offline-queue-vault.test.ts"],
    why: "Hai tab cùng gửi một op — gửi trùng/ghi kết quả chồng nhau.",
  },
  {
    key: "fencing: tab mất lease không được ghi kết quả",
    file: "app/components/offlineQueue/store.ts",
    find: "      if (!l || l.holder !== holder || l.token !== token) return false;",
    replace: "      if (!l) return false;",
    tests: ["tests/offline-queue-vault.test.ts"],
    why: "Tab cũ (bị treo quá hạn lease) xoá/sửa op mà tab mới đang gửi — mất op hoặc trạng thái sai.",
  },
  // QUALITY-FINAL-1 S08: màn phục hồi + allowlist cache SW.
  {
    key: "phục hồi: chỉ bỏ op conflict/rejected được chọn",
    file: "app/components/offlineQueue/index.ts",
    find: '    if (!r || !cungChu(r, chu) || (r.state !== "conflict" && r.state !== "rejected")) return false;',
    replace: "    if (!r) return false;",
    tests: ["tests/audit-s08-offline-recovery.test.ts"],
    why: "Nút 'Bỏ thao tác này' xoá op đang chờ gửi/đang gửi — mất thao tác chưa lên máy chủ (D03).",
  },
  {
    key: "phục hồi: giữ bản nhật ký chỉ bỏ op cũ sau khi op mới đã lưu",
    file: "app/components/offlineQueue/index.ts",
    find: "      await this.refreshStats().catch(() => undefined);\n      return loi(OFFLINE_SAVE_ERROR);",
    replace: "      void 0;",
    tests: ["tests/audit-s08-offline-recovery.test.ts"],
    why: "Op mới chưa ghi được (quota/abort) mà op xung đột cũ vẫn bị bỏ — mất bản nhật ký người dùng chọn giữ (A2-FR11).",
  },
  {
    key: "phục hồi: đăng xuất không còn đếm op của chủ cũ",
    file: "app/components/offlineQueue/index.ts",
    find: "    if (quenChu) this.userCuoi = null;",
    replace: "    void quenChu;",
    tests: ["tests/audit-s08-offline-recovery.test.ts"],
    why: "Sau đăng xuất/đổi tài khoản, badge/màn phục hồi vẫn đếm thao tác của người trước (A2-AC01).",
  },
  {
    key: "SW: tài chính luôn network-only kể cả khi allowlist bị nới",
    file: "public/sw.js",
    find: "  if (laTaiChinhHoacNhayCam(url.pathname)) return null;",
    replace: "  void laTaiChinhHoacNhayCam;",
    tests: ["tests/audit-s08-sw-allowlist.test.ts"],
    why: "Mở rộng allowlist sau này vô tình cache dữ liệu tài chính/xác thực vào Cache Storage, lộ khi mất mạng (A2-AC09).",
  },
  {
    key: "xoá ảnh: khoá nhật ký trước khi DELETE task_photos",
    file: "app/api/photos/[id]/route.ts",
    find: "      await khoaNhatKyCuaAnh([id]);",
    replace: "      void khoaNhatKyCuaAnh;",
    tests: ["tests/offline-receipt-route.test.ts"],
    why: "Xoá ảnh đồng thời với lưu nhật ký gắn ảnh đó → deadlock (trigger version 0164), một bên 500.",
  },
];

const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const list = only ? MUTATIONS.filter((m) => m.key.includes(only)) : MUTATIONS;

/** Chạy 1 file test (cùng cờ mock.module như runner chính); true nếu file ĐỎ. */
function fileFails(f) {
  const res = spawnSync(process.execPath, [CO_MOCK_MODULE, `--import=${tsxLoader}`, "--test", f], {
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf8",
  });
  return res.status !== 0;
}

/** Chạy các file test; trả true nếu CÓ ÍT NHẤT MỘT file đỏ. */
function testsFail(files) {
  return files.some(fileFails);
}

/** Sau mutation: `moiFile` đòi MỌI file đỏ; còn lại chỉ cần 1. Trả danh sách file vẫn xanh. */
function filesStillGreen(m) {
  if (!m.moiFile) return testsFail(m.tests) ? [] : [...m.tests];
  return m.tests.filter((f) => !fileFails(f));
}

let songSot = 0;
let daChay = 0;

for (const m of list) {
  const src = readFileSync(m.file, "utf8");
  const soLan = src.split(m.find).length - 1;

  if (soLan !== 1) {
    process.stdout.write(
      `\n⚠️  BỎ QUA "${m.key}"\n` +
        `    Chuỗi cần thay xuất hiện ${soLan} lần trong ${m.file} (phải đúng 1).\n` +
        `    Code đã đổi — cập nhật lại 'find' trong scripts/mutation-check.mjs, đừng để mutation trượt chỗ khác.\n`,
    );
    songSot++; // coi như lỗi: mutation không còn kiểm được gì
    continue;
  }

  process.stdout.write(`\n▶ ${m.key}\n   ${m.file} · test: ${m.tests.join(", ")}\n`);

  // ĐƯỜNG NỀN (baseline) — BẮT BUỘC kiểm trước khi sửa code.
  //
  // Không có bước này, script tự lừa mình: bất kỳ lý do nào làm test thoát khác 0 (Postgres
  // chết, thiếu TEST_DATABASE_URL, lỗi cú pháp sẵn có) đều bị đếm là "mutation đã bị bắt",
  // và bảng kết quả ra 9/9 xanh mượt trong khi thực chất chưa đo được gì. Đã mắc đúng lỗi
  // này ở lần chạy đầu (Postgres tắt giữa chừng) — nên chốt thành bước cứng.
  if (testsFail(m.tests)) {
    process.stdout.write(
      `   ⚠️  BỎ QUA — test đã ĐỎ SẴN khi CHƯA sửa gì.\n` +
        `      Kết quả mutation sẽ vô nghĩa (đỏ vì hạ tầng/lỗi có sẵn, không phải vì bắt được).\n` +
        `      Sửa cho test xanh trước (thường là thiếu TEST_DATABASE_URL hoặc Postgres chưa chạy).\n`,
    );
    songSot++;
    continue;
  }

  daChay++;
  try {
    writeFileSync(m.file, src.replace(m.find, m.replace));
    const conXanh = filesStillGreen(m);
    if (conXanh.length === 0) {
      process.stdout.write(`   ✅ test ĐỎ như mong đợi — bất biến này thật sự được canh\n`);
    } else {
      songSot++;
      process.stdout.write(
        `   ❌ MUTATION SỐNG SÓT — test vẫn XANH dù code đã bị phá: ${conXanh.join(", ")}\n` +
          `      Hậu quả nếu lọt thật: ${m.why}\n` +
          `      => Bộ test chưa canh bất biến này. Bổ sung assert, đừng sửa mutation cho qua.\n`,
      );
    }
  } finally {
    // Luôn trả file về nguyên trạng, kể cả khi test ném lỗi giữa chừng.
    writeFileSync(m.file, src);
  }
}

process.stdout.write(
  `\n=== Mutation: ${daChay}/${list.length} chạy được · ${songSot} sống sót (mong đợi 0) ===\n`,
);
process.exit(songSot > 0 ? 1 : 0);
