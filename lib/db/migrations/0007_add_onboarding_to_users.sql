ALTER TABLE users
ADD COLUMN IF NOT EXISTS onboarding JSONB DEFAULT '{"companyProfile":false,"firstClient":false,"industry":false,"integrations":false,"firstMission":false,"dismissed":false,"completedAt":null}';
