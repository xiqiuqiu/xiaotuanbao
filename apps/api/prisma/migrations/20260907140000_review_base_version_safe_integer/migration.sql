-- 发团版本为 updatedAt 的毫秒时间戳；float8 能精确保存 JavaScript 安全整数。
-- 旧 int4 数据可无损扩容，API 继续使用整数 number 版本。
ALTER TABLE "ai_review_packages"
  ALTER COLUMN "base_object_version" TYPE DOUBLE PRECISION;
ALTER TABLE "ai_review_packages"
  ADD CONSTRAINT "ai_review_packages_base_version_safe_integer"
  CHECK ("base_object_version" >= 1
    AND "base_object_version" <= 9007199254740991
    AND "base_object_version" = trunc("base_object_version"));
