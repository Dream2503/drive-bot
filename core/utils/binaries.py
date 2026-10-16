import platform
import re
import shutil
import subprocess
import webbrowser
from getpass import getpass
from os import chmod, environ
from pathlib import Path
from queue import Empty, Queue
from socket import create_connection
from subprocess import DEVNULL, PIPE, STDOUT, Popen, TimeoutExpired
from threading import Thread
from time import monotonic
from urllib import request
from zipfile import ZipFile

from core.config import TRANSFER_PATH
from core.data_center import Binaries
from core.utils import write_log


def get_ffmpeg_path():
    ffmpeg_path: str | None = shutil.which("ffmpeg")

    if ffmpeg_path is not None:
        return Path(ffmpeg_path)

    if platform.system() == "Windows":
        ffmpeg_dir: Path = Path.home() / "AppData" / "Local" / "StoreLimitless" / "ffmpeg"
        ffmpeg_path: Path = ffmpeg_dir / "ffmpeg.exe"

        if not ffmpeg_path.is_file():
            write_log('INFO', Binaries, 'GET_FFMPEG_PATH', "server", "FFmpeg is not installed. Downloading and installing FFmpeg for you...")
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

        write_log('INFO', Binaries, 'GET_FFMPEG_PATH', "server", f"FFmpeg installed at: {ffmpeg_path}")
        return ffmpeg_path

    if platform.system() == "Linux":
        write_log('INFO', Binaries, 'GET_FFMPEG_PATH', "server", "FFmpeg is not installed. Installing FFmpeg for you...")

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
            write_log('INFO', Binaries, 'START_REDIS_SERVER', "server", "Redis is not installed. Downloading and installing Redis for you...")
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
            write_log('INFO', Binaries, 'START_REDIS_SERVER', "server", "Redis is not installed. Installing Redis for you...")

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


