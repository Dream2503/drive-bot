from os import getenv

from dotenv import load_dotenv
from psycopg2 import connect

load_dotenv()

try:
    CURSOR = connect(
            user=getenv("USERNAME"),
            password=getenv("PASSWORD"),
            host=getenv("HOST"),
            port=getenv("PORT"),
            dbname=getenv("DATABASE"),
    ).cursor()

except Exception as e:
    print(f"Failed to connect: {e}")
    raise
