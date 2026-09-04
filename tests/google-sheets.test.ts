import { test, mock } from "node:test";
import assert from "node:assert/strict";

// Client Google Sheets là cửa duy nhất ra bảng vật tư dùng chung với ngoài công trường.
// Hai nhóm bất biến cần khoá:
//   1. ĐỌC CẤU HÌNH fail-fast — thiếu/sai biến môi trường phải ném lỗi TIẾNG VIỆT nói rõ
//      thiếu gì, ngay lúc gọi sync, chứ không phải im lặng đồng bộ nửa vời rồi ghi đè
//      bảng vật tư thật bằng dữ liệu rỗng.
//   2. GỌI API đúng tab và đúng vùng — sai tab là ghi đè nhầm sheet của người khác.
//
// `google-auth-library` đi thẳng ra mạng bằng http của Node (KHÔNG qua fetch toàn cục), nên
// phải mock.module chính thư viện đó; phần còn lại của client dùng fetch toàn cục nên thay
// trực tiếp là đủ. Cờ --experimental-test-module-mocks bật sẵn trong scripts/test-flags.mjs.

const ENV_KEYS = [
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "GOOGLE_SA_EMAIL",
  "GOOGLE_SA_PRIVATE_KEY",
  "GOOGLE_SHEET_ID",
  "GOOGLE_SHEET_TAB",
] as const;

/** Đặt môi trường sạch rồi áp đúng các biến của ca test — tránh rò cấu hình giữa các ca. */
function datEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
}

// mock.module chỉ đặt ĐƯỢC MỘT LẦN cho mỗi định danh module trong một tiến trình test, nên
// mock đúng một lần ở đây và điều khiển hành vi qua hai biến dưới thay vì mock lại mỗi ca.
let tokenTraVe: string | null = "tok";
let keyNhanDuoc = "";
mock.module("google-auth-library", {
  namedExports: {
    JWT: class {
      constructor(opts: { key: string }) {
        keyNhanDuoc = opts.key;
      }
      async getAccessToken() {
        return { token: tokenTraVe };
      }
    },
  },
});

/** Đặt token mà JWT giả sẽ trả về cho ca test hiện tại. */
function datToken(token: string | null) {
  tokenTraVe = token;
}

/** Nạp module với query khác nhau để mỗi ca có instance riêng (module cache theo URL). */
let lanNap = 0;
const napClient = async () =>
  (await import(
    `@/lib/vat-tu/google-sheets?ca=${++lanNap}`
  )) as typeof import("@/lib/vat-tu/google-sheets");

test("Thiếu hoàn toàn cấu hình → báo lỗi nói rõ cần biến nào", async () => {
  datEnv({});
  datToken("tok");
  const { getSheetClient } = await napClient();
  await assert.rejects(
    () => getSheetClient(),
    /Thiếu cấu hình Google Sheets.*GOOGLE_SERVICE_ACCOUNT_JSON.*GOOGLE_SA_EMAIL/s,
  );
});

test("GOOGLE_SERVICE_ACCOUNT_JSON không phải JSON hợp lệ → lỗi rõ ràng", async () => {
  datEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: "{ đây không phải json", GOOGLE_SHEET_ID: "sheet-1" });
  datToken("tok");
  const { getSheetClient } = await napClient();
  await assert.rejects(() => getSheetClient(), /không phải JSON hợp lệ/);
});

test("JSON service account thiếu client_email hoặc private_key → lỗi rõ ràng", async () => {
  datToken("tok");
  for (const thieu of [{ private_key: "k" }, { client_email: "a@b.c" }, {}]) {
    datEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(thieu), GOOGLE_SHEET_ID: "sheet-1" });
    const { getSheetClient } = await napClient();
    await assert.rejects(() => getSheetClient(), /thiếu client_email hoặc private_key/);
  }
});

