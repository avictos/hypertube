import { db } from "@/drizzle";
import { movieComments } from "@/drizzle/schema";

export async function createComment(
    movieId: string,
    userId: string,
    username: string,
    content: string
) {
    const [newComment] = await db
        .insert(movieComments)
        .values({ movieId, userId, username, content })
        .returning({
            id: movieComments.id,
            username: movieComments.username,
            userId: movieComments.userId,
            content: movieComments.content,
            date: movieComments.createdAt,
        });

    return newComment;
}
