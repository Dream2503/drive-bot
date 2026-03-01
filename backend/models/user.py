from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from ..database.get_db import Base


class User(Base):
    __tablename__ = "users"

    uid = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    password = Column(String, nullable=False)

    files = relationship("Own", back_populates="user")