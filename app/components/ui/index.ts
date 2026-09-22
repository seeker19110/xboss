// Bộ component nền dùng chung cho toàn app (khung + trang chính). Import gọn:
//   import { Button, Card, Section, StatCard, Chip } from "@/app/components/ui";
export { default as Button, ButtonLink, buttonClass } from "@/app/components/ui/Button";
export { default as Card, CardLink, cardClass } from "@/app/components/ui/Card";
export { default as Chip } from "@/app/components/ui/Chip";
export { default as Section } from "@/app/components/ui/Section";
export { default as StatCard } from "@/app/components/ui/StatCard";
export { default as Select } from "@/app/components/ui/Select";
export { default as Tabs, TabPanel, type TabItem } from "@/app/components/ui/Tabs";
// Bộ component "màn hình chứng từ" (M124) — xem ADR-0009 mục cùng tên.
export { default as DocToolbar } from "@/app/components/ui/DocToolbar";
export { default as DocField, DocFieldGroup } from "@/app/components/ui/DocField";
export { default as DocTotals, type DocTotalRow } from "@/app/components/ui/DocTotals";
export { default as Kbd } from "@/app/components/ui/Kbd";