test("Có credentials nhưng thiếu GOOGLE_SHEET_ID → lỗi rõ ràng", async () => {
  datEnv({ GOOGLE_SA_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_SA_PRIVATE_KEY: "k" });
  datToken("tok");
  const { getSheetClient } = await napClient();
  await assert.rejects(() => getSheetClient(), /Thiếu GOOGLE_SHEET_ID/);
});

test("Private key dán qua env có '\\n' literal được chuyển về xuống dòng thật", async () => {
  // Đây là cái bẫy kinh điển khi dán key vào biến môi trường: không chuyển đổi thì thư viện
  // ký JWT sẽ từ chối key và lỗi hiện ra ở tận bước gọi API, rất khó truy.
  datEnv({
    GOOGLE_SA_EMAIL: "sa@x.iam.gserviceaccount.com",
    GOOGLE_SA_PRIVATE_KEY: "dong1\\ndong2",
    GOOGLE_SHEET_ID: "sheet-1",
  });
  datToken("tok");
  const { getSheetClient } = await napClient();
  await getSheetClient();
  assert.equal(keyNhanDuoc, "dong1\ndong2");
});

test("Tab mặc định là 'VatTu', đặt GOOGLE_SHEET_TAB thì theo cấu hình", async () => {
  datToken("tok");
  datEnv({
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "a@b.c", private_key: "k" }),
    GOOGLE_SHEET_ID: "sheet-1",
  });
  assert.equal((await (await napClient()).getSheetClient()).tab, "VatTu");

  datEnv({
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "a@b.c", private_key: "k" }),
    GOOGLE_SHEET_ID: "sheet-1",
    GOOGLE_SHEET_TAB: "  BangVatTu  ",
  });
  assert.equal((await (await napClient()).getSheetClient()).tab, "BangVatTu");

  // Tab đặt thành chuỗi rỗng/khoảng trắng → coi như không đặt, quay về mặc định.
  datEnv({
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "a@b.c", private_key: "k" }),
    GOOGLE_SHEET_ID: "sheet-1",
    GOOGLE_SHEET_TAB: "   ",
  });
  assert.equal((await (await napClient()).getSheetClient()).tab, "VatTu");
});

test("Không lấy được access token → dừng ngay, không gọi API", async () => {
  datEnv({
    GOOGLE_SA_EMAIL: "sa@x.iam.gserviceaccount.com",
    GOOGLE_SA_PRIVATE_KEY: "k",
    GOOGLE_SHEET_ID: "sheet-1",
  });
  datToken(null);
  const fetchGoc = globalThis.fetch;
  let goiApi = 0;
  globalThis.fetch = (async () => {
    goiApi++;
    return new Response("{}");
  }) as typeof fetch;
  try {
    const client = await (await napClient()).getSheetClient();
    await assert.rejects(() => client.readRows(), /Không lấy được access token/);
    assert.equal(goiApi, 0, "chưa có token thì không được gọi API");
  } finally {
    globalThis.fetch = fetchGoc;
  }
});

