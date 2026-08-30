from sqlite3 import connect, Connection, Cursor, Row

from core.config import DATABASE_PATH

try:
    CONNECTION: Connection = connect(DATABASE_PATH, check_same_thread=False)
    CONNECTION.row_factory = Row
    CONNECTION.execute("PRAGMA foreign_keys = ON")
    CURSOR: Cursor = CONNECTION.cursor()

    CURSOR.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            uid        INTEGER PRIMARY KEY AUTOINCREMENT,
            username   TEXT NOT NULL UNIQUE,
            password   TEXT NOT NULL,
            first_name TEXT NOT NULL DEFAULT '',
            last_name  TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS files (
            fid         INTEGER PRIMARY KEY AUTOINCREMENT,
            fname       TEXT    NOT NULL,
            directory   TEXT,
            file_size   INTEGER NOT NULL,
            file_type   TEXT,
            modified_at TEXT    NOT NULL,
            data_center TEXT,
            flinks      TEXT    NOT NULL,
            uid         INTEGER,
            FOREIGN KEY (uid) REFERENCES users (uid)
        );

        CREATE TABLE IF NOT EXISTS github_cursor (
            repo_id INTEGER NOT NULL DEFAULT 0 PRIMARY KEY,
            used    INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    CONNECTION.commit()

except Exception as e:
    print(f"Failed to connect: {e}")
