'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Brain, CheckSquare, BarChart2, ArrowRight, Zap } from 'lucide-react';

export default function EngLandingPage() {
  const router = useRouter();

  useEffect(() => {
    fetch('/api/eng/auth/me')
      .then(r => { if (r.ok) router.replace('/eng/hoc'); })
      .catch(() => {});
  }, [router]);

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center py-12 px-4">
      {/* Hero */}
      <div className="mb-8">
        <div className="text-6xl mb-4">🇺🇸 📚</div>
        <h1 className="text-4xl md:text-5xl font-bold text-zinc-100 mb-4">
          Học Tiếng Anh{' '}
          <span className="text-indigo-400">Hiệu Quả</span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-md mx-auto leading-relaxed">
          Hệ thống học tiếng Anh thông minh dành cho người Việt — từ vựng, ngữ pháp, luyện tập và theo dõi tiến độ.
        </p>
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row gap-3 mb-16">
        <Link
          href="/eng/dang-ky"
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-base"
        >
          Bắt đầu học miễn phí
          <ArrowRight size={18} />
        </Link>
        <Link
          href="/eng/dang-nhap"
          className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium px-8 py-3.5 rounded-xl transition-colors text-base"
        >
          Đã có tài khoản
        </Link>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full">
        {[
          {
            icon: BookOpen,
            color: 'text-sky-400',
            bg: 'bg-sky-400/10',
            title: 'Flashcard Từ vựng',
            desc: '68+ từ vựng với ký âm, ví dụ và hệ thống lặp lại thông minh (SRS)',
          },
          {
            icon: Brain,
            color: 'text-violet-400',
            bg: 'bg-violet-400/10',
            title: 'Bài học Ngữ pháp',
            desc: '5 chủ đề ngữ pháp cơ bản với giải thích bằng tiếng Việt',
          },
          {
            icon: CheckSquare,
            color: 'text-emerald-400',
            bg: 'bg-emerald-400/10',
            title: 'Kiểm tra Trắc nghiệm',
            desc: 'Quiz từ vựng, ngữ pháp hoặc hỗn hợp, chấm điểm tự động',
          },
          {
            icon: BarChart2,
            color: 'text-amber-400',
            bg: 'bg-amber-400/10',
            title: 'Theo dõi Tiến độ',
            desc: 'Streak hàng ngày, biểu đồ tiến bộ và lịch sử kiểm tra',
          },
        ].map(({ icon: Icon, color, bg, title, desc }) => (
          <div key={title} className="flex items-start gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-left">
            <div className={`${bg} ${color} p-2.5 rounded-lg shrink-0`}>
              <Icon size={22} />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-100 mb-1">{title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Badge */}
      <div className="mt-12 flex items-center gap-2 text-zinc-500 text-sm">
        <Zap size={14} className="text-amber-400" />
        Miễn phí hoàn toàn · Không cần cài đặt · Học mọi lúc mọi nơi
      </div>
    </div>
  );
}
