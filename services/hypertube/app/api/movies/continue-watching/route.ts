import { NextResponse } from "next/server";
import { db } from "@/drizzle";
import { movies, userPlaybacks } from "@/drizzle/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get("userId");

        if (!userId) {
            return NextResponse.json({ movies: [] });
        }

        // 1. Fetch playbacks joined with movie details, ordered by most recently watched
        const watchedRecords = await db
            .select({
                movie: movies,
                playback: userPlaybacks,
            })
            .from(userPlaybacks)
            .innerJoin(movies, eq(userPlaybacks.movieId, movies.id))
            .where(eq(userPlaybacks.userId, userId))
            .orderBy(desc(userPlaybacks.updatedAt));

        // 2. Filter the results in memory
        const COMPLETION_THRESHOLD = 0.9; // 90% watched = finished

        const continueWatchingMovies = watchedRecords
            .filter((record) => {
                const watchedSeconds = record.playback.lastWatchedSeconds || 0;

                // Convert runtimeMinutes to seconds. If missing, fallback to an average 120 mins.
                const totalRuntimeSeconds =
                    (record.movie.runtimeMinutes || 120) * 60;

                // Check if they are in the final 10% of the movie (usually credits)
                const isFinished =
                    watchedSeconds >=
                    totalRuntimeSeconds * COMPLETION_THRESHOLD;

                // Optional: Filter out movies they clicked on but only watched for 15 seconds
                const isJustStarted = watchedSeconds < 15;

                // Keep it ONLY if it's not finished and not just a misclick
                return !isFinished && !isJustStarted;
            })
            .map((record) => record.movie);

        return NextResponse.json({ movies: continueWatchingMovies });
    } catch (error) {
        console.error("Continue Watching API Error:", error);
        return NextResponse.json({ movies: [] }, { status: 500 });
    }
}
