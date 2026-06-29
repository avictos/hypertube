import { NextResponse } from "next/server";
import { db } from "@/drizzle";
import { movies, userPlaybacks, watchHistory } from "@/drizzle/schema";
import { eq, desc, and, ilike, gte } from "drizzle-orm";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get("userId");
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "20");
        const search = searchParams.get("search") || "";

        if (!userId) {
            return NextResponse.json(
                { error: "User ID is required" },
                { status: 400 }
            );
        }

        const offset = (page - 1) * limit;

        const conditions = [eq(watchHistory.userId, userId)];
        if (search) {
            conditions.push(ilike(movies.title, `%${search}%`));
        }

        // Fetch paginated history from watchHistory, joined with movies
        // Left join userPlaybacks just to grab the current progress bar value
        const historyRecords = await db
            .select({
                movie: movies,
                watchedAt: watchHistory.updatedAt,
                lastWatchedSeconds: userPlaybacks.lastWatchedSeconds,
            })
            .from(watchHistory)
            .innerJoin(movies, eq(watchHistory.movieId, movies.id))
            .leftJoin(
                userPlaybacks,
                and(
                    eq(userPlaybacks.movieId, movies.id),
                    eq(userPlaybacks.userId, userId)
                )
            )
            .where(and(...conditions))
            .orderBy(desc(watchHistory.updatedAt))
            .limit(limit)
            .offset(offset);

        // Flatten the structure for the frontend
        const formattedHistory = historyRecords.map((record) => ({
            ...record.movie,
            watchedAt: record.watchedAt,
            lastWatchedSeconds: record.lastWatchedSeconds || 0,
        }));

        return NextResponse.json({
            data: formattedHistory,
            hasMore: formattedHistory.length === limit,
        });
    } catch (error) {
        console.error("Watch History GET Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch history" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { movieId, userId } = body;

        if (!movieId || !userId) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to midnight to check if watched "today"

        // Check if there is already a log for this movie TODAY
        const existingHistory = await db
            .select({ id: watchHistory.id })
            .from(watchHistory)
            .where(
                and(
                    eq(watchHistory.userId, userId),
                    eq(watchHistory.movieId, movieId),
                    gte(watchHistory.updatedAt, today)
                )
            )
            .limit(1);

        if (existingHistory.length === 0) {
            // It's a new day or first time watching! Insert a new record.
            await db.insert(watchHistory).values({ userId, movieId });
        } else {
            // Re-watching today. Bump the updated time so it jumps to the top of the history list.
            await db
                .update(watchHistory)
                .set({ updatedAt: new Date() })
                .where(eq(watchHistory.id, existingHistory[0].id));
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Watch History POST Error:", error);
        return NextResponse.json(
            { error: "Failed to log history" },
            { status: 500 }
        );
    }
}
