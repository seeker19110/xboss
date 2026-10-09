"use client";
// Trang Admin "Thiết bị offline" (M131 §3 — docs/nang-cap/M131-vault-offline-bao-tri-va-khoi-phuc.md).
// Tab "Thiết bị": mọi thiết bị offline cùng tổ chức (GET /api/offline/devices) — đổi hồ sơ / thu hồi
// qua PATCH /api/offline/devices/:id. Tab "Yêu cầu khôi phục": duyệt/từ chối yêu cầu khôi phục khi
// mất proof (GET + PATCH /api/offline/recovery[/:id]). Admin KHÔNG bao giờ nhận khoá/bản nháp — chỉ
// trạng thái; khoá chỉ được chuyển sang thiết bị mới khi chính chủ hoàn tất trên thiết bị đó.
// Server là ranh giới quyền (CAN.manageUsers + 2FA, không tự duyệt yêu cầu của mình).
import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Clock,
  KeyRound,
  LifeBuoy,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserCog,
  XCircle,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton, TableSkeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { appConfirm, appPrompt } from "@/app/components/dialogs";
import { Button, Card, Chip, Section, TabPanel, Tabs } from "@/app/components/ui";
import type { ChipTone } from "@/app/components/ui/Chip";
import { fetchMe, redirectToLogin, type Me } from "@/app/lib/me";

type ThietBi = {
  id: string;
  userId: number;
  userName: string;
  profile: "shared-safe" | "field-personal";
  approvedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  dungChung: boolean;
  thisBrowser: boolean;
};

type TrangThaiYeuCau = "pending" | "approved" | "rejected" | "completed" | "expired";
type YeuCau = {
  id: string;
  userId: number;
  userName: string;
  oldDeviceId: string;
  newDeviceId: string;
  status: TrangThaiYeuCau;
  reason: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decideNote: string | null;
  keysRecovered: number | null;
  keysSkipped: number | null;
  requestedAt: string;
};

const NHOM_TAB = "thiet-bi-offline";
type TabId = "thiet-bi" | "khoi-phuc";

const NHAN_YEU_CAU: Record<TrangThaiYeuCau, { nhan: string; tone: ChipTone; icon: typeof Clock }> =
  {
    pending: { nhan: "Chờ duyệt", tone: "warning", icon: Clock },
    approved: { nhan: "Đã duyệt — chờ chủ hoàn tất", tone: "info", icon: ShieldCheck },
    rejected: { nhan: "Đã từ chối", tone: "neutral", icon: XCircle },
    completed: { nhan: "Đã khôi phục", tone: "success", icon: CheckCircle2 },
    expired: { nhan: "Hết hạn", tone: "neutral", icon: Clock },
  };

const ngayGio = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

/** Mã thiết bị rút gọn (8 ký tự đầu UUID) — đủ để đối chiếu, không lộ gì thêm. */
const maNgan = (id: string) => id.slice(0, 8);

async function docLoi(r: Response): Promise<string> {
  const j = (await r.json().catch(() => null)) as { error?: unknown } | null;
  return typeof j?.error === "string" ? j.error : `Thao tác thất bại (HTTP ${r.status})`;
}

