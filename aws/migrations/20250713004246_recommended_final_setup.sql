-- ==========================================================
-- 🔧 Extensions
-- ==========================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;  -- Optional, helps normalize names

-- ==========================================================
-- 🧩 Indexes for Fast Text Search
-- ==========================================================

-- 1️⃣ Trigram-based fuzzy search index (for partial name matches)
CREATE INDEX IF NOT EXISTS idx_unclaimed_properties_owner_name_trgm
  ON unclaimed_properties
  USING GIN (lower(owner_name) gin_trgm_ops);

-- 2️⃣ Optional full-text search column and index
ALTER TABLE unclaimed_properties
  ADD COLUMN IF NOT EXISTS owner_name_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', unaccent(owner_name))) STORED;

CREATE INDEX IF NOT EXISTS idx_unclaimed_properties_owner_name_tsv
  ON unclaimed_properties USING GIN (owner_name_tsv);

-- 3️⃣ City filter optimization
CREATE INDEX IF NOT EXISTS idx_unclaimed_properties_owner_city
  ON unclaimed_properties (lower(owner_city));

-- ==========================================================
-- 👁️  Search View (formatted for display)
-- ==========================================================
CREATE OR REPLACE VIEW property_search AS
SELECT 
    id,
    property_type,
    cash_reported,
    shares_reported,
    name_of_securities_reported,
    number_of_owners,
    owner_name,
    TRIM(CONCAT_WS(', ', 
        NULLIF(owner_street_1, ''),
        NULLIF(owner_street_2, ''),
        NULLIF(owner_street_3, '')
    )) AS owner_full_address,
    owner_city,
    owner_state,
    owner_zip,
    owner_country_code,
    current_cash_balance,
    number_of_pending_claims,
    number_of_paid_claims,
    holder_name,
    TRIM(CONCAT_WS(', ', 
        NULLIF(holder_street_1, ''),
        NULLIF(holder_street_2, ''),
        NULLIF(holder_street_3, '')
    )) AS holder_full_address,
    holder_city,
    holder_state,
    holder_zip,
    cusip,
    created_at,
    updated_at
FROM unclaimed_properties;

-- ==========================================================
-- ⚡ Fast Search Function
-- ==========================================================
CREATE OR REPLACE FUNCTION search_properties_fast(
    search_name       TEXT,
    min_amount        DECIMAL   DEFAULT NULL,
    max_amount        DECIMAL   DEFAULT NULL,
    search_city       TEXT      DEFAULT NULL,
    search_prop_type  TEXT      DEFAULT NULL,
    search_limit      INTEGER   DEFAULT 50
)
RETURNS TABLE (
    id                          TEXT,
    property_type               TEXT,
    cash_reported               DECIMAL,
    shares_reported             DECIMAL,
    name_of_securities_reported TEXT,
    number_of_owners            TEXT,
    owner_name                  TEXT,
    owner_full_address          TEXT,
    owner_city                  TEXT,
    owner_state                 TEXT,
    owner_zip                   TEXT,
    owner_country_code          TEXT,
    current_cash_balance        DECIMAL,
    number_of_pending_claims    INTEGER,
    number_of_paid_claims       INTEGER,
    holder_name                 TEXT,
    holder_full_address         TEXT,
    holder_city                 TEXT,
    holder_state                TEXT,
    holder_zip                  TEXT,
    cusip                       TEXT
) AS $$
DECLARE
  search_name_l TEXT := lower(search_name);
  q             tsquery := plainto_tsquery('simple', search_name_l);
BEGIN
  RETURN QUERY
  SELECT
    ps.id,
    ps.property_type,
    ps.cash_reported,
    ps.shares_reported,
    ps.name_of_securities_reported,
    ps.number_of_owners,
    ps.owner_name,
    ps.owner_full_address,
    ps.owner_city,
    ps.owner_state,
    ps.owner_zip,
    ps.owner_country_code,
    ps.current_cash_balance,
    ps.number_of_pending_claims,
    ps.number_of_paid_claims,
    ps.holder_name,
    ps.holder_full_address,
    ps.holder_city,
    ps.holder_state,
    ps.holder_zip,
    ps.cusip
  FROM property_search ps
  WHERE
    (
      ps.owner_name_tsv @@ q
      OR lower(ps.owner_name) ILIKE '%' || search_name_l || '%'
      OR lower(ps.owner_name) % search_name_l   -- trigram fuzzy match
    )
    AND (min_amount       IS NULL OR ps.current_cash_balance >= min_amount)
    AND (max_amount       IS NULL OR ps.current_cash_balance <= max_amount)
    AND (search_city      IS NULL OR lower(ps.owner_city) ILIKE '%' || lower(search_city) || '%')
    AND (search_prop_type IS NULL OR ps.property_type = search_prop_type)
  ORDER BY
    ps.current_cash_balance DESC
  LIMIT search_limit;
END;
$$ LANGUAGE plpgsql
SET statement_timeout = '15s';

-- ==========================================================
-- 🧪 Optional: Tune fuzzy similarity threshold
-- ==========================================================
-- Lower value = more results (looser matching)
-- Default is 0.3; try 0.2 for very fuzzy names.
-- SET pg_trgm.similarity_threshold = 0.3;

-- ==========================================================
-- ✅ Done! Run this once to enable fast owner_name search
-- ==========================================================
