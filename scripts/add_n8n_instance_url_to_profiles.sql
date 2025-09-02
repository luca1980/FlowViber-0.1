-- Add n8n_instance_url column to profiles table for storing user's n8n instance URL
ALTER TABLE profiles 
ADD COLUMN n8n_instance_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN profiles.n8n_instance_url IS 'User''s n8n instance URL for API integration';
