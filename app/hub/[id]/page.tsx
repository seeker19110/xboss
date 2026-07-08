"use client";
import { use } from "react";
import DashboardHub from "@/app/components/DashboardHub";

export default function HubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DashboardHub dashId={id} />;
}
