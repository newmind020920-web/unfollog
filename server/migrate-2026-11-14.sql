-- 이미 돌고 있는 DB 에 적용하는 변경입니다. schema.sql 은 처음 만들 때만 쓰세요.
--
-- 1) 문의를 받을 자리
CREATE TABLE IF NOT EXISTS inquiry (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  code      TEXT,
  at        INTEGER NOT NULL,
  message   TEXT NOT NULL,
  contact   TEXT,
  meta      TEXT,
  done      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS inquiry_at ON inquiry (at);

-- 2) 같은 사람이 여러 명으로 세어지는 이유를 가려내기 위한 칸.
--    이미 있으면 "duplicate column name" 이 납니다. 그러면 넘어가세요.
ALTER TABLE visitor ADD COLUMN host TEXT;
ALTER TABLE visitor ADD COLUMN app TEXT;
