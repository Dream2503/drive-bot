import platform
import shutil
import subprocess
from pathlib import Path
from socket import create_connection
from urllib import request
from zipfile import ZipFile

from core.config import TRANSFER_PATH


def get_ffmpeg_path():
    ffmpeg_path: str | None = shutil.which("ffmpeg")

    if ffmpeg_path is not None:
        return Path(ffmpeg_path)

    if platform.system() == "Windows":
        ffmpeg_dir: Path = Path.home() / "AppData" / "Local" / "StoreLimitless" / "ffmpeg"
        ffmpeg_path: Path = ffmpeg_dir / "ffmpeg.exe"

        if not ffmpeg_path.is_file():
            print("FFmpeg is not installed. Downloading and installing FFmpeg for you...")
            ffmpeg_dir.mkdir(parents=True, exist_ok=True)
            archive: Path = ffmpeg_dir / "ffmpeg.zip"
            request.urlretrieve("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", archive)

            with ZipFile(archive) as zf:
                ffmpeg_files: list[str] = [name for name in zf.namelist() if name.endswith("/bin/ffmpeg.exe")]

                if not ffmpeg_files:
                    raise RuntimeError("FFmpeg was downloaded, but ffmpeg.exe could not be found.")

                with zf.open(ffmpeg_files[0]) as source:
                    ffmpeg_path.write_bytes(source.read())

            archive.unlink(missing_ok=True)

        if not ffmpeg_path.is_file():
            raise RuntimeError("FFmpeg was downloaded, but ffmpeg.exe could not be installed.")

        print(f"FFmpeg installed at: {ffmpeg_path}")
        return ffmpeg_path

    if platform.system() == "Linux":
        print("FFmpeg is not installed. Installing FFmpeg for you...")

        try:
            subprocess.run(["sudo", "apt", "update"], check=True)
            subprocess.run(["sudo", "apt", "install", "-y", "ffmpeg"], check=True)

        except subprocess.CalledProcessError as e:
            raise RuntimeError(
                "FFmpeg is required to download YouTube videos, but StoreLimitless could not install it automatically.\n\n"
                "Please install it manually by running:\n"
                "sudo apt update && sudo apt install ffmpeg"
            ) from e

        ffmpeg_path = shutil.which("ffmpeg")

        if ffmpeg_path is None:
            raise RuntimeError("FFmpeg was installed, but could not be found in PATH.")

        return Path(ffmpeg_path)

    raise RuntimeError("FFmpeg is required to download YouTube videos. Please install FFmpeg and make sure it is available in PATH.")


def start_redis_server():
    try:
        with create_connection(("127.0.0.1", 6379), timeout=0.1):
            return None

    except OSError:
        pass

    system: str = platform.system()

    if system == "Windows":
        redis_dir: Path = Path.home() / "AppData" / "Local" / "StoreLimitless" / "redis"
        redis_path: Path = redis_dir / "redis-server.exe"
        system_redis: str | None = shutil.which("redis-server")

        if system_redis is not None:
            redis_path = Path(system_redis)

        elif not redis_path.is_file():
            print("Redis is not installed. Downloading and installing Redis for you...")
            redis_dir.mkdir(parents=True, exist_ok=True)
            archive: Path = redis_dir / "redis.zip"
            request.urlretrieve("https://github.com/redis-windows/redis-windows/releases/download/8.2.1/Redis-8.2.1-Windows-x64-msys2.zip", archive)

            with ZipFile(archive) as zf:
                redis_files: list[str] = [name for name in zf.namelist() if name.endswith("/redis-server.exe")]

                if not redis_files:
                    raise RuntimeError("Redis was downloaded, but redis-server.exe could not be found.")

                prefix: str = redis_files[0].rsplit("/", 1)[0] + "/"

                for name in zf.namelist():
                    if name.startswith(prefix) and not name.endswith("/"):
                        target: Path = redis_dir / name[len(prefix):]
                        target.parent.mkdir(parents=True, exist_ok=True)

                        with zf.open(name) as source:
                            target.write_bytes(source.read())

            archive.unlink(missing_ok=True)

    elif system == "Linux":
        redis_path: Path = Path(shutil.which("redis-server") or "")

        if not redis_path.is_file():
            print("Redis is not installed. Installing Redis for you...")

            try:
                subprocess.run(["sudo", "apt", "update"], check=True)
                subprocess.run(["sudo", "apt", "install", "-y", "redis-server"], check=True)

            except subprocess.CalledProcessError as e:
                raise RuntimeError(
                    "Redis is required, but StoreLimitless could not install it automatically.\n\n"
                    "Please install it manually by running:\n"
                    "sudo apt update && sudo apt install redis-server"
                ) from e

            redis_path = Path(shutil.which("redis-server") or "")

    else:
        raise RuntimeError(f"Redis automatic installation is not supported on {system}.")

    if not redis_path.is_file():
        raise FileNotFoundError(f"Redis executable not found: {redis_path}")

    redis_data_dir: Path = TRANSFER_PATH.parent / "redis"
    redis_data_dir.mkdir(parents=True, exist_ok=True)
    return subprocess.Popen([str(redis_path), "--bind", "127.0.0.1", "--port", "6379", "--dir", str(redis_data_dir)])
