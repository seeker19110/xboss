'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Brain, CheckSquare, BarChart2, Flame, Star, LogOut, Loader2 } from 'lucide-react';

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

type User = { name: string; email: string; level: string };

function pct(a: number, b: number) { return b > 0 ? Math.round((a / b) * 100) : 0; }

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/eng/auth/me').then(r => r.ok ? r.json() : null),
      fetch('/api/eng/progress').then(r => r.ok ? r.json() : null),
    ]).then(([u, p]) => {
      if (!u) { router.replace('/eng/dang-nhap'); return; }
      setUser(u.user);
      setProgress(p);
    }).finally(() => setLoading(false));
  }, [router]);

  async function logout() {
    await fetch('/api/eng/auth/logout', { method: 'POST' });
    router.push('/eng');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-indigo-400" size={32} />
      </div>
    );
  }
  if (!user) return null;

  const levelLabel: Record<string, string> = { beginner: 'Mới bắt đầu', intermediate: 'Trung cấp', advanced: 'Nâng cao' };

  return (
    <div className="space-y-6">
      {/* User greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            Xin chào, {user.name.split(' ').pop()}! 👋
          </h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            Trình độ: <span className="text-indigo-400">{levelLabel[user.level] || user.level}</span>
          </p>
        </div>
        <button
          onClick={logout}
          className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
          title="Đăng xuất"
        >
          <LogOut size={18} />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Flame size={18} className="text-orange-400" />
            <span className="text-2xl font-bold text-zinc-100">{progress?.streak_days ?? 0}</span>
          </div>
          <p className="text-xs text-zinc-500">Ngày liên tiếp</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-zinc-100 mb-1">{progress?.vocab_learned ?? 0}</div>
          <p className="text-xs text-zinc-500">Từ đã học</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Star size={16} className="text-amber-400" />
            <span className="text-2xl font-bold text-zinc-100">
              {progress?.avg_score != null ? `${progress.avg_score}%` : '—'}
            </span>
          </div>
          <p className="text-xs text-zinc-500">Điểm trung bình</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/eng/tu-vung" className="group bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-sky-500/40 rounded-xl p-5 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-sky-400/10 text-sky-400 p-2.5 rounded-lg group-hover:bg-sky-400/20 transition-colors">
              <BookOpen size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-100">Từ vựng</h3>
              {progress && (
                <p className="text-xs text-zinc-500">
                  {progress.vocab_due > 0
                    ? <span className="text-amber-400 font-medium">{progress.vocab_due} từ cần ôn</span>
                    : 'Đã ôn xong hôm nay ✓'}
                </p>
              )}
            </div>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5">
            <div
              className="bg-sky-400 h-1.5 rounded-full transition-all"
              style={{ width: `${pct(progress?.vocab_learned ?? 0, progress?.vocab_total ?? 1)}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500 mt-1.5">
            {progress?.vocab_learned ?? 0} / {progress?.vocab_total ?? 0} từ đã học
          </p>
        </Link>

        <Link href="/eng/ngu-phap" className="group bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-violet-500/40 rounded-xl p-5 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-violet-400/10 text-violet-400 p-2.5 rounded-lg group-hover:bg-violet-400/20 transition-colors">
              <Brain size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-100">Ngữ pháp</h3>
              <p className="text-xs text-zinc-500">{progress?.grammar_done ?? 0} / {progress?.grammar_total ?? 0} bài hoàn thành</p>
            </div>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5">
            <div
              className="bg-violet-400 h-1.5 rounded-full transition-all"
              style={{ width: `${pct(progress?.grammar_done ?? 0, progress?.grammar_total ?? 1)}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500 mt-1.5">
            {pct(progress?.grammar_done ?? 0, progress?.grammar_total ?? 1)}% hoàn thành
          </p>
        </Link>

        <Link href="/eng/kiem-tra" className="group bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/40 rounded-xl p-5 transition-all">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-400/10 text-emerald-400 p-2.5 rounded-lg group-hover:bg-emerald-400/20 transition-colors">
              <CheckSquare size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-100">Kiểm tra</h3>
              <p className="text-xs text-zinc-500">Làm bài kiểm tra ngay</p>
            </div>
          </div>
        </Link>

        <Link href="/eng/tien-do" className="group bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/40 rounded-xl p-5 transition-all">
          <div className="flex items-center gap-3">
            <div className="bg-amber-400/10 text-amber-400 p-2.5 rounded-lg group-hover:bg-amber-400/20 transition-colors">
              <BarChart2 size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-100">Tiến độ</h3>
              <p className="text-xs text-zinc-500">Xem kết quả chi tiết</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Recent quizzes */}
      {progress && progress.quiz_history.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Kiểm tra gần đây</h2>
          <div className="space-y-2">
            {progress.quiz_history.slice(0, 3).map((q, i) => {
              const score = q.total > 0 ? Math.round((q.score / q.total) * 100) : 0;
              const modeLabel: Record<string, string> = { vocabulary: 'Từ vựng', grammar: 'Ngữ pháp', mixed: 'Hỗn hợp' };
              return (
                <div key={i} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                  <div>
                    <span className="text-sm text-zinc-300">{modeLabel[q.mode] || q.mode}</span>
                    <p className="text-xs text-zinc-500">
                      {new Date(q.completed_at).toLocaleDateString('vi-VN')}
                    </p>
                  </div>
                  <div className={`text-lg font-bold ${score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {score}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
