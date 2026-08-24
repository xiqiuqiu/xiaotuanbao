-- Recompute proposal_hash with the same canonical JSON as departureReviewProposalHash:
-- sha256(UTF8(JSON.stringify(canonicalize({ confirmationUnit, candidates: [{clarity,evidence,fieldKey,proposedValue}] }))))
-- jsonb::text cannot be used: it inserts spaces and orders keys by length, so confirm would keep conflicting.
CREATE OR REPLACE FUNCTION review_canonical_json(val jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text;
  k text;
  parts text[] := ARRAY[]::text[];
  elem jsonb;
BEGIN
  IF val IS NULL THEN
    RETURN 'null';
  END IF;
  t := jsonb_typeof(val);
  IF t = 'null' THEN
    RETURN 'null';
  ELSIF t = 'boolean' OR t = 'number' THEN
    RETURN val::text;
  ELSIF t = 'string' THEN
    RETURN to_json(val #>> '{}')::text;
  ELSIF t = 'array' THEN
    FOR elem IN SELECT value FROM jsonb_array_elements(val) AS value
    LOOP
      parts := array_append(parts, review_canonical_json(elem));
    END LOOP;
    RETURN '[' || array_to_string(parts, ',') || ']';
  ELSIF t = 'object' THEN
    FOR k IN SELECT key FROM jsonb_object_keys(val) AS key ORDER BY key COLLATE "C"
    LOOP
      parts := array_append(parts, to_json(k)::text || ':' || review_canonical_json(val -> k));
    END LOOP;
    RETURN '{' || array_to_string(parts, ',') || '}';
  ELSE
    RAISE EXCEPTION 'unsupported jsonb type %', t;
  END IF;
END;
$$;

UPDATE "ai_review_packages"
SET "proposal_hash" = encode(
  sha256(
    convert_to(
      review_canonical_json(
        jsonb_build_object(
          'candidates',
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'clarity', elem->'clarity',
                  'evidence', elem->'evidence',
                  'fieldKey', elem->'fieldKey',
                  'proposedValue', elem->'proposedValue'
                )
                ORDER BY ordinality
              )
              FROM jsonb_array_elements("candidates") WITH ORDINALITY AS t(elem, ordinality)
            ),
            '[]'::jsonb
          ),
          'confirmationUnit', to_jsonb("confirmation_unit")
        )
      ),
      'UTF8'
    )
  ),
  'hex'
)
WHERE jsonb_typeof("candidates") = 'array'
  AND (
    "proposal_hash" = ''
    OR "proposal_hash" = encode(sha256(convert_to("candidates"::text, 'UTF8')), 'hex')
  );

DROP FUNCTION review_canonical_json(jsonb);
