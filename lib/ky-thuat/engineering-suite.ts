// lib/engineering-suite.ts — Centralized Barrel Index for XBoss Engineering OS (M65 – M72)
// Cung cấp một điểm truy cập duy nhất (Single Point of Entry) cho toàn bộ hệ sinh thái MEPF AI & Engineering

// (1) CAD Studio & Vector Diffing (M65) và (2) CAD 5D QTO & BBNT điện tử (M66) đã được gỡ khỏi
// sản phẩm cùng toàn bộ cụm CAD/BIM — xem PROGRESS.md.

// 3. Autonomous MEPF Lifecycle & Smart T&C (M67)
export * from "@/lib/ky-thuat/engineering-mepf-takeoff";
export * from "@/lib/ky-thuat/engineering-mepf-tc";

// 4. Computational Hydraulics & SMACNA Hanger (M68)
export * from "@/lib/ky-thuat/engineering-mepf-hydraulic";

// 5. 1D Cutting Stock Nesting Optimization (M68)
export * from "@/lib/ky-thuat/engineering-mepf-nesting";

// (6) AI Voice Field Logger & Productivity Index (M68), (7) Omnipotent Shopdrawing LOD 400 &
// Sleeve Matrix (M69) và (8) 5D QS Cost Engineering & FIDIC Claim Defense (M69) đã bị xoá
// 2026-09-22 — không có giá trị nghiệp vụ đủ rõ so với chi phí bảo trì, UI duy nhất gọi tới là
// 3 nút demo trên /engineering/mepf-lifecycle (xem PROGRESS.md).

// (9) AI Reality Scan-to-BIM & Deviation Mesh (M70) đã được gỡ cùng cụm CAD/BIM.

// 10. Closed-Loop WBS & Payment Sync (M70)
export * from "@/lib/ky-thuat/engineering-closed-loop-sync";

// (11) Predictive Maintenance MTBF & RUL (M71), (12) Embodied Carbon LCA & Green Building (M71),
// (13) LOD 500 Digital Handover Passport (M71), (14) Multi-Agent Real-Time Debate Swarm (M72,
// route riêng /api/engineering/multi-agent-copilot — khác cụm Swarm Debate ở mục dưới) và
// (15) Dynamic Project Health Cockpit & Monte Carlo (M72) đã bị xoá 2026-09-21: backend xong
// nhưng chưa từng có route/UI nào gọi tới (dead-routes-allowlist "chờ chốt hướng ở đề xuất #6
// audit 2026-08-25" — người dùng quyết định xoá thay vì gắn UI, xem PROGRESS.md).

// (16) Hyper-Spatial WASM Geometry & Cache (M73) đã bị xoá cùng trang /engineering/quantum-hub.

// (17) Distributed Engineering Task Queue (M73) đã được gỡ cùng trang `/engineering/mepf-studio`
// và route `/api/engineering/queue/**` — hàng đợi này chỉ có daemon Python `mepf-worker` tiêu thụ,
// xoá worker rồi thì tác vụ nạp vào sẽ nằm `pending` vĩnh viễn.

// 18. Merkle Tree Provenance Ledger (M73)
export * from "@/lib/ky-thuat/engineering-merkle-ledger";

// (19) MEPF Worker Closed-Loop Bridge (PR2) đã được gỡ cùng thư mục `mepf-worker/` — cầu nối này
// chỉ phục vụ daemon Python MEPF-Agents, không còn nơi gọi sau khi hệ 9-agent bị xoá.

// (20) Spatial Viewer & Field Pinning Engine (M74) đã bị xoá cùng trang /engineering/spatial-viewer.

// 21. Smart Bidding & Subcon Procurement Matrix (M75)
export * from "@/lib/ky-thuat/engineering-bidding-matrix";

// (22) Site Telegram Gateway & Voice Copilot (M76) đã bị xoá cùng trang /engineering/site-copilot.

// (23) AI Auto-Routing & Beam Sleeve Matrix (M77) đã được gỡ cùng cụm CAD/BIM — giao diện duy
// nhất dùng nó là trang /engineering/auto-routing (chạy trên phần tử BIM).

// 24. Smart Materials QR Logistics & Mobile Scanner (M78)
export * from "@/lib/ky-thuat/engineering-qr-logistics";

// (25) AI FIDIC Contract Dispute & Delay Defense (M79, route /api/engineering/fidic-tia) đã bị
// xoá 2026-09-22 cùng module `engineering-nextgen-apex` — 1/6 module `thuNghiem: true` không
// ai bật, xem PROGRESS.md.
