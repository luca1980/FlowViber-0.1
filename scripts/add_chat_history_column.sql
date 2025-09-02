-- Add chat_history column to workflows table
ALTER TABLE workflows 
ADD COLUMN IF NOT EXISTS chat_history JSONB DEFAULT '[]'::jsonb;

-- Add comment to describe the column
COMMENT ON COLUMN workflows.chat_history IS 'Stores the conversation messages as JSON array';
