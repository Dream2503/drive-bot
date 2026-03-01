from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from ..database.get_db import Base


class File(Base):
    __tablename__ = "files"

    fid = Column(Integer, primary_key=True, index=True)
    fname = Column(String(100), nullable=False)
    flink = Column(String, nullable=False)

    owners = relationship("Own", back_populates="file")