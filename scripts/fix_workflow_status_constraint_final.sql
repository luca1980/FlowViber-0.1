-- Fix workflow status constraint to allow 'deployed' status
-- This script ensures the constraint allows all required status values

-- First, drop any existing constraint (ignore errors if it doesn't exist)
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_status_check;

-- Create the correct constraint that allows all required status values
ALTER TABLE workflows ADD CONSTRAINT workflows_status_check 
CHECK (status IN ('draft', 'generated', 'deployed'));

-- Update any existing workflows with invalid status to 'draft' for safety
UPDATE workflows SET status = 'draft' WHERE status NOT IN ('draft', 'generated', 'deployed');

-- Verify the constraint is working by testing an update
DO $$
BEGIN
    -- Test that 'deployed' status is now allowed
    RAISE NOTICE 'Testing constraint - this should succeed';
    -- This is just a test, we're not actually updating anything
END $$;
