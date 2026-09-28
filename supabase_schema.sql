-- =========================================================
-- SVS Billing: Supabase Database Schema
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqrkldffbxzshxwyfduc/sql
-- =========================================================

-- 1. Create bills table
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  no TEXT NOT NULL,
  date TEXT,
  cname TEXT,
  grand NUMERIC DEFAULT 0,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_bills_type_no ON bills(type, no);
CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

-- 4. Allow public access (Read, Insert, Update, Delete)
DROP POLICY IF EXISTS "Allow public read" ON bills;
CREATE POLICY "Allow public read" ON bills FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert" ON bills;
CREATE POLICY "Allow public insert" ON bills FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update" ON bills;
CREATE POLICY "Allow public update" ON bills FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete" ON bills;
CREATE POLICY "Allow public delete" ON bills FOR DELETE USING (true);