test("readRows: gọi đúng tab + vùng, sheet trống trả mảng rỗng chứ không undefined", async () => {
  datEnv({
    GOOGLE_SA_EMAIL: "sa@x.iam.gserviceaccount.com",
    GOOGLE_SA_PRIVATE_KEY: "k",
    GOOGLE_SHEET_ID: "sheet-42",
    GOOGLE_SHEET_TAB: "VatTu",
  });
  datToken("tok-123");
  const fetchGoc = globalThis.fetch;
  const goi: { url: string; auth: string | undefined }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    goi.push({
      url: String(url),
      auth: (init?.headers as Record<string, string>)?.Authorization,
    });
    return new Response(
      JSON.stringify({
        values: [
          ["ID", "Tên"],
          ["1", "Ống gió"],
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;
  try {
    const client = await (await napClient()).getSheetClient();
    assert.deepEqual(await client.readRows(), [
      ["ID", "Tên"],
      ["1", "Ống gió"],
    ]);
    assert.equal(goi.length, 1);
    assert.match(goi[0].url, /\/sheet-42\/values\/VatTu!A1%3AZ100000$/);
    assert.equal(goi[0].auth, "Bearer tok-123");
  } finally {
    globalThis.fetch = fetchGoc;
  }

  // Sheet trống: API không trả trường `values` — phải quy về [] để bên gọi lặp được ngay.
  globalThis.fetch = (async () =>
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    const client = await (await napClient()).getSheetClient();
    assert.deepEqual(await client.readRows(), []);
  } finally {
    globalThis.fetch = fetchGoc;
  }
});

test("writeRows: PUT đúng ô bắt đầu, giá trị RAW, thân là mảng hàng", async () => {
  datEnv({
    GOOGLE_SA_EMAIL: "sa@x.iam.gserviceaccount.com",
    GOOGLE_SA_PRIVATE_KEY: "k",
    GOOGLE_SHEET_ID: "sheet-42",
    GOOGLE_SHEET_TAB: "Kho",
  });
  datToken("tok");
  const fetchGoc = globalThis.fetch;
  let ghi: { url: string; method?: string; body?: string } = { url: "" };
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    ghi = { url: String(url), method: init?.method, body: init?.body as string };
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const client = await (await napClient()).getSheetClient();
    await client.writeRows("B2", [["1", 2]]);
    assert.equal(ghi.method, "PUT");
    assert.match(ghi.url, /\/values\/Kho!B2\?valueInputOption=RAW$/);
    assert.deepEqual(JSON.parse(ghi.body!), { values: [["1", 2]] });
  } finally {
    globalThis.fetch = fetchGoc;
  }
});

test("API trả lỗi → ném lỗi kèm mã trạng thái và trích đoạn thân phản hồi", async () => {
  datEnv({
    GOOGLE_SA_EMAIL: "sa@x.iam.gserviceaccount.com",
    GOOGLE_SA_PRIVATE_KEY: "k",
    GOOGLE_SHEET_ID: "sheet-1",
  });
  datToken("tok");
  const fetchGoc = globalThis.fetch;

  // Thân lỗi rất dài phải bị cắt còn 300 ký tự — log lỗi không được nuốt trọn 1 trang HTML.
  globalThis.fetch = (async () => new Response("X".repeat(1000), { status: 403 })) as typeof fetch;
  try {
    const client = await (await napClient()).getSheetClient();
    await assert.rejects(client.readRows(), (e: Error) => {
      assert.match(e.message, /Google Sheets API lỗi 403/);
      assert.equal(e.message.includes("X".repeat(300)), true);
      assert.equal(e.message.includes("X".repeat(301)), false);
      return true;
    });
  } finally {
    globalThis.fetch = fetchGoc;
  }

  // Thân lỗi không đọc được (stream hỏng) vẫn phải ném lỗi có mã, không nuốt.
  globalThis.fetch = (async () => ({
    ok: false,
    status: 500,
    text: async () => {
      throw new Error("stream hỏng");
    },
  })) as unknown as typeof fetch;
  try {
    const client = await (await napClient()).getSheetClient();
    await assert.rejects(client.readRows(), /Google Sheets API lỗi 500/);
  } finally {
    globalThis.fetch = fetchGoc;
  }
});

test("Phản hồi 200 nhưng thân không phải JSON → coi như rỗng, không làm sập sync", async () => {
  datEnv({
    GOOGLE_SA_EMAIL: "sa@x.iam.gserviceaccount.com",
    GOOGLE_SA_PRIVATE_KEY: "k",
    GOOGLE_SHEET_ID: "sheet-1",
  });
  datToken("tok");
  const fetchGoc = globalThis.fetch;
  globalThis.fetch = (async () => new Response("không-phải-json", { status: 200 })) as typeof fetch;
  try {
    const client = await (await napClient()).getSheetClient();
    assert.deepEqual(await client.readRows(), []);
  } finally {
    globalThis.fetch = fetchGoc;
  }
});
