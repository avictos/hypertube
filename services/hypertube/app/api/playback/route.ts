import { NextResponse } from "next/server";
import { db } from "@/drizzle";
import { userPlaybacks } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const movieId = searchParams.get("movieId");
        const userId = searchParams.get("userId");

        if (!movieId || !userId) {
            return NextResponse.json({ lastWatchedSeconds: 0 });
        }

        const playback = await db
            .select({ lastWatchedSeconds: userPlaybacks.lastWatchedSeconds })
            .from(userPlaybacks)
            .where(
                and(
                    eq(userPlaybacks.movieId, movieId),
                    eq(userPlaybacks.userId, userId)
                )
            )
            .limit(1);

        if (playback.length > 0) {
            return NextResponse.json({
                lastWatchedSeconds: playback[0].lastWatchedSeconds,
            });
        }

        return NextResponse.json({ lastWatchedSeconds: 0 });
    } catch (error) {
        console.error("GET Playback Error:", error);
        return NextResponse.json({ lastWatchedSeconds: 0 }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { movieId, downloadId, userId, lastWatchedSeconds } = body;

        if (!movieId || !downloadId || !userId) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        // Upsert the playback progress
        await db
            .insert(userPlaybacks)
            .values({
                userId,
                downloadId,
                movieId,
                lastWatchedSeconds,
            })
            .onConflictDoUpdate({
                target: [userPlaybacks.userId, userPlaybacks.downloadId],
                set: {
                    lastWatchedSeconds,
                    updatedAt: new Date(),
                },
            });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("POST Playback Error:", error);
        return NextResponse.json(
            { error: "Failed to save playback" },
            { status: 500 }
        );
    }
}
