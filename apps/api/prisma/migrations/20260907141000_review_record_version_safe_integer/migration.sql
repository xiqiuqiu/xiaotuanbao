-- 修订与确认审计记录保存同一个发团版本，须与审核包保持相同精度。
ALTER TABLE "ai_review_records"
  ALTER COLUMN "object_version" TYPE DOUBLE PRECISION;
ALTER TABLE "ai_review_records"
  ADD CONSTRAINT "ai_review_records_object_version_safe_integer"
  CHECK ("object_version" >= 1
    AND "object_version" <= 9007199254740991
    AND "object_version" = trunc("object_version"));
