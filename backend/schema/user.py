from pydantic import BaseModel, Field, ConfigDict
class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=50)

class UserCreate(UserBase):
    password: str = Field(min_length=6)

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(UserBase):
    uid: int

    model_config = ConfigDict(from_attributes=True)