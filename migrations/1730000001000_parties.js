export const up = pgm => {
  pgm.sql(`
    CREATE TABLE games (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      host_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'finished', 'interrupted')),
      settings jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      ended_at timestamptz
    );
    CREATE INDEX games_host_created ON games (host_id, created_at DESC);

    CREATE TABLE game_tracks (
      game_id uuid NOT NULL REFERENCES games ON DELETE CASCADE,
      position int NOT NULL,
      uri text NOT NULL,
      name text NOT NULL,
      artists jsonb NOT NULL,
      album_image text,
      theme_id text NOT NULL,
      from_review boolean NOT NULL,
      played boolean NOT NULL DEFAULT false,
      PRIMARY KEY (game_id, position)
    );

    CREATE TABLE review_tracks (
      host_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      uri text NOT NULL,
      name text NOT NULL,
      artists jsonb NOT NULL,
      album_image text,
      theme_id text NOT NULL,
      added_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY (host_id, uri)
    );
  `);
};

export const down = pgm => {
  pgm.sql('DROP TABLE review_tracks; DROP TABLE game_tracks; DROP TABLE games;');
};
