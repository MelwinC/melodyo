export const up = pgm => {
  pgm.sql(`
    CREATE TABLE rooms (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code text NOT NULL,
      host_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      closed_at timestamptz
    );
    CREATE UNIQUE INDEX rooms_open_code ON rooms (code) WHERE closed_at IS NULL;
    CREATE UNIQUE INDEX rooms_open_host ON rooms (host_id) WHERE closed_at IS NULL;

    CREATE TABLE participants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id uuid NOT NULL REFERENCES rooms ON DELETE CASCADE,
      user_id uuid REFERENCES users ON DELETE CASCADE,
      guest_name text,
      guest_token_hash text,
      joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
    );
    CREATE UNIQUE INDEX participants_room_user ON participants (room_id, user_id);
    CREATE INDEX participants_guest_token ON participants (guest_token_hash);

    ALTER TABLE games ADD COLUMN room_id uuid REFERENCES rooms ON DELETE SET NULL;

    CREATE TABLE answers (
      game_id uuid NOT NULL REFERENCES games ON DELETE CASCADE,
      position int NOT NULL,
      participant_id uuid NOT NULL REFERENCES participants ON DELETE CASCADE,
      title text NOT NULL DEFAULT '',
      artist text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (game_id, position, participant_id)
    );
  `);
};

export const down = pgm => {
  pgm.sql('DROP TABLE answers; ALTER TABLE games DROP COLUMN room_id; DROP TABLE participants; DROP TABLE rooms;');
};
