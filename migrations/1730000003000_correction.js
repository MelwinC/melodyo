export const up = pgm => {
  pgm.sql(`
    ALTER TABLE answers ADD COLUMN title_ok boolean, ADD COLUMN artist_ok boolean;
    CREATE TABLE game_reveals (
      game_id uuid NOT NULL REFERENCES games ON DELETE CASCADE,
      position int NOT NULL,
      PRIMARY KEY (game_id, position)
    );
  `);
};

export const down = pgm => {
  pgm.sql('DROP TABLE game_reveals; ALTER TABLE answers DROP COLUMN title_ok, DROP COLUMN artist_ok;');
};
