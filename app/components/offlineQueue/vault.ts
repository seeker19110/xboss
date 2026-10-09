// Phiên vault offline phía client (QUALITY-FINAL-1 S07 — A2-FR04/FR05, DATA-CONTRACTS §3–§4,
// DATA-MIGRATIONS §2/§5, D02/D03).
//
// UNKNOWN → VERIFYING → ACTIVE; lỗi/đổi ngữ cảnh/hết lease → LOCKED; server chưa bật → DISABLED.
// - Chỉ ACTIVE sau khi xác minh ONLINE: /api/auth/me (chủ sở hữu) → /api/offline/context (thiết bị
//   + dự án, đăng ký thiết bị nếu chưa có) → /api/offline/vault/unlock (DEK các manifest còn quyền).
//   Không có đường mở offline/khởi động lạnh: tải lại trang khi mất mạng = LOCKED.
// - DEK nhập thành CryptoKey KHÔNG xuất được, chỉ giữ trong bộ nhớ của tab; bản thô bị ghi đè 0
//   ngay sau khi nhập. Không ghi khoá/context/payload vào IDB/localStorage/Cache Storage/log.
// - Lease context theo server (15 phút shared-safe / 8 giờ field-personal): đo bằng cả đồng hồ
//   đơn điệu lẫn đồng hồ tường; đồng hồ tường lùi (clock rollback) → LOCKED.
// - AAD payload gắn keyId/manifestHash/owner/org/dự án/thiết bị/keyVersion/operation/kind/sequence;
//   bản ghi của chủ khác bị từ chối TRƯỚC khi thử giải mã, sửa bất kỳ trường AAD → giải mã thất bại.
import {
  aadPayload,
  base64urlDecode,
  giaiMaPayload,
  maHoaPayload,
  nhapDekBoNho,
} from "@/lib/nen/offline-crypto";
import {
  bamManifest,
  chuanHoaManifest,
  docManifestDaLuu,
  type OfflineManifest,
} from "@/lib/nen/offline-manifest";
import {
  cungChu,
  type ChuSoHuu,
  type QueueKind,
  type QueueRecord,
  type VaultMoKhoa,
} from "./logic";

export type VaultTrangThai = "unknown" | "verifying" | "active" | "locked" | "disabled";

type KhoaBoNho = {
  keyId: string;
  keyVersion: number;
  manifestHash: string;
  manifest: OfflineManifest;
  tasks: Set<number>;
  key: CryptoKey;
};

type NguCanh = {
  contextId: string;
  /** Hạn theo đồng hồ đơn điệu và đồng hồ tường của client, dựng từ thời lượng do server cấp. */
  hanDonDieu: number;
  hanTuong: number;
  /** Đồng hồ tường lúc nhận — đồng hồ tường nhỏ hơn mốc này (trừ dung sai) = bị lùi. */
  tuongLucNhan: number;
};

type DongHo = { tuong: () => number; donDieu: () => number };

/** Lỗi vault — `loai` để lớp gọi quyết định (khoá/tắt/thử lại khi có mạng). */
export class LoiVault extends Error {
  constructor(
    readonly loai: "auth" | "locked" | "disabled" | "network" | "owner",
    message = `offline_vault_${loai}`,
  ) {
    super(message);
    this.name = "LoiVault";
  }
}

/** Làm mới context khi còn ít hơn ngần này (tránh gửi request với context sắp hết hạn). */
const LAM_MOI_TRUOC_MS = 60_000;
/** Dung sai đồng hồ tường lùi (NTP chỉnh nhẹ) trước khi coi là rollback. */
const DUNG_SAI_LUI_MS = 5_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;

type KhoaApi = {
  keyId?: unknown;
  keyVersion?: unknown;
  manifestHash?: unknown;
  manifest?: unknown;
  dek?: unknown;
};

export class VaultSession implements VaultMoKhoa {
  trangThai: VaultTrangThai = "unknown";
  private chuHienHanh: ChuSoHuu | null = null;
  private nguCanh: NguCanh | null = null;
  private keys = new Map<string, KhoaBoNho>();
  private daCam = new Set<string>();
  private dangMo: Promise<boolean> | null = null;
  private role: string | null = null;
  private langNghe = new Set<() => void>();

  constructor(
    private readonly f: typeof fetch = (...a) => fetch(...a),
    private readonly dongHo: DongHo = {
      tuong: () => Date.now(),
      donDieu: () => performance.now(),
    },
  ) {}

  onDoi(fn: () => void): () => void {
    this.langNghe.add(fn);
    return () => {
      this.langNghe.delete(fn);
    };
  }

  private datTrangThai(t: VaultTrangThai) {
    if (this.trangThai === t) return;
    this.trangThai = t;
    for (const fn of this.langNghe) fn();
  }

