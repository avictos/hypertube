import { NextResponse } from "next/server";
import { db } from "@/drizzle";
import { movieComments } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { getAuthUserId } from "@/lib/get-auth-user";

const commentSelect = {
    id: movieComments.id,
    username: movieComments.username,
    userId: movieComments.userId,
    content: movieComments.content,
    date: movieComments.createdAt,
};

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const data = await db
            .select(commentSelect)
            .from(movieComments)
            .where(eq(movieComments.id, id))
            .limit(1);

        if (data.length === 0) {
            return NextResponse.json(
                { error: "Comment not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(data[0]);
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to load comment" },
            { status: 500 }
        );
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const userId = getAuthUserId(request);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const body = await request.json();
        const { comment } = body;

        if (!comment) {
            return NextResponse.json(
                { error: "comment is required" },
                { status: 400 }
            );
        }

        const existing = await db
            .select()
            .from(movieComments)
            .where(eq(movieComments.id, id))
            .limit(1);

        if (existing.length === 0) {
            return NextResponse.json(
                { error: "Comment not found" },
                { status: 404 }
            );
        }

        if (existing[0].userId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const [updatedComment] = await db
            .update(movieComments)
            .set({ content: comment, updatedAt: new Date() })
            .where(eq(movieComments.id, id))
            .returning(commentSelect);

        return NextResponse.json(updatedComment);
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to update comment" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const userId = getAuthUserId(request);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;

        const existing = await db
            .select()
            .from(movieComments)
            .where(eq(movieComments.id, id))
            .limit(1);

        if (existing.length === 0) {
            return NextResponse.json(
                { error: "Comment not found" },
                { status: 404 }
            );
        }

        if (existing[0].userId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await db.delete(movieComments).where(eq(movieComments.id, id));

        return NextResponse.json({ success: true, message: "Comment deleted" });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to delete comment" },
            { status: 500 }
        );
    }
}
