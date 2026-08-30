"use client";
// M105 §6 journey 8 — bảng đốt MEPF của một bản vẽ: kết quả chia đốt theo kiểu kết nối
// (do XBOSS_VE_CHIADOT đẩy lên) kèm tổng phụ kiện mối nối cho xưởng/QS.
import { useCallback, useEffect, useState } from "react";
import { Ruler, RefreshCw, Wrench, AlertTriangle } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import { Button, Card, Chip, Section } from "@/app/components/ui";
import { Skeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

interface BanVe {
  id: number;
  code: string;
  name: string;
}

interface Dot {
  pieceIndex: number;
  lengthMm: number;
  tag: string;
}

interface Tuyen {
  id: string;
  runKey: string;
  systemId: string;
  itemId: string;
  size: string;
  jointType: string;
  divideMode: string;
  overridden: boolean;
  rulePackVersion: string;
  totalLengthMm: number;
  pieceCount: number;
  jointCount: number;
  pieces: Dot[];
}

interface PhuKien {
  item: string;
  unit: string;
  quantity: number;
}

const TEN_KIEU_NOI: Record<string, string> = {
  nep_c: "Nẹp C",
  tdc: "TDC",
  mat_bich_v: "Mặt bích V",
  ren: "Ren",
  grooved: "Coupling rãnh",
  han: "Hàn đối đầu",
  mang_xong: "Măng xông",
  tam_noi: "Tấm nối",
};

const TEN_CHE_DO: Record<string, string> = {
  deu: "Chia đều",
  cay_nguyen: "Tối đa cây nguyên",
};

function met(mm: number): string {
  return (mm / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

export default function TrangBangDot() {
  const [banVes, setBanVes] = useState<BanVe[]>([]);
  const [banVeId, setBanVeId] = useState<number | null>(null);
  const [tuyens, setTuyens] = useState<Tuyen[]>([]);
  const [phuKiens, setPhuKiens] = useState<PhuKien[]>([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/drawings")
      .then(async (r) => {
        if (r.status === 401) return (redirectToLogin(), null);
        return r.json();
      })
      .then((j) => {
        if (!j) return;
        const ds: BanVe[] = (j.drawings ?? j.items ?? j ?? []) as BanVe[];
        setBanVes(Array.isArray(ds) ? ds : []);
        if (Array.isArray(ds) && ds.length > 0) setBanVeId(ds[0].id);
        else setDangTai(false);
      })
      .catch(() => {
        setLoi("Không tải được danh sách bản vẽ");
        setDangTai(false);
      });
  }, []);

  const taiBangDot = useCallback(async () => {
    if (banVeId == null) return;
    setDangTai(true);
    setLoi(null);
    try {
      const r = await fetch(`/api/engineering/joint-segmentation?drawingId=${banVeId}`);
      if (r.status === 401) return redirectToLogin();
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Không tải được bảng đốt");
      setTuyens(j.runs ?? []);
      setPhuKiens(j.hardware ?? []);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : "Không tải được bảng đốt");
      setTuyens([]);
      setPhuKiens([]);
    } finally {
      setDangTai(false);
    }
  }, [banVeId]);

  useEffect(() => {
    void taiBangDot();
  }, [taiBangDot]);

  const theoHe = tuyens.reduce<Record<string, Tuyen[]>>((acc, t) => {
    (acc[t.systemId] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="container mx-auto p-4 md:p-6">
        <EngineeringNav />

        <div className="mb-6 mt-4 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold">
              <Ruler size={20} className="text-emerald-400" />
              Bảng đốt MEPF
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Kết quả chia đốt theo kiểu kết nối của lệnh <code>XBOSS_VE_CHIADOT</code> — chiều dài
              từng đốt và phụ kiện mối nối cần chuẩn bị.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Chọn bản vẽ"
              value={banVeId ?? ""}
              onChange={(e) => setBanVeId(Number(e.target.value))}
              className="h-10 min-w-48 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100"
            >
              {banVes.length === 0 && <option value="">Chưa có bản vẽ</option>}
              {banVes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>
            <Button variant="primary" icon={RefreshCw} onClick={() => void taiBangDot()}>
              Tải lại
            </Button>
          </div>
        </div>

        {loi && (
          <Card tone="raised" pad="md" className="mb-4 border-amber-700/60">
            <p className="flex items-center gap-2 text-sm text-amber-300">
              <AlertTriangle size={16} />
              {loi}
            </p>
          </Card>
        )}

        {dangTai ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : tuyens.length === 0 ? (
          <Card tone="raised" pad="lg">
            <p className="text-sm text-zinc-400">
              Bản vẽ này chưa có bảng đốt. Chạy lệnh <code>XBOSS_VE_CHIADOT</code> trong AutoCAD rồi
              tải bản vẽ lên để kết quả chia đốt hiện ở đây.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(theoHe).map(([he, ds]) => (
              <Section key={he} title={`Hệ ${he}`} icon={Ruler}>
                <Card tone="raised" pad="none" className="overflow-x-auto">
                  <table className="w-full min-w-max text-sm">
                    <thead className="sticky top-0 bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-400">
                      <tr>
                        <th className="px-3 py-2">Tuyến</th>
                        <th className="px-3 py-2">Cỡ</th>
                        <th className="px-3 py-2">Kiểu nối</th>
                        <th className="px-3 py-2 text-right">Số đốt</th>
                        <th className="px-3 py-2 text-right">Số mối</th>
                        <th className="px-3 py-2 text-right">Tổng dài (m)</th>
                        <th className="px-3 py-2">Chiều dài từng đốt (mm)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {ds.map((t) => (
                        <tr key={t.id} className="align-top">
                          <td className="px-3 py-2 font-medium text-zinc-200">{t.itemId}</td>
                          <td className="px-3 py-2 text-zinc-300">{t.size}</td>
                          <td className="px-3 py-2">
                            <span className="text-zinc-200">
                              {TEN_KIEU_NOI[t.jointType] ?? t.jointType}
                            </span>
                            {t.overridden && (
                              <Chip tone="warning" className="ml-2">
                                kỹ sư ghi đè
                              </Chip>
                            )}
                            <div className="text-xs text-zinc-500">
                              {TEN_CHE_DO[t.divideMode] ?? t.divideMode}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{t.pieceCount}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{t.jointCount}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {met(t.totalLengthMm)}
                          </td>
                          <td className="px-3 py-2 text-xs text-zinc-400">
                            {t.pieces.map((p) => `${p.tag}: ${p.lengthMm}`).join(" · ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </Section>
            ))}

            {phuKiens.length > 0 && (
              <Section
                title="Phụ kiện mối nối cần chuẩn bị"
                icon={Wrench}
                description="Suy từ số mối nối × định mức trong rule pack đang phát hành."
              >
                <Card tone="raised" pad="none" className="overflow-x-auto">
                  <table className="w-full min-w-max text-sm">
                    <thead className="sticky top-0 bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-400">
                      <tr>
                        <th className="px-3 py-2">Hạng mục</th>
                        <th className="px-3 py-2 text-right">Khối lượng</th>
                        <th className="px-3 py-2">Đơn vị</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {phuKiens.map((h) => (
                        <tr key={`${h.item}|${h.unit}`}>
                          <td className="px-3 py-2 text-zinc-200">{h.item}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {h.quantity.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2 text-zinc-400">{h.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </Section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
