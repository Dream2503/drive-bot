from asyncio import CancelledError, Task, create_task, gather, run
from shutil import rmtree
from subprocess import Popen, TimeoutExpired
from threading import Thread

from uvicorn import Config, Server

from backend.server.app import app
from core.config import TRANSFER_PATH
from core.data_center import DataCenter
from core.utils.binaries import start_redis_server
from core.utils.discord_ import Discord
from core.utils.telegram_ import Telegram


async def main() -> None:
    redis_process: Popen | None = start_redis_server()

    try:
        await DataCenter.initialize_cache()
        await Telegram.main()

        discord_thread: Thread = Thread(target=Discord.main, daemon=True)
        server_task: Task[None] = create_task(Server(Config(app, host="0.0.0.0", port=8000, log_level="warning")).serve())
        discord_thread.start()

        try:
            await server_task

        except CancelledError:
            pass

        finally:
            server_task.cancel()
            await gather(server_task, return_exceptions=True)
            await Telegram.exit()
            discord_thread.join(timeout=5)

    finally:
        if redis_process is not None and redis_process.poll() is None:
            redis_process.terminate()

            try:
                redis_process.wait(timeout=5)

            except TimeoutExpired:
                redis_process.kill()
                redis_process.wait()

        for path in TRANSFER_PATH.iterdir():
            if path.is_dir():
                rmtree(path)

            else:
                path.unlink()


if __name__ == "__main__":
    try:
        run(main())

    except KeyboardInterrupt:
        pass
