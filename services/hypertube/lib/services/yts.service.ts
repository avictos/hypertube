import crypto from "crypto";
import axios from "axios";
import { eq } from "drizzle-orm";
import { db } from "@/drizzle";
import { minioClient } from "@/lib/minio";
import { movies, torrents, movieDirectors, movieCast } from "@/drizzle/schema";

const POSTERS_BUCKET = "posters";
const BACKGROUNDS_BUCKET = "backgrounds";
const TORRENTS_BUCKET = "torrents";

// ========================== INTERFACES ==========================

export interface TorrentDto {
    url: string;
    hash: string;
    quality: string;
    type: string;
    seeds: number;
    peers: number;
    sizeBytes: number;
    sizeHuman: string;
}

export interface MovieDto {
    id: number;
    title: string;
    titleLong: string;
    year: number;
    rating: number;
    runtime: number;
    summary: string;
    language: string;
    genres: string[];
    mpaRating: string | null;
    imdbCode: string | null;
    dateUploaded: Date | null;

    isNewRelease: boolean;
    isPopular: boolean;

    mediumCoverImage: string | null;
    largeCoverImage: string | null;
    backgroundImage: string | null;
    backgroundImageOriginal: string | null;

    directors: string[];
    cast: string[];

    torrents: TorrentDto[];
}

export interface YtsTorrentRaw {
    url: string;
    hash: string;
    quality: string;
    type?: string;
    seeds: number | string;
    peers: number | string;
    size_bytes: number | string;
    size?: string;
}

export interface YtsMovieRaw {
    id: number | string;
    title: string;
    title_long?: string;
    year: number;
    rating: number;
    runtime: number | string;
    summary: string;
    description_full?: string;
    language: string;
    genres?: string[];
    mpa_rating?: string;
    imdb_code?: string;
    date_uploaded?: string;
    download_count?: number;
    like_count?: number;

    medium_cover_image?: string;
    large_cover_image?: string;
    background_image?: string;
    background_image_original?: string;

    torrents?: YtsTorrentRaw[];
}

export interface OmdbMovieRaw {
    Director: string;
    Actors: string;
    Response: string;
    Error?: string;
}

