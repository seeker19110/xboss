import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  computeSha256,
  hashLeafRecord,
  buildMerkleTree,
  generateMerkleProof,
  verifyMerkleProof,
} from "@/lib/bao-mat/merkle-audit-ledger";

// Sổ cái Merkle + chuỗi audit là bằng chứng CHỐNG SỬA của hồ sơ nghiệm thu/thanh toán.
// Giá trị của nó nằm ở đúng một điều: sửa một bản ghi thì phải LỘ RA. Nên test ở đây không
// chỉ kiểm "hàm chạy" mà kiểm chính điều đó — đổi 1 ký tự trong dữ liệu là root/chuỗi phải gãy.

test("computeSha256: đúng chuẩn SHA-256, ổn định giữa các lần gọi", () => {
  // Đối chiếu với vector chuẩn để phát hiện nếu ai đó đổi thuật toán băm.
  assert.equal(
    computeSha256("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(computeSha256(""), computeSha256(""));
  assert.notEqual(computeSha256("a"), computeSha256("b"));
});

test("hashLeafRecord: cùng nội dung nhưng khác THỨ TỰ khoá vẫn ra cùng băm", () => {
  // Nếu băm phụ thuộc thứ tự khoá JSON thì hai lần seal cùng dữ liệu sẽ ra root khác nhau,
  // và mọi cảnh báo "hồ sơ bị sửa" trở thành báo động giả.
  const a = hashLeafRecord({ id: 1, ten: "Ống gió", kl: 10 });
  const b = hashLeafRecord({ kl: 10, ten: "Ống gió", id: 1 });
  assert.equal(a, b);

  // Đổi GIÁ TRỊ thì băm phải khác — đây chính là tính chống sửa.
  assert.notEqual(a, hashLeafRecord({ id: 1, ten: "Ống gió", kl: 11 }));

  // Chuỗi băm thẳng, không bọc JSON.
  assert.equal(hashLeafRecord("abc"), computeSha256("abc"));
  // null/số/undefined đi qua nhánh JSON.stringify.
  assert.equal(hashLeafRecord(null), computeSha256("null"));
  assert.equal(hashLeafRecord(42), computeSha256("42"));
  // undefined: JSON.stringify trả về chính `undefined` (không phải chuỗi) nên hàm băm ném lỗi.
  // Ghi lại hành vi thật thay vì giả vờ nó hợp lệ — người gọi không được đưa undefined vào sổ cái.
  assert.throws(() => hashLeafRecord(undefined), /must be of type string/);
});

test("buildMerkleTree: cây rỗng có root tiền định, không phải chuỗi rỗng", () => {
  for (const rong of [[], null as unknown as string[], undefined as unknown as string[]]) {
    const t = buildMerkleTree(rong);
    assert.equal(t.root, computeSha256("EMPTY_TREE"));
    assert.equal(t.leafCount, 0);
    assert.deepEqual(t.leafHashes, []);
    assert.deepEqual(t.treeLevels, [[computeSha256("EMPTY_TREE")]]);
  }
});

test("buildMerkleTree: 1 lá thì root chính là lá đó", () => {
  const la = computeSha256("mot-la");
  const t = buildMerkleTree([la]);
  assert.equal(t.root, la);
  assert.equal(t.leafCount, 1);
  assert.equal(t.treeLevels.length, 1);
});

test("buildMerkleTree: số lá LẺ — lá cuối tự ghép với chính nó", () => {
  // Đây là quy ước dễ sai nhất của Merkle tree: quên xử lý lá lẻ thì cây mất bản ghi cuối.
  const la = ["a", "b", "c"].map(computeSha256);
  const t = buildMerkleTree(la);
  assert.equal(t.leafCount, 3);
  const capAB = computeSha256(la[0] + la[1]);
  const capCC = computeSha256(la[2] + la[2]); // c ghép với chính nó
  assert.deepEqual(t.treeLevels[1], [capAB, capCC]);
  assert.equal(t.root, computeSha256(capAB + capCC));
});

test("buildMerkleTree: đổi MỘT lá là root đổi — đây là tính chống sửa", () => {
  const goc = ["a", "b", "c", "d"].map(computeSha256);
  const sua = [...goc];
  sua[2] = computeSha256("c-đã-bị-sửa");
  assert.notEqual(buildMerkleTree(goc).root, buildMerkleTree(sua).root);
});

test("generateMerkleProof + verifyMerkleProof: chứng minh được MỌI lá trong cây", () => {
  for (const soLa of [2, 3, 4, 5, 8]) {
    const la = Array.from({ length: soLa }, (_, i) => computeSha256(`la-${i}`));
    const cay = buildMerkleTree(la);
    for (let i = 0; i < soLa; i++) {
      const proof = generateMerkleProof(i, cay.treeLevels);
      assert.equal(
        verifyMerkleProof(la[i], proof, cay.root),
        true,
        `lá ${i}/${soLa} phải chứng minh được`,
      );
    }
  }
});

test("verifyMerkleProof: lá giả hoặc proof của lá khác đều bị từ chối", () => {
  const la = ["a", "b", "c", "d"].map(computeSha256);
  const cay = buildMerkleTree(la);
  const proof0 = generateMerkleProof(0, cay.treeLevels);

  assert.equal(verifyMerkleProof(computeSha256("lá-giả"), proof0, cay.root), false);
  // Proof của lá 0 không được chứng minh cho lá 1.
  assert.equal(verifyMerkleProof(la[1], proof0, cay.root), false);
  // Root sai thì từ chối kể cả proof đúng.
  assert.equal(verifyMerkleProof(la[0], proof0, computeSha256("root-giả")), false);
  // Proof rỗng chỉ đúng khi lá CHÍNH LÀ root (cây 1 lá).
  assert.equal(verifyMerkleProof(la[0], [], la[0]), true);
  assert.equal(verifyMerkleProof(la[0], [], cay.root), false);
});

test("generateMerkleProof: cây rỗng/1 lá trả proof rỗng; chỉ số ngoài phạm vi thì ném lỗi", () => {
  assert.deepEqual(generateMerkleProof(0, []), []);
  assert.deepEqual(generateMerkleProof(0, null as unknown as string[][]), []);
  assert.deepEqual(generateMerkleProof(0, [[computeSha256("x")]]), []);

  const cay = buildMerkleTree(["a", "b"].map(computeSha256));
  assert.throws(() => generateMerkleProof(-1, cay.treeLevels), /vượt giới hạn/);
  assert.throws(() => generateMerkleProof(2, cay.treeLevels), /vượt giới hạn/);
});

// ===== Chuỗi audit và sổ cái trên DB thật =====

test(
  "verifyAuditChain: chuỗi băm liền mạch là ok; sửa 1 dòng là LỘ RA ngay",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, query } = await import("@/lib/db");
    const { verifyAuditChain } = await import("@/lib/bao-mat/merkle-audit-ledger");

    await run(`DELETE FROM audit_log`);

    // Dựng chuỗi đúng luật: hash(dòng n) = sha256(hash(n-1) + entityKey + at + changes).
    // Băm phải tính trên ĐÚNG chuỗi mà lib đọc ra (`changes::text`), không phải chuỗi JSON ta
    // gửi đi: Postgres chuẩn hoá jsonb khi ép sang text (`{"n":1}` → `{"n": 1}`), lệch một dấu
    // cách là cả chuỗi gãy. Vì vậy lấy lại giá trị thật từ RETURNING rồi mới băm.
    const themDong = async (entityKey: string, changes: string, prevHash: string) => {
      const at = new Date().toISOString();
      const row = await query<{ id: number; at: string; changesText: string }>(
        `INSERT INTO audit_log (entity_type, entity_id, entity_key, action, changes, at)
         VALUES ('task', 1, ?, 'update', ?::jsonb, ?::timestamptz)
         RETURNING id, at::text AS at, changes::text AS "changesText"`,
        entityKey,
        changes,
        at,
      );
      const payload = `${prevHash}${entityKey}${row[0].at}${row[0].changesText}`;
      const hash = crypto.createHash("sha256").update(payload).digest("hex");
      await run(`UPDATE audit_log SET row_hash = ? WHERE id = ?`, hash, row[0].id);
      return hash;
    };

    let prev = "";
    for (const i of [1, 2, 3]) prev = await themDong(`task:${i}`, `{"n":${i}}`, prev);

    const ok = await verifyAuditChain();
    assert.equal(ok.total, 3);
    assert.equal(ok.checked, 3);
    assert.deepEqual(ok.errors, []);
    assert.equal(ok.ok, true);

    // Sửa lén nội dung dòng giữa mà không cập nhật băm → phải bị bắt.
    const giua = await query<{ id: number }>(
      `SELECT id FROM audit_log ORDER BY id LIMIT 1 OFFSET 1`,
    );
    await run(`UPDATE audit_log SET changes = '{"n":999}'::jsonb WHERE id = ?`, giua[0].id);

    const hong = await verifyAuditChain();
    assert.equal(hong.ok, false);
    assert.ok(
      hong.errors.some((e) => e.id === giua[0].id),
      "dòng bị sửa phải nằm trong danh sách lỗi",
    );
    await run(`DELETE FROM audit_log`);
  },
);

