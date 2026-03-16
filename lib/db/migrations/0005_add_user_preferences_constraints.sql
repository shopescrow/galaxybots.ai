ALTER TABLE user_preferences
  ADD CONSTRAINT chk_accent_color CHECK (accent_color IN ('purple','cyan','gold','green','orange','red','blue','slate')),
  ADD CONSTRAINT chk_font_size CHECK (font_size IN ('sm','md','lg','xl'));
