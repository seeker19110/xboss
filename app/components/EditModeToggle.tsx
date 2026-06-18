'use client';
import { Lock, LockOpen } from 'lucide-react';

interface Props {
  canEdit: boolean;
  editMode: boolean;
  onToggle: () => void;
  className?: string;
}

export default function EditModeToggle({ canEdit, editMode, onToggle, className = '' }: Props) {
  if (!canEdit) return null;

  return (
    <button
      onClick={onToggle}
      title={editMode ? 'Đang chỉnh sửa — bấm để khoá lại' : 'Bấm để mở khoá chỉnh sửa'}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
        editMode
          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25'
          : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-zinc-200 hover:bg-zinc-700'
      } ${className}`}
    >
      {editMode
        ? <><LockOpen className="w-3.5 h-3.5" /><span>Đang sửa</span></>
        : <><Lock className="w-3.5 h-3.5" /><span>Chỉ xem</span></>
      }
    </button>
  );
}
