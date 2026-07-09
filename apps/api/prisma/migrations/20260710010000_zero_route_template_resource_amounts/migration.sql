-- Route templates only store execution-arrangement structure; resource amounts are always 0.
UPDATE "route_template_resources" SET "amount_cents" = 0 WHERE "amount_cents" <> 0;
