import { NextResponse } from "next/server";
import { db } from "@/drizzle";
import { movies } from "@/drizzle/schema";
import { inArray, eq } from "drizzle-orm";
import { YtsService } from "@/lib/services/yts.service";

const SEARCH_LIMIT = 20;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query) {
        return NextResponse.json(
            { error: "Search query is required" },
            { status: 400 }
        );
    }

    const omdbApiKey = process.env.OMDB_API_KEY || "";
    const ytsService = new YtsService(omdbApiKey);

    // Initialize the stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            // Helper function to stream a single movie object to the client
            const sendMovie = (movieData: any) => {
                controller.enqueue(
                    encoder.encode(JSON.stringify(movieData) + "\n")
                );
            };

            try {
                // 1. Fetch YTS payload
                const ytsResults = await ytsService.searchMovies(
                    query,
                    SEARCH_LIMIT
                );

                if (ytsResults.length === 0) {
                    controller.close();
                    return;
                }

                const ytsIds = ytsResults.map((m) => m.id);

                // 2. Extract IDs and check local DB for existing movies
                const existingMovies = await db
                    .select()
                    .from(movies)
                    .where(inArray(movies.ytsId, ytsIds));

                const existingIds = new Set(existingMovies.map((m) => m.ytsId));

                // 3. Immediately stream the movies we ALREADY have
                for (const existingMovie of existingMovies) {
                    sendMovie(existingMovie);
                }

                // 4. Filter out missing movies
                const missingMovies = ytsResults.filter(
                    (m) => !existingIds.has(m.id)
                );

                // 5. Download and stream the missing ones sequentially
                for (const movie of missingMovies) {
                    // Download assets & insert into DB
                    await ytsService.processAndSaveMovie(movie);

                    // Fetch the newly inserted row to maintain standard schema formatting
                    const [savedMovie] = await db
                        .select()
                        .from(movies)
                        .where(eq(movies.ytsId, movie.id))
                        .limit(1);

                    if (savedMovie) {
                        sendMovie(savedMovie);
                    }
                }
            } catch (error) {
                console.error("Stream API Error:", error);
                // Optionally send an error object down the stream
                controller.enqueue(
                    encoder.encode(
                        JSON.stringify({ error: "Stream interrupted" }) + "\n"
                    )
                );
            } finally {
                // Close the stream once all processing is complete
                controller.close();
            }
        },
    });

    // Return the stream with NDJSON headers so the browser reads it dynamically
    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}