  // Mọi đường đọc/ghi đi qua chu()/coKhoa() nên kiểm lease tại đây: hết lease khi đang mất mạng
  // (không có flush nào gọi conHieuLuc) vẫn khoá vault trước khi giải mã/mã hoá (A2-FR04).
  chu(): ChuSoHuu | null {
    return this.conHieuLuc() ? this.chuHienHanh : null;
  }

  vaiTro(): string | null {
    return this.conHieuLuc() ? this.role : null;
  }

  coKhoa(keyId: string): boolean {
    return this.conHieuLuc() && this.keys.has(keyId);
  }

  /** Đóng vault: bỏ mọi tham chiếu khoá/context trong bộ nhớ (ciphertext trên thiết bị giữ nguyên). */
  khoa(trangThai: "locked" | "disabled" = "locked"): void {
    this.keys.clear();
    this.daCam.clear();
    this.nguCanh = null;
    this.chuHienHanh = null;
    this.role = null;
    this.datTrangThai(trangThai);
  }

  /** Lease offline còn hiệu lực (A2-FR04): chưa hết hạn theo cả 2 đồng hồ, đồng hồ tường không lùi. */
  conHieuLuc(): boolean {
    const c = this.nguCanh;
    if (this.trangThai !== "active" || !c) return false;
    const tuong = this.dongHo.tuong();
    if (tuong < c.tuongLucNhan - DUNG_SAI_LUI_MS) {
      this.khoa();
      return false;
    }
    if (this.dongHo.donDieu() >= c.hanDonDieu || tuong >= c.hanTuong) {
      this.khoa();
      return false;
    }
    return true;
  }

  /** Mốc hết lease theo đồng hồ tường (ms) khi vault ACTIVE — báo cho SW giới hạn cache đọc. */
  hanLeaseTuong(): number | null {
    return this.conHieuLuc() && this.nguCanh ? this.nguCanh.hanTuong : null;
  }

  // ── Mạng ────────────────────────────────────────────────────────────────────────────────

