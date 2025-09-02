-- Create a default user for development without authentication
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'dev@flowviber.com',
  '$2a$10$dummy.hash.for.development.user.only',
  NOW(),
  NOW(),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"name": "Development User"}',
  false,
  'authenticated'
) ON CONFLICT (id) DO NOTHING;
