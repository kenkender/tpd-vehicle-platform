PRAGMA foreign_keys = ON;

-- ผู้ครอบครอง / เจ้าของรถ
CREATE TABLE IF NOT EXISTS owners (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name        TEXT NOT NULL,
  national_id_enc  TEXT,            -- เลขบัตรประชาชน (เข้ารหัส AES-256-GCM)
  national_id_idx  TEXT,            -- HMAC blind index ไว้ค้นหา/จับคู่เจ้าของเดิม
  national_id_last4 TEXT,           -- 4 หลักท้าย ไว้แสดงผลแบบปิดบัง
  phone            TEXT,
  affiliation      TEXT,            -- ที่อยู่ / แผนก / สังกัด
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_owners_nid ON owners(national_id_idx);
CREATE INDEX IF NOT EXISTS idx_owners_name ON owners(full_name);

-- ยานพาหนะ  (ทะเบียนเดียวกันคนละจังหวัด = คนละคัน -> UNIQUE คู่ plate_norm + province)
CREATE TABLE IF NOT EXISTS vehicles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  plate_number  TEXT NOT NULL,      -- ที่ผู้ใช้กรอก (ใช้แสดงผล เช่น 1กก 9999)
  plate_norm    TEXT NOT NULL,      -- ถอดช่องว่างแล้ว เช่น 1กก9999 (ใช้ query / จับคู่ LPR)
  province      TEXT NOT NULL,
  plate_prefix  TEXT,               -- หมวดอักษร เช่น 1กก
  plate_digits  TEXT,               -- ตัวเลข เช่น 9999
  plate_type    TEXT NOT NULL,
  brand         TEXT NOT NULL,
  model         TEXT NOT NULL,
  body_type     TEXT NOT NULL,
  color         TEXT NOT NULL,
  owner_id      INTEGER NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  member_type   TEXT NOT NULL,      -- official | staff | visitor | blacklist
  visit_target  TEXT,               -- บ้านเลขที่ / ห้อง / บริษัท / หน่วยที่มาติดต่อ (สำหรับ Visitor)
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | allowed | blocked
  valid_from    TEXT,               -- ISO (Start Time For Entry)
  valid_to      TEXT,               -- ISO (End Time For Entry)
  note          TEXT,
  excel_status  TEXT NOT NULL DEFAULT 'none',      -- none | ok | error
  sheet_status  TEXT NOT NULL DEFAULT 'none',      -- none | ok | error | off
  sync_message  TEXT,
  synced_at     TEXT,
  submitted_ip  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (plate_norm, province)
);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate_norm);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_member ON vehicles(member_type);
CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(owner_id);

-- บันทึกการเข้า-ออก (รองรับ LPR / Hikvision ในอนาคต หรือแอดมินบันทึกเอง)
CREATE TABLE IF NOT EXISTS access_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id    INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  plate_norm    TEXT NOT NULL,
  province      TEXT,
  direction     TEXT NOT NULL,      -- in | out
  event_time    TEXT NOT NULL,      -- ISO
  gate_id       TEXT,               -- ประตู / เลน
  image_url     TEXT,               -- รูปป้ายทะเบียน / รูปรถ
  visit_target  TEXT,
  member_type   TEXT,
  source        TEXT NOT NULL DEFAULT 'manual',    -- manual | hikvision | other
  matched       INTEGER NOT NULL DEFAULT 0,        -- 1 = ตรงกับทะเบียนในระบบ
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_time ON access_logs(event_time);
CREATE INDEX IF NOT EXISTS idx_logs_plate ON access_logs(plate_norm);

-- แอดมิน
CREATE TABLE IF NOT EXISTS admins (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  display_name   TEXT,
  failed_count   INTEGER NOT NULL DEFAULT 0,
  locked_until   INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ประวัติการทำงานของแอดมิน
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin      TEXT,
  action     TEXT NOT NULL,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
