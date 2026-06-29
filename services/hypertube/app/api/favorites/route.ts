import { NextResponse } from "next/server";
import { db } from "@/drizzle";
import { movies, userFavorites } from "@/drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get("userId");
        const movieId = searchParams.get("movieId");

        if (!userId) {
            return NextResponse.json(
                { error: "User ID is required" },
                { status: 400 }
            );
        }

        // If a movieId is provided, we just return a boolean checking if it's favorited
        if (movieId) {
            const fav = await db
                .select({ id: userFavorites.id })
                .from(userFavorites)
                .where(
                    and(
                        eq(userFavorites.userId, userId),
                        eq(userFavorites.movieId, movieId)
                    )
                )
                .limit(1);

            return NextResponse.json({ isFavorite: fav.length > 0 });
        }

        // Otherwise, return the user's entire list of favorite movies
        const favRecords = await db
            .select({
                movie: movies,
                addedAt: userFavorites.createdAt,
            })
            .from(userFavorites)
            .innerJoin(movies, eq(userFavorites.movieId, movies.id))
            .where(eq(userFavorites.userId, userId))
            .orderBy(desc(userFavorites.createdAt));

        const formattedFavorites = favRecords.map((r) => ({
            ...r.movie,
            addedAt: r.addedAt,
        }));

        return NextResponse.json({ data: formattedFavorites });
    } catch (error) {
        console.error("Favorites GET Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch favorites" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const { userId, movieId } = await request.json();

        if (!userId || !movieId) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        // Check if it already exists
        const existing = await db
            .select({ id: userFavorites.id })
            .from(userFavorites)
            .where(
                and(
                    eq(userFavorites.userId, userId),
                    eq(userFavorites.movieId, movieId)
                )
            )
            .limit(1);

        if (existing.length > 0) {
            // It exists, so remove it (Toggle OFF)
            await db
                .delete(userFavorites)
                .where(eq(userFavorites.id, existing[0].id));
            return NextResponse.json({ isFavorite: false });
        } else {
            // It doesn't exist, so add it (Toggle ON)
            await db.insert(userFavorites).values({ userId, movieId });
            return NextResponse.json({ isFavorite: true });
        }
    } catch (error) {
        console.error("Favorites POST Error:", error);
        return NextResponse.json(
            { error: "Failed to update favorites" },
            { status: 500 }
        );
    }
}