test(
  "verifyAuditChain: dòng chưa có băm được bỏ qua và RESET chuỗi, không tính là lỗi",
  { skip: !HAS_TEST_DB },
  async () => {
    // Dữ liệu cũ (trước khi bật ký băm) có row_hash NULL. Nếu coi đó là lỗi thì mọi lần
    // kiểm sẽ đỏ vĩnh viễn và cảnh báo thật bị chìm trong nhiễu.
    const { run, query } = await import("@/lib/db");
    const { verifyAuditChain } = await import("@/lib/bao-mat/merkle-audit-ledger");

    await run(`DELETE FROM audit_log`);
    await run(
      `INSERT INTO audit_log (entity_type, entity_id, entity_key, action, changes, at)
       VALUES ('task', 1, 'task:cu', 'update', '{"cu":1}'::jsonb, NOW())`,
    );
    const sau = await query<{ id: number; at: string; changesText: string }>(
      `INSERT INTO audit_log (entity_type, entity_id, entity_key, action, changes, at)
       VALUES ('task', 2, 'task:moi', 'update', '{"moi":1}'::jsonb, NOW())
       RETURNING id, at::text AS at, changes::text AS "changesText"`,
    );
    // Chuỗi RESET sau dòng NULL → prevHash rỗng.
    const hash = crypto
      .createHash("sha256")
      .update(`task:moi${sau[0].at}${sau[0].changesText}`)
      .digest("hex");
    await run(`UPDATE audit_log SET row_hash = ? WHERE id = ?`, hash, sau[0].id);

    const kq = await verifyAuditChain();
    assert.equal(kq.total, 2, "đếm cả dòng chưa băm");
    assert.equal(kq.checked, 1, "chỉ kiểm dòng có băm");
    assert.equal(kq.ok, true);
    await run(`DELETE FROM audit_log`);
  },
);

