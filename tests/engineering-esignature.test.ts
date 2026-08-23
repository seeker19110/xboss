import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDocumentEnvelopeHash,
  generateCertificateCode,
  createEsignEnvelope,
  executeSignEnvelope,
  listEsignEnvelopes,
} from "@/lib/ky-thuat/engineering-esignature";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

test("M84: e-Signature Hash & Certificate Generator", () => {
  const payload = {
    scope: "Nghiệm thu lắp đặt ống gió tầng 5",
    standard: "TCVN 5687:2010",
    inspectedDate: "2026-08-20",
  };

  const hash1 = createDocumentEnvelopeHash(payload);
  const hash2 = createDocumentEnvelopeHash(payload);
  assert.equal(hash1, hash2, "Mã băm SHA-256 phải có tính xác định deterministic");
  assert.equal(hash1.length, 64, "Mã SHA-256 phải có độ dài 64 ký tự hex");

  const certCode = generateCertificateCode("BBNT");
  assert.ok(certCode.startsWith("CERT-BBNT-"));
});

test(
  "M84: e-Signature DB Lifecycle — Tạo phong bì, ký 3 bên & sinh chứng thư",
  { skip: !HAS_DB },
  async () => {
    const { insertId } = await import("@/lib/db");
    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Esignature Proj')`);

    const envelope = await createEsignEnvelope({
      projectId,
      title: "Nghiệm thu đường ống cấp nước trục đứng",
      documentType: "BBNT",
      referenceCode: "BBNT-PLUMB-01",
      documentPayload: {
        location: "Trục đứng Tầng 1 - 10",
        pressureTest: "10 bar / 24h",
        result: "PASS",
      },
      signatories: [
        { signerName: "Kỹ Sư Nhà Thầu A", signerRole: "CONTRACTOR_ENGINEER", signingOrder: 1 },
        { signerName: "Tư Vấn Giám Sát B", signerRole: "SUPERVISION_CONSULTANT", signingOrder: 2 },
      ],
    });

    assert.ok(envelope.id);
    assert.equal(envelope.status, "pending");
    assert.equal(envelope.signatories?.length, 2);

    const signer1 = envelope.signatories![0];
    const signer2 = envelope.signatories![1];

    assert.equal(signer1.status, "ready");
    assert.equal(signer2.status, "waiting");

    // Ký bên thứ 1
    const signResult1 = await executeSignEnvelope({
      projectId,
      envelopeId: envelope.id,
      signatoryId: signer1.id,
      signatureData: "SIG_DATA_CONTRACTOR_01",
    });
    assert.equal(signResult1.success, true);
    assert.equal(signResult1.isEnvelopeComplete, false);

    // Ký bên thứ 2 -> Hoàn tất hồ sơ & sinh chứng thư
    const signResult2 = await executeSignEnvelope({
      projectId,
      envelopeId: envelope.id,
      signatoryId: signer2.id,
      signatureData: "SIG_DATA_CONSULTANT_02",
    });
    assert.equal(signResult2.success, true);
    assert.equal(signResult2.isEnvelopeComplete, true);
    assert.ok(signResult2.certificateCode?.startsWith("CERT-BBNT-"));

    const list = await listEsignEnvelopes(projectId);
    assert.ok(list.length >= 1);
  },
);
