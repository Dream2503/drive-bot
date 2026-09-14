FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir --index-url https://pypi.org/simple -r requirements.txt

COPY backend ./backend
COPY core ./core
COPY transfer ./transfer

RUN mkdir -p /data

EXPOSE 8000

CMD ["python", "-m", "core.main"]
