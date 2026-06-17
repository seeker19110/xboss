'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Circle, ChevronRight, Loader2 } from 'lucide-react';

type Lesson = {
  id: number;
  title: string;
  description_vi: string;
  level: string;
  sort_order: number;
  completed: boolean;
  score: number | null;
  total: number | null;
};

const LEVEL_BADGE: Record<string, { label: string; color: string }> = {
  beginner:     { label: 'Cơ bản',     color: 'bg-emerald-400/10 text-emerald-400' },
  intermediate: { label: 'Trung cấp', color: 'bg-amber-400/10 text-amber-400' },
  advanced:     { label: 'Nâng cao',  color: 'bg-rose-400/10 text-rose-400' },
};

export default function GrammarListPage() {
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/eng/grammar')
      .then(r => {
        if (r.status === 401) { router.replace('/eng/dang-nhap'); return null; }
        return r.json();
      })
      .then(data => { if (data) setLessons(data.lessons ?? []); })
      .finally(() => setLoading(false));
  }, [router]);

  const done = lessons.filter(l => l.completed).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-indigo-400" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Bài học Ngữ pháp</h1>
        <p className="text-zinc-400 text-sm mt-0.5">
          {done}/{lessons.length} bài đã hoàn thành
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-zinc-800 rounded-full h-2">
        <div
          className="bg-violet-500 h-2 rounded-full transition-all"
          style={{ width: `${lessons.length ? (done / lessons.length) * 100 : 0}%` }}
        />
      </div>

      {/* Lesson list */}
      <div className="space-y-2">
        {lessons.map((lesson, i) => {
          const badge = LEVEL_BADGE[lesson.level] ?? { label: lesson.level, color: 'bg-zinc-700 text-zinc-300' };
          const score = lesson.score != null && lesson.total ? Math.round((lesson.score / lesson.total) * 100) : null;

          return (
            <Link
              key={lesson.id}
              href={`/eng/ngu-phap/${lesson.id}`}
              className="flex items-center gap-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-all group"
            >
              <div className="shrink-0">
                {lesson.completed
                  ? <CheckCircle2 size={24} className="text-emerald-400" />
                  : <Circle size={24} className="text-zinc-600 group-hover:text-zinc-500" />
                }
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs text-zinc-500 font-medium">Bài {i + 1}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
                <h3 className="font-semibold text-zinc-100 truncate">{lesson.title}</h3>
                <p className="text-xs text-zinc-500 truncate mt-0.5">{lesson.description_vi}</p>
              </div>

              <div className="shrink-0 flex items-center gap-3">
                {score != null && (
                  <span className={`text-sm font-bold ${score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {score}%
                  </span>
                )}
                <ChevronRight size={18} className="text-zinc-600 group-hover:text-zinc-400" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
