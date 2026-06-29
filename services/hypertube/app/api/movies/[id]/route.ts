import { NextResponse } from "next/server";
import { eq, count } from "drizzle-orm";
import { db } from "@/drizzle";
import {
    movies,
    movieDirectors,
    movieCast,
    downloads,
    subtitles,
    movieComments,
} from "@/drizzle/schema";
import { YtsService } from "@/lib/services/yts.service";

// Define cache lifespan (24 hours in milliseconds)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: movieId } = await params;

        // 1. Fetch the main movie record
        let data = await db
            .select()
            .from(movies)
            .where(eq(movies.id, movieId))
            .limit(1);

        if (data.length === 0) {
            return NextResponse.json(
                { error: "Movie not found" },
                { status: 404 }
            );
        }

        let baseMovie = data[0];

        // 2. Cache Invalidation Check
        const now = new Date();
        // Fallback to updatedAt if lastCheckedAt is missing on older records
        const lastChecked = baseMovie.lastCheckedAt || baseMovie.updatedAt;

        if (now.getTime() - lastChecked.getTime() > CACHE_TTL_MS) {
            console.log(
                `\n♻️ Cache stale for "${baseMovie.title}". Fetching updates...`
            );

            const omdbApiKey = process.env.OMDB_API_KEY || "";
            const ytsService = new YtsService(omdbApiKey);

            // Prefer IMDb code for an exact match, fallback to exact title
            const searchQuery = baseMovie.imdbCode || baseMovie.title;
            const freshResults = await ytsService.searchMovies(searchQuery, 3);

            // Ensure we update the correct movie by matching the YTS ID
            const freshMovie = freshResults.find(
                (m) => m.id === baseMovie.ytsId
            );

            if (freshMovie) {
                // This updates the database, directors, cast, and torrents
                await ytsService.processAndSaveMovie(freshMovie);

                // Explicitly update the cache timestamp
                await db
                    .update(movies)
                    .set({ lastCheckedAt: now })
                    .where(eq(movies.id, movieId));

                // Re-fetch the freshly updated record
                data = await db
                    .select()
                    .from(movies)
                    .where(eq(movies.id, movieId))
                    .limit(1);

                baseMovie = data[0];
            } else {
                // If it's completely gone from YTS, just bump the timestamp so we
                // don't keep hitting the external API on every single page load
                await db
                    .update(movies)
                    .set({ lastCheckedAt: now })
                    .where(eq(movies.id, movieId));
            }
        }

        // 3. Fetch the associated directors, cast, subtitles, and comment count
        const [directorsData, castData, subtitlesData, commentsCountResult] =
            await Promise.all([
                db
                    .select({ name: movieDirectors.name })
                    .from(movieDirectors)
                    .where(eq(movieDirectors.movieId, movieId)),
                db
                    .select({ name: movieCast.name })
                    .from(movieCast)
                    .where(eq(movieCast.movieId, movieId)),
                db
                    .select({
                        languageCode: subtitles.languageCode,
                        languageName: subtitles.languageName,
                    })
                    .from(subtitles)
                    .innerJoin(
                        downloads,
                        eq(subtitles.downloadId, downloads.id)
                    )
                    .where(eq(downloads.movieId, movieId)),
                db
                    .select({ value: count() })
                    .from(movieComments)
                    .where(eq(movieComments.movieId, movieId)),
            ]);

        // 4. Map the relational records into simple string arrays + spec'd aliases
        const enrichedMovie = {
            ...baseMovie,
            name: baseMovie.title,
            imdbRating: baseMovie.rating,
            directors: directorsData.map((d) => d.name),
            cast: castData.map((c) => c.name),
            subtitles: subtitlesData,
            commentsCount: Number(commentsCountResult[0]?.value ?? 0),
        };

        return NextResponse.json(enrichedMovie);
    } catch (error) {
        console.error("Database fetch error:", error);
        return NextResponse.json(
            { error: "Failed to load movie from the database." },
            { status: 500 }
        );
    }
}
