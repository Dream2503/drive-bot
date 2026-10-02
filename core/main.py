from asyncio import CancelledError, Task, create_task, gather, get_running_loop, run
from shutil import rmtree
from subprocess import Popen, TimeoutExpired, DEVNULL
from threading import Thread

from uvicorn import Config, Server

from backend.database.redis_server import Redis
from backend.ftp.server import StoreLimitlessFTPServer
from backend.server.app import app
from core.config import TRANSFER_PATH
from core.data_center import DataCenter
from core.utils.binaries import start_redis_server
from core.utils.discord_ import Discord
from core.utils.telegram_ import Telegram


async def main() -> None:
    redis_process: Popen | None = start_redis_server()
    frontend_process: Popen | None = None

    try:
        await Redis.initialize()
        await DataCenter.initialize_cache()
        await Telegram.main()

        discord_thread: Thread = Thread(target=Discord.main, daemon=True)
        ftp_server = StoreLimitlessFTPServer(get_running_loop())

        server_task: Task[None] = create_task(Server(Config(app, host="0.0.0.0", port=8000, log_level="warning")).serve())
        frontend_process = Popen(["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"], cwd="frontend", stdout=DEVNULL, stderr=DEVNULL)

        discord_thread.start()
        ftp_server.start()

        try:
            await server_task

        except CancelledError:
            pass

        finally:
            server_task.cancel()
            await gather(server_task, return_exceptions=True)

            ftp_server.stop()
            ftp_server.join(timeout=5)

            await Telegram.exit()
            discord_thread.join(timeout=5)

    finally:
        await Redis.close()

        if redis_process is not None and redis_process.poll() is None:
            redis_process.terminate()

            try:
                redis_process.wait(timeout=5)

            except TimeoutExpired:
                redis_process.kill()
                redis_process.wait()

        if frontend_process is not None and frontend_process.poll() is None:
            frontend_process.terminate()

            try:
                frontend_process.wait(timeout=5)

            except TimeoutExpired:
                frontend_process.kill()
                frontend_process.wait()

        rmtree(TRANSFER_PATH)


if __name__ == "__main__":
    try:
        run(main())

    except KeyboardInterrupt:
        pass
