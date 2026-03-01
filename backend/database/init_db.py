def init_db():
    from psycopg2 import connect
    from dotenv import load_dotenv
    from os import getenv

    load_dotenv()
    USERNAME = getenv("USERNAME")
    PASSWORD = getenv("PASSWORD")
    HOST = getenv("HOST")
    PORT = getenv("PORT")
    DATABASE = getenv("DATABASE")

    try:
        connection = connect(
                user=USERNAME,
                password=PASSWORD,
                host=HOST,
                port=PORT,
                dbname=DATABASE,
        )
        return connection.cursor()

    except Exception as e:
        print(f"Failed to connect: {e}")
        exit(0)
