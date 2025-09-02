-- Fix workflow status constraint to include 'deployed' status
-- This addresses the constraint violation when updating workflow status to 'deployed'

-- Drop existing constraint if it exists
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_status_check;

-- Add new constraint that includes all required status values
ALTER TABLE workflows ADD CONSTRAINT workflows_status_check 
CHECK (status IN ('draft', 'active', 'completed', 'generated', 'deployed', 'archived'));

-- Update any existing workflows with invalid status to 'draft'
UPDATE workflows SET status = 'draft' WHERE status NOT IN ('draft', 'active', 'completed', 'generated', 'deployed', 'archived');
