'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, CheckCircle2, XCircle, Loader2, Send } from 'lucide-react';

type Exercise = {
  id: number;
  question: string;
  options: string[];
  answer: string;
  explanation_vi: string;
  sort_order: number;
};

type Lesson = {
  id: number;
  title: string;
  content_vi: string;
  level: string;
  exercises: Exercise[];
  progress: { score: number; total: number } | null;
};

type Result = { id: number; correct: boolean; explanation_vi: string };

export default function GrammarLessonPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Result[] | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/eng/grammar/${id}`)
      .then(r => {
        if (r.status === 401) { router.replace('/eng/dang-nhap'); return null; }
        return r.json();
      })
      .then(data => { if (data) setLesson(data.lesson); })
      .finally(() => setLoading(false));
  }, [id, router]);

  async function handleSubmit() {
    if (!lesson) return;
    const unanswered = lesson.exercises.filter(e => !answers[e.id]);
    if (unanswered.length > 0) {
      alert(`Bạn chưa trả lời ${unanswered.length} câu hỏi.`);
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/eng/grammar/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await r.json();
      setResults(data.results);
      setScore(Math.round((data.score / data.total) * 100));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-indigo-400" size={28} />
      </div>
    );
  }
  if (!lesson) return <p className="text-zinc-400">Không tìm thấy bài học.</p>;

  const resultMap = new Map(results?.map(r => [r.id, r]) ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/eng/ngu-phap" className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">{lesson.title}</h1>
          {lesson.progress && (
            <p className="text-xs text-zinc-500 mt-0.5">
              Kết quả cũ: {lesson.progress.score}/{lesson.progress.total} câu đúng
            </p>
          )}
        </div>
      </div>

      {/* Lesson content */}
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 prose prose-invert prose-sm max-w-none
          [&_table]:w-full [&_table]:border-collapse [&_th]:bg-zinc-800 [&_th]:p-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-zinc-300
          [&_td]:p-2 [&_td]:border-b [&_td]:border-zinc-800 [&_td]:text-sm [&_td]:text-zinc-300
          [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-zinc-100 [&_h2]:mt-0 [&_h2]:mb-3
          [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_h3]:mt-4 [&_h3]:mb-2
          [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1
          [&_li]:text-zinc-300 [&_li]:text-sm
          [&_p]:text-zinc-300 [&_p]:text-sm [&_p]:leading-relaxed
          [&_strong]:text-zinc-100 [&_em]:text-indigo-300"
        dangerouslySetInnerHTML={{ __html: lesson.content_vi }}
      />

      {/* Score result banner */}
      {score !== null && (
        <div className={`rounded-xl p-5 border text-center ${
          score >= 80
            ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-300'
            : score >= 50
            ? 'bg-amber-400/10 border-amber-400/30 text-amber-300'
            : 'bg-rose-400/10 border-rose-400/30 text-rose-300'
        }`}>
          <div className="text-4xl font-bold">{score}%</div>
          <p className="text-sm mt-1">
            {score >= 80 ? 'Xuất sắc! Bạn hiểu bài rất tốt.' : score >= 50 ? 'Khá tốt! Ôn lại lý thuyết một chút.' : 'Cần ôn lại. Đọc lại phần lý thuyết nhé!'}
          </p>
        </div>
      )}

      {/* Exercises */}
      <div>
        <h2 className="text-base font-semibold text-zinc-200 mb-3">
          Bài tập ({lesson.exercises.length} câu)
        </h2>
        <div className="space-y-4">
          {lesson.exercises.map((ex, i) => {
            const res = resultMap.get(ex.id);
            const selected = answers[ex.id];

            return (
              <div
                key={ex.id}
                className={`bg-zinc-900 border rounded-xl p-4 ${
                  res ? (res.correct ? 'border-emerald-500/40' : 'border-rose-500/40') : 'border-zinc-800'
                }`}
              >
                <p className="text-sm font-medium text-zinc-100 mb-3">
                  <span className="text-zinc-500 mr-2">Câu {i + 1}.</span>
                  {ex.question}
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {ex.options.map(opt => {
                    const isSelected = selected === opt;
                    const isCorrect = opt === ex.answer;
                    let optClass = 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600';

                    if (res) {
                      if (isCorrect) optClass = 'bg-emerald-400/10 border-emerald-400/50 text-emerald-300';
                      else if (isSelected && !isCorrect) optClass = 'bg-rose-400/10 border-rose-400/50 text-rose-300';
                      else optClass = 'bg-zinc-800/50 border-zinc-800 text-zinc-500';
                    } else if (isSelected) {
                      optClass = 'bg-indigo-600/20 border-indigo-500 text-indigo-300';
                    }

                    return (
                      <button
                        key={opt}
                        disabled={!!res}
                        onClick={() => setAnswers(a => ({ ...a, [ex.id]: opt }))}
                        className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 text-sm text-left transition-all ${optClass}`}
                      >
                        {res && isCorrect && <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />}
                        {res && isSelected && !isCorrect && <XCircle size={14} className="shrink-0 text-rose-400" />}
                        {opt}
                      </button>
                    );
                  })}
                </div>

                {res && !res.correct && (
                  <p className="mt-2 text-xs text-zinc-400 bg-zinc-800 rounded-lg px-3 py-2">
                    💡 {res.explanation_vi}
                  </p>
                )}
                {res && res.correct && (
                  <p className="mt-2 text-xs text-emerald-400/80">✓ Chính xác!</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Submit / retry */}
      {!results ? (
        <button
          onClick={handleSubmit}
          disabled={submitting || Object.keys(answers).length < lesson.exercises.length}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-colors"
        >
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          Nộp bài ({Object.keys(answers).length}/{lesson.exercises.length} câu)
        </button>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => { setAnswers({}); setResults(null); setScore(null); }}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium py-3 rounded-xl transition-colors"
          >
            Làm lại
          </button>
          <Link
            href="/eng/ngu-phap"
            className="flex-1 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl transition-colors"
          >
            Bài tiếp theo
          </Link>
        </div>
      )}
    </div>
  );
}
