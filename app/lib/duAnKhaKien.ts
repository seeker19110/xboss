"use client";
// Singleton cache phía client — danh sách dự án user thấy (GET /api/projects), fetch 1 lần mỗi
// lần load trang (như fetchMe). Dùng chung cho ProjectSwitcher và màn "chưa được gán dự án"
// (AUDIT-S16) để không gọi trùng route.
import { useEffect, useState } from "react";
import type { ProjectListItem } from "@/lib/ha-tang/projects";

let _promise: Promise<ProjectListItem[] | null> | null = null;

/** Quên danh sách đã tải — gọi khi ngữ cảnh đổi (đổi dự án/đăng xuất/đổi tài khoản) để lần
 *  dùng sau không trả dự án của phiên/trạng thái cũ. */
export function xoaCacheDuAnKhaKien(): void {
  _promise = null;
}

/** `null` = không tải được (lỗi mạng/401…) — KHÔNG đồng nghĩa "không có dự án". */
export function fetchDuAnKhaKien(): Promise<ProjectListItem[] | null> {
  if (!_promise) {
    _promise = fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { projects?: ProjectListItem[] } | null) =>
        Array.isArray(d?.projects) ? d.projects : null,
      )
      .catch(() => null)
      .then((ds) => {
        if (ds == null) _promise = null; // lỗi thì lần sau thử lại
        return ds;
      });
  }
  return _promise;
}

/** true khi đã tải được danh sách và nó RỖNG — user chưa được gán dự án nào. */
export function useChuaGanDuAn(): boolean {
  const [chuaGan, setChuaGan] = useState(false);
  useEffect(() => {
    let huy = false;
    fetchDuAnKhaKien().then((ds) => {
      if (!huy) setChuaGan(ds != null && ds.length === 0);
    });
    return () => {
      huy = true;
    };
  }, []);
  return chuaGan;
}