export default function ThietBiOfflinePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("thiet-bi");
  const [thietBi, setThietBi] = useState<ThietBi[] | null>(null);
  const [yeuCau, setYeuCau] = useState<YeuCau[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangLam, setDangLam] = useState<string | null>(null);

  const laAdmin = me?.role === "admin";

  const taiLai = useCallback(async () => {
    setLoi(null);
    try {
      const [rTb, rYc] = await Promise.all([
        fetch("/api/offline/devices", { cache: "no-store" }),
        fetch("/api/offline/recovery", { cache: "no-store" }),
      ]);
      if (rTb.status === 401 || rYc.status === 401) {
        void redirectToLogin();
        return;
      }
      if (!rTb.ok || !rYc.ok) {
        setLoi(await docLoi(rTb.ok ? rYc : rTb));
        return;
      }
      setThietBi(((await rTb.json()) as { devices: ThietBi[] }).devices);
      setYeuCau(((await rYc.json()) as { requests: YeuCau[] }).requests);
    } catch {
      setLoi("Mất kết nối — không tải được danh sách thiết bị offline.");
    }
  }, []);

  useEffect(() => {
    fetchMe()
      .then(setMe)
      .finally(() => setMeLoading(false));
    // Link từ thông báo/push: /admin/thiet-bi-offline?tab=khoi-phuc
    if (new URLSearchParams(window.location.search).get("tab") === "khoi-phuc") setTab("khoi-phuc");
  }, []);

  useEffect(() => {
    if (laAdmin) void taiLai();
  }, [laAdmin, taiLai]);

  async function goi(khoa: string, url: string, body: unknown, thanhCong: string) {
    setDangLam(khoa);
    try {
      const r = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.status === 401) {
        void redirectToLogin();
        return;
      }
      if (!r.ok) {
        showToast(await docLoi(r), "error");
        return;
      }
      showToast(thanhCong);
      await taiLai();
    } catch {
      showToast("Mất kết nối — thao tác chưa được lưu, thử lại.", "error");
    } finally {
      setDangLam(null);
    }
  }

  async function doiHoSo(t: ThietBi) {
    const sang = t.profile === "field-personal" ? "shared-safe" : "field-personal";
    const ok = await appConfirm(
      sang === "field-personal"
        ? `Duyệt thiết bị của ${t.userName} là "Cá nhân hiện trường" (phiên offline 8 giờ)? Chỉ duyệt khi trình duyệt này chỉ một người dùng.`
        : `Hạ thiết bị của ${t.userName} về "Dùng chung an toàn" (phiên offline 15 phút)?`,
      { confirmLabel: sang === "field-personal" ? "Duyệt cá nhân" : "Hạ về dùng chung" },
    );
    if (!ok) return;
    await goi(
      `tb-${t.id}`,
      `/api/offline/devices/${t.id}`,
      { profile: sang },
      "Đã cập nhật hồ sơ thiết bị",
    );
  }

  async function thuHoi(t: ThietBi) {
    const ok = await appConfirm(
      `Thu hồi thiết bị offline của ${t.userName}? Người dùng phải đăng nhập lại; bản nháp trên thiết bị đó chỉ còn lấy lại được qua yêu cầu khôi phục. Không hoàn tác được.`,
      { danger: true, confirmLabel: "Thu hồi thiết bị" },
    );
    if (!ok) return;
    await goi(
      `tb-${t.id}`,
      `/api/offline/devices/${t.id}`,
      { revoke: true },
      "Đã thu hồi thiết bị",
    );
  }

  async function duyet(y: YeuCau) {
    const ok = await appConfirm(
      `Duyệt khôi phục cho ${y.userName}? Thiết bị cũ (${maNgan(y.oldDeviceId)}) sẽ bị THU HỒI và người dùng phải đăng nhập lại. Khoá chỉ được chuyển khi chính người đó hoàn tất trên thiết bị mới (${maNgan(y.newDeviceId)}) — Admin không nhận được dữ liệu nào.`,
      { confirmLabel: "Duyệt & thu hồi thiết bị cũ" },
    );
    if (!ok) return;
    await goi(
      `yc-${y.id}`,
      `/api/offline/recovery/${y.id}`,
      { decision: "approve" },
      "Đã duyệt yêu cầu khôi phục",
    );
  }

  async function tuChoi(y: YeuCau) {
    const ghiChu = await appPrompt(`Lý do từ chối yêu cầu của ${y.userName} (không bắt buộc):`);
    if (ghiChu === null) return;
    await goi(
      `yc-${y.id}`,
      `/api/offline/recovery/${y.id}`,
      { decision: "reject", note: ghiChu.trim() || null },
      "Đã từ chối yêu cầu khôi phục",
    );
  }

  if (meLoading) return <PageSkeleton />;

  if (!laAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Thiết bị offline" subtitle="Quản lý thiết bị & khôi phục vault" />
        <main className="p-4 sm:p-6">
          <EmptyState
            icon={Smartphone}
            title="Không có quyền truy cập"
            message="Chỉ Admin mới quản lý được thiết bị offline và yêu cầu khôi phục."
          />
        </main>
      </div>
    );
  }

  const choDuyet = yeuCau?.filter((y) => y.status === "pending").length ?? 0;
  const dangDung = thietBi?.filter((t) => !t.revokedAt).length ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Thiết bị offline"
        subtitle="Duyệt hồ sơ, thu hồi thiết bị và yêu cầu khôi phục dữ liệu ngoại tuyến"
      />
      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <Tabs
          group={NHOM_TAB}
          label="Nhóm quản lý thiết bị offline"
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          items={[
            {
              id: "thiet-bi",
              label: "Thiết bị",
              icon: Smartphone,
              badge: thietBi ? dangDung : undefined,
            },
            {
              id: "khoi-phuc",
              label: "Yêu cầu khôi phục",
              icon: LifeBuoy,
              badge: choDuyet > 0 ? choDuyet : undefined,
            },
          ]}
        />

        {loi ? (
          <Card className="space-y-3" role="alert">
            <p className="text-sm text-amber-300">{loi}</p>
            <Button icon={RefreshCw} onClick={() => void taiLai()}>
              Thử lại
            </Button>
          </Card>
        ) : thietBi === null || yeuCau === null ? (
          <div aria-busy="true" aria-label="Đang tải">
            <TableSkeleton rows={4} cols={5} />
          </div>
        ) : (
          <TabPanel group={NHOM_TAB} value={tab}>
            {tab === "thiet-bi" ? (
              <BangThietBi
                ds={thietBi}
                dangLam={dangLam}
                meId={me?.id ?? 0}
                onDoiHoSo={doiHoSo}
                onThuHoi={thuHoi}
              />
            ) : (
              <DanhSachYeuCau
                ds={yeuCau}
                dangLam={dangLam}
                meId={me?.id ?? 0}
                onDuyet={duyet}
                onTuChoi={tuChoi}
              />
            )}
          </TabPanel>
        )}
      </main>
    </div>
  );
}

