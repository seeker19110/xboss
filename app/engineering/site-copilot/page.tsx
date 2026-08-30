"use client";

import { useState, useEffect, useCallback } from "react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import { Skeleton } from "@/app/components/Skeleton";
import {
  Send,
  Bot,
  KeyRound,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Search,
  RefreshCw,
  Sparkles,
  Smartphone,
  MessageSquare,
  Volume2,
} from "lucide-react";

interface MessageLog {
  id: string;
  chatId: number;
  messageType: string;
  rawText: string;
  parsedIntent: string;
  actionResult: Record<string, any>;
  status: string;
  createdAt: string;
  userName: string | null;
}

export default function SiteCopilotPage() {
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<
    Array<{ sender: "user" | "bot"; text: string; time: string; intent?: string }>
  >([
    {
      sender: "bot",
      text: "Xin chào! Tôi là Trợ Lý Hiện Trường XBoss (Telegram & Voice Copilot). Bạn có thể thử gửi các lệnh cập nhật tiến độ, báo cáo sự cố hoặc ghi nhật ký bằng giọng nói/tin nhắn.",
      time: new Date().toLocaleTimeString("vi-VN"),
    },
  ]);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // OTP State
  const [otp, setOtp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generatingOtp, setGeneratingOtp] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      setLoadingLogs(true);
      const res = await fetch("/api/telegram/simulate-voice");
      if (res.ok) {
        const d = await res.json();
        setLogs(d.data || []);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleGenerateOtp = async () => {
    try {
      setGeneratingOtp(true);
      const res = await fetch("/api/telegram/link-otp", { method: "POST" });
      if (res.ok) {
        const d = await res.json();
        setOtp(d.otp);
      }
    } catch {
      // Ignore
    } finally {
      setGeneratingOtp(false);
    }
  };

  const handleCopyOtp = () => {
    if (!otp) return;
    navigator.clipboard.writeText(`/link ${otp}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    const userMsg = {
      sender: "user" as const,
      text,
      time: new Date().toLocaleTimeString("vi-VN"),
    };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText("");

    setSubmitting(true);
    try {
      const res = await fetch("/api/telegram/simulate-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (res.ok) {
        const d = await res.json();
        const botReply = {
          sender: "bot" as const,
          text: d.data?.replyText || "Đã nhận lệnh.",
          intent: d.data?.parsedIntent,
          time: new Date().toLocaleTimeString("vi-VN"),
        };
        setMessages((prev) => [...prev, botReply]);
        await fetchLogs();
      }
    } catch {
      // Ignore
    } finally {
      setSubmitting(false);
    }
  };

  const QUICK_PROMPTS = [
    { label: "Cập nhật tiến độ task A1.02 đạt 85%", text: "Cập nhật tiến độ task A1.02 đạt 85%" },
    {
      label: "Báo sự cố rò rỉ nước phòng bơm",
      text: "Báo cáo sự cố rò rỉ nước tại phòng bơm tầng hầm mức độ khẩn cấp",
    },
    {
      label: "Ghi nhật ký thi công ngày",
      text: "Hôm nay 15 công nhân hoàn thành lắp đặt tuyến ống gió tầng 8",
    },
    { label: "Tra cứu tồn kho ty ren M12", text: "Tra cứu tồn kho ty ren M12" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-6">
        <EngineeringNav />

        {/* Tiêu đề */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Site Telegram Gateway & Field Voice Copilot (M76)
            </h1>
            <p className="text-xs text-zinc-400">
              Trợ lý công trường 2 chiều: Cập nhật tiến độ WBS, ghi nhật ký và báo cáo sự cố tức
              thời bằng giọng nói & Telegram
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Cột Trái: Liên Kết Telegram & Console Chat Simulator */}
          <div className="space-y-4 lg:col-span-2">
            {/* Thẻ Liên Kết Telegram */}
            <div className="rounded-xl border border-violet-800/40 bg-gradient-to-r from-violet-950/30 to-zinc-900 p-4 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400">
                    <Smartphone size={20} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-zinc-200">Liên Kết Telegram Bot</h3>
                    <p className="text-[11px] text-zinc-400">
                      Gửi lệnh trực tiếp từ Telegram di động tại công trường
                    </p>
                  </div>
                </div>

                <div>
                  {!otp ? (
                    <button
                      onClick={handleGenerateOtp}
                      disabled={generatingOtp}
                      className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                    >
                      <KeyRound size={13} /> Tạo Mã OTP Liên Kết
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg border border-violet-700 bg-zinc-900 px-3 py-1 font-mono text-sm font-bold text-violet-300">
                        {otp}
                      </div>
                      <button
                        onClick={handleCopyOtp}
                        className="flex items-center gap-1 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
                      >
                        {copied ? (
                          <Check size={13} className="text-emerald-400" />
                        ) : (
                          <Copy size={13} />
                        )}
                        {copied ? "Đã copy" : "Copy cú pháp"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Khung Chat Trợ Lý Ảo Hiện Trường */}
            <div className="flex h-[460px] flex-col rounded-xl border border-zinc-800 bg-zinc-900/80 shadow-inner">
              {/* Header Chat */}
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Bot size={16} className="text-violet-400" />
                  <span className="text-xs font-bold text-zinc-200">
                    XBoss Site Voice & Chat Simulator
                  </span>
                </div>
                <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>{" "}
                  Sẵn sàng nhận lệnh
                </span>
              </div>

              {/* Messages Container */}
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs shadow-sm ${
                        m.sender === "user"
                          ? "bg-violet-600 text-white rounded-br-none"
                          : "bg-zinc-800 text-zinc-200 border border-zinc-700/60 rounded-bl-none"
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                      {m.intent && m.intent !== "UNKNOWN" && (
                        <div className="mt-1.5 flex items-center gap-1 border-t border-zinc-700/50 pt-1 text-[10px] text-violet-300">
                          <Sparkles size={11} />
                          <span>Intent: {m.intent}</span>
                        </div>
                      )}
                    </div>
                    <span className="mt-1 text-[10px] text-zinc-500">{m.time}</span>
                  </div>
                ))}
              </div>

              {/* Gợi Ý Lệnh Nhanh */}
              <div className="flex flex-wrap gap-1.5 border-t border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
                {QUICK_PROMPTS.map((qp, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(qp.text)}
                    className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-violet-700 hover:text-violet-300"
                  >
                    {qp.label}
                  </button>
                ))}
              </div>

              {/* Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2 border-t border-zinc-800 p-2.5"
              >
                <input
                  type="text"
                  placeholder="Nhập hoặc nói lệnh hiện trường (VD: Cập nhật tiến độ task A1.01 90%)..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-200 focus:border-violet-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={submitting || !inputText.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  <Send size={14} />
                </button>
              </form>
            </div>
          </div>

          {/* Cột Phải: Sổ Nhật Ký Tin Nhắn Hiện Trường (Audit Logs) */}
          <div className="space-y-4 lg:col-span-1">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-zinc-400" />
                  <h3 className="text-xs font-semibold text-zinc-200">
                    Nhật Ký Lệnh Hiện Trường ({logs.length})
                  </h3>
                </div>
                <button onClick={fetchLogs} className="text-zinc-500 hover:text-zinc-300">
                  <RefreshCw size={12} />
                </button>
              </div>

              {loadingLogs ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                  ))}
                </div>
              ) : logs.length === 0 ? (
                <p className="py-8 text-center text-xs text-zinc-500">
                  Chưa có tin nhắn/lệnh thoại nào được gửi
                </p>
              ) : (
                <div className="max-h-[500px] space-y-2 overflow-y-auto pr-1">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-semibold text-violet-400">
                          {log.parsedIntent || "UNKNOWN"}
                        </span>
                        <span className="text-zinc-500">
                          {new Date(log.createdAt).toLocaleTimeString("vi-VN")}
                        </span>
                      </div>

                      <p className="mt-1 font-medium text-zinc-200">&ldquo;{log.rawText}&rdquo;</p>

                      {log.actionResult?.summary && (
                        <p className="mt-1 text-[11px] text-emerald-400">
                          ✓ {log.actionResult.summary}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
