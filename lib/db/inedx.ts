// lib/db/index.ts
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

const client = createClient({
  url: "file:./xboss.db",   // Tạo file database local
});

export const db = drizzle(client);
export * from "./schema";