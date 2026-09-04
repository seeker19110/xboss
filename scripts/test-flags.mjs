// Cờ Node dùng chung cho mọi tiến trình chạy test (cả đường tuần tự trong run-tests.mjs lẫn
// đường song song trong run-tests-parallel.mjs).
//
// Tách thành module riêng thay vì khai trong run-tests.mjs: run-tests-parallel.mjs được
// run-tests.mjs `await import(...)`, nên nếu nó import ngược lại run-tests.mjs thì hai file
// chờ nhau và runner treo ở top-level await (đã dính thật khi thêm cờ này).
//
// `mock.module()` của node:test còn nằm sau cờ experimental (Node 22/24). Một số test buộc
// phải thay module ngoài để phủ được nhánh thật — vd lib/vat-tu/google-sheets.ts gọi
// google-auth-library, thư viện này đi thẳng ra mạng bằng http của Node chứ KHÔNG qua
// `fetch` toàn cục, nên không chặn được bằng cách gán lại globalThis.fetch. Bật cờ cho MỌI
// tiến trình con; file không dùng mock hoàn toàn không bị ảnh hưởng.
export const CO_MOCK_MODULE = "--experimental-test-module-mocks";
