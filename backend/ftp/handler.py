from asyncio import AbstractEventLoop

from pyftpdlib.handlers import FTPHandler

from backend.database.models import User
from backend.ftp.filesystem.filesystem import StoreLimitlessFS


class StoreLimitlessHandler(FTPHandler):
    abstracted_fs = StoreLimitlessFS

    event_loop: AbstractEventLoop
    store_limitless_user: User | None = None

    def on_connect(self) -> None:
        print(f"[FTP CONNECT] {self.remote_ip}:{self.remote_port}")

    def on_login(self, username: str) -> None:
        print(f"[FTP LOGIN] user={username}")

    def on_logout(self, username: str) -> None:
        print(f"[FTP LOGOUT] user={username}")
        self.store_limitless_user = None

    def on_disconnect(self) -> None:
        print(f"[FTP DISCONNECT] {self.remote_ip}:{self.remote_port}")

    def on_file_sent(self, file: str) -> None:
        print(f"[FTP SENT] {file}")

    def on_incomplete_file_sent(self, file: str) -> None:
        print(f"[FTP INCOMPLETE] {file}")
