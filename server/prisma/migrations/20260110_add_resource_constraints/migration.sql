-- Add CHECK constraints to prevent negative resource values
-- This prevents race condition exploits that could result in negative resources

ALTER TABLE planets ADD CONSTRAINT carbon_non_negative CHECK (carbon >= 0);
ALTER TABLE planets ADD CONSTRAINT titanium_non_negative CHECK (titanium >= 0);
ALTER TABLE planets ADD CONSTRAINT food_non_negative CHECK (food >= 0);
ALTER TABLE planets ADD CONSTRAINT credits_non_negative CHECK (credits >= 0);
