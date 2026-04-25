CREATE TABLE IF NOT EXISTS cot_performance (
  metal TEXT NOT NULL,
  score_bucket TEXT NOT NULL,
  weeks INT NOT NULL,
  median_30d REAL,
  median_90d REAL,
  PRIMARY KEY (metal, score_bucket)
);
ALTER TABLE cot_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON cot_performance;
CREATE POLICY "public read" ON cot_performance FOR SELECT USING (true);
