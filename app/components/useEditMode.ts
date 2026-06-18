'use client';
import { useState, useCallback } from 'react';

export function useEditMode(canEdit: boolean) {
  const [editMode, setEditMode] = useState(false);

  const toggle = useCallback(() => {
    if (!canEdit) return;
    setEditMode(v => !v);
  }, [canEdit]);

  const lock = useCallback(() => setEditMode(false), []);

  return { editMode: canEdit && editMode, toggle, lock };
}
