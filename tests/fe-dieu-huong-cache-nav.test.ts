import "./setup"; // quy ước: đứng đầu (dù test thuần, không chạm DB)
import { test } from "node:test";
import assert from "node:assert/strict";
import { laHrefNoiBoMem, phaiTaiLaiCung } from "@/app/lib/dieuHuong";
import {
  TTL_CAU_HINH_NAV_MS,
  taiCauHinhNav,
  taiCoTinhNang,
  xoaCacheCauHinhNav,
} from "@/app/lib/cauHinhNav";
import { phatDoiNguCanh } from "@/app/lib/contextEpoch";
import { doanCheDoTrangChu, ghiCheDoGanNhat, HOME_MODE_KEY } from "@/app/lib/homeMode";

// ===== FE-1: quy tắc điều hướng client-side (app/lib/dieuHuong.ts) =====

test("laHrefNoiBoMem: chỉ trang nội bộ không query/hash", () => {
  for (const href of ["/", "/diary", "/hub/dash.site", "/tracking/ogtd"])
    assert.equal(laHrefNoiBoMem(href), true, href);
  for (const href of [
    "https://example.com/x",
    "//evil.test/x",
    "mailto:a@b.c",
    "#top",
    "/api/export/excel",
    "/api",
    "/api?x=1",
    "/procurement?tab=orders",
    "/governance?tab=lifecycle",
    "/report#in",
  ])
    assert.equal(laHrefNoiBoMem(href), false, href);
  // `/apiary` không phải route API.
  assert.equal(laHrefNoiBoMem("/apiary"), true);
});

test("phaiTaiLaiCung: URL hiện tại có query hoặc cùng pathname → tải lại cứng như <a> cũ", () => {
  const o = (pathname: string, search = "") => ({ pathname, search });
  assert.equal(phaiTaiLaiCung("/diary", o("/tracking/ogtd")), false);
  assert.equal(phaiTaiLaiCung("/", o("/diary")), false);
  // Query cũ (vd ?status=) sẽ rò vào state khởi tạo của trang mới (Next đổi URL sau render).
  assert.equal(phaiTaiLaiCung("/tracking/ogtd", o("/approvals", "?status=cho")), true);
  // Bấm lại chính trang đang mở = làm mới trang.
  assert.equal(phaiTaiLaiCung("/diary", o("/diary")), true);
  // href không đi mềm được thì luôn tải lại cứng.
  assert.equal(phaiTaiLaiCung("/procurement?tab=orders", o("/diary")), true);
  assert.equal(phaiTaiLaiCung("/api/export/excel", o("/diary")), true);
});

// ===== P7: cache module cấu hình nav (app/lib/cauHinhNav.ts) =====

type FetchCall = string;
function giaLapTrinhDuyet(cookie = "xboss_project=7") {
  const calls: FetchCall[] = [];
  let traVe: () => Response = () =>
    Response.json({ settings: { "dash.a": false }, flags: { hse: false } });
  const g = globalThis as unknown as Record<string, unknown>;
  const cu = { fetch: g.fetch, document: g.document, Date: Date.now };
  const doc = { cookie };
  g.document = doc;
  g.fetch = async (url: string) => {
    calls.push(url);
    return traVe();
  };
  let now = 1_000_000;
  Date.now = () => now;
  xoaCacheCauHinhNav();
  return {
    calls,
    doc,
    tien: (ms: number) => (now += ms),
    datTraVe: (fn: () => Response) => (traVe = fn),
    khoiPhuc: () => {
      g.fetch = cu.fetch;
      g.document = cu.document;
      Date.now = cu.Date;
      xoaCacheCauHinhNav();
    },
  };
}

test("cauHinhNav: một request dùng chung trong TTL, vẫn bust cache SW bằng query `_`", async () => {
  const b = giaLapTrinhDuyet();
  try {
    const [a, c] = await Promise.all([taiCauHinhNav(), taiCauHinhNav()]);
    assert.deepEqual(a, { "dash.a": false });
    assert.equal(a, c);
    assert.deepEqual(await taiCoTinhNang(), { hse: false });
    b.tien(TTL_CAU_HINH_NAV_MS - 1);
    await taiCauHinhNav();
    await taiCoTinhNang();
    assert.equal(b.calls.length, 2);
    assert.match(b.calls[0], /^\/api\/nav-settings\?_=\d+$/);
    assert.match(b.calls[1], /^\/api\/feature-flags\?_=\d+$/);
    b.tien(1); // hết TTL → tải lại
    await taiCauHinhNav();
    assert.equal(b.calls.length, 3);
  } finally {
    b.khoiPhuc();
  }
});

test("cauHinhNav: khoá theo dự án — đổi cookie dự án thì tải lại", async () => {
  const b = giaLapTrinhDuyet("xboss_project=7");
  try {
    await taiCoTinhNang();
    b.doc.cookie = "xboss_project=8";
    await taiCoTinhNang();
    assert.equal(b.calls.length, 2);
  } finally {
    b.khoiPhuc();
  }
});

test("cauHinhNav: xoá khi admin ghi và khi đổi ngữ cảnh (phatDoiNguCanh)", async () => {
  const b = giaLapTrinhDuyet();
  try {
    await taiCauHinhNav();
    xoaCacheCauHinhNav();
    await taiCauHinhNav();
    assert.equal(b.calls.length, 2);
    phatDoiNguCanh("switch");
    await taiCauHinhNav();
    assert.equal(b.calls.length, 3);
  } finally {
    b.khoiPhuc();
  }
});

test("cauHinhNav: lỗi/401/sai hình dạng → null và KHÔNG giữ cache (lần sau thử lại)", async () => {
  const b = giaLapTrinhDuyet();
  try {
    b.datTraVe(() => Response.json({ error: "Chưa đăng nhập" }, { status: 401 }));
    assert.equal(await taiCauHinhNav(), null);
    b.datTraVe(() => Response.json({ settings: ["x"] }));
    assert.equal(await taiCauHinhNav(), null);
    b.datTraVe(() => {
      throw new Error("mất mạng");
    });
    assert.equal(await taiCauHinhNav(), null);
    b.datTraVe(() => Response.json({ settings: { "dash.b": true } }));
    assert.deepEqual(await taiCauHinhNav(), { "dash.b": true });
    assert.equal(b.calls.length, 4);
  } finally {
    b.khoiPhuc();
  }
});

// ===== FE-6: đoán chế độ trang chủ để tải trước chunk (app/lib/homeMode.ts) =====

test("doanCheDoTrangChu: ưu tiên chế độ hiển thị gần nhất, rồi lựa chọn đã lưu, không đoán bừa", () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const cu = g.window;
  const kho = new Map<string, string>();
  g.window = {
    localStorage: {
      getItem: (k: string) => kho.get(k) ?? null,
      setItem: (k: string, v: string) => void kho.set(k, v),
    },
  };
  try {
    assert.equal(doanCheDoTrangChu(), null);
    kho.set(HOME_MODE_KEY, "hien-truong");
    assert.equal(doanCheDoTrangChu(), "hien-truong");
    ghiCheDoGanNhat("dieu-hanh");
    assert.equal(doanCheDoTrangChu(), "dieu-hanh");
    kho.set("xboss_home_mode_gan_nhat", "rac");
    assert.equal(doanCheDoTrangChu(), "hien-truong");
  } finally {
    g.window = cu;
  }
});