def start_cloudflare_tunnel(service_url: str, label: str) -> tuple[Popen, str]:
    cloudflared: str | None = shutil.which("cloudflared")

    if cloudflared is None:
        system: str = platform.system()
        machine: str = platform.machine().lower()

        cloudflared_dir: Path = (
            Path.home() / "AppData" / "Local" / "StoreLimitless" / "cloudflared"
            if system == "Windows"
            else Path.home() / ".local" / "share" / "StoreLimitless" / "cloudflared"
        )

        executable: str = "cloudflared.exe" if system == "Windows" else "cloudflared"
        cloudflared_path: Path = cloudflared_dir / executable

        if system == "Windows":
            if machine not in ("amd64", "x86_64"):
                raise RuntimeError(
                    f"Automatic Cloudflare installation is not supported for {system} {machine}."
                )

            download_url: str = (
                "https://github.com/cloudflare/cloudflared/releases/latest/download/"
                "cloudflared-windows-amd64.exe"
            )

        elif system == "Linux":
            architectures: dict[str, str] = {
                "x86_64": "amd64",
                "amd64": "amd64",
                "aarch64": "arm64",
                "arm64": "arm64",
                "armv7l": "arm",
            }

            architecture: str | None = architectures.get(machine)

            if architecture is None:
                raise RuntimeError(
                    f"Automatic Cloudflare installation is not supported for {system} {machine}."
                )

            download_url = (
                "https://github.com/cloudflare/cloudflared/releases/latest/download/"
                f"cloudflared-linux-{architecture}"
            )

        elif system == "Darwin":
            architectures = {
                "x86_64": "amd64",
                "amd64": "amd64",
                "arm64": "arm64",
                "aarch64": "arm64",
            }

            architecture = architectures.get(machine)

            if architecture is None:
                raise RuntimeError(
                    f"Automatic Cloudflare installation is not supported for {system} {machine}."
                )

            download_url = (
                "https://github.com/cloudflare/cloudflared/releases/latest/download/"
                f"cloudflared-darwin-{architecture}"
            )

        else:
            raise RuntimeError(
                f"Automatic Cloudflare installation is not supported on {system}."
            )

        if not cloudflared_path.is_file():
            write_log('INFO', Binaries, 'START_CLOUDFLARE_TUNNEL', "server", "Cloudflare Tunnel is not installed. Downloading it for you...")
            cloudflared_dir.mkdir(parents=True, exist_ok=True)

            try:
                request.urlretrieve(download_url, cloudflared_path)

            except Exception as e:
                cloudflared_path.unlink(missing_ok=True)

                raise RuntimeError(
                    "Cloudflare Tunnel could not be downloaded automatically.\n\n"
                    "Please install it using:\n"
                    "https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/"
                ) from e

        if not cloudflared_path.is_file() or cloudflared_path.stat().st_size == 0:
            raise RuntimeError(
                "Cloudflare Tunnel was downloaded, but the executable is missing or empty."
            )

        if system != "Windows":
            chmod(cloudflared_path, 0o755)

        cloudflared = str(cloudflared_path)
        write_log('INFO', Binaries, 'START_CLOUDFLARE_TUNNEL', "server", f"Cloudflare Tunnel installed at: {cloudflared_path}")

    output: Queue[str] = Queue(maxsize=1)

    process: Popen = Popen(
        [cloudflared, "tunnel", "--no-autoupdate", "--url", service_url],
        stdout=PIPE,
        stderr=STDOUT,
        text=True,
        bufsize=1,
    )

    def read_output() -> None:
        if process.stdout is None:
            return

        for line in process.stdout:
            write_log('INFO', Binaries, 'START_CLOUDFLARE_TUNNEL', "server", f"[Cloudflare:{label}] {line.rstrip()}")

            match = re.search(
                r"https://[a-zA-Z0-9-]+\.trycloudflare\.com",
                line,
            )

            if match:
                try:
                    output.put_nowait(match.group(0))
                except Exception:
                    pass

    Thread(target=read_output, daemon=True).start()

    try:
        public_url: str = output.get(timeout=60)

    except Empty as e:
        if process.poll() is None:
            process.terminate()

            try:
                process.wait(timeout=5)
            except TimeoutExpired:
                process.kill()
                process.wait()

        raise RuntimeError(
            f"Could not obtain the public Cloudflare URL for {label}. "
            "Check your internet connection and the Cloudflare Tunnel logs."
        ) from e

    return process, public_url


