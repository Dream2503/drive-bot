from pydantic import BaseModel, ConfigDict

"""
CREATE TABLE IF NOT EXISTS users
(
    uid        INTEGER PRIMARY KEY AUTOINCREMENT,
    username   VARCHAR(50) NOT NULL UNIQUE,
    password   VARCHAR     NOT NULL,
    first_name VARCHAR     NOT NULL DEFAULT '',
    last_name  VARCHAR     NOT NULL DEFAULT ''
);
"""


class User(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    uid: int | None = None
    first_name: str
    last_name: str
    username: str
    password: str

    def __repr__(self) -> str:
        return (
            f"User(uid={self.uid}, "
            f"first_name={self.first_name!r}, "
            f"last_name={self.last_name!r}, "
            f"username={self.username!r})"
        )


"""
CREATE TABLE IF NOT EXISTS files
(
    fid         INTEGER PRIMARY KEY AUTOINCREMENT,
    fname       TEXT    NOT NULL,
    directory   TEXT,
    file_size   INTEGER NOT NULL,
    file_type   TEXT,
    data_center TEXT,
    flinks      TEXT    NOT NULL,
    uid         INTEGER,
    FOREIGN KEY (uid) REFERENCES users (uid)
);
"""


class File(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    fid: int | None = None
    fname: str
    directory: str
    file_size: int
    file_type: str
    flinks: list[str]
    data_center: str
    uid: int

    def __repr__(self) -> str:
        return (
            f"File(fid={self.fid}, "
            f"fname={self.fname!r}, "
            f"directory={self.directory!r}, "
            f"file_size={self.file_size}, "
            f"file_type={self.file_type}, "
            f"flinks={self.flinks!r}, "
            f"data_center={self.data_center!r}, "
            f"uid={self.uid})"
        )


"""
CREATE TABLE IF NOT EXISTS github_cursor
(
    repo_id INTEGER NOT NULL DEFAULT 0 PRIMARY KEY,
    used    INTEGER NOT NULL DEFAULT 0
);
"""


class LoginRequest(BaseModel):
    username: str
    password: str

    def __repr__(self) -> str:
        return f"LoginRequest(username={self.username!r})"
