-- 发团协作写入 updatedAt 毫秒时间戳；无业务快照的闲聊会话写 0。
-- float8 能精确保存 JavaScript 安全整数。旧 int4 / bigint 均可无损升到 float8。
ALTER TABLE "ai_context_manifests"
  ALTER COLUMN "business_snapshot_version" TYPE DOUBLE PRECISION;
ALTER TABLE "ai_context_manifests"
  ADD CONSTRAINT "ai_context_manifests_business_snapshot_version_safe_integer"
  CHECK ("business_snapshot_version" >= 0
    AND "business_snapshot_version" <= 9007199254740991
    AND "business_snapshot_version" = trunc("business_snapshot_version"));
