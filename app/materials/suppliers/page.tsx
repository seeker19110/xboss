"use client";
import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import SuppliersTab from "@/app/materials/_components/SuppliersTab";
import { fetchMe } from "@/app/lib/me";

export default function SuppliersPage() {
  const [role, setRole] = useState("");

  useEffect(() => {
    fetchMe().then((user) => setRole(user?.role ?? ""));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <AppHeader />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Building2 className="w-6 h-6 text-blue-400" />
          <h2 className="text-2xl font-bold">Nhà cung cấp</h2>
        </div>
        {role && <SuppliersTab role={role} />}
      </div>
    </div>
  );
}
