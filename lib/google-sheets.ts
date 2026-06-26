import { JWT } from "google-auth-library";

// Client mỏng cho Google Sheets REST API v4 dùng Service Account.
// Chỉ kéo `google-auth-library` để mint access token; mọi lời gọi API qua fetch.
//
// Cấu hình qua biến môi trường (fail-fast khi gọi sync, không ảnh hưởng build):
//   GOOGLE_SERVICE_ACCOUNT_JSON  — nội dung JSON key service account, HOẶC
//   GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY  — cặp email + private key.
//   GOOGLE_SHEET_ID   — ID spreadsheet (chia sẻ quyền Editor cho email SA).
//   GOOGLE_SHEET_TAB  — (tuỳ chọn) tên tab, mặc định "VatTu".

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export type SheetCredentials = { email: string; privateKey: string };

// Đọc + kiểm cấu hình; thiếu là ném lỗi tiếng Việt rõ ràng (chủ đích fail-fast).
function readCredentials(): SheetCredentials {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    let parsed: { client_email?: string; private_key?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON không phải JSON hợp lệ.");
    }
    if (!parsed.client_email || !parsed.private_key)
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON thiếu client_email hoặc private_key.");
    return { email: parsed.client_email, privateKey: normalizeKey(parsed.private_key) };
  }

  const email = process.env.GOOGLE_SA_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SA_PRIVATE_KEY?.trim();
  if (!email || !privateKey)
    throw new Error(
      "Thiếu cấu hình Google Sheets — cần GOOGLE_SERVICE_ACCOUNT_JSON hoặc cặp GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY.");
  return { email, privateKey: normalizeKey(privateKey) };
}

// Private key dán qua biến môi trường thường có "\n" literal — chuyển về xuống dòng thật.
const normalizeKey = (k: string) => k.replace(/\\n/g, "\n");

function readSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID?.trim();
  if (!id) throw new Error("Thiếu GOOGLE_SHEET_ID — ID của Google Sheet cần đồng bộ.");
  return id;
}

const readTabName = () => process.env.GOOGLE_SHEET_TAB?.trim() || "VatTu";

export type SheetClient = {
  /** Đọc toàn bộ vùng dữ liệu của tab (mảng hàng × ô, chuỗi). */
  readRows(): Promise<string[][]>;
  /** Ghi đè vùng A1 bắt đầu từ ô trên-trái bằng `rows`. */
  writeRows(startCell: string, rows: (string | number)[][]): Promise<void>;
  /** Xoá sạch nội dung tab (giữ tab). */
  clear(): Promise<void>;
  tab: string;
};

// Tạo client đã xác thực; gọi 1 lần đầu mỗi lần sync.
export async function getSheetClient(): Promise<SheetClient> {
  const { email, privateKey } = readCredentials();
  const sheetId = readSheetId();
  const tab = readTabName();

  const jwt = new JWT({ email, key: privateKey, scopes: SCOPES });

  async function authHeaders(): Promise<Record<string, string>> {
    const { token } = await jwt.getAccessToken();
    if (!token) throw new Error("Không lấy được access token Google (kiểm tra service account).");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  async function call(path: string, init?: RequestInit): Promise<unknown> {
    const headers = { ...(await authHeaders()), ...(init?.headers as Record<string, string>) };
    const res = await fetch(`${API_BASE}/${sheetId}${path}`, { ...init, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Sheets API lỗi ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json().catch(() => ({}));
  }

  const range = (a1: string) => encodeURIComponent(`${tab}!${a1}`);

  return {
    tab,
    async readRows() {
      const data = (await call(`/values/${range("A1:Z100000")}`)) as { values?: string[][] };
      return data.values ?? [];
    },
    async writeRows(startCell, rows) {
      await call(`/values/${range(startCell)}?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ values: rows }),
      });
    },
    async clear() {
      await call(`/values/${range("A1:Z100000")}:clear`, { method: "POST" });
    },
  };
}
