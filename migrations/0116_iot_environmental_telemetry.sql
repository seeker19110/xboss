-- Migration 0116: IoT Smart Site Energy & Environmental Telemetry Hub (Module M83)

CREATE TABLE IF NOT EXISTS engineering_iot_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_code TEXT NOT NULL, -- e.g. SENSOR-AQI-B1, ENERGY-MSB-01
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL, -- AIR_QUALITY, GAS_LEAK, NOISE, TEMPERATURE_HUMIDITY, ENERGY_METER
  location_area TEXT NOT NULL, -- Tầng hầm B1 - Khu bơm nước, Tầng 5 - Tháp A
  tower_id BIGINT REFERENCES towers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  threshold_min NUMERIC(10, 2),
  threshold_max NUMERIC(10, 2),
  unit TEXT NOT NULL, -- ug/m3, ppm, dBA, degC, %, kW, kWh
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering_iot_telemetry_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES engineering_iot_devices(id) ON DELETE CASCADE,
  metric_value NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'NORMAL', -- NORMAL, WARNING, CRITICAL
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS engineering_iot_threshold_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES engineering_iot_devices(id) ON DELETE CASCADE,
  severity TEXT NOT NULL, -- WARNING, CRITICAL
  alert_title TEXT NOT NULL,
  alert_message TEXT NOT NULL,
  standard_reference TEXT, -- e.g. QCVN 05:2023/BTNMT, QCVN 26:2010/BTNMT
  triggered_value NUMERIC(10, 2) NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bật Row Level Security (RLS)
ALTER TABLE engineering_iot_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_iot_telemetry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_iot_threshold_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_iot_devices_project_scope') THEN
    CREATE POLICY engineering_iot_devices_project_scope ON engineering_iot_devices
      USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_iot_telemetry_logs_project_scope') THEN
    CREATE POLICY engineering_iot_telemetry_logs_project_scope ON engineering_iot_telemetry_logs
      USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'engineering_iot_threshold_alerts_project_scope') THEN
    CREATE POLICY engineering_iot_threshold_alerts_project_scope ON engineering_iot_threshold_alerts
      USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
  END IF;
END $$;
