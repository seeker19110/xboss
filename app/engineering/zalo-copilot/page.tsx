"use client";

import React, { useState } from "react";
import EngineeringNav from "@/app/components/EngineeringNav";
import { MessageSquare, Bot, Send, Key, CheckCircle, ShieldAlert, Sparkles } from "lucide-react";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  intent?: string;
  time: string;
}

export default function ZaloCopilotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      sender: "bot",
      text: "Xin chào! Tôi là Trợ lý Hiện trường Zalo XBoss. Bạn có thể gửi báo cáo sản lượng, báo lỗi NCR, tra cứu vật tư hoặc yêu cầu nghiệm thu.",
      time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [otpCode, setOtpCode] = useState<string | null>(null);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text,
      time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText("");

    try {
      setSending(true);
      const res = await fetch("/api/zalo/simulate-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          zaloUserId: "ZALO_SITE_FOREMAN_01",
        }),
      });
      const json = await res.json();
      if (json.success) {
        const botMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: "bot",
          text: json.data.replyText,
          intent: json.data.intent,
          time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, botMsg]);
      }
    } catch (err) {
      console.error("Lỗi gửi tin:", err);
    } finally {
      setSending(false);
    }
  };

  const handleGenerateOtp = async () => {
    try {
      const res = await fetch("/api/zalo/link-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const json = await res.json();
      if (json.success) {
        setOtpCode(json.data.otpCode);
      }
    } catch (err) {
      alert("Lỗi tạo mã OTP");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-3">
              <MessageSquare className="text-blue-400" />
              Smart Zalo Field Copilot & Interactive Gateway (M86)
            </h1>
            <p className="text-sm text-zinc-400">
              Cổng tương tác 2 chiều thích ứng văn hóa công trường Việt Nam qua Zalo Webhook & Voice
              Intent Parser
            </p>
          </div>
          <span className="rounded-full bg-blue-950/80 border border-blue-700/50 px-3 py-1 text-xs font-semibold text-blue-400">
            Zalo Gateway Active
          </span>
        </div>

        <EngineeringNav />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Cột trái: Trạm kết nối OTP & Mẫu lệnh nhanh */}
          <div className="space-y-6 lg:col-span-1">
            {/* Thẻ liên kết OTP Zalo */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur-sm">
              <h2 className="mb-3 text-base font-semibold text-zinc-200 flex items-center gap-2">
                <Key size={18} className="text-amber-400" />
                Liên Kết Tài Khoản Zalo Công Trường
              </h2>
              <p className="text-xs text-zinc-400 mb-4">
                Sinh mã OTP để cấp quyền cho tài khoản Zalo của Kỹ sư / Đội trưởng thầu phụ cập nhật
                tiến độ từ xa.
              </p>
              <button
                onClick={handleGenerateOtp}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition-colors"
              >
                Tạo Mã OTP Liên Kết Zalo (15 phút)
              </button>
              {otpCode && (
                <div className="mt-3 rounded bg-zinc-800 border border-amber-500/50 p-3 text-center">
                  <div className="text-xs text-zinc-400">Mã xác thực của bạn:</div>
                  <div className="text-2xl font-mono font-bold text-amber-400 tracking-widest">
                    {otpCode}
                  </div>
                </div>
              )}
            </div>

            {/* Mẫu câu lệnh tiếng Việt thông dụng */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur-sm">
              <h2 className="mb-3 text-base font-semibold text-zinc-200 flex items-center gap-2">
                <Sparkles size={18} className="text-amber-400" />
                Mẫu Câu Lệnh Hiện Trường
              </h2>
              <div className="space-y-2">
                {[
                  "Báo cáo hôm nay tầng 8 kéo xong 400 mét cáp điện",
                  "Tầng 5 trục A-B lắp được 85 m2 ống gió tôn",
                  "Tạo NCR đội ống nước làm ẩu gây rỉ nước",
                  "Tra cứu mã vật tư DUCT-ISO-08 còn tồn bao nhiêu",
                  "Lập phiếu nghiệm thu BBNT tầng 6",
                ].map((sample, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(sample)}
                    className="w-full text-left rounded border border-zinc-800 bg-zinc-800/40 p-2.5 text-xs text-zinc-300 hover:border-blue-500/60 hover:bg-zinc-800 transition-all"
                  >
                    💬 &ldquo;{sample}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cột phải: Khung chat mô phỏng Zalo tương tác */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur-sm flex flex-col h-[560px] lg:col-span-2">
            <div className="border-b border-zinc-800 pb-3 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-bold text-zinc-200">
                  Zalo Bot Simulator • Kỹ sư Hiện trường
                </span>
              </div>
              <span className="text-xs text-zinc-500 font-mono">
                NLP Engine: Tiếng Việt Xây Dựng
              </span>
            </div>

            {/* Vùng tin nhắn */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-md rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                      msg.sender === "user"
                        ? "bg-blue-600 text-white rounded-br-none"
                        : "bg-zinc-800 text-zinc-200 border border-zinc-700/60 rounded-bl-none"
                    }`}
                  >
                    {msg.text}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500 font-mono px-1">
                    <span>{msg.time}</span>
                    {msg.intent && <span className="text-amber-400">[{msg.intent}]</span>}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="text-left text-xs text-zinc-500 italic">
                  Zalo Bot đang phân tích intent...
                </div>
              )}
            </div>

            {/* Input gửi tin */}
            <div className="border-t border-zinc-800 pt-3 mt-3 flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Nhập tin nhắn tiếng Việt hoặc chọn mẫu lệnh..."
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={sending}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Send size={14} />
                Gửi
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
