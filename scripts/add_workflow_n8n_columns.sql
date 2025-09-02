-- Add missing columns to workflows table for n8n integration
ALTER TABLE workflows 
ADD COLUMN IF NOT EXISTS n8n_workflow_id TEXT,
ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;

-- Add index on n8n_workflow_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_workflows_n8n_workflow_id ON workflows(n8n_workflow_id);

-- Add comment for documentation
COMMENT ON COLUMN workflows.n8n_workflow_id IS 'The workflow ID from n8n after deployment';
COMMENT ON COLUMN workflows.deployed_at IS 'Timestamp when workflow was deployed to n8n';
COMMENT ON COLUMN workflows.last_sync_at IS 'Timestamp of last sync with n8n';
