// Nạp biến môi trường cho script chạy ngoài Next (tsx): .env.local trước, .env sau.
import { config } from "dotenv";
config({ path: ".env.local" });
config();
