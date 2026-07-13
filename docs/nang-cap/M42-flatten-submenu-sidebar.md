# M42 — Bỏ submenu lồng trong sidebar, giữ accordion cấp nhóm

> **Trạng thái: KẾ HOẠCH — chưa triển khai.** Module độc lập, không thuộc đợt UX 2026-07 (M38-M41) nhưng chạy song song cùng đợt đó trong worktree riêng — chạm 2 file khác (`app/lib/dashboardTree.ts`, phần `renderDashboard`/`renderCluster` của `app/components/AppHeader.tsx`) so với M38-M41 nên rủi ro trùng thấp (M41 chỉ sửa min-w/min-h của các nút hamburger/theme/chuông trong cùng file, không đụng 2 hàm này).

## Bối cảnh — đã xác định đúng nguồn gốc lỗi

`app/lib/dashboardTree.ts` (`DASHBOARD_TREE`): 1 số cụm (`DashCluster`) chỉ chứa **đúng 1 dashboard** (`DashNode`) có `children`, và nhãn dashboard đó **trùng hoặc gần trùng nhãn cụm cha**:

| Cụm cha (label) | Dashboard con lồng (label, có `children`) |
| --- | --- |
| `Thi công hiện trường` | `dash.hien-truong` — "Hiện trường" |
| `An toàn – HSE & Rủi ro` | `dash.an-toan` — "An toàn – HSE & Rủi ro" (trùng hệt) |
| `Thiết bị & Máy móc` | `dash.thiet-bi` — "Thiết bị & Máy móc" (trùng hệt) |
| `Họp – Công văn` | `dash.hop-cong-van` — "Họp – Công văn" (trùng hệt) |
| `Nhân sự & Tổ chức` | `dash.nhan-su` — "Nhân sự & Tổ chức" (trùng hệt) |

Ngoài ra, cụm `Chi phí · Hợp đồng · Tài chính` có NHIỀU dashboard, trong đó 2 cái có `children` lồng (`dash.chi-phi-hop-dong` — "Chi phí & Hợp đồng", và `dash.claim` — "Claim & Thay đổi"), xen giữa các dashboard lá phẳng khác (`Tài chính – Kế toán`, `Bảo hiểm & Bảo lãnh`).

`app/components/AppHeader.tsx`:
- `renderCluster` (dòng 211-245): render header cụm (chevron, `toggleDash("cluster:<label>")`, đúng accordion cấp nhóm cần GIỮ NGUYÊN) rồi gọi `renderDashboard(dash)` cho từng dashboard trong cụm.
- `renderDashboard` (dòng 162-209): nếu `dash.children` rỗng → `renderLeaf` (giữ nguyên, đây là trường hợp "vốn đã phẳng" không đổi). Nếu có `children` → render **thêm 1 button header nữa** (dòng 174-186, chevron riêng, `toggleDash(id)` riêng) rồi mới tới link "Tổng quan" (dòng 189-203) + `visibleChildren.map(renderLeaf)` (dòng 204), bọc trong `<div className="ml-4 border-l border-zinc-800 pl-1">`. **Đây chính là lớp gập/mở + nhãn lặp thừa cần xoá.**

## Yêu cầu thay đổi (chỉ sửa `renderDashboard`, không đổi `renderCluster`/`renderLeaf`/`toggleDash`/dữ liệu `DASHBOARD_TREE`)

Sửa `renderDashboard` trong `AppHeader.tsx`: khi `dash.children` tồn tại, **bỏ hẳn button header + chevron riêng của dashboard này** — flatten trực tiếp dưới cụm cha:

```tsx
function renderDashboard(dash: DashNode) {
  if (!dash.children) return renderLeaf(dash);
  const visibleChildren = dash.children.filter((c) => canSeeNavItem(c, me?.role));
  if (visibleChildren.length === 0) return null;
  return (
    <div key={dash.id ?? dash.label} role="group" aria-label={dash.label}>
      {dash.id && (
        <a href={`/hub/${dash.id}`} /* ...giữ nguyên href, style, icon LayoutDashboard, "Tổng quan" như cũ... */>
          ...
        </a>
      )}
      {visibleChildren.map((child) => renderLeaf(child))}
    </div>
  );
}
```

Cụ thể:
- **Xoá hoàn toàn**: `button` header (dòng 174-186), state `open`/`containsActive` cục bộ của hàm này (không cần nữa vì không có gì để gập — hiển thị mọi lúc khi cụm cha đang mở), và div bọc `ml-4 border-l border-zinc-800 pl-1` (không cần thụt lề thêm — các mục con giờ ngang hàng với các dashboard lá khác trong cùng cụm, đúng như minh hoạ "Sau" trong đề bài).
- **Giữ nguyên y hệt**: link "Tổng quan" (href `/hub/${dash.id}`, icon `LayoutDashboard`, style, `aria-current`) — chỉ bỏ điều kiện nó nằm trong `{open && ...}` vì giờ luôn hiển thị.
- **Giữ nguyên y hệt**: `visibleChildren.map((child) => renderLeaf(child))` — không đổi `renderLeaf`, không đổi href nào.
- Thêm `role="group" aria-label={dash.label}` cho div bọc (yêu cầu a11y trong đề bài) — thay cho `aria-expanded` của button đã xoá.
- Tham số `Icon` (icon riêng của dashboard, vd `Wrench` cho "Thiết bị & Máy móc") không còn chỗ hiển thị (không còn header dashboard) — **chấp nhận mất icon nhóm này khỏi sidebar mở rộng lẫn chế độ thu gọn**, vì mục tiêu là xoá hẳn hàng tiêu đề đó; icon cụm cha (`renderCluster` không có icon, chỉ có nhãn text nhỏ uppercase) và icon từng link con (`renderLeaf`) đã đủ nhận diện. Không cần giữ icon này ở đâu khác trong module này.

