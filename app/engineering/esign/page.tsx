"use client";

import React, { useState, useEffect } from "react";
import EngineeringNav from "@/app/components/EngineeringNav";
import {
  ShieldCheck,
  FileCheck,
  Key,
  CheckCircle2,
  Clock,
  FileText,
  AlertTriangle,
  Send,
} from "lucide-react";

interface Signatory {
  id: string;
  signerName: string;
  signerRole: string;
  signingOrder: number;
  status: "waiting" | "ready" | "signed" | "rejected";
  signatureData?: string;
  signedAt?: string;
}

interface EsignEnvelope {
  id: string;
  title: string;
  documentType: string;
  referenceCode: string;
  status: "draft" | "pending" | "signed" | "rejected";
  documentHash: string;
  documentPayload: any;
  createdAt: string;
  signatories: Signatory[];
}

export default function EsignStudioPage() {
  const [envelopes, setEnvelopes] = useState<EsignEnvelope[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEnv, setSelectedEnv] = useState<EsignEnvelope | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [signStatus, setSignStatus] = useState<string | null>(null);

  // Form tạo mới
  const [newTitle, setNewTitle] = useState("Biên bản nghiệm thu lắp đặt ống gió tầng 5 Tháp A");
  const [newDocType, setNewDocType] = useState("BBNT");
  const [newRefCode, setNewRefCode] = useState("BBNT-MEPF-2026-T05");

  const fetchEnvelopes = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/engineering/esign/envelopes");
      const json = await res.json();
      if (json.success) {
        setEnvelopes(json.data);
        if (json.data.length > 0 && !selectedEnv) {
          setSelectedEnv(json.data[0]);
        }
      }
    } catch (err) {
      console.error("Lỗi tải envelopes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchEnvelopes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateEnvelope = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/engineering/esign/envelopes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          documentType: newDocType,
          referenceCode: newRefCode,
          documentPayload: {
            scope: "Hệ thống thông gió & cấp gió tươi tầng 5",
            standardRef: "TCVN 5687:2010",
            inspectedItems: 24,
            result: "ĐẠT YÊU CẦU",
            notes: "Mối nối bích kín khít, độ võng ty treo đúng tiêu chuẩn.",
          },
          signatories: [
            {
              signerName: "Nguyễn Văn Hải (Kỹ Sư Trưởng)",
              signerRole: "CONTRACTOR_ENGINEER",
              signingOrder: 1,
            },
            {
              signerName: "Trần Đình Trọng (Tư Vấn Giám Sát)",
              signerRole: "SUPERVISION_CONSULTANT",
              signingOrder: 2,
            },
            {
              signerName: "Lê Hoàng Long (Đại Diện CĐT)",
              signerRole: "CLIENT_REP",
              signingOrder: 3,
            },
          ],
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert("Khởi tạo hồ sơ trình ký điện tử thành công!");
        fetchEnvelopes();
      } else {
        alert("Lỗi: " + json.error);
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  const handleSign = async (signatory: Signatory) => {
    if (!selectedEnv) return;
    try {
      setSignStatus("Đang ký số & đóng dấu niêm phong mật mã...");
      const res = await fetch("/api/engineering/esign/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          envelopeId: selectedEnv.id,
          signatoryId: signatory.id,
          signatureData: `DIGITAL_SIG_${signatureName || signatory.signerName}_${Date.now()}`,
          otpCode: otpInput || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSignStatus(
          json.data.isEnvelopeComplete
            ? "✅ Hồ sơ đã ký số hoàn tất 100%!"
            : "✅ Đã ký thành công lượt ký này!",
        );
        fetchEnvelopes();
      } else {
        setSignStatus(`❌ Ký thất bại: ${json.error}`);
      }
    } catch (err) {
      setSignStatus("❌ Lỗi kết nối máy chủ");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-3">
              <FileCheck className="text-emerald-400" />
              Paperless Smart e-Signature & Legal PKI BBNT Studio (M84)
            </h1>
            <p className="text-sm text-zinc-400">
              Số hóa 100% quy trình ký số pháp lý cho Biên bản nghiệm thu (BBNT) và Phiếu yêu cầu
              (RFA) ngay tại công trường
            </p>
          </div>
          <span className="rounded-full bg-emerald-950/80 border border-emerald-700/50 px-3 py-1 text-xs font-semibold text-emerald-400">
            e-Sign Legal Protocol Active
          </span>
        </div>

        <EngineeringNav />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Cột trái: Form tạo & Danh sách */}
          <div className="space-y-6 lg:col-span-1">
            {/* Form tạo hồ sơ trình ký */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur-sm">
              <h2 className="mb-4 text-base font-semibold text-zinc-200 flex items-center gap-2">
                <FileText size={18} className="text-amber-400" />
                Khởi tạo Hồ sơ Trình Ký Mới
              </h2>
              <form onSubmit={handleCreateEnvelope} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Tiêu đề tài liệu</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">Loại hồ sơ</label>
                    <select
                      value={newDocType}
                      onChange={(e) => setNewDocType(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="BBNT">BBNT (Nghiệm thu)</option>
                      <option value="RFA">RFA (Phiếu YCNT)</option>
                      <option value="MATERIAL_APPROVAL">Trình mẫu vật tư</option>
                      <option value="SAFETY_PERMIT">Giấy phép an toàn</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">Mã tham chiếu</label>
                    <input
                      type="text"
                      value={newRefCode}
                      onChange={(e) => setNewRefCode(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-emerald-500"
                >
                  <Send size={16} />
                  Phát hành Hồ sơ Trình ký
                </button>
              </form>
            </div>

            {/* Danh sách Envelopes */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur-sm">
              <h2 className="mb-3 text-base font-semibold text-zinc-200">Hồ sơ Đang Lưu hành</h2>
              {loading ? (
                <div className="text-center py-6 text-sm text-zinc-500">Đang tải hồ sơ...</div>
              ) : envelopes.length === 0 ? (
                <div className="text-center py-6 text-sm text-zinc-500">
                  Chưa có hồ sơ trình ký nào.
                </div>
              ) : (
                <div className="space-y-3">
                  {envelopes.map((env) => (
                    <div
                      key={env.id}
                      onClick={() => setSelectedEnv(env)}
                      className={`cursor-pointer rounded-lg border p-3 transition-all ${
                        selectedEnv?.id === env.id
                          ? "border-emerald-500/80 bg-emerald-950/30"
                          : "border-zinc-800 bg-zinc-800/40 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-amber-400">{env.referenceCode}</span>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] ${
                            env.status === "signed"
                              ? "bg-emerald-900/60 text-emerald-300"
                              : "bg-amber-900/60 text-amber-300"
                          }`}
                        >
                          {env.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-1 text-sm font-medium text-zinc-200 line-clamp-1">
                        {env.title}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                        <span>{new Date(env.createdAt).toLocaleDateString("vi-VN")}</span>
                        <span>
                          {env.signatories?.filter((s) => s.status === "signed").length || 0}/3 chữ
                          ký
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cột phải: Chi tiết hồ sơ & Trạm ký số */}
          <div className="space-y-6 lg:col-span-2">
            {selectedEnv ? (
              <div className="space-y-6">
                {/* Header & Hash */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="rounded bg-zinc-800 px-2.5 py-1 text-xs font-mono text-emerald-400">
                        {selectedEnv.documentType}
                      </span>
                      <h2 className="mt-2 text-xl font-bold text-zinc-100">{selectedEnv.title}</h2>
                      <div className="mt-1 text-xs text-zinc-400 font-mono">
                        Mã băm SHA-256 niêm phong:{" "}
                        <span className="text-zinc-300">{selectedEnv.documentHash}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                          selectedEnv.status === "signed"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : "bg-amber-950 text-amber-400 border border-amber-800"
                        }`}
                      >
                        {selectedEnv.status === "signed" ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <Clock size={14} />
                        )}
                        {selectedEnv.status === "signed" ? "ĐÃ HOÀN TẤT KÝ SỐ" : "ĐANG CHỜ KÝ"}
                      </span>
                    </div>
                  </div>

                  {/* Nội dung nghiệm thu */}
                  <div className="mt-4 rounded-lg bg-zinc-950/70 p-4 border border-zinc-800/80 font-mono text-xs text-zinc-300 space-y-1">
                    <div>
                      <strong className="text-zinc-400">Phạm vi nghiệm thu:</strong>{" "}
                      {selectedEnv.documentPayload?.scope}
                    </div>
                    <div>
                      <strong className="text-zinc-400">Tiêu chuẩn áp dụng:</strong>{" "}
                      {selectedEnv.documentPayload?.standardRef}
                    </div>
                    <div>
                      <strong className="text-zinc-400">Kết quả đánh giá:</strong>{" "}
                      <span className="text-emerald-400 font-bold">
                        {selectedEnv.documentPayload?.result}
                      </span>
                    </div>
                    <div>
                      <strong className="text-zinc-400">Ghi chú hiện trường:</strong>{" "}
                      {selectedEnv.documentPayload?.notes}
                    </div>
                  </div>
                </div>

                {/* Luồng ký số 3 bên */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                  <h3 className="mb-4 text-base font-semibold text-zinc-200 flex items-center gap-2">
                    <Key size={18} className="text-amber-400" />
                    Tiến Trình Ký Số 3 Bên (Signing Workflow)
                  </h3>
                  <div className="space-y-4">
                    {selectedEnv.signatories?.map((s, idx) => (
                      <div
                        key={s.id}
                        className={`rounded-lg border p-4 transition-all ${
                          s.status === "signed"
                            ? "border-emerald-800/60 bg-emerald-950/20"
                            : s.status === "ready"
                              ? "border-amber-700/80 bg-amber-950/20"
                              : "border-zinc-800/80 bg-zinc-950/40 opacity-70"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">
                              {s.signingOrder}
                            </span>
                            <div>
                              <div className="text-sm font-semibold text-zinc-100">
                                {s.signerName}
                              </div>
                              <div className="text-xs text-zinc-400 font-mono">{s.signerRole}</div>
                            </div>
                          </div>
                          <div>
                            {s.status === "signed" ? (
                              <div className="text-right">
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-950 px-2 py-0.5 text-xs text-emerald-400 font-semibold">
                                  <CheckCircle2 size={12} /> Đã Ký Số
                                </span>
                                <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                  {new Date(s.signedAt || "").toLocaleString("vi-VN")}
                                </div>
                              </div>
                            ) : s.status === "ready" ? (
                              <span className="rounded bg-amber-950 px-2 py-0.5 text-xs text-amber-400 font-semibold">
                                Đến Lượt Ký
                              </span>
                            ) : (
                              <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                                Chờ lượt trước
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Trạm ký tức thời cho người ở trạng thái Ready */}
                        {s.status === "ready" && (
                          <div className="mt-4 rounded-lg bg-zinc-900 border border-zinc-700/60 p-4 space-y-3">
                            <div className="text-xs font-semibold text-amber-300">
                              ✍️ Xác nhận Ký số Điện tử cho: {s.signerName}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <input
                                type="text"
                                placeholder="Họ tên người ký xác thực"
                                value={signatureName}
                                onChange={(e) => setSignatureName(e.target.value)}
                                className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                              />
                              <input
                                type="text"
                                placeholder="Mã OTP SMS/SmartCA (nếu có)"
                                value={otpInput}
                                onChange={(e) => setOtpInput(e.target.value)}
                                className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                              />
                            </div>
                            <button
                              onClick={() => handleSign(s)}
                              className="w-full rounded bg-emerald-700 py-2 text-xs font-bold text-on-accent hover:bg-emerald-500 transition-colors"
                            >
                              Ký Số & Đóng Dấu Điện Tử
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {signStatus && (
                    <div className="mt-4 rounded bg-zinc-800/80 p-3 text-xs text-center font-medium text-zinc-200 border border-zinc-700">
                      {signStatus}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-96 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 text-sm text-zinc-500">
                Chọn một hồ sơ trình ký bên trái để xem chi tiết và ký số
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