def start_ngrok_ftp() -> tuple[Popen | None, str | None]:
    ngrok: str | None = shutil.which("ngrok")

    if ngrok is None:
        system: str = platform.system()
        machine: str = platform.machine().lower()

        ngrok_dir: Path = (
            Path.home() / "AppData" / "Local" / "StoreLimitless" / "ngrok"
            if system == "Windows"
            else Path.home() / ".local" / "share" / "StoreLimitless" / "ngrok"
        )

        executable: str = "ngrok.exe" if system == "Windows" else "ngrok"
        ngrok_path: Path = ngrok_dir / executable

        architectures: dict[str, str] = {
            "x86_64": "amd64",
            "amd64": "amd64",
            "aarch64": "arm64",
            "arm64": "arm64",
            "armv7l": "arm",
        }

        architecture: str | None = architectures.get(machine)

        if architecture is None:
            raise RuntimeError(
                f"Automatic ngrok installation is not supported for {system} {machine}."
            )

        if system == "Windows":
            if architecture not in ("amd64", "arm64"):
                raise RuntimeError(
                    f"Automatic ngrok installation is not supported for Windows {machine}."
                )

            download_url: str = (
                f"https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-{architecture}.zip"
            )

        elif system == "Linux":
            download_url = (
                f"https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-{architecture}.zip"
            )

        elif system == "Darwin":
            download_url = (
                f"https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-darwin-{architecture}.zip"
            )

        else:
            raise RuntimeError(
                f"Automatic ngrok installation is not supported on {system}."
            )

        if not ngrok_path.is_file():
            write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "\nngrok is not installed. Downloading and installing it...")
            ngrok_dir.mkdir(parents=True, exist_ok=True)

            archive: Path = ngrok_dir / "ngrok.zip"

            try:
                request.urlretrieve(download_url, archive)

                if not archive.is_file() or archive.stat().st_size == 0:
                    raise RuntimeError("The downloaded ngrok archive is empty.")

                with ZipFile(archive) as zf:
                    ngrok_files: list[str] = [
                        name
                        for name in zf.namelist()
                        if name.rsplit("/", 1)[-1] == executable
                    ]

                    if not ngrok_files:
                        raise RuntimeError(
                            f"ngrok was downloaded, but {executable} could not be found."
                        )

                    with zf.open(ngrok_files[0]) as source:
                        ngrok_path.write_bytes(source.read())

            except Exception as e:
                ngrok_path.unlink(missing_ok=True)

                raise RuntimeError(
                    "ngrok could not be installed automatically.\n"
                    "Download it manually from https://ngrok.com/download"
                ) from e

            finally:
                archive.unlink(missing_ok=True)

        if not ngrok_path.is_file() or ngrok_path.stat().st_size == 0:
            raise RuntimeError(
                "ngrok was downloaded, but its executable is missing or empty."
            )

        if system != "Windows":
            chmod(ngrok_path, 0o755)

        ngrok = str(ngrok_path)
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", f"ngrok installed at: {ngrok_path}")

    # ---------------------------------------------------------
    # Find an existing ngrok authentication configuration.
    # ---------------------------------------------------------

    config_paths: list[Path] = [
        Path.home() / ".config" / "ngrok" / "ngrok.yml",
        Path.home() / ".ngrok2" / "ngrok.yml",
    ]

    if platform.system() == "Windows":
        local_app_data: str | None = environ.get("LOCALAPPDATA")

        if local_app_data:
            config_paths.append(Path(local_app_data) / "ngrok" / "ngrok.yml")

        config_paths.append(
            Path.home() / "AppData" / "Local" / "ngrok" / "ngrok.yml"
        )

    def has_saved_token() -> bool:
        for config_path in config_paths:
            if not config_path.is_file():
                continue

            try:
                config_text: str = config_path.read_text(encoding="utf-8")

                if re.search(
                        r"(?m)^\s*authtoken\s*:\s*\S+",
                        config_text,
                ):
                    return True

            except OSError:
                continue

        return False

    # ---------------------------------------------------------
    # Ask for a token only when one isn't already configured.
    # ---------------------------------------------------------

    ngrok_token: str | None = environ.get("NGROK_AUTHTOKEN", "").strip() or None

    if ngrok_token:
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "Configuring ngrok using NGROK_AUTHTOKEN...")

    elif not has_saved_token():
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "\n" + "=" * 60)
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "StoreLimitless FTP: ngrok authentication required")
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "=" * 60)

        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "\nngrok requires a free account and an authentication token "
                                                                 "before it can expose your FTP server.")

        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "\nFollow these steps:")
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "  1. Create an account if you don't already have one:")
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "     https://dashboard.ngrok.com/signup")
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "\n  2. Sign in to your ngrok account.")
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "  3. Open the authentication-token page:")
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "     https://dashboard.ngrok.com/get-started/your-authtoken")
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "  4. Copy your authtoken from the dashboard.")
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "  5. Paste it into the terminal prompt below.")
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "\nYour token will be saved in ngrok's configuration.")
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "You won't need to enter it again on this installation.")
        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "=" * 60 + "\n")

        try:
            webbrowser.open(
                "https://dashboard.ngrok.com/get-started/your-authtoken"
            )
        except Exception:
            write_log('ERROR', Binaries, 'START_NGROK_FTP', "server", "Could not open your browser automatically.")
            write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "Open the token URL above manually.")

        try:
            ngrok_token = getpass("Paste your ngrok authtoken (input hidden): ").strip()
        except (EOFError, KeyboardInterrupt):
            write_log('WARNING', Binaries, 'START_NGROK_FTP', "server", "\nngrok authentication cancelled.")
            return None, None

        if not ngrok_token:
            write_log('WARNING', Binaries, 'START_NGROK_FTP', "server", "\nNo token supplied. Public FTP tunnelling was skipped.")
            write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "Restart StoreLimitless after obtaining your ngrok token.")
            return None, None

    # ---------------------------------------------------------
    # Save the token using ngrok's official configuration CLI.
    # ---------------------------------------------------------

    if ngrok_token:
        try:
            subprocess.run(
                [ngrok, "config", "add-authtoken", ngrok_token],
                check=True,
                stdout=DEVNULL,
                stderr=PIPE,
                text=True,
            )

        except subprocess.CalledProcessError as e:
            error: str = (e.stderr or "").strip()

            write_log('ERROR', Binaries, 'START_NGROK_FTP', "server", "\nERROR: Could not configure ngrok authentication.")

            if error:
                write_log('INFO', Binaries, 'START_NGROK_FTP', "server", error)

            write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "Check that the token is copied correctly from your dashboard.")
            return None, None

        except OSError as e:
            write_log('ERROR', Binaries, 'START_NGROK_FTP', "server", f"\nERROR: Could not run ngrok: {e}")
            return None, None

        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "ngrok authentication configured successfully.")

    # ---------------------------------------------------------
    # Start the public FTP TCP tunnel on port 2121.
    # ---------------------------------------------------------

    output: Queue[str] = Queue()

    try:
        process: Popen = Popen(
            [ngrok, "tcp", "2121", "--log=stdout", "--log-format=json"],
            stdout=PIPE,
            stderr=STDOUT,
            text=True,
            bufsize=1,
        )

    except OSError as e:
        write_log('ERROR', Binaries, 'START_NGROK_FTP', "server", f"ERROR: Could not start ngrok: {e}")
        return None, None

    def read_output() -> None:
        if process.stdout is None:
            return

        for line in process.stdout:
            write_log('INFO', Binaries, 'START_NGROK_FTP', "server", f"[ngrok:FTP] {line.rstrip()}")

            match = re.search(
                r"tcp://[a-zA-Z0-9.-]+:\d+",
                line,
            )

            if match:
                output.put(match.group(0))

    Thread(target=read_output, daemon=True).start()

    deadline: float = monotonic() + 30

    try:
        while monotonic() < deadline:
            try:
                ftp_url: str = output.get(timeout=0.5)
                write_log('INFO', Binaries, 'START_NGROK_FTP', "server", f"Public FTP address: {ftp_url}")
                return process, ftp_url

            except Empty:
                if process.poll() is not None:
                    break

        write_log('WARNING', Binaries, 'START_NGROK_FTP', "server", "\nWARNING: ngrok did not provide a public FTP address.")

        if process.poll() is not None:
            write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "ngrok exited before the tunnel could be established.")
        else:
            write_log('WARNING', Binaries, 'START_NGROK_FTP', "server", "ngrok timed out while establishing the tunnel.")

        write_log('INFO', Binaries, 'START_NGROK_FTP', "server", "Check the ngrok logs above and your account's authentication status.")

        if process.poll() is None:
            process.terminate()

            try:
                process.wait(timeout=5)
            except TimeoutExpired:
                process.kill()
                process.wait()

        return None, None

    except KeyboardInterrupt:
        write_log('WARNING', Binaries, 'START_NGROK_FTP', "server", "\nFTP tunnel startup cancelled.")

        if process.poll() is None:
            process.terminate()

            try:
                process.wait(timeout=5)
            except TimeoutExpired:
                process.kill()
                process.wait()

        return None, None
