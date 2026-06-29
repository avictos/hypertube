import { NextResponse } from "next/server";
import { getAuthUserId, getAuthUsername } from "@/lib/get-auth-user";
import { createComment } from "@/lib/comments";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const userId = getAuthUserId(request);
    const username = getAuthUsername(request);

    if (!userId || !username) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id: movieId } = await params;
        const body = await request.json();
        const { comment } = body;

        if (!comment) {
            return NextResponse.json(
                { error: "comment is required" },
                { status: 400 }
            );
        }

        const newComment = await createComment(
            movieId,
            userId,
            username,
            comment
        );

        return NextResponse.json(newComment, { status: 201 });
    } catch (error) {
        console.error("POST Movie Comment Error:", error);
        return NextResponse.json(
            { error: "Failed to post comment" },
            { status: 500 }
        );
    }
}