  private async goi(
    url: string,
    init: RequestInit & { context?: boolean } = {},
  ): Promise<{ status: number; body: Record<string, unknown> | null }> {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.context && this.nguCanh) headers["X-XBoss-Context"] = this.nguCanh.contextId;
    let res: Response;
    try {
      res = await this.f(url, {
        method: init.method ?? "GET",
        headers,
        body: init.body,
        cache: "no-store",
        credentials: "same-origin",
      });
    } catch {
      throw new LoiVault("network");
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: res.status, body };
  }

  private loiTheoStatus(status: number): LoiVault {
    if (status === 401) return new LoiVault("auth");
    if (status === 503) return new LoiVault("disabled");
    return new LoiVault("locked");
  }

  private async docMe(): Promise<{ id: number; orgId: number; role: string }> {
    const r = await this.goi("/api/auth/me");
    const u = r.body?.user as { id?: unknown; orgId?: unknown; role?: unknown } | undefined;
    if (r.status !== 200 || !u) throw this.loiTheoStatus(r.status === 200 ? 401 : r.status);
    if (
      typeof u.id !== "number" ||
      typeof u.orgId !== "number" ||
      typeof u.role !== "string" ||
      !Number.isSafeInteger(u.id) ||
      !Number.isSafeInteger(u.orgId)
    )
      throw new LoiVault("locked");
    return { id: u.id, orgId: u.orgId, role: u.role };
  }

  private nhanNguCanh(
    raw: unknown,
    projectId: number | null,
  ): { projectId: number; deviceId: string } {
    const c = raw as
      | {
          contextId?: unknown;
          deviceId?: unknown;
          projectId?: unknown;
          expiresAt?: unknown;
          serverTime?: unknown;
        }
      | undefined;
    if (
      !c ||
      typeof c.contextId !== "string" ||
      typeof c.deviceId !== "string" ||
      !UUID_RE.test(c.deviceId) ||
      typeof c.projectId !== "number" ||
      !Number.isSafeInteger(c.projectId) ||
      typeof c.expiresAt !== "string" ||
      typeof c.serverTime !== "string"
    )
      throw new LoiVault("locked");
    if (projectId != null && c.projectId !== projectId) throw new LoiVault("locked");
    const conLai = Date.parse(c.expiresAt) - Date.parse(c.serverTime);
    if (!Number.isFinite(conLai) || conLai <= 0) throw new LoiVault("locked");
    const tuong = this.dongHo.tuong();
    this.nguCanh = {
      contextId: c.contextId,
      hanDonDieu: this.dongHo.donDieu() + conLai,
      hanTuong: tuong + conLai,
      tuongLucNhan: tuong,
    };
    return { projectId: c.projectId, deviceId: c.deviceId };
  }

  /** Lấy context; thiết bị chưa đăng ký → đăng ký (idempotent) rồi thử lại đúng 1 lần. */
  private async layNguCanh(expectedProjectId: number | null) {
    const body = JSON.stringify(expectedProjectId == null ? {} : { expectedProjectId });
    let r = await this.goi("/api/offline/context", { method: "POST", body });
    if (r.status === 403 && r.body?.code === "device_unregistered") {
      const dk = await this.goi("/api/offline/devices", { method: "POST", body: "{}" });
      if (dk.status !== 200 && dk.status !== 201) throw this.loiTheoStatus(dk.status);
      r = await this.goi("/api/offline/context", { method: "POST", body });
    }
    if (r.status !== 200) throw this.loiTheoStatus(r.status);
    return this.nhanNguCanh(r.body?.context, expectedProjectId);
  }

  private async nhapKhoa(k: KhoaApi, projectId: number): Promise<KhoaBoNho | null> {
    if (
      typeof k.keyId !== "string" ||
      !UUID_RE.test(k.keyId) ||
      typeof k.keyVersion !== "number" ||
      !Number.isSafeInteger(k.keyVersion) ||
      typeof k.manifestHash !== "string" ||
      !HEX64_RE.test(k.manifestHash) ||
      typeof k.dek !== "string"
    )
      return null;
    // Manifest dạng chuẩn server trả, đúng dự án, và băm ra đúng manifestHash đã gắn vào AAD.
    const m = docManifestDaLuu(k.manifest, projectId);
    if (!m || (await bamManifest(m)) !== k.manifestHash) return null;
    let tho: Uint8Array<ArrayBuffer> | null = null;
    try {
      tho = base64urlDecode(k.dek, 32);
      const key = await nhapDekBoNho(tho);
      return {
        keyId: k.keyId,
        keyVersion: k.keyVersion,
        manifestHash: k.manifestHash,
        manifest: m,
        tasks: new Set(m.tasks),
        key,
      };
    } catch {
      return null;
    } finally {
      tho?.fill(0);
    }
  }

  /**
   * Mở vault (online). Đồng thời nhiều lời gọi dùng chung một lần mở. Trả true khi ACTIVE.
   * /api/auth/me được đọc TRƯỚC và SAU khi mở khoá — đổi actor giữa chừng → LOCKED.
   */
  moKhoa(): Promise<boolean> {
    if (this.trangThai === "active" && this.conHieuLuc()) return Promise.resolve(true);
    if (this.trangThai === "disabled") return Promise.resolve(false);
    if (!this.dangMo) {
      this.dangMo = this.thucHienMo().finally(() => {
        this.dangMo = null;
      });
    }
    return this.dangMo;
  }

  private async thucHienMo(): Promise<boolean> {
    this.khoa();
    this.datTrangThai("verifying");
    try {
      const me = await this.docMe();
      const { projectId, deviceId } = await this.layNguCanh(null);
      const r = await this.goi("/api/offline/vault/unlock", {
        method: "POST",
        body: "{}",
        context: true,
      });
      if (r.status !== 200) throw this.loiTheoStatus(r.status);
      const ds = Array.isArray(r.body?.keys) ? (r.body.keys as KhoaApi[]) : [];
      const keys = new Map<string, KhoaBoNho>();
      for (const k of ds) {
        const nhap = await this.nhapKhoa(k, projectId);
        if (nhap) keys.set(nhap.keyId, nhap);
      }
      const me2 = await this.docMe();
      if (me2.id !== me.id || me2.orgId !== me.orgId) throw new LoiVault("owner");
      this.keys = keys;
      this.role = me.role;
      this.chuHienHanh = { ownerUserId: me.id, orgId: me.orgId, projectId, deviceId };
      this.datTrangThai("active");
      return true;
    } catch (e) {
      this.khoa(e instanceof LoiVault && e.loai === "disabled" ? "disabled" : "locked");
      return false;
    }
  }

  /** Context cho request gửi hàng đợi: làm mới online khi gần hết hạn; lệch dự án/thiết bị → khoá. */
  async contextGui(): Promise<string> {
    const chu = this.chu();
    const c = this.nguCanh;
    if (!chu || !c) throw new LoiVault("locked");
    const conLai = Math.min(c.hanDonDieu - this.dongHo.donDieu(), c.hanTuong - this.dongHo.tuong());
    if (conLai > LAM_MOI_TRUOC_MS && this.dongHo.tuong() >= c.tuongLucNhan - DUNG_SAI_LUI_MS)
      return c.contextId;
    try {
      const moi = await this.layNguCanh(chu.projectId);
      if (moi.deviceId !== chu.deviceId) throw new LoiVault("owner");
    } catch (e) {
      if (!(e instanceof LoiVault) || e.loai !== "network") this.khoa();
      throw e;
    }
    const moi = this.nguCanh as NguCanh | null;
    if (!moi) throw new LoiVault("locked");
    return moi.contextId;
  }

  /**
   * Bảo đảm có khoá cho manifest (online): đã có khoá cùng manifestHash → dùng lại; chưa có →
   * xin khoá mới. Server từ chối (403 manifest_forbidden) → ghi nhớ trong phiên, không gọi lại.
   */
  async damBaoKhoa(manifestInput: {
    tasks?: number[];
    taskActions?: string[];
    diary?: { from: string; to: string } | null;
  }): Promise<boolean> {
    const chu = this.chu();
    if (!chu) return false;
    const m = chuanHoaManifest(manifestInput, chu.projectId);
    if (!m.ok) return false;
    const hash = await bamManifest(m.manifest);
    for (const k of this.keys.values()) if (k.manifestHash === hash) return true;
    if (this.daCam.has(hash)) return false;
    await this.contextGui();
    const r = await this.goi("/api/offline/vault/keys", {
      method: "POST",
      body: JSON.stringify({ manifest: manifestInput }),
      context: true,
    });
    if (r.status === 403 && r.body?.code === "manifest_forbidden") {
      this.daCam.add(hash);
      return false;
    }
    if (r.status !== 200 && r.status !== 201) {
      if (r.status === 401 || r.status === 409) this.khoa();
      return false;
    }
    const nhap = await this.nhapKhoa((r.body?.key ?? {}) as KhoaApi, chu.projectId);
    if (!nhap || nhap.manifestHash !== hash || !this.chu()) return false;
    this.keys.set(nhap.keyId, nhap);
    return true;
  }

  /**
   * Khoá mới nhất (keyVersion lớn nhất) có manifest phủ TOÀN BỘ tài nguyên của thao tác:
   * tick/tick_batch/ảnh → mọi task thuộc manifest + hành động tương ứng; nhật ký → ngày nằm trong
   * khoảng. Không có → null (không cho tạo thao tác ngoài capability đã tải — DATA-MIGRATIONS §2).
   */
  timKhoa(kind: QueueKind, can: { taskIds?: number[]; date?: string }): string | null {
    if (!this.conHieuLuc()) return null;
    let tot: KhoaBoNho | null = null;
    for (const k of this.keys.values()) {
      const m = k.manifest;
      let phu = false;
      if (kind === "diary_note") {
        phu = !!m.diary && !!can.date && m.diary.from <= can.date && can.date <= m.diary.to;
      } else {
        const hanhDong = kind === "photo" ? "photo" : "tick";
        const ds = can.taskIds ?? [];
        phu =
          ds.length > 0 && m.taskActions.includes(hanhDong) && ds.every((id) => k.tasks.has(id));
      }
      if (phu && (!tot || k.keyVersion > tot.keyVersion)) tot = k;
    }
    return tot?.keyId ?? null;
  }

  private aad(
    rec: Pick<QueueRecord, "vaultKeyId" | "operationId" | "kind" | "sequence">,
    chu: ChuSoHuu,
    k: KhoaBoNho,
  ) {
    return aadPayload({
      keyId: k.keyId,
      manifestHash: k.manifestHash,
      ownerUserId: chu.ownerUserId,
      orgId: chu.orgId,
      projectId: chu.projectId,
      deviceId: chu.deviceId,
      keyVersion: k.keyVersion,
      operationId: rec.operationId,
      kind: rec.kind,
      sequence: rec.sequence,
    });
  }

  async maHoa(
    meta: Pick<QueueRecord, "vaultKeyId" | "operationId" | "kind" | "sequence">,
    banRo: Uint8Array<ArrayBuffer>,
  ): Promise<{ iv: string; ciphertext: string }> {
    const chu = this.chu();
    const k = this.keys.get(meta.vaultKeyId);
    if (!chu || !k) throw new LoiVault("locked");
    return maHoaPayload(k.key, banRo, this.aad(meta, chu, k));
  }

  /** Giải mã bản ghi của CHÍNH chủ hiện hành; chủ khác/khoá chưa mở → LoiVault, không thử. */
  async giaiMa(rec: QueueRecord): Promise<Uint8Array> {
    const chu = this.chu();
    if (!chu) throw new LoiVault("locked");
    if (!cungChu(rec, chu)) throw new LoiVault("owner");
    const k = this.keys.get(rec.vaultKeyId);
    if (!k) throw new LoiVault("locked");
    return giaiMaPayload(
      k.key,
      { iv: rec.iv, ciphertext: rec.ciphertext },
      this.aad(
        rec,
        {
          ownerUserId: rec.ownerUserId,
          orgId: rec.orgId,
          projectId: rec.projectId,
          deviceId: rec.deviceId,
        },
        k,
      ),
    );
  }
}
