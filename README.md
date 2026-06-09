# XBoss - Hệ thống quản lý thi công MEP

**Web App quản lý tiến độ thi công Ống gió & MEP cho dự án AVIO Tháp A**

## Pha 0: Khởi tạo - HOÀN THÀNH ✅

**Mục tiêu**: Xây dựng nền tảng rõ ràng, chuẩn hóa dữ liệu.

### Deliverables Đạt Được:
- ✅ Repo Next.js 14 + TypeScript + Tailwind
- ✅ Data Mapping từ Excel AVIO
- ✅ ERD Database
- ✅ User Stories cơ bản
- ✅ Sample data & Import prototype plan

### 1. Data Analysis & Mapping từ Excel "GIA THÀNH - TT AVIO.xlsx"

**Main Sheets**:
- **DashBoard**: Danh sách công việc trễ hạn
- **TRACKING OGTĐ**: Ống gió trực đứng
- **OGHL**: Ống gió hành lang
- **OGCH**: Ống gió căn hộ
- **ODNN**: Ống đồng nước ngưng

**Mapping chính**:
- `CODE` + `TẦNG` → unique identifier cho Task/WorkPackage
- `CHI TIẾT CÔNG VIỆC` → Task name
- `NGÀY BẮT ĐẦU`, `NGÀY KẾT THÚC` → Dates (convert Excel serial number)
- `% TIẾN ĐỘ` → progress_percent (0-1)
- Các cột sau → Progress Dimensions (JSONB hoặc separate table)
- `SHEET` → sheet_type (OGTĐ, OGHL...)

**Excel Date Convert Example**:
```ts
const excelSerialToDate = (serial: number): Date => {
  const utc_days = Math.floor(serial - 25569);
  return new Date(utc_days * 86400 * 1000);
};
```

### 2. Database ERD (Text)
```
projects (1) ── (N) towers
towers (1) ── (N) floors
floors (1) ── (N) work_packages
work_packages (1) ── (N) tasks
tasks (1) ── (N) progress_dimensions
tasks (1) ── (N) materials
tasks (1) ── (N) task_history
```

### 3. User Stories (User Stories cơ bản)
**US-01**: Là PM, tôi muốn import Excel để đồng bộ dữ liệu tiến độ.
**US-02**: Là Engineer, tôi muốn xem dashboard với KPI % hoàn thành theo tầng/tháp.
**US-03**: Là Site staff, tôi muốn update tiến độ task realtime qua mobile.
**US-04**: Hệ thống tự động highlight task trễ hạn (Red).

**Acceptance Criteria**: Import thành công ≥95% records, Drill-down mượt, Role-based access.

### 4. Setup Repo
- Next.js 14 App Router
- Tailwind CSS
- TypeScript
- Sẵn sàng thêm: shadcn/ui, Drizzle, Supabase, TanStack Table

### Next Action (Pha 1)
- Tạo Drizzle Schema
- Implement Excel Import API

**Repo sẵn sàng deploy lên Vercel + Supabase.**

Hãy tiếp tục với **Pha 1: DB & Import**!
