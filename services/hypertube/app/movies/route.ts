import { NextResponse } from "next/server";
import { desc, asc, ilike, count, eq, and, gte, lte, sql } from "drizzle-orm";
import { movies } from "@/drizzle/schema";
import { db } from "@/drizzle";

const int = (v: string | null, d: number) =>
    !v || isNaN(parseInt(v, 10)) ? d : parseInt(v, 10);
const flt = (v: string | null, d: number) =>
    !v || isNaN(parseFloat(v)) ? d : parseFloat(v);

export async function GET(request: Request) {
    try {
        const sp = new URL(request.url).searchParams;

        // ── Params ────────────────────────────────────────────────────────────
        const mode = sp.get("mode") ?? "page";
        const page = Math.max(1, int(sp.get("page"), 1));
        const pageSize = Math.min(
            500,
            Math.max(1, int(sp.get("pageSize"), 30))
        );
        const legacyLim = int(sp.get("limit"), 0);
        const safeSize = legacyLim > 0 ? legacyLim : pageSize;
        const offset = (page - 1) * safeSize;

        const search = sp.get("search")?.trim() ?? "";
        const genreParam = sp.get("genres")?.trim() ?? "";
        const language = sp.get("language")?.trim() ?? "";
        const yearFrom = int(sp.get("yearFrom"), 0);
        const yearTo = int(sp.get("yearTo"), 9999);
        const ratingMin = flt(sp.get("ratingMin"), 0);
        const ratingMax = flt(sp.get("ratingMax"), 10);
        const durMin = int(sp.get("durMin"), 0);
        const durMax = int(sp.get("durMax"), 99999);
        const isNewRel = sp.get("isNewRelease") === "true";
        const isPop = sp.get("isPopular") === "true";
        const sortParam = sp.get("sort") ?? "";

        // ── WHERE conditions ──────────────────────────────────────────────────
        const conds: any[] = [];

        if (search) conds.push(ilike(movies.title, `%${search}%`));

        if (mode === "new-releases" || isNewRel)
            conds.push(eq(movies.isNewRelease, true));
        if (mode === "popular" || isPop) conds.push(eq(movies.isPopular, true));

        if (yearFrom > 0) conds.push(gte(movies.releaseYear, yearFrom));
        if (yearTo < 9999) conds.push(lte(movies.releaseYear, yearTo));
        if (ratingMin > 0) conds.push(gte(movies.rating, ratingMin));
        if (ratingMax < 10) conds.push(lte(movies.rating, ratingMax));
        if (durMin > 0) conds.push(gte(movies.runtimeMinutes, durMin));
        if (durMax < 99999) conds.push(lte(movies.runtimeMinutes, durMax));
        if (language) conds.push(ilike(movies.language, language));

        // Genre: the schema stores genres as text[].
        // We use PostgreSQL array overlap: genres && ARRAY['Action','Drama']::text[]
        // sql.raw is safe here because we whitelist genre values (no user-controlled SQL).
        if (genreParam) {
            const genreList = genreParam
                .split(",")
                .map((g) => g.trim())
                .filter(Boolean);
            if (genreList.length > 0) {
                const escaped = genreList
                    .map((g) => `'${g.replace(/'/g, "''")}'`)
                    .join(", ");
                conds.push(
                    sql`${movies.genres} && ARRAY[${sql.raw(escaped)}]::text[]`
                );
            }
        }

        const where = conds.length > 0 ? and(...conds) : undefined;

        // ── ORDER BY ──────────────────────────────────────────────────────────
        let orderBy: any;
        if (mode === "new-releases") orderBy = desc(movies.releaseYear);
        else if (mode === "popular") orderBy = desc(movies.rating);
        else if (sortParam === "year") orderBy = desc(movies.releaseYear);
        else if (sortParam === "rating") orderBy = desc(movies.rating);
        else if (sortParam === "title") orderBy = asc(movies.title);
        else orderBy = desc(movies.createdAt);
        // NOTE: RANDOM() was removed — it causes different rows to appear on
        // each page request, producing duplicate movie IDs across pages and
        // React "duplicate key" warnings. Stable sort (createdAt desc) ensures
        // page 2 always follows page 1 without overlap.

        // ── Queries ───────────────────────────────────────────────────────────
        const [rows, countResult] = await Promise.all([
            db
                .select()
                .from(movies)
                .where(where)
                .orderBy(orderBy)
                .limit(safeSize)
                .offset(offset),
            db.select({ value: count() }).from(movies).where(where),
        ]);

        const total = Number(countResult[0]?.value ?? 0);
        const pages = Math.ceil(total / safeSize) || 1;

        // `name` is the spec'd field for the frontpage list (id + name); kept alongside
        // `title` so the existing UI consumers of this endpoint don't break.
        const moviesWithName = rows.map((movie) => ({
            ...movie,
            name: movie.title,
        }));

        return NextResponse.json({
            movies: moviesWithName,
            total,
            page,
            pageSize: safeSize,
            pages,
        });
    } catch (err) {
        console.error("[/api/movies] error:", err);
        return NextResponse.json(
            { error: "Failed to load movies.", detail: String(err) },
            { status: 500 }
        );
    }
}
