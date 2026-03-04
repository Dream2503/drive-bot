from passlib.context import CryptContext

CONTEXT: CryptContext = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str):
    return CONTEXT.hash(password)


def verify_password(password: str, hashed_password: str):
    return CONTEXT.verify(password, hashed_password)
