export const up = pgm => {
  pgm.sql(`
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username text NOT NULL,
      password_hash text NOT NULL,
      avatar_kind text NOT NULL DEFAULT 'preset' CHECK (avatar_kind IN ('preset', 'upload')),
      avatar_value text NOT NULL DEFAULT 'note',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX users_username_lower ON users (lower(username));

    CREATE TABLE sessions (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX sessions_user_id ON sessions (user_id);

    CREATE TABLE spotify_links (
      user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
      spotify_user_id text NOT NULL,
      access_token text NOT NULL,
      refresh_token text NOT NULL,
      expires_at timestamptz NOT NULL
    );
  `);
};

export const down = pgm => {
  pgm.sql('DROP TABLE spotify_links; DROP TABLE sessions; DROP TABLE users;');
};
