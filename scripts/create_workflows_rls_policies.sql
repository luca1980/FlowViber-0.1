-- Enable Row Level Security on workflows table
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for workflows table to allow CRUD operations for authenticated users
-- Allow users to view their own workflows
CREATE POLICY "Allow users to view their own workflows" 
ON workflows FOR SELECT 
USING (auth.uid() = user_id);

-- Allow users to insert their own workflows
CREATE POLICY "Allow users to insert their own workflows" 
ON workflows FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own workflows
CREATE POLICY "Allow users to update their own workflows" 
ON workflows FOR UPDATE 
USING (auth.uid() = user_id);

-- Allow users to delete their own workflows
CREATE POLICY "Allow users to delete their own workflows" 
ON workflows FOR DELETE 
USING (auth.uid() = user_id);

-- Create a temporary policy for development that allows operations with the default dev user
-- This allows the development user to perform CRUD operations
CREATE POLICY "Allow development user operations" 
ON workflows FOR ALL 
USING (user_id = '550e8400-e29b-41d4-a716-446655440000'::uuid)
WITH CHECK (user_id = '550e8400-e29b-41d4-a716-446655440000'::uuid);
