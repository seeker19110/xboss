"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ChuanHoaBanVePage from "@/app/engineering/chuan-hoa-ban-ve/page";

export default function CadEngineeringPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/engineering/chuan-hoa-ban-ve");
  }, [router]);

  return <ChuanHoaBanVePage />;
}
