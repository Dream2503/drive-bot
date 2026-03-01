from pydantic import BaseModel, ConfigDict
class FileCreate(BaseModel):
    fname: str
    flink: str

class FileResponse(FileCreate):
    fid: int

    class Config:
        model_config = ConfigDict(from_attributes=True)

# [Optional] Can be used if needed...Not created any extra file for this.
class Owns(BaseModel):
    uid: int
    fid: int