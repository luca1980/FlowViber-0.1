-- Update workflow status constraint to allow 'generated' status
-- This fixes the constraint violation when updating workflow status to 'generated'

-- First, drop the existing constraint if it exists
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_status_check;

-- Add a new constraint that includes 'generated' as an allowed status
ALTER TABLE workflows ADD CONSTRAINT workflows_status_check 
CHECK (status IN ('draft', 'active', 'completed', 'archived', 'generated'));

-- Add comment to document the allowed status values
COMMENT ON COLUMN workflows.status IS 'Workflow status: draft, active, completed, archived, or generated';
