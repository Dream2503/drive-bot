from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from ..database.get_db import Base


class Own(Base):
    __tablename__ = "owns"

    uid = Column(Integer, ForeignKey("users.uid"), primary_key=True)
    fid = Column(Integer, ForeignKey("files.fid"), primary_key=True)

    user = relationship("User", back_populates="files")
    file = relationship("File", back_populates="owners")