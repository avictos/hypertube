import { NextResponse } from "next/server";
import { db } from "@/drizzle";
import { movieComments } from "@/drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { getAuthUserId, getAuthUsername } from "@/lib/get-auth-user";
import { createComment } from "@/lib/comments";

const LATEST_COMMENTS_LIMIT = 20;

const commentSelect = {
    id: movieComments.id,
    username: movieComments.username,
    userId: movieComments.userId, // Kept to allow UI to show Edit/Delete buttons
    content: movieComments.content,
    date: movieComments.createdAt,
};

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const movieId = searchParams.get("movie_id");

        // With a movie_id: comments for that movie. Without: the latest comments
        // across all movies, per the spec's "GET /comments" shape.
        const comments = movieId
            ? await db
                  .select(commentSelect)
                  .from(movieComments)
                  .where(eq(movieComments.movieId, movieId))
                  .orderBy(desc(movieComments.createdAt))
            : await db
                  .select(commentSelect)
                  .from(movieComments)
                  .orderBy(desc(movieComments.createdAt))
                  .limit(LATEST_COMMENTS_LIMIT);

        return NextResponse.json(comments);
    } catch (error) {
        console.error("GET Comments Error:", error);
        return NextResponse.json(
            { error: "Failed to load comments" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    const userId = getAuthUserId(request);
    const username = getAuthUsername(request);

    if (!userId || !username) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { comment, movie_id } = body;

        if (!comment || !movie_id) {
            return NextResponse.json(
                { error: "comment and movie_id are required" },
                { status: 400 }
            );
        }

        // Server fills in the rest (id, author, date) from the verified identity.
        const newComment = await createComment(
            movie_id,
            userId,
            username,
            comment
        );

        return NextResponse.json(newComment, { status: 201 });
    } catch (error) {
        console.error("POST Comment Error:", error);
        return NextResponse.json(
            { error: "Failed to post comment" },
            { status: 500 }
        );
    }
}
