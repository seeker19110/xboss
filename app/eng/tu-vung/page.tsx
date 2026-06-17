'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, Volume2, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';

type VocabCard = {
  id: number;
  word: string;
  phonetic: string;
  meaning_vi: string;
  example_en: string;
  example_vi: string;
  topic: string;
  learned: boolean;
  due: boolean;
  reps: number | null;
};

const TOPIC_LABELS: Record<string, string> = {
  all: 'Tất cả',
  chao_hoi: 'Chào hỏi',
  gia_dinh: 'Gia đình',
  thuc_an: 'Thức ăn',
  dong_tu: 'Động từ',
  tinh_tu: 'Tính từ',
};

const QUALITY_BUTTONS = [
  { quality: 0, label: 'Không biết', color: 'bg-rose-600 hover:bg-rose-500' },
  { quality: 2, label: 'Khó', color: 'bg-amber-600 hover:bg-amber-500' },
  { quality: 4, label: 'Bình thường', color: 'bg-sky-600 hover:bg-sky-500' },
  { quality: 5, label: 'Dễ', color: 'bg-emerald-600 hover:bg-emerald-500' },
] as const;

export default function VocabularyPage() {
  const router = useRouter();
  const [topic, setTopic] = useState('all');
  const [cards, setCards] = useState<VocabCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'all' | 'due'>('due');
  const [done, setDone] = useState(false);

  const loadCards = useCallback(async (t: string) => {
    setLoading(true);
    setDone(false);
    setIndex(0);
    setFlipped(false);
    try {
      const url = `/api/eng/vocabulary${t !== 'all' ? `?topic=${t}` : ''}`;
      const r = await fetch(url);
      if (r.status === 401) { router.replace('/eng/dang-nhap'); return; }
      const data = await r.json();
      const all: VocabCard[] = data.vocabulary ?? [];
      const filtered = mode === 'due' ? all.filter(c => c.due) : all;
      setCards(filtered);
      if (filtered.length === 0) setDone(true);
    } finally {
      setLoading(false);
    }
  }, [router, mode]);

  useEffect(() => { loadCards(topic); }, [loadCards, topic]);

  async function handleReview(quality: number) {
    const card = cards[index];
    if (!card || submitting) return;
    setSubmitting(true);
    try {
      await fetch(`/api/eng/vocabulary/${card.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality }),
      });
      const next = index + 1;
      if (next >= cards.length) {
        setDone(true);
      } else {
        setIndex(next);
        setFlipped(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function speak(text: string) {
    if ('speechSynthesis' in window) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'en-US';
      speechSynthesis.speak(utt);
    }
  }

  const card = cards[index];
  const progress = cards.length > 0 ? ((index) / cards.length) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">Flashcard Từ vựng</h1>
        <button
          onClick={() => { setMode(m => m === 'due' ? 'all' : 'due'); }}
          className="text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          {mode === 'due' ? '🔔 Cần ôn' : '📚 Tất cả'}
        </button>
      </div>

      {/* Topic tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {Object.entries(TOPIC_LABELS).map(([t, label]) => (
          <button
            key={t}
            onClick={() => { setTopic(t); }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              topic === t
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-indigo-400" size={28} />
        </div>
      ) : done ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <div className="text-5xl">🎉</div>
          <div>
            <p className="text-xl font-bold text-zinc-100">Hoàn thành!</p>
            <p className="text-zinc-400 text-sm mt-1">
              {mode === 'due' ? 'Bạn đã ôn xong tất cả từ cần ôn hôm nay.' : 'Bạn đã hoàn thành bộ từ này.'}
            </p>
          </div>
          <button
            onClick={() => loadCards(topic)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl transition-colors text-sm font-medium"
          >
            <RotateCcw size={16} />
            Học lại
          </button>
        </div>
      ) : card ? (
        <>
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
              <span>{index + 1} / {cards.length}</span>
              <span>{TOPIC_LABELS[topic] || 'Tất cả'}</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1.5">
              <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Flashcard */}
          <div
            className="relative cursor-pointer select-none"
            style={{ perspective: '1000px' }}
            onClick={() => setFlipped(f => !f)}
          >
            <div
              className="transition-transform duration-500"
              style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
            >
              {/* Front */}
              <div
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 min-h-[220px] flex flex-col items-center justify-center gap-3 text-center"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <div className="text-4xl font-bold text-zinc-100">{card.word}</div>
                <div className="text-lg text-zinc-500 font-mono">{card.phonetic}</div>
                <button
                  onClick={e => { e.stopPropagation(); speak(card.word); }}
                  className="mt-1 p-2 text-sky-400 hover:bg-sky-400/10 rounded-full transition-colors"
                  title="Nghe phát âm"
                >
                  <Volume2 size={20} />
                </button>
                <p className="text-xs text-zinc-600 mt-2">Nhấn để xem nghĩa</p>
              </div>

              {/* Back */}
              <div
                className="absolute inset-0 bg-zinc-900 border border-indigo-500/40 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-center"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                <div className="text-2xl font-bold text-indigo-300">{card.meaning_vi}</div>
                {card.example_en && (
                  <div className="mt-2 space-y-1">
                    <p className="text-sm text-zinc-300 italic">&ldquo;{card.example_en}&rdquo;</p>
                    <p className="text-xs text-zinc-500">({card.example_vi})</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Navigation + rating */}
          {flipped ? (
            <div>
              <p className="text-center text-xs text-zinc-500 mb-3">Bạn nhớ từ này như thế nào?</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {QUALITY_BUTTONS.map(({ quality, label, color }) => (
                  <button
                    key={quality}
                    onClick={() => handleReview(quality)}
                    disabled={submitting}
                    className={`${color} disabled:opacity-60 text-white font-medium py-3 rounded-xl transition-colors text-sm`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <button
                onClick={e => { e.stopPropagation(); if (index > 0) { setIndex(i => i - 1); setFlipped(false); } }}
                disabled={index === 0}
                className="p-2 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <ChevronLeft size={22} />
              </button>
              <p className="text-sm text-zinc-500">Nhấn thẻ để lật</p>
              <button
                onClick={e => { e.stopPropagation(); if (index < cards.length - 1) { setIndex(i => i + 1); setFlipped(false); } }}
                disabled={index === cards.length - 1}
                className="p-2 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <ChevronRight size={22} />
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
