# Start with the Debian-based Node image that matches your Ubuntu host
FROM node:20-bookworm-slim

# Update the package manager and install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Set the working directory
WORKDIR /app
