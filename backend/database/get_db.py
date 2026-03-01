from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker,declarative_base
from dotenv import load_dotenv
from os import getenv

load_dotenv()
DatabaseURL = getenv("DATABASE_URL")

engine = create_engine(DatabaseURL)

SessionLocal = sessionmaker(autocommit=False,bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()