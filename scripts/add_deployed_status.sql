-- Add 'deployed' status to the existing workflow status constraint
-- This updates the constraint to allow draft, generated, active, completed, archived, and deployed

-- Drop the existing constraint if it exists
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_status_check;

-- Add the updated constraint with 'deployed' status
ALTER TABLE workflows ADD CONSTRAINT workflows_status_check 
CHECK (status IN ('draft', 'generated', 'active', 'completed', 'archived', 'deployed'));

-- Update any existing workflows with NULL status to 'draft'
UPDATE workflows SET status = 'draft' WHERE status IS NULL;
