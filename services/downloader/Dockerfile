FROM python:3.13-slim-bookworm

# ffmpeg provides ffprobe (used to inspect downloaded videos before streaming).
# build-essential is a fallback in case no prebuilt libtorrent wheel matches
# this image's exact platform.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p downloaded_movies torrents

EXPOSE 8000

CMD ["python", "main.py"]
