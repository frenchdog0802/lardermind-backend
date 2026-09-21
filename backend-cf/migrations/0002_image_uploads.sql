-- Image upload quota columns for R2 uploads (calendar-month period).
ALTER TABLE usage_quotas ADD COLUMN image_uploads INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_quotas ADD COLUMN image_period_start INTEGER;
