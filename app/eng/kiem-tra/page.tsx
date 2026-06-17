'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, Play, RotateCcw } from 'lucide-react';

type QuizItem = {
  id: number;
  question: string;
  options: string[];
  type: string;
};

type SubmitResult = {
  score: number;
  total: number;
  items: Array<{ id: number; correct_answer: string; user_answer: string; is_correct: boolean }>;
};

type Mode = 'vocabulary' | 'grammar' | 'mixed';
type Phase = 'setup' | 'playing' | 'result';

const MODE_OPTIONS: Array<{ value: Mode; label: string; desc: string; emoji: string }> = [
  { value: 'vocabulary', label: 'Từ vựng', desc: 'Câu hỏi về nghĩa của từ', emoji: '📖' },
  { value: 'grammar', label: 'Ngữ pháp', desc: 'Bài tập ngữ pháp đã học', emoji: '✏️' },
  { value: 'mixed', label: 'Hỗn hợp', desc: 'Kết hợp từ vựng + ngữ pháp', emoji: '🎯' },
];

const COUNT_OPTIONS = [5, 10, 20];

export default function QuizPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('setup');
  const [mode, setMode] = useState<Mode>('mixed');
  const [count, setCount] = useState(10);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [items, setItems] = useState<QuizItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    fetch('/api/eng/auth/me').then(r => { if (r.status === 401) router.replace('/eng/dang-nhap'); });
  }, [router]);

  async function startQuiz() {
    setLoading(true);
    try {
      const r = await fetch('/api/eng/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, count }),
      });
      if (!r.ok) { alert('Không thể tạo bài kiểm tra. Thử lại sau.'); return; }
      const data = await r.json();
      setSessionId(data.sessionId);
      setItems(data.items);
      setCurrent(0);
      setAnswers({});
      setResult(null);
      setSelected(null);
      setShowFeedback(false);
      setPhase('playing');
    } finally {
      setLoading(false);
    }
  }

  function selectAnswer(opt: string) {
    if (showFeedback) return;
    const item = items[current];
    if (!item) return;
    setSelected(opt);
    setAnswers(a => ({ ...a, [item.id]: opt }));
    setShowFeedback(true);
  }

  function nextQuestion() {
    setShowFeedback(false);
    setSelected(null);
    if (current + 1 < items.length) {
      setCurrent(c => c + 1);
    } else {
      submitQuiz();
    }
  }

  async function submitQuiz() {
    if (!sessionId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/eng/quiz/${sessionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await r.json();
      setResult(data);
      setPhase('result');
    } finally {
      setLoading(false);
    }
  }

  if (phase === 'setup') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Kiểm tra</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Chọn loại bài kiểm tra và số câu hỏi</p>
        </div>

        <div>
          <p className="text-sm font-medium text-zinc-300 mb-3">Loại bài kiểm tra</p>
          <div className="space-y-2">
            {MODE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className={`w-full flex items-center gap-4 p-4 border rounded-xl transition-all text-left ${
                  mode === opt.value
                    ? 'bg-indigo-600/20 border-indigo-500 text-zinc-100'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700'
                }`}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <div>
                  <p className="font-semibold">{opt.label}</p>
                  <p className="text-xs text-zinc-400">{opt.desc}</p>
                </div>
                {mode === opt.value && (
                  <CheckCircle2 size={18} className="ml-auto text-indigo-400" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-zinc-300 mb-3">Số câu hỏi</p>
          <div className="flex gap-3">
            {COUNT_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`flex-1 py-3 rounded-xl border font-semibold transition-all ${
                  count === n
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={startQuiz}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold py-4 rounded-xl transition-colors text-base"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
          Bắt đầu kiểm tra
        </button>
      </div>
    );
  }

  if (phase === 'playing') {
    const item = items[current];
    if (!item) return null;
    const progress = ((current) / items.length) * 100;

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">Câu {current + 1} / {items.length}</span>
          <button
            onClick={() => setPhase('setup')}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Thoát
          </button>
        </div>

        {/* Progress */}
        <div className="w-full bg-zinc-800 rounded-full h-2">
          <div
            className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Question */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 min-h-[120px] flex items-center justify-center">
          <p className="text-center text-lg font-semibold text-zinc-100 leading-relaxed">
            {item.question}
          </p>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 gap-2">
          {item.options.map(opt => {
            let optClass = 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700';
            if (showFeedback) {
              optClass = 'bg-zinc-900 border-zinc-800 text-zinc-500 cursor-not-allowed';
            }
            if (selected === opt && showFeedback) {
              optClass = 'bg-indigo-600/20 border-indigo-500 text-zinc-100';
            }

            return (
              <button
                key={opt}
                onClick={() => selectAnswer(opt)}
                disabled={showFeedback}
                className={`w-full flex items-center gap-3 border rounded-xl px-4 py-3.5 text-sm text-left transition-all ${optClass}`}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {/* Next button */}
        {showFeedback && (
          <button
            onClick={nextQuestion}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-colors"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : null}
            {current + 1 < items.length ? 'Câu tiếp theo →' : 'Xem kết quả'}
          </button>
        )}
      </div>
    );
  }

  if (phase === 'result' && result) {
    const score = Math.round((result.score / result.total) * 100);
    const correct = result.items.filter(i => i.is_correct).length;
    const wrong = result.items.filter(i => !i.is_correct);

    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-zinc-100">Kết quả kiểm tra</h1>

        {/* Score */}
        <div className={`rounded-2xl p-8 border text-center ${
          score >= 80 ? 'bg-emerald-400/10 border-emerald-400/30'
          : score >= 50 ? 'bg-amber-400/10 border-amber-400/30'
          : 'bg-rose-400/10 border-rose-400/30'
        }`}>
          <div className={`text-6xl font-bold mb-2 ${
            score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-rose-400'
          }`}>
            {score}%
          </div>
          <p className="text-zinc-300">
            {correct} / {result.total} câu đúng
          </p>
          <p className="text-zinc-400 text-sm mt-1">
            {score >= 80 ? '🎉 Xuất sắc!' : score >= 60 ? '👍 Khá tốt!' : '💪 Cần cố gắng thêm!'}
          </p>
        </div>

        {/* Wrong answers */}
        {wrong.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
              <XCircle size={14} className="text-rose-400" />
              Câu trả lời sai ({wrong.length})
            </h2>
            <div className="space-y-2">
              {wrong.map((item, i) => {
                const q = items.find(it => it.id === item.id);
                return (
                  <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <p className="text-sm text-zinc-300 mb-2">{q?.question}</p>
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="text-rose-400">✗ Bạn chọn: {item.user_answer}</span>
                      <span className="text-emerald-400">✓ Đáp án đúng: {item.correct_answer}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => { setPhase('setup'); setResult(null); }}
            className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium py-3 rounded-xl transition-colors"
          >
            <RotateCcw size={16} />
            Làm lại
          </button>
          <button
            onClick={startQuiz}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-medium py-3 rounded-xl transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Bài mới
          </button>
        </div>
      </div>
    );
  }

  return null;
}
