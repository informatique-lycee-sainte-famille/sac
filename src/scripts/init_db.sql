BEGIN;

-- =========================
-- USERS & AUTH
-- =========================

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  external_id VARCHAR UNIQUE, -- Office365 / EcoleDirecte ID
  role VARCHAR NOT NULL CHECK (role IN ('student', 'teacher', 'staff')),
  email VARCHAR UNIQUE,
  first_name VARCHAR,
  last_name VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role ON users(role);


-- =========================
-- INSTITUTIONS
-- =========================

CREATE TABLE institutions (
  id SERIAL PRIMARY KEY,
  code VARCHAR NOT NULL UNIQUE,
  name VARCHAR NOT NULL,
  rne VARCHAR UNIQUE,
  degree INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE institution_settings (
  institution_id INTEGER PRIMARY KEY
    REFERENCES institutions(id) ON DELETE CASCADE,
  visio_enabled BOOLEAN NOT NULL DEFAULT false,
  attendance_via_schedule BOOLEAN NOT NULL DEFAULT true,
  attendance_via_timegrid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);


-- =========================
-- BUILDINGS & ROOMS
-- =========================

CREATE TABLE buildings (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL
    REFERENCES institutions(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL
);

CREATE INDEX idx_buildings_institution ON buildings(institution_id);

CREATE TABLE rooms (
  id SERIAL PRIMARY KEY,
  building_id INTEGER NOT NULL
    REFERENCES buildings(id) ON DELETE CASCADE,
  code VARCHAR NOT NULL UNIQUE,
  name VARCHAR,
  nfc_uid VARCHAR NOT NULL UNIQUE,
  reservable BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_rooms_building ON rooms(building_id);
CREATE INDEX idx_rooms_reservable ON rooms(reservable);


-- =========================
-- CLASSES & GROUPS
-- =========================

CREATE TABLE classes (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL
    REFERENCES institutions(id) ON DELETE CASCADE,
  code VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (institution_id, code)
);

CREATE INDEX idx_classes_institution ON classes(institution_id);

CREATE TABLE groups (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL
    REFERENCES classes(id) ON DELETE CASCADE,
  code VARCHAR NOT NULL,
  name VARCHAR,
  UNIQUE (class_id, code)
);

CREATE INDEX idx_groups_class ON groups(class_id);


-- =========================
-- STUDENTS
-- =========================

CREATE TABLE students (
  user_id INTEGER PRIMARY KEY
    REFERENCES users(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL
    REFERENCES classes(id),
  group_id INTEGER
    REFERENCES groups(id),
  badge_uid VARCHAR UNIQUE,
  entry_date DATE,
  exit_date DATE
);

CREATE INDEX idx_students_class ON students(class_id);
CREATE INDEX idx_students_group ON students(group_id);


-- =========================
-- TEACHERS ↔ CLASSES
-- =========================

CREATE TABLE class_teachers (
  class_id INTEGER NOT NULL
    REFERENCES classes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  is_main_teacher BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (class_id, user_id)
);

CREATE INDEX idx_class_teachers_user ON class_teachers(user_id);


-- =========================
-- COURSE SESSIONS
-- =========================

CREATE TABLE course_sessions (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL
    REFERENCES classes(id),
  room_id INTEGER NOT NULL
    REFERENCES rooms(id),
  teacher_id INTEGER NOT NULL
    REFERENCES users(id),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  CHECK (end_time > start_time)
);

CREATE INDEX idx_sessions_class ON course_sessions(class_id);
CREATE INDEX idx_sessions_room ON course_sessions(room_id);
CREATE INDEX idx_sessions_teacher ON course_sessions(teacher_id);
CREATE INDEX idx_sessions_time ON course_sessions(start_time, end_time);


-- =========================
-- ATTENDANCE
-- =========================

CREATE TABLE attendance_records (
  session_id INTEGER NOT NULL
    REFERENCES course_sessions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR NOT NULL CHECK (
    status IN ('present', 'late', 'absent', 'excused')
  ),
  scanned_at TIMESTAMP,
  PRIMARY KEY (session_id, student_id)
);

CREATE INDEX idx_attendance_status ON attendance_records(status);
CREATE INDEX idx_attendance_scanned_at ON attendance_records(scanned_at);


-- =========================
-- RAW NFC SCANS (AUDIT / DEBUG)
-- =========================

CREATE TABLE nfc_scans (
  id SERIAL PRIMARY KEY,
  nfc_uid VARCHAR NOT NULL,
  user_id INTEGER
    REFERENCES users(id) ON DELETE SET NULL,
  scanned_at TIMESTAMP NOT NULL DEFAULT now(),
  ip_address INET
);

CREATE INDEX idx_nfc_scans_uid ON nfc_scans(nfc_uid);
CREATE INDEX idx_nfc_scans_user ON nfc_scans(user_id);
CREATE INDEX idx_nfc_scans_time ON nfc_scans(scanned_at);


COMMIT;
