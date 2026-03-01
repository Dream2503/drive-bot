from typing import Callable


def get_username(cursor, uid: int, logger: Callable[[str, str, str, str], None]) -> str | None:
    cursor.execute(
            """
            SELECT username
            FROM users
            WHERE uid = %s;
            """, (uid,),
    )
    data: tuple[str] | None = cursor.fetchone()
    logger("INFO", "GET USERNAME", "", f"Query executed.")

    if data:
        logger("INFO", "GET USERNAME", data[0], f"Successfully fetched user from database.")
        return data[0]

    logger("ERROR", "GET USERNAME", "", f"User not found in the database")
    return None


def get_file_links(cursor, uid: int, filename: str, logger: Callable[[str, str, str, str], None]) -> list[int] | None:
    username: str | None = get_username(cursor, uid, logger)

    if username:
        cursor.execute(
                """
                SELECT flinks
                FROM files f
                         JOIN owns o ON f.fid = o.fid
                WHERE o.uid = %s
                  AND f.fname = %s;
                """, (uid, filename),
        )
        data: tuple[list[int]] | None = cursor.fetchone()
        logger("INFO", "GET FILE LINKS", "", f"Query executed.")

        if data:
            logger("INFO", "GET FILE LINKS", username, f"Successfully fetched user and file links from the database.")
            return data[0]

        logger("ERROR", "GET FILE LINKS", username, f"File: {filename} not found in the database.")

    return None


def insert_files(cursor, uid: int, filename: str, links: list[int], logger: Callable[[str, str, str, str], None]) -> None:
    username: str | None = get_username(cursor, uid, logger)

    if username:
        cursor.execute(
                """
                INSERT INTO files (fname, flinks)
                VALUES (%s, %s) RETURNING fid;
                """, (filename, links),
        )
        fid: int = cursor.fetchone()[0]
        cursor.execute(
                """
                INSERT INTO owns
                VALUES (%s, %s);
                """, (uid, fid),
        )
        logger("INFO", "INSERT FILES", "", f"Query executed.")
        cursor.connection.commit()
        logger("INFO", "INSERT FILES", username, f"File `{filename}` saved to database with {len(links)} part(s).")
