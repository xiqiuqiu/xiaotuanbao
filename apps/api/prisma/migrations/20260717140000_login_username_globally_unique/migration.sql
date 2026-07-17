-- Fail loudly when non-deleted usernames collide after trim+lower normalization.
-- Do not auto-rename; operators must resolve conflicts manually before migrate.
DO $$
DECLARE
  conflict_summary text;
BEGIN
  SELECT string_agg(normalized_username || '(' || cnt || ')', ', ' ORDER BY normalized_username)
  INTO conflict_summary
  FROM (
    SELECT lower(btrim(username)) AS normalized_username, count(*)::int AS cnt
    FROM users
    WHERE deleted_at IS NULL
    GROUP BY lower(btrim(username))
    HAVING count(*) > 1
  ) duplicates;

  IF conflict_summary IS NOT NULL THEN
    RAISE EXCEPTION
      'Login username conflicts detected (including case-only duplicates among non-deleted users): %. Resolve manually before applying global uniqueness; do not auto-rename.',
      conflict_summary;
  END IF;
END $$;

-- Persist canonical lowercase usernames (including soft-deleted rows for consistency).
UPDATE users
SET username = lower(btrim(username))
WHERE username <> lower(btrim(username));

DROP INDEX "users_organization_id_username_key";

CREATE UNIQUE INDEX "users_username_active_key"
ON "users"("username")
WHERE "deleted_at" IS NULL;
