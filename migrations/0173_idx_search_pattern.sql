-- Perf G3/P2: index tiền tố cho /api/search. Index btree lower(code) thường (0001) không
-- phục vụ LIKE 'x%' khi collation DB khác 'C' → thêm bản text_pattern_ops. Chỉ thêm index.
CREATE INDEX IF NOT EXISTS idx_tasks_code_lower_pat ON tasks (lower(code) text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_boq_lower_pat ON tasks (lower(boq_code) text_pattern_ops) WHERE boq_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wp_code_lower_pat ON work_packages (lower(code) text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_wp_boq_lower_pat ON work_packages (lower(boq_code) text_pattern_ops) WHERE boq_code IS NOT NULL;
