-- Extend fixed fare-adjustment kinds to cover customer-side catalog:
-- 其他补充费用 (increase), 不含首晚或末晚住宿 (decrease).
ALTER TYPE "fare_adjustment_kind" ADD VALUE 'other_supplement';
ALTER TYPE "fare_adjustment_kind" ADD VALUE 'excluded_first_or_last_night';