### Trạng thái mở/đóng & auto-mở khi có mục active

- **Không cần đổi `toggleDash`/`openMap`** cho các dashboard đã bỏ header — chúng không còn khoá riêng, không còn được gọi `toggleDash(id, ...)`. `id` của các `DashNode` này (`dash.hien-truong`, `dash.an-toan`, `dash.thiet-bi`, `dash.hop-cong-van`, `dash.nhan-su`, `dash.chi-phi-hop-dong`, `dash.claim`) **vẫn giữ nguyên trong dữ liệu** (dùng cho href `/hub/<id>` và `nav_settings.node_key` — KHÔNG xoá `id` khỏi `DASHBOARD_TREE`, chỉ đổi cách render).
- Logic "mục active trong nhóm đóng thì tự mở nhóm chứa nó" đã có sẵn ở **cấp cụm** (`renderCluster` dòng 216-217: `containsActive = cluster.dashboards.some((dash) => isNavItemActive(dash, path))`) — `isNavItemActive` (từ `dashboardTree.ts` dòng 440-443) đã tự đệ quy qua `children` nên **không cần sửa gì thêm** — cụm cha tự mở đúng khi 1 mục con cháu đang active. Xác nhận lại bằng test tay, không cần đổi code phần này.

### Chế độ "Thu gọn menu" (icon-only)

- `renderCluster` khi `collapsed` đã bỏ qua render button cụm (chỉ còn text nhỏ ẩn — thực ra dòng 220-225 vẫn render 1 div label ẩn, nhưng quan trọng là `open = collapsed || ...` luôn `true` khi collapsed) → các dashboard con (kể cả loại vừa flatten) đều render qua `renderDashboard`, và giờ luôn hiển thị (không còn điều kiện `open &&`) nên **hoạt động đúng tự nhiên, không cần sửa thêm** — chỉ cần verify tay bằng cách bấm nút "Thu gọn" và kiểm tra các icon con (Tổng quan + từng link) vẫn hiện đủ, đúng tooltip `title`.

## Việc KHÔNG làm

- Không đổi `app/lib/dashboardTree.ts` (dữ liệu cây giữ nguyên 100% — id/href/label/icon/children không đổi gì, chỉ đổi cách `AppHeader.tsx` RENDER cây đó).
- Không đổi `renderCluster`, `renderLeaf`, `toggleDash`, `resolveVisibleTree`, `isNavItemActive`, `canSeeNavItem`.
- Không đổi các cụm "vốn đã phẳng" (`Kế hoạch & Tiến độ`, `Quản lý vật tư`, `Đấu thầu & Nhà thầu phụ`, `Môi trường & Quan trắc`, `Tổng quan & Báo cáo`, `Bàn giao & Vận hành`, `Hệ thống`) — các cụm này không có dashboard nào mang `children` nên không bị ảnh hưởng, không cần verify kỹ như 6 cụm có nested ở trên nhưng vẫn nên click qua để chắc chắn không vỡ.

## Test & Definition of Done

- `npm run lint` + `npm run typecheck` xanh.
- Nếu có test hiện có cho sidebar/nav (`grep -rn "dashboardTree\|DASHBOARD_TREE\|renderDashboard" tests/ e2e/`), chạy lại đảm bảo còn pass; nếu test dựa vào việc có 2 lớp button (vd đếm số `role=button` trong 1 cụm) — sửa test cho khớp hành vi mới đã đổi có chủ đích, không phải bug.
- Verify tay qua trình duyệt (dev server nếu có DB, nếu không thì đọc kỹ code + kiểm tra bằng `npm run build`): mở từng cụm trong bảng ở trên (`Thi công hiện trường`, `An toàn – HSE & Rủi ro`, `Thiết bị & Máy móc`, `Họp – Công văn`, `Nhân sự & Tổ chức`, `Chi phí · Hợp đồng · Tài chính`) — xác nhận chỉ còn 1 chevron/nhãn ở đầu (cấp cụm), mở ra thấy ngay toàn bộ mục con phẳng gồm "Tổng quan", không phải bấm thêm; href mọi link không đổi so với trước; điều hướng tới `/hse`, `/equipment`, `/meetings`, `/claims`... rồi load lại trang → cụm chứa mục active tự mở.
- Kiểm tra chế độ "Thu gọn menu" (nút cuối sidebar) vẫn hiện đủ icon các mục đã flatten.
- Kiểm tra bàn phím: Tab qua sidebar, chevron cụm vẫn `aria-expanded` đúng; không còn `aria-expanded` nào sót lại trên phần tử đã xoá (kiểm bằng đọc DOM devtools hoặc axe).

## Chia PR

1 PR duy nhất — thay đổi nhỏ, tập trung trong `renderDashboard` (AppHeader.tsx), không cần chia nhỏ hơn.
