-- Custom AI-generated player avatar, separate from the Higgsfield platform
-- account's own avatar_url (CurrentUser.avatar_url) — this one is optional
-- and only set once a player generates one via the in-app avatar creator.
ALTER TABLE quiz_users ADD COLUMN avatar_url TEXT;
