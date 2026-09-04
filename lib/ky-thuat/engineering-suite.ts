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

// 6. AI Voice Field Logger & Productivity Index (M68)
export * from "@/lib/ky-thuat/engineering-mepf-voice";

// 7. Omnipotent Shopdrawing LOD 400 & Sleeve Matrix (M69)
export * from "@/lib/ky-thuat/engineering-shopdrawing-omnipotent";

// 8. 5D QS Cost Engineering & FIDIC Claim Defense (M69)
export * from "@/lib/ky-thuat/engineering-qs-omnipotent";

// (9) AI Reality Scan-to-BIM & Deviation Mesh (M70) đã được gỡ cùng cụm CAD/BIM.

// 10. Closed-Loop WBS & Payment Sync (M70)
export * from "@/lib/ky-thuat/engineering-closed-loop-sync";

// 11. Predictive Maintenance MTBF & RUL (M71)
export * from "@/lib/ky-thuat/engineering-mepf-predictive";

// 12. Embodied Carbon LCA & Green Building (M71)
export * from "@/lib/ky-thuat/engineering-carbon-lca";

// 13. LOD 500 Digital Handover Passport (M71)
export * from "@/lib/ky-thuat/engineering-digital-handover";

// 14. Multi-Agent Real-Time Debate Swarm (M72)
export * from "@/lib/ky-thuat/engineering-multi-agent-copilot";

// 15. Dynamic Project Health Cockpit & Monte Carlo (M72)
export * from "@/lib/ky-thuat/engineering-project-health";

// 16. Hyper-Spatial WASM Geometry & Cache (M73)
export * from "@/lib/ky-thuat/engineering-spatial-wasm";

// 17. Distributed Engineering Task Queue (M73)
export * from "@/lib/ky-thuat/engineering-task-queue";

// 18. Merkle Tree Provenance Ledger (M73)
export * from "@/lib/ky-thuat/engineering-merkle-ledger";

// 19. MEPF Worker Closed-Loop Bridge (PR2)
export * from "@/lib/ky-thuat/engineering-worker-bridge";

// 20. Spatial Viewer & Field Pinning Engine (M74)
export * from "@/lib/ky-thuat/engineering-spatial-pinning";

// 21. Smart Bidding & Subcon Procurement Matrix (M75)
export * from "@/lib/ky-thuat/engineering-bidding-matrix";

// 22. Site Telegram Gateway & Voice Copilot (M76)
export * from "@/lib/ky-thuat/engineering-site-bot";

// (23) AI Auto-Routing & Beam Sleeve Matrix (M77) đã được gỡ cùng cụm CAD/BIM — giao diện duy
// nhất dùng nó là trang /engineering/auto-routing (chạy trên phần tử BIM).

// 24. Smart Materials QR Logistics & Mobile Scanner (M78)
export * from "@/lib/ky-thuat/engineering-qr-logistics";

// 25. AI FIDIC Contract Dispute & Delay Defense (M79)
export * from "@/lib/ky-thuat/engineering-fidic-claim";
