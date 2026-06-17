'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flame, BookOpen, Brain, Star, Loader2, TrendingUp } from 'lucide-react';

type Progress = {
  vocab_total: number;
  vocab_learned: number;
  vocab_due: number;
  grammar_total: number;
  grammar_done: number;
  streak_days: number;
  avg_score: number | null;
  quiz_history: Array<{ score: number; total: number; mode: string; completed_at: string }>;
};

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-zinc-800 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const MODE_LABEL: Record<string, string> = { vocabulary: 'Từ vựng', grammar: 'Ngữ pháp', mixed: 'Hỗn hợp' };

export default function ProgressPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/eng/progress')
      .then(r => {
        if (r.status === 401) { router.replace('/eng/dang-nhap'); return null; }
        return r.json();
      })
      .then(data => { if (data) setProgress(data); })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-indigo-400" size={28} />
      </div>
    );
  }
  if (!progress) return null;

  const vocabPct = progress.vocab_total > 0 ? Math.round((progress.vocab_learned / progress.vocab_total) * 100) : 0;
  const grammarPct = progress.grammar_total > 0 ? Math.round((progress.grammar_done / progress.grammar_total) * 100) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-100">Tiến độ học tập</h1>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame size={18} className="text-orange-400" />
            <span className="text-sm text-zinc-400">Streak</span>
          </div>
          <div className="text-3xl font-bold text-zinc-100">{progress.streak_days}</div>
          <p className="text-xs text-zinc-500 mt-0.5">ngày liên tiếp</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star size={18} className="text-amber-400" />
            <span className="text-sm text-zinc-400">Điểm TB Quiz</span>
          </div>
          <div className="text-3xl font-bold text-zinc-100">
            {progress.avg_score != null ? `${progress.avg_score}%` : '—'}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{progress.quiz_history.length} bài đã làm</p>
        </div>
      </div>

      {/* Vocabulary progress */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-sky-400" />
            <h3 className="font-semibold text-zinc-100">Từ vựng</h3>
          </div>
          <span className="text-sm font-bold text-sky-400">{vocabPct}%</span>
        </div>
        <Bar value={progress.vocab_learned} max={progress.vocab_total} color="bg-sky-500" />
        <div className="flex items-center justify-between mt-2 text-xs text-zinc-500">
          <span>{progress.vocab_learned} / {progress.vocab_total} từ đã học</span>
          {progress.vocab_due > 0 && (
            <span className="text-amber-400">{progress.vocab_due} từ cần ôn hôm nay</span>
          )}
        </div>
      </div>

      {/* Grammar progress */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-violet-400" />
            <h3 className="font-semibold text-zinc-100">Ngữ pháp</h3>
          </div>
          <span className="text-sm font-bold text-violet-400">{grammarPct}%</span>
        </div>
        <Bar value={progress.grammar_done} max={progress.grammar_total} color="bg-violet-500" />
        <p className="text-xs text-zinc-500 mt-2">{progress.grammar_done} / {progress.grammar_total} bài hoàn thành</p>
      </div>

      {/* Quiz history */}
      {progress.quiz_history.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-zinc-400" />
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
              Lịch sử kiểm tra ({progress.quiz_history.length})
            </h3>
          </div>
          <div className="space-y-2">
            {progress.quiz_history.map((q, i) => {
              const pct = q.total > 0 ? Math.round((q.score / q.total) * 100) : 0;
              return (
                <div key={i} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{MODE_LABEL[q.mode] || q.mode}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(q.completed_at).toLocaleDateString('vi-VN', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-20">
                      <Bar value={q.score} max={q.total} color={pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'} />
                    </div>
                    <span className={`text-sm font-bold w-10 text-right ${pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {progress.quiz_history.length === 0 && (
        <div className="text-center py-8 text-zinc-500">
          <TrendingUp size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Chưa có lịch sử kiểm tra</p>
          <p className="text-xs mt-1">Làm bài kiểm tra để xem tiến độ tại đây</p>
        </div>
      )}
    </div>
  );
}
