-- Add a function to prevent deployed workflows from reverting to draft
-- unless explicitly clearing the n8n_workflow_id

CREATE OR REPLACE FUNCTION prevent_status_regression()
RETURNS TRIGGER AS $$
BEGIN
  -- If workflow is being changed from deployed to draft
  IF OLD.status = 'deployed' AND NEW.status = 'draft' THEN
    -- Only allow if n8n_workflow_id is being explicitly cleared
    IF NEW.n8n_workflow_id IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot change deployed workflow to draft status while n8n_workflow_id exists. Clear n8n_workflow_id first or set status to another valid state.';
    END IF;
  END IF;
  
  -- If workflow has n8n_workflow_id, status should not be draft
  IF NEW.n8n_workflow_id IS NOT NULL AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'Workflow with n8n_workflow_id cannot have draft status';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS workflow_status_protection ON workflows;
CREATE TRIGGER workflow_status_protection
  BEFORE UPDATE ON workflows
  FOR EACH ROW
  EXECUTE FUNCTION prevent_status_regression();
