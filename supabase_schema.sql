-- =========================================================
-- SVS Billing: Supabase Database Schema & Security Fixes
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qqrkldffbxzshxwyfduc/sql
-- =========================================================

-- 1. Create bills table
CREATE TABLE IF NOT EXISTS public.bills (
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

-- 2. Indexes
-- Primary key already indexes 'id'. Add index for date sorting if queried by date.
CREATE INDEX IF NOT EXISTS idx_bills_date ON public.bills(date DESC);

-- Drop unused index if previously created
DROP INDEX IF EXISTS public.idx_bills_type_no;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

-- 4. Secure Policies
-- Drop old permissive policies
DROP POLICY IF EXISTS "Allow public read" ON public.bills;
DROP POLICY IF EXISTS "Allow public insert" ON public.bills;
DROP POLICY IF EXISTS "Allow public update" ON public.bills;
DROP POLICY IF EXISTS "Allow public delete" ON public.bills;
DROP POLICY IF EXISTS "Allow all operations for anon and service" ON public.bills;

-- Define explicit policy for application access
CREATE POLICY "Allow all operations for anon and service"
ON public.bills
FOR ALL
TO anon, authenticated, service_role
USING (true)
WITH CHECK (true);

-- 5. Fix Security Definer Function Permissions (rls_auto_enable)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    -- Revoke execute from public/anon/authenticated
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
    -- Grant only to postgres and service_role
    GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO postgres, service_role;
    -- Secure search path
    ALTER FUNCTION public.rls_auto_enable() SET search_path = public, pg_temp;
  END IF;
END $$;
