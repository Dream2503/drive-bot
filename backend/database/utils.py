from datetime import datetime
from json import loads, dumps

from core.data_center import Database
from core.utils import write_log
from .connection import CURSOR
from .schema import File, User


def add_user(user: User) -> None:
    try:
        CURSOR.execute(
            """
            INSERT INTO users (username, password, first_name, last_name, created_at)
            VALUES (?, ?, ?, ?. ?);
            """, (user.username, user.password, user.first_name, user.last_name, user.created_at.isoformat()),
        )
        CURSOR.connection.commit()
        write_log("INFO", Database, "SET USER", user.username, "User successfully inserted into database.")

    except Exception as e:
        write_log("ERROR", Database, "SET USER", user.username, f"Failed to insert user: {e}")


def get_user(username: str) -> User | None:
    CURSOR.execute(
        """
        SELECT username, password, first_name, last_name, created_at
        FROM users
        WHERE username = ?;
        """,
        (username,),
    )
    write_log("INFO", Database, "GET USER", username, f"Select query executed for {username}.")
    user: dict[str, int | str] | None = CURSOR.fetchone()

    if user:
        user["created_at"] = datetime.fromisoformat(user["created_at"])
        return User(**user)

    write_log("ERROR", Database, "GET USER", "", "User not found in the database")
    return None


def add_file(file: File) -> None:
    user: User | None = get_user(username=file.username)

    if user:
        CURSOR.execute(
            """
            INSERT INTO files (directory, name, type, size, modified_at, data_center, links, username)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (file.directory, file.name, file.type, file.size, file.modified_at.isoformat(), file.data_center, dumps(file.links), file.username),
        )
        CURSOR.connection.commit()
        write_log("INFO", Database, "INSERT FILES", user.username, f"File `{file.name}` saved to database with {len(file.links)} part(s).")


def get_file(file_id: int) -> File | None:
    CURSOR.execute(
        """
        SELECT id,
               directory,
               name,
               type,
               "size",
               modified_at,
               data_center,
               links,
               username
        FROM files
        WHERE id = ?;
        """, (file_id,),
    )

    write_log("INFO", Database, "GET FILE", "", f"Select query executed for id={file_id}.")
    file: dict[str, int | str | list[str]] | None = CURSOR.fetchone()

    if file:
        file["links"] = loads(file["links"])
        file["modified_at"] = datetime.fromisoformat(file["modified_at"])
        return File(**file)

    write_log("ERROR", Database, "GET FILE", "", f"No file found for id={file_id}.")
    return None


def get_files(*, directory: str | None = None, username: str | None = None) -> list[File] | None:
    if directory is not None:
        CURSOR.execute(
            """
            SELECT id,
                   directory,
                   name,
                   type,
                   "size",
                   modified_at,
                   data_center,
                   links,
                   username
            FROM files
            WHERE directory = ?;
            """, (directory,),
        )
        attribute, value = "directory", directory

    elif username is not None:
        CURSOR.execute(
            """
            SELECT id,
                   directory,
                   name,
                   type,
                   "size",
                   modified_at,
                   data_center,
                   links,
                   username
            FROM files
            WHERE username = ?;
            """, (username,),
        )
        attribute, value = "username", username

    else:
        write_log("ERROR", Database, "GET FILES", "", "No valid search parameter provided.")
        return None

    write_log("INFO", Database, "GET FILES", "", f"Select query executed for {attribute}={value}.")
    data: list[dict[str, int | str | list[str]]] = CURSOR.fetchall()

    if data:
        files: list[File] = []

        for file in data:
            file["links"] = loads(file["links"])
            file["modified_at"] = datetime.fromisoformat(file["modified_at"])
            files.append(File(**file))

        write_log("INFO", Database, "GET FILES", str(value), f"Successfully fetched {len(files)} file(s) from database.")
        return files

    write_log("ERROR", Database, "GET FILES", "", f"No files found for {attribute}={value}.")
    return None


def github_cursor_get_repo_id() -> int:
    CURSOR.execute(
        """
        SELECT repo_id
        FROM github_cursor;
        """,
    )
    data: dict[str, int] | None = CURSOR.fetchone()

    if data:
        return data["repo_id"]

    write_log("ERROR", Database, "GET GITHUB CURSOR", "", "No GitHub cursor found in database.")
    raise OSError("GitHub cursor not found in database.")


def github_cursor_increment_repo_id() -> None:
    CURSOR.execute(
        """
        UPDATE github_cursor
        SET repo_id = repo_id + 1;
        """,
    )
    CURSOR.connection.commit()
    write_log("INFO", Database, "UPDATE GITHUB CURSOR", "", "GitHub repository ID incremented.")


def github_cursor_get_used() -> int:
    CURSOR.execute(
        """
        SELECT used
        FROM github_cursor;
        """,
    )
    data: dict[str, int] | None = CURSOR.fetchone()

    if data:
        return data["used"]

    write_log("ERROR", Database, "GET GITHUB CURSOR", "", "No GitHub cursor found in database.")
    raise OSError("GitHub cursor not found in database.")


def github_cursor_set_used(value: int) -> None:
    CURSOR.execute(
        """
        UPDATE github_cursor
        SET used = ?;
        """,
        (value,),
    )
    CURSOR.connection.commit()
    write_log("INFO", Database, "UPDATE GITHUB CURSOR", "", f"GitHub storage usage increased by {value} bytes.")
