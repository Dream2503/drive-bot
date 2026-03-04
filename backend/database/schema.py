class User:
    def __init__(self, uid: int | None, first_name: str, last_name: str, username: str, password: str) -> None:
        self._uid: int | None = uid
        self._first_name: str = first_name
        self._last_name: str = last_name
        self._username: str = username
        self._password: str = password

    @property
    def uid(self) -> int | None:
        return self._uid

    @property
    def first_name(self) -> str:
        return self._first_name

    @property
    def last_name(self) -> str:
        return self._last_name

    @property
    def username(self) -> str:
        return self._username

    @property
    def password(self) -> str:
        return self._password


class File:
    def __init__(self, fid: int | None, fname: str, flinks: list[str], data_center: str, uid: int) -> None:
        self._fid: int | None = fid
        self._fname: str = fname
        self._flinks: list[str] = flinks
        self._data_center: str = data_center
        self._uid: int = uid

    @property
    def fid(self) -> int | None:
        return self._fid

    @property
    def fname(self) -> str:
        return self._fname

    @property
    def flinks(self) -> list[str]:
        return self._flinks

    @property
    def data_center(self) -> str:
        return self._data_center

    @property
    def uid(self) -> int:
        return self._uid
