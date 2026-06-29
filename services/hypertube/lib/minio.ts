import * as Minio from "minio";
import fs from "fs";

const [MINIO_HOST, MINIO_PORT] = (
    process.env.MINIO_ENDPOINT || "localhost:9000"
).split(":");

export const minioClient = new Minio.Client({
    endPoint: MINIO_HOST,
    port: Number(MINIO_PORT) || 9000,
    useSSL: false,
    accessKey: process.env.MINIO_ROOT_USER || "minioadmin",
    secretKey:
        process.env.MINIO_ROOT_PASSWORD ||
        "ad7cdfb3619aabb1d9a326753975a2083305b336920dd7a3fe32feaaf643544f",
});

export const MOVIES_BUCKET = "movies";

/**
 * Checks if a movie is already fully downloaded and stored in MinIO.
 */
export async function isMovieInMinio(torrentId: string): Promise<boolean> {
    try {
        await minioClient.statObject(MOVIES_BUCKET, `${torrentId}.mp4`);
        return true;
    } catch (err: any) {
        // MinIO throws an error if the object doesn't exist
        if (err.code === "NotFound" || err.code === "NoSuchKey") {
            return false;
        }
        console.error("MinIO statObject error:", err);
        return false;
    }
}

/**
 * Uploads a local file to the MinIO movies bucket.
 */
export async function uploadMovieToMinio(
    torrentId: string,
    localFilePath: string
): Promise<void> {
    const minioPath = `${torrentId}.mp4`;
    console.log(
        `[MinIO] Uploading ${localFilePath} to ${MOVIES_BUCKET}/${minioPath}...`
    );

    // We set the content type so browsers treat it as a video stream automatically
    const metaData = {
        "Content-Type": "video/mp4",
    };

    await minioClient.fPutObject(
        MOVIES_BUCKET,
        minioPath,
        localFilePath,
        metaData
    );
    console.log(`[MinIO] Upload complete for ${torrentId}`);
}

/**
 * Downloads a .torrent file from MinIO to a local path on disk.
 *
 * @param minioPath  The object path in MinIO, e.g. "torrents/4-his-girl-friday.torrent"
 * @param localPath  The absolute local filesystem path to write to
 */
export async function downloadTorrentFromMinio(
    minioPath: string,
    localPath: string
): Promise<void> {
    const firstSlash = minioPath.indexOf("/");
    const bucket =
        firstSlash !== -1 ? minioPath.slice(0, firstSlash) : "torrents";
    const objectName =
        firstSlash !== -1 ? minioPath.slice(firstSlash + 1) : minioPath;

    try {
        // 1. Get the readable stream as a promise
        const stream = await minioClient.getObject(bucket, objectName);

        // 2. Use the 'fs' stream pipeline to write directly to disk
        // This is much more memory-efficient than buffering into a massive array
        const fileStream = fs.createWriteStream(localPath);

        await new Promise<void>((resolve, reject) => {
            stream.pipe(fileStream);
            stream.on("end", resolve);
            stream.on("error", reject);
            fileStream.on("error", reject);
        });

        console.log(`[MinIO] Downloaded ${minioPath} → ${localPath}`);
    } catch (err) {
        console.error(`[MinIO] Failed to download ${minioPath}:`, err);
        throw err;
    }
}

/**
 * Reads a MinIO object (e.g. a subtitle .vtt file) fully into a Buffer.
 */
export async function getMinioObjectBuffer(
    bucket: string,
    objectName: string
): Promise<Buffer> {
    const stream = await minioClient.getObject(bucket, objectName);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
}
