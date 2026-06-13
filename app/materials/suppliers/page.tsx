'use client';
import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import AppHeader from '@/app/components/AppHeader';
import SuppliersTab from '@/app/materials/_components/SuppliersTab';

export default function SuppliersPage() {
  const [role, setRole] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(async r => {
      if (!r.ok) { window.location.href = '/login'; return; }
      const j = await r.json();
      setRole(j.user?.role ?? '');
    });
  }, []);

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <AppHeader />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Building2 className="w-6 h-6 text-blue-400" />
          <h1 className="text-2xl font-bold">Nhà cung cấp</h1>
        </div>
        {role && <SuppliersTab role={role} />}
      </div>
    </div>
  );
}
