-- Create workflows table with proper RLS policies for user-specific workflow storage
CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  chat_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  workflow_json JSONB,
  status TEXT DEFAULT 'draft',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "workflows_select_own"
  ON public.workflows FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "workflows_insert_own"
  ON public.workflows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "workflows_update_own"
  ON public.workflows FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "workflows_delete_own"
  ON public.workflows FOR DELETE
  USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_workflows_updated_at
    BEFORE UPDATE ON public.workflows
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
