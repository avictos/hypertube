"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/sdk/auth/auth-provider";

interface Comment {
    id: string;
    username: string;
    userId: string;
    content: string;
    date: string;
}

export function CommentsSection({ movieId }: { movieId: string }) {
    const { user, isSignedIn } = useAuth();

    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");

    // Fetch comments
    useEffect(() => {
        fetch(`/comments?movie_id=${movieId}`)
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data)) setComments(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [movieId]);

    // Add a comment
    const handlePostComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !user) return;

        setSubmitting(true);
        try {
            const res = await fetch("/comments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    comment: newComment,
                    movie_id: movieId,
                }),
            });

            if (res.ok) {
                const postedComment = await res.json();
                setComments([postedComment, ...comments]); // Prepend new comment
                setNewComment("");
            }
        } finally {
            setSubmitting(false);
        }
    };

    // Update a comment
    const handleUpdateComment = async (id: string) => {
        if (!editContent.trim() || !user) return;

        try {
            const res = await fetch(`/comments/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ comment: editContent }),
            });

            if (res.ok) {
                const updated = await res.json();
                setComments(
                    comments.map((c) =>
                        c.id === id ? { ...c, content: updated.content } : c
                    )
                );
                setEditingId(null);
            }
        } catch (error) {
            console.error("Failed to update comment");
        }
    };

    // Delete a comment
    const handleDeleteComment = async (id: string) => {
        if (!user || !confirm("Are you sure you want to delete this comment?"))
            return;

        try {
            const res = await fetch(`/comments/${id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setComments(comments.filter((c) => c.id !== id));
            }
        } catch (error) {
            console.error("Failed to delete comment");
        }
    };

    return (
        <div className="mt-12 border-t border-gray-800 pt-8">
            <h2 className="mb-6 text-xl font-bold text-white">
                Comments ({comments.length})
            </h2>

            {/* Post Comment Form or Login Prompt */}
            {isSignedIn ? (
                <form onSubmit={handlePostComment} className="mb-10">
                    <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="What did you think of the movie?"
                        className="w-full resize-none rounded-xl border border-gray-700 bg-gray-900/50 p-4 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        rows={3}
                    />
                    <div className="mt-2 flex justify-end">
                        <button
                            type="submit"
                            disabled={submitting || !newComment.trim()}
                            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                        >
                            {submitting ? "Posting..." : "Post Comment"}
                        </button>
                    </div>
                </form>
            ) : (
                <div className="mb-10 rounded-xl border border-gray-800 bg-gray-900/30 p-6 text-center">
                    <p className="text-gray-400">
                        Please sign in to join the discussion.
                    </p>
                </div>
            )}

            {/* Comments List */}
            {loading ? (
                <div className="animate-pulse space-y-4">
                    {[1, 2].map((i) => (
                        <div
                            key={i}
                            className="h-20 w-full rounded-xl bg-gray-800/50"
                        />
                    ))}
                </div>
            ) : comments.length === 0 ? (
                <p className="text-center text-sm text-gray-500">
                    No comments yet. Be the first to share your thoughts!
                </p>
            ) : (
                <div className="space-y-6">
                    {comments.map((c) => (
                        <div
                            key={c.id}
                            className="rounded-xl border border-gray-800 bg-gray-900/30 p-5"
                        >
                            <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 text-xs font-bold text-white uppercase">
                                        {c.username.charAt(0)}
                                    </div>
                                    <div>
                                        <span className="text-sm font-bold text-gray-200">
                                            {c.username}
                                        </span>
                                        <span className="ml-2 text-xs text-gray-500">
                                            {new Date(
                                                c.date
                                            ).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>

                                {/* Edit / Delete Controls (Only active for the comment owner) */}
                                {user?.id === c.userId && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setEditingId(c.id);
                                                setEditContent(c.content);
                                            }}
                                            className="text-xs text-gray-500 hover:text-blue-400"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() =>
                                                handleDeleteComment(c.id)
                                            }
                                            className="text-xs text-gray-500 hover:text-red-400"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Edit Mode vs View Mode */}
                            {editingId === c.id ? (
                                <div className="mt-3">
                                    <textarea
                                        value={editContent}
                                        onChange={(e) =>
                                            setEditContent(e.target.value)
                                        }
                                        className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                                        rows={2}
                                    />
                                    <div className="mt-2 flex justify-end gap-2">
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="rounded px-3 py-1.5 text-xs text-gray-400 hover:text-white"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() =>
                                                handleUpdateComment(c.id)
                                            }
                                            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm leading-relaxed text-gray-300">
                                    {c.content}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
