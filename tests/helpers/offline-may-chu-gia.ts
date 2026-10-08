// Máy chủ GIẢ cho các endpoint /api/auth/me + /api/offline/* mà VaultSession (client S07) gọi —
// dùng ở unit test không có DB. Bám hình dạng phản hồi của route thật (S05): context
// {contextId, deviceId, projectId, expiresAt, serverTime…}, khoá {keyId, keyVersion, manifestHash,
// manifest (dạng chuẩn), dek}. DEK sinh bằng CSPRNG thật, manifest chuẩn hoá/băm bằng đúng hàm
// lib/nen/offline-manifest. Bằng chứng với route THẬT nằm ở offline-queue-route.test.ts.
import { randomUUID } from "node:crypto";
import { base64urlEncode, taoDek } from "@/lib/nen/offline-crypto";
import { bamManifest, chuanHoaManifest, type OfflineManifest } from "@/lib/nen/offline-manifest";

type Khoa = {
  keyId: string;
  keyVersion: number;
  manifestHash: string;
  manifest: OfflineManifest;
  dek: string;
  userId: number;
  deviceId: string;
  biThuHoi: boolean;
};

export type MayChuGia = {
  fetch: typeof fetch;
  goi: string[];
  /** Đổi người đăng nhập (cookie phiên dùng chung của trình duyệt). */
  dangNhap(u: { id: number; orgId: number; role: string } | null): void;
  datDuAn(projectId: number): void;
  /** Thu hồi quyền trên khoá (unlock không trả nữa) — mô phỏng manifest có tài nguyên bị thu hồi. */
  thuHoi(keyId: string): void;
  tatVault(): void;
  khoa: Khoa[];
  thoiHanMs: number;
};

export function taoMayChuGia(opts: { now?: () => number } = {}): MayChuGia {
  const now = opts.now ?? Date.now;
  let user: { id: number; orgId: number; role: string } | null = null;
  let projectId = 1;
  let tat = false;
  const thietBi = new Map<number, string>();
  const khoa: Khoa[] = [];
  const goi: string[] = [];
  const state = { thoiHanMs: 15 * 60_000 };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  const traKhoa = (k: Khoa) => ({
    keyId: k.keyId,
    keyVersion: k.keyVersion,
    manifestHash: k.manifestHash,
    manifest: k.manifest,
    dek: k.dek,
  });

  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    goi.push(`${method} ${url}`);
    if (url === "/api/auth/me") return user ? json({ user }) : json({ user: null }, 401);
    if (!user) return json({ error: "Chưa đăng nhập", code: "unauthenticated" }, 401);
    if (tat) return json({ error: "tắt", code: "offline_vault_disabled" }, 503);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url === "/api/offline/devices" && method === "POST") {
      if (!thietBi.has(user.id)) thietBi.set(user.id, randomUUID());
      return json({ device: { id: thietBi.get(user.id) }, created: true }, 201);
    }
    const deviceId = thietBi.get(user.id);
    if (url === "/api/offline/context") {
      if (!deviceId) return json({ error: "chưa đăng ký", code: "device_unregistered" }, 403);
      if (body.expectedProjectId != null && body.expectedProjectId !== projectId)
        return json({ error: "đổi", code: "context_changed" }, 409);
      const t = now();
      return json({
        context: {
          contextId: `ctx-${user.id}-${projectId}-${t}`,
          generation: t,
          deviceId,
          projectId,
          profile: "shared-safe",
          issuedAt: new Date(t).toISOString(),
          expiresAt: new Date(t + state.thoiHanMs).toISOString(),
          cacheSchemaVersion: 1,
          serverTime: new Date(t).toISOString(),
        },
      });
    }
    if (url === "/api/offline/vault/unlock") {
      const cua = khoa.filter((k) => k.userId === user!.id && k.deviceId === deviceId);
      return json({
        keys: cua.filter((k) => !k.biThuHoi && k.manifest.projectId === projectId).map(traKhoa),
        locked: cua.filter((k) => k.biThuHoi).map((k) => ({ keyId: k.keyId })),
        truncated: false,
      });
    }
    if (url === "/api/offline/vault/keys") {
      const m = chuanHoaManifest(body.manifest, projectId);
      if (!m.ok) return json({ error: m.error, code: "manifest_invalid" }, 422);
      const hash = await bamManifest(m.manifest);
      const daCo = khoa.find(
        (k) => k.userId === user!.id && k.manifestHash === hash && k.deviceId === deviceId,
      );
      if (daCo) return json({ key: traKhoa(daCo), created: false });
      const k: Khoa = {
        keyId: randomUUID(),
        keyVersion: khoa.filter((x) => x.userId === user!.id).length + 1,
        manifestHash: hash,
        manifest: m.manifest,
        dek: base64urlEncode(taoDek()),
        userId: user.id,
        deviceId: deviceId as string,
        biThuHoi: false,
      };
      khoa.push(k);
      return json({ key: traKhoa(k), created: true }, 201);
    }
    return json({ error: "không có route giả" }, 404);
  }) as typeof fetch;

  return {
    fetch: f,
    goi,
    khoa,
    dangNhap: (u) => {
      user = u;
    },
    datDuAn: (p) => {
      projectId = p;
    },
    thuHoi: (keyId) => {
      const k = khoa.find((x) => x.keyId === keyId);
      if (k) k.biThuHoi = true;
    },
    tatVault: () => {
      tat = true;
    },
    get thoiHanMs() {
      return state.thoiHanMs;
    },
    set thoiHanMs(v: number) {
      state.thoiHanMs = v;
    },
  };
}
