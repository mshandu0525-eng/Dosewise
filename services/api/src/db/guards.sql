-- Production-only guards (not supported by the in-memory test database).
-- The consent log is append-only: rows can be added, never changed or removed,
-- except by the retention job role after 5 years.
CREATE OR REPLACE FUNCTION consents_append_only() RETURNS trigger AS $$
BEGIN
  IF current_user <> 'dosewise_retention' THEN
    RAISE EXCEPTION 'consents is append-only';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS consents_no_update ON consents;
CREATE TRIGGER consents_no_update BEFORE UPDATE OR DELETE ON consents
  FOR EACH ROW EXECUTE FUNCTION consents_append_only();