function sanitizeFilename(name: string): string {
    return name
        .replace(/[/\\?%*:|"<>]/g, "")
        .replace(/\s+/g, "_")
        .trim()
        .toLowerCase();
}

// ========================== SERVICE CLASS ==========================

export class YtsService {
    ytsApiUrl = "https://movies-api.accel.li/api/v2/list_movies.json";
    omdbBaseUrl = "https://www.omdbapi.com/";
    omdbApiKey: string;

    constructor(omdbApiKey: string = "") {
        this.omdbApiKey = omdbApiKey;
        if (!this.omdbApiKey) {
            console.warn(
                "⚠️ Warning: No valid OMDb API key provided. Cast/Directors will be empty."
            );
        }
    }

    // --- MinIO Methods ---

    async ensureBucket(bucket: string) {
        if (!(await minioClient.bucketExists(bucket))) {
            await minioClient.makeBucket(bucket);
        }
    }

    async uploadToMinio(
        url: string,
        bucket: string,
        objectName: string
    ): Promise<string | null> {
        try {
            const res = await axios.get(url, {
                responseType: "arraybuffer",
                timeout: 15000,
            });
            await minioClient.putObject(
                bucket,
                objectName,
                Buffer.from(res.data)
            );
            console.log(`✅ Uploaded to MinIO → ${bucket}/${objectName}`);
            return objectName;
        } catch (err: any) {
            if (err.response?.status === 404) {
                console.log(
                    `⚠️  File not found at source, skipping: ${objectName}`
                );
                return null;
            }
            console.error(
                `❌ MinIO upload failed for ${objectName}: ${err.message}`
            );
            return null;
        }
    }

    // --- OMDb Helper Methods ---

    private parseNamesList(commaString: string | undefined): string[] {
        if (!commaString || commaString === "N/A") return [];
        return commaString
            .split(",")
            .map((name) => name.trim())
            .filter((name) => name.length > 0);
    }

    private async fetchOmdbDetails(
        imdbId: string | null
    ): Promise<{ directors: string[]; cast: string[] }> {
        if (!imdbId || !this.omdbApiKey) return { directors: [], cast: [] };

        try {
            const url = `${this.omdbBaseUrl}?i=${imdbId}&apikey=${this.omdbApiKey}`;
            const response = await axios.get<OmdbMovieRaw>(url, {
                timeout: 5000,
            });

            if (response.data.Response === "False") {
                return { directors: [], cast: [] };
            }

            return {
                directors: this.parseNamesList(response.data.Director),
                cast: this.parseNamesList(response.data.Actors),
            };
        } catch (error) {
            console.error(`⚠️ Failed to fetch OMDb details for ${imdbId}`);
            return { directors: [], cast: [] };
        }
    }

    // --- Core Operations ---

    async searchMovies(query: string, limit: number = 5): Promise<MovieDto[]> {
        try {
            const encodedQuery = encodeURIComponent(query);
            const url = `${this.ytsApiUrl}?query_term=${encodedQuery}&limit=${limit}&with_images=true`;

            console.log(
                `\n🔍 Searching YTS movies: "${query}", limit: ${limit}`
            );

            const response = await axios.get(url);
            const data = response.data.data;
            const moviesRaw: YtsMovieRaw[] = data?.movies;

            if (!moviesRaw || moviesRaw.length === 0) {
                return [];
            }

            const currentYear = new Date().getFullYear();
            const enrichedMovies: MovieDto[] = [];

            for (const movie of moviesRaw) {
                const { directors, cast } = await this.fetchOmdbDetails(
                    movie.imdb_code || null
                );

                const isNewRelease = Number(movie.year) >= currentYear - 1;
                const isPopular =
                    Number(movie.rating) >= 7.5 ||
                    (movie.download_count ?? 0) > 10000 ||
                    (movie.like_count ?? 0) > 500;

                const dto: MovieDto = {
                    id: Number(movie.id),
                    title: movie.title,
                    titleLong: movie.title_long || movie.title,
                    year: Number(movie.year),
                    rating: Number(movie.rating),
                    runtime: Number(movie.runtime),
                    summary: movie.description_full || movie.summary || "",
                    language: movie.language || "Unknown",
                    genres: movie.genres || [],
                    mpaRating: movie.mpa_rating || null,
                    imdbCode: movie.imdb_code || null,
                    dateUploaded: movie.date_uploaded
                        ? new Date(movie.date_uploaded)
                        : null,

                    isNewRelease,
                    isPopular,

                    mediumCoverImage: movie.medium_cover_image || null,
                    largeCoverImage: movie.large_cover_image || null,
                    backgroundImage: movie.background_image || null,
                    backgroundImageOriginal:
                        movie.background_image_original || null,

                    directors,
                    cast,

                    torrents: [],
                };

                if (movie.torrents && Array.isArray(movie.torrents)) {
                    dto.torrents = movie.torrents.map(
                        (t: YtsTorrentRaw): TorrentDto => ({
                            url: t.url,
                            hash: t.hash,
                            quality: t.quality,
                            type: t.type || "web",
                            seeds: Number(t.seeds) || 0,
                            peers: Number(t.peers) || 0,
                            sizeBytes: Number(t.size_bytes) || 0,
                            sizeHuman: t.size || "",
                        })
                    );
                }

                enrichedMovies.push(dto);
            }

            return enrichedMovies;
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(`❌ Error searching movies: ${error.message}`);
            } else {
                console.error(
                    "❌ An unknown error occurred while searching movies."
                );
            }
            return [];
        }
    }

    async processAndSaveMovie(movie: MovieDto) {
        await this.ensureBucket(POSTERS_BUCKET);
        await this.ensureBucket(BACKGROUNDS_BUCKET);
        await this.ensureBucket(TORRENTS_BUCKET);

        const safeTitle = sanitizeFilename(movie.title);
        const uniqueId = crypto.randomBytes(8).toString("hex");
        const baseFilename = `${safeTitle}_${movie.year}_${uniqueId}`;

        console.log(`\n⚙️ Processing: ${movie.title} (${movie.year})`);

        // === 1. Upload Images ===
        const posterUrl = movie.largeCoverImage || movie.mediumCoverImage;
        const posterName = `${baseFilename}_poster.jpg`;
        const minioPosterPath = posterUrl
            ? await this.uploadToMinio(posterUrl, POSTERS_BUCKET, posterName)
            : null;

        const bgUrl = movie.backgroundImageOriginal || movie.backgroundImage;
        const bgName = `${baseFilename}_bg.jpg`;
        const minioBackgroundImagePath = bgUrl
            ? await this.uploadToMinio(bgUrl, BACKGROUNDS_BUCKET, bgName)
            : null;

        // === 2. Database: Upsert Movie ===
        const movieData = {
            ytsId: movie.id,
            title: movie.title,
            titleLong: movie.titleLong,
            releaseYear: movie.year,
            rating: movie.rating,
            runtimeMinutes: movie.runtime,
            description: movie.summary,
            genres: movie.genres,
            language: movie.language,
            mpaRating: movie.mpaRating,
            ytsPosterUrl: posterUrl || "",
            minioPosterPath,
            ytsBackgroundImageUrl: bgUrl || null,
            minioBackgroundImagePath,
            imdbCode: movie.imdbCode,
            dateUploaded: movie.dateUploaded,
            isNewRelease: movie.isNewRelease,
            isPopular: movie.isPopular,
        };

        const existing = await db
            .select({ id: movies.id })
            .from(movies)
            .where(eq(movies.ytsId, movie.id))
            .limit(1);

        let dbMovieId: string;

        if (existing.length > 0) {
            await db
                .update(movies)
                .set(movieData)
                .where(eq(movies.ytsId, movie.id));
            dbMovieId = existing[0].id;
            console.log(`💾 Updated DB Record: ${movie.title}`);
        } else {
            const result = await db
                .insert(movies)
                .values(movieData)
                .returning({ id: movies.id });
            dbMovieId = result[0].id;
            console.log(`💾 Inserted DB Record: ${movie.title}`);
        }

        // === 3. Relational Inserts (Directors & Cast) ===
        // To prevent duplicate relations on update, we clear old ones first
        await db
            .delete(movieDirectors)
            .where(eq(movieDirectors.movieId, dbMovieId));
        if (movie.directors.length > 0) {
            const dirValues = movie.directors.map((name) => ({
                movieId: dbMovieId,
                name,
            }));
            await db.insert(movieDirectors).values(dirValues);
        }

        await db.delete(movieCast).where(eq(movieCast.movieId, dbMovieId));
        if (movie.cast.length > 0) {
            const castValues = movie.cast.map((name) => ({
                movieId: dbMovieId,
                name,
            }));
            await db.insert(movieCast).values(castValues);
        }

        // === 4. Deduplicate and Process Torrents ===
        const uniqueTorrents = new Map<string, TorrentDto>();

        for (const t of movie.torrents) {
            const key = `${t.quality}_${t.type}`;
            if (
                !uniqueTorrents.has(key) ||
                uniqueTorrents.get(key)!.seeds < t.seeds
            ) {
                uniqueTorrents.set(key, t);
            }
        }

        for (const [key, t] of uniqueTorrents) {
            const torrentName = `${baseFilename}_${t.quality}.torrent`;
            const minioTorrentPath = await this.uploadToMinio(
                t.url,
                TORRENTS_BUCKET,
                torrentName
            );

            const torrentData = {
                movieId: dbMovieId,
                quality: t.quality,
                type: t.type,
                isRepack: false,
                isProper: false,
                fileSizeBytes: t.sizeBytes,
                fileSizeHuman: t.sizeHuman,
                torrentHash: t.hash,
                torrentFileUrl: t.url,
                minioTorrentPath,
                seeds: t.seeds,
                peers: t.peers,
            };

            await db.insert(torrents).values(torrentData).onConflictDoUpdate({
                target: torrents.torrentHash,
                set: torrentData,
            });

            console.log(`🔗 Linked Torrent: ${t.quality} (${t.seeds} seeds)`);
        }
    }
}
