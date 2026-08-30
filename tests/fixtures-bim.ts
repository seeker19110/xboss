// Fixture BIM dùng chung cho các test phát hiện va chạm (clash detection).
//
// Vì sao tách ra: `bim-unified-facade.test.ts` và `engineering-bim-routing.test.ts`
// dựng CÙNG một mảng 3 phần tử dài 32 dòng, chép nguyên si ở cả hai nơi. Sửa toạ độ ở
// một chỗ mà quên chỗ kia thì hai test âm thầm kiểm hai hình học khác nhau.
//
// KHÔNG đặt tên `*.test.ts` — `scripts/run-tests.mjs` chỉ nạp file khớp đuôi đó, nên
// file này là helper thuần, không bị chạy như một bộ test (cùng khuôn `tests/setup.ts`).
import type { BimElementRecord } from "@/lib/ky-thuat/engineering-bim-cad";

/**
 * Ba cấu kiện cùng tầng/zone: ELEM-01 (ống gió) và ELEM-02 (ống nước) GIAO NHAU,
 * ELEM-03-FAR nằm xa hẳn để chứng minh bộ dò không báo nhầm.
 * Trả mảng MỚI mỗi lần gọi — test nào lỡ sửa tại chỗ cũng không ảnh hưởng test khác.
 */
export function taoBimElementsVaCham(): BimElementRecord[] {
  const created_at = new Date().toISOString();
  return [
    {
      id: "ELEM-01",
      project_id: 1,
      ifc_guid: "GUID-DUCT-01",
      element_type: "DUCT_STRAIGHT",
      discipline: "hvac",
      system_name: "M-DUCT-SUPP",
      storey_level: "Level 1",
      zone_name: "Zone A",
      properties: {},
      spatial_bounding_box: {
        min: [1000, 2000, 2800],
        max: [5000, 2600, 3200],
      },
      task_id: null,
      boq_code: null,
      actual_status: "installed",
      created_at,
    },
    {
      id: "ELEM-02",
      project_id: 1,
      ifc_guid: "GUID-PIPE-01",
      element_type: "PIPE_STRAIGHT",
      discipline: "plumbing",
      system_name: "P-PIPE-SANR",
      storey_level: "Level 1",
      zone_name: "Zone A",
      properties: {},
      spatial_bounding_box: {
        min: [2500, 1000, 2900],
        max: [2700, 4000, 3100], // Giao cắt với ELEM-01
      },
      task_id: null,
      boq_code: null,
      actual_status: "installed",
      created_at,
    },
    {
      id: "ELEM-03-FAR",
      project_id: 1,
      ifc_guid: "GUID-PIPE-FAR",
      element_type: "PIPE_STRAIGHT",
      discipline: "plumbing",
      system_name: "P-PIPE-SANR",
      storey_level: "Level 1",
      zone_name: "Zone B",
      properties: {},
      spatial_bounding_box: {
        min: [10000, 10000, 2900],
        max: [10200, 14000, 3100], // Cách xa, không va chạm
      },
      task_id: null,
      boq_code: null,
      actual_status: "installed",
      created_at,
    },
  ];
}
