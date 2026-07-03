"use client";
import AppHeader from "@/app/components/AppHeader";
import ProgressMap from "@/app/components/ProgressMap";

export default function TimelinePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title="Timeline tầng" back />
      <main className="px-3 sm:px-6 py-4 w-full">
        <ProgressMap />
      </main>
    </div>
  );
}
