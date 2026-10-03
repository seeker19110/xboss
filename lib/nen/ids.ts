/** ID dương an toàn: chỉ nhận số nguyên hoặc chuỗi thập phân chuẩn, không ép kiểu. */
export function parsePositiveId(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[1-9]\d*$/.test(value)) return null;
  const id = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
