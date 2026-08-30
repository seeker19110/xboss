"use client";

import { useEffect, useState } from "react";
import { fetchMe } from "@/app/lib/me";
import SuppliersTabCore from "@/app/materials/_components/SuppliersTab";
import { Skeleton } from "@/app/components/Skeleton";

export default function SuppliersTab() {
  const [role, setRole] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe().then((user) => {
      setRole(user?.role ?? "");
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 shadow-sm">
      <SuppliersTabCore role={role} />
    </div>
  );
}