test("verifyAuditChain: bảng rỗng là hợp lệ, không phải lỗi", { skip: !HAS_TEST_DB }, async () => {
  const { run } = await import("@/lib/db");
  const { verifyAuditChain } = await import("@/lib/bao-mat/merkle-audit-ledger");
  await run(`DELETE FROM audit_log`);
  assert.deepEqual(await verifyAuditChain(), { total: 0, checked: 0, errors: [], ok: true });
});

test(
  "createAndSealMerkleBatch: nối previous_root thành chuỗi, seal lại cùng mã batch thì GHI ĐÈ",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { createAndSealMerkleBatch, listMerkleRoots, getMerkleRoot } =
      await import("@/lib/bao-mat/merkle-audit-ledger");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test merkle ledger')`);
    await run(`DELETE FROM engineering_merkle_roots WHERE project_id = ?`, projectId);

    const dot1 = await createAndSealMerkleBatch(projectId, "dot-1", [{ a: 1 }, { b: 2 }], {
      nguon: "test",
    });
    assert.equal(dot1.tree.leafCount, 2);
    assert.equal(dot1.record.previous_root, null, "đợt đầu tiên chưa có root trước");
    assert.match(dot1.record.signature_token, /^SIG-MERKLE-DOT-1-/);
    assert.deepEqual(dot1.record.metadata, { nguon: "test" });

    const dot2 = await createAndSealMerkleBatch(projectId, "dot-2", [{ c: 3 }]);
    assert.equal(
      dot2.record.previous_root,
      dot1.record.merkle_root,
      "đợt sau phải móc vào root của đợt trước",
    );
    assert.deepEqual(dot2.record.metadata, {}, "không truyền metadata thì lưu object rỗng");

    // Seal lại cùng batch_code với dữ liệu khác → cập nhật tại chỗ, không đẻ dòng thứ hai.
    const dot2b = await createAndSealMerkleBatch(projectId, "dot-2", [{ c: 3 }, { d: 4 }]);
    assert.notEqual(dot2b.record.merkle_root, dot2.record.merkle_root);
    assert.equal(dot2b.record.leaf_count, 2);

    const ds = await listMerkleRoots(projectId);
    assert.equal(ds.length, 2, "vẫn chỉ 2 batch: dot-1 và dot-2");
    assert.equal((await getMerkleRoot(projectId, "dot-2"))?.merkle_root, dot2b.record.merkle_root);
    assert.equal(await getMerkleRoot(projectId, "khong-co"), undefined);

    // limit chặn đúng số dòng trả về.
    assert.equal((await listMerkleRoots(projectId, 1)).length, 1);
  },
);
