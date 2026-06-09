# XBoss Database ERD

## Entities & Relationships

### Core Hierarchy (WBS)
- **Project** (AVIO)
  - **Tower** (Tháp A)
    - **Floor** (9F, 11F, ..., 29F)
      - **WorkPackage** (sheet_type: OGTĐ, OGHL, OGCH, ODNN)
        - **Task** (CHI TIẾT CÔNG VIỆC)
          - **ProgressDimension** (kích thước ống gió, true/false hoặc %)
          - **Material** (Vật tư liên kết)
          - **TaskHistory** (Audit log)

## SQL Schema Draft (Drizzle ready)
Xem file schema/index.ts trong Pha 1.

**Indexes khuyến nghị**:
- end_date, progress_percent
- floor_id, package_id
- task_id trên progress_dimensions
