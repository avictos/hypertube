import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/drizzle";
import { subtitles, downloads } from "@/drizzle/schema";
import { getMinioObjectBuffer } from "@/lib/minio";

const SUBTITLES_BUCKET = "subtitles";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string; lang: string }> }
) {
    const { id: movieId, lang } = await params;

    const rows = await db
        .select({ minioPath: subtitles.minioPath })
        .from(subtitles)
        .innerJoin(downloads, eq(subtitles.downloadId, downloads.id))
        .where(
            and(eq(downloads.movieId, movieId), eq(subtitles.languageCode, lang))
        )
        .limit(1);

    if (rows.length === 0) {
        return NextResponse.json(
            { error: "Subtitle not found" },
            { status: 404 }
        );
    }

    try {
        const buffer = await getMinioObjectBuffer(SUBTITLES_BUCKET, rows[0].minioPath);
        return new NextResponse(buffer.toString("utf-8"), {
            status: 200,
            headers: { "content-type": "text/vtt" },
        });
    } catch (error) {
        console.error("Failed to read subtitle from MinIO:", error);
        return NextResponse.json(
            { error: "Failed to load subtitle" },
            { status: 500 }
        );
    }
}
