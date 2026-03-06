from os import getenv

from psycopg2 import connect
from psycopg2.extras import RealDictCursor

try:
    CURSOR: RealDictCursor = connect(
            user=getenv("USERNAME"),
            password=getenv("PASSWORD"),
            host=getenv("HOST"),
            port=getenv("PORT"),
            dbname=getenv("DATABASE"),
    ).cursor(cursor_factory=RealDictCursor)

except Exception as e:
    print(f"Failed to connect: {e}")
    raise