function BangThietBi({
  ds,
  dangLam,
  meId,
  onDoiHoSo,
  onThuHoi,
}: {
  ds: ThietBi[];
  dangLam: string | null;
  meId: number;
  onDoiHoSo: (t: ThietBi) => void;
  onThuHoi: (t: ThietBi) => void;
}) {
  if (ds.length === 0)
    return (
      <EmptyState
        icon={Smartphone}
        title="Chưa có thiết bị offline"
        message="Thiết bị xuất hiện ở đây khi người dùng bật lưu ngoại tuyến trên trình duyệt."
      />
    );
  return (
    <Section
      title="Thiết bị trong tổ chức"
      icon={Smartphone}
      description='"Cá nhân hiện trường" giữ phiên offline 8 giờ — chỉ duyệt cho trình duyệt một người dùng.'
    >
      <Card pad="none" className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Danh sách thiết bị offline trong tổ chức</caption>
          <thead className="sticky top-0 bg-zinc-900">
            <tr className="text-left text-xs font-semibold text-zinc-400 border-b border-zinc-800">
              <th scope="col" className="py-3 px-4">
                Người dùng
              </th>
              <th scope="col" className="py-3 px-4">
                Thiết bị
              </th>
              <th scope="col" className="py-3 px-4">
                Hồ sơ
              </th>
              <th scope="col" className="py-3 px-4">
                Trạng thái
              </th>
              <th scope="col" className="py-3 px-4">
                Đăng ký
              </th>
              <th scope="col" className="py-3 px-4 text-right">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody>
            {ds.map((t) => {
              const ban = dangLam === `tb-${t.id}`;
              return (
                <tr key={t.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="py-3 px-4 font-medium text-zinc-100 whitespace-nowrap">
                    {t.userName}
                    {t.userId === meId && <span className="ml-1 text-xs text-zinc-400">(bạn)</span>}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-zinc-300 whitespace-nowrap">
                    {maNgan(t.id)}
                    {t.thisBrowser && (
                      <span className="ml-2 font-sans text-zinc-400">· trình duyệt này</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {t.profile === "field-personal" ? (
                      <Chip tone="accent" icon={UserCog}>
                        Cá nhân hiện trường
                      </Chip>
                    ) : (
                      <Chip tone="neutral">Dùng chung an toàn</Chip>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {t.revokedAt ? (
                        <Chip tone="danger" icon={Ban}>
                          Đã thu hồi
                        </Chip>
                      ) : (
                        <Chip tone="success" icon={CheckCircle2}>
                          Đang dùng
                        </Chip>
                      )}
                      {t.dungChung && !t.revokedAt && (
                        <Chip tone="warning">Trình duyệt dùng chung</Chip>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-zinc-400 whitespace-nowrap">
                    {ngayGio(t.createdAt)}
                  </td>
                  <td className="py-3 px-4">
                    {t.revokedAt ? (
                      <span className="block text-right text-xs text-zinc-400">
                        Thu hồi {ngayGio(t.revokedAt)}
                      </span>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          icon={KeyRound}
                          disabled={ban}
                          onClick={() => onDoiHoSo(t)}
                          aria-label={`Đổi hồ sơ thiết bị của ${t.userName}`}
                        >
                          {t.profile === "field-personal" ? "Hạ về dùng chung" : "Duyệt cá nhân"}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          icon={Ban}
                          disabled={ban}
                          onClick={() => onThuHoi(t)}
                          aria-label={`Thu hồi thiết bị của ${t.userName}`}
                        >
                          Thu hồi
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </Section>
  );
}

function DanhSachYeuCau({
  ds,
  dangLam,
  meId,
  onDuyet,
  onTuChoi,
}: {
  ds: YeuCau[];
  dangLam: string | null;
  meId: number;
  onDuyet: (y: YeuCau) => void;
  onTuChoi: (y: YeuCau) => void;
}) {
  if (ds.length === 0)
    return (
      <EmptyState
        icon={LifeBuoy}
        title="Chưa có yêu cầu khôi phục"
        message="Người dùng mất truy cập trình duyệt cũ (xoá dữ liệu, đổi máy) gửi yêu cầu từ màn Thao tác ngoại tuyến trên thiết bị mới."
      />
    );
  return (
    <Section
      title="Yêu cầu khôi phục"
      icon={LifeBuoy}
      description="Duyệt sẽ thu hồi thiết bị cũ. Khoá chỉ chuyển khi chính chủ hoàn tất trên thiết bị mới — Admin không nhận khoá hay bản nháp."
    >
      <ul className="space-y-3">
        {ds.map((y) => {
          const nhan = NHAN_YEU_CAU[y.status];
          const cuaToi = y.userId === meId;
          const ban = dangLam === `yc-${y.id}`;
          return (
            <li key={y.id}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-100">{y.userName}</p>
                    <p className="text-xs text-zinc-400">Gửi lúc {ngayGio(y.requestedAt)}</p>
                  </div>
                  <Chip tone={nhan.tone} icon={nhan.icon}>
                    {nhan.nhan}
                  </Chip>
                </div>
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-zinc-400">Thiết bị cũ (mất truy cập)</dt>
                    <dd className="font-mono text-zinc-200">{maNgan(y.oldDeviceId)}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-400">Thiết bị mới</dt>
                    <dd className="font-mono text-zinc-200">{maNgan(y.newDeviceId)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-zinc-400">Lý do người dùng</dt>
                    <dd className="text-zinc-200 whitespace-pre-wrap break-words">
                      {y.reason ?? "—"}
                    </dd>
                  </div>
                  {y.decidedAt && (
                    <div className="sm:col-span-2">
                      <dt className="text-zinc-400">Quyết định</dt>
                      <dd className="text-zinc-200">
                        {y.decidedByName ?? "Admin"} · {ngayGio(y.decidedAt)}
                        {y.decideNote ? ` — ${y.decideNote}` : ""}
                      </dd>
                    </div>
                  )}
                  {y.status === "completed" && (
                    <div className="sm:col-span-2">
                      <dt className="text-zinc-400">Kết quả</dt>
                      <dd className="text-zinc-200">
                        Khôi phục {y.keysRecovered ?? 0} khoá · bỏ qua {y.keysSkipped ?? 0} khoá
                        (không còn quyền)
                      </dd>
                    </div>
                  )}
                </dl>
                {y.status === "pending" &&
                  (cuaToi ? (
                    <p className="text-xs text-zinc-400">
                      Đây là yêu cầu của bạn — cần một Admin khác duyệt.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        icon={ShieldCheck}
                        disabled={ban}
                        onClick={() => onDuyet(y)}
                        aria-label={`Duyệt yêu cầu khôi phục của ${y.userName}`}
                      >
                        Duyệt
                      </Button>
                      <Button
                        icon={XCircle}
                        disabled={ban}
                        onClick={() => onTuChoi(y)}
                        aria-label={`Từ chối yêu cầu khôi phục của ${y.userName}`}
                      >
                        Từ chối
                      </Button>
                    </div>
                  ))}
              </Card>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
