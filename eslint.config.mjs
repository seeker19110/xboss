import nextConfig from "eslint-config-next/core-web-vitals";
import tsParser from "@typescript-eslint/parser";

const config = [
  // Bộ khung tạm (staging để tự merge) — không lint, xem .gitignore
  { ignores: ["_framework-dropins/**"] },
  // Worktree tạm của agent (chứa build artifact .next riêng) — không lint, xem .gitignore
  { ignores: [".claude/**"] },
  ...nextConfig,
  {
    // ESLint 10: eslint-plugin-react tự dò phiên bản React bằng API cũ
    // (`context.getFilename`) đã bị gỡ → khai báo thẳng phiên bản để bỏ qua bước dò.
    settings: { react: { version: "19.2" } },
    rules: {
      // React Compiler rules (react-hooks v5) quá strict với code hiện tại
      // Các pattern fetch-in-effect và inline component là hợp lệ trong dự án này
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/incompatible-library": "off",
      // Dự án dùng hard navigation (window.location.href) có chủ đích khi đổi project/401/logout
      // để reset hoàn toàn cache trình duyệt, service worker và state client
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  {
    // ESLint 10: parser babel gói kèm trong `eslint-config-next` (dùng cho file .js/.mjs)
    // trả về scope manager của eslint-scope cũ, thiếu `addGlobals` → ESLint 10 crash.
    // Dùng thẳng parser của typescript-eslint (đọc được cả JS) cho nhóm file này.
    files: ["**/*.{js,mjs,cjs,jsx}"],
    languageOptions: { parser: tsParser },
  },
];

export default config;
