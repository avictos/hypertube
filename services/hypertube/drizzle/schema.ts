import { relations } from "drizzle-orm";
import {
    pgTable,
    text,
    integer,
    doublePrecision,
    timestamp,
    uuid,
    pgEnum,
    unique,
    bigint,
    boolean,
    index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------
// ENUMS
// ---------------------------------------------------------
export const downloadStateEnum = pgEnum("download_state", [
    "IDLE",
    "FETCHING_METADATA",
    "DOWNLOADING",
    "PROCESSING",
    "COMPLETED",
    "ERROR",
]);

export const storageProviderEnum = pgEnum("storage_provider", [
    "NONE",
    "LOCAL_DISK",
    "MINIO",
]);

export const sourceTypeEnum = pgEnum("source_type", ["MAGNET", "TORRENT_FILE"]);

// ---------------------------------------------------------
// MOVIES TABLE
// ---------------------------------------------------------
export const movies = pgTable(
    "movies",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        ytsId: integer("yts_id").unique().notNull(),
        title: text("title").notNull(),
        titleLong: text("title_long"),
        releaseYear: integer("release_year").notNull(),
        rating: doublePrecision("rating"),
        runtimeMinutes: integer("runtime_minutes"),
        description: text("description"),
        genres: text("genres").array(),
        language: text("language"),
        mpaRating: text("mpa_rating"),
        ytsPosterUrl: text("yts_poster_url").notNull(),
        minioPosterPath: text("minio_poster_path"),
        ytsBackgroundImageUrl: text("yts_background_image_url"),
        minioBackgroundImagePath: text("minio_background_image_path"),
        imdbCode: text("imdb_code"),
        dateUploaded: timestamp("date_uploaded", { withTimezone: true }),

        // --- NEW FIELDS ---
        isNewRelease: boolean("is_new_release").default(false),
        isPopular: boolean("is_popular").default(false),

        lastCheckedAt: timestamp("last_checked_at", { withTimezone: true })
            .defaultNow()
            .notNull(),

        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => ({
        ytsIdIdx: index("yts_id_idx").on(table.ytsId),
        titleIdx: index("title_idx").on(table.title),
    })
);

// ---------------------------------------------------------
// MOVIE DIRECTORS TABLE (NEW)
// ---------------------------------------------------------
export const movieDirectors = pgTable(
    "movie_directors",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        movieId: uuid("movie_id")
            .references(() => movies.id, { onDelete: "cascade" })
            .notNull(),
        name: text("name").notNull(),
        imageUrl: text("image_url"),
    },
    (table) => ({
        movieIdIdx: index("director_movie_id_idx").on(table.movieId),
    })
);

// ---------------------------------------------------------
// MOVIE CAST TABLE (NEW)
// ---------------------------------------------------------
export const movieCast = pgTable(
    "movie_cast",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        movieId: uuid("movie_id")
            .references(() => movies.id, { onDelete: "cascade" })
            .notNull(),
        name: text("name").notNull(),
        characterName: text("character_name"),
        imageUrl: text("image_url"),
        imdbCode: text("imdb_code"),
    },
    (table) => ({
        movieIdIdx: index("cast_movie_id_idx").on(table.movieId),
    })
);

// ---------------------------------------------------------
// TORRENTS TABLE
// ---------------------------------------------------------
export const torrents = pgTable(
    "torrents",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        movieId: uuid("movie_id")
            .references(() => movies.id, { onDelete: "cascade" })
            .notNull(),
        quality: text("quality").notNull(),
        type: text("type").notNull(),
        isRepack: boolean("is_repack").default(false),
        isProper: boolean("is_proper").default(false),
        fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
        fileSizeHuman: text("file_size_human"),
        torrentHash: text("torrent_hash").unique().notNull(),
        torrentFileUrl: text("torrent_file_url").notNull(),
        minioTorrentPath: text("minio_torrent_path"),
        seeds: integer("seeds").default(0),
        peers: integer("peers").default(0),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => ({
        movieQualityUnique: unique("movieQualityUnique").on(
            table.movieId,
            table.quality,
            table.type
        ),
        hashIdx: index("torrent_hash_idx").on(table.torrentHash),
    })
);

// ---------------------------------------------------------
// DOWNLOADS TABLE
// ---------------------------------------------------------
export const downloads = pgTable("downloads", {
    id: uuid("id").defaultRandom().primaryKey(),
    torrentId: uuid("torrent_id")
        .references(() => torrents.id, { onDelete: "restrict" })
        .notNull(),
    movieId: uuid("movie_id")
        .references(() => movies.id, { onDelete: "cascade" })
        .notNull(),
    sessionId: uuid("session_id").unique().notNull(),
    sourceType: sourceTypeEnum("source_type").notNull(),
    sourceUri: text("source_uri").notNull(),
    state: downloadStateEnum("state").default("IDLE").notNull(),
    progress: doublePrecision("progress").default(0.0).notNull(),
    downloadedBytes: bigint("downloaded_bytes", { mode: "number" }).default(0),
    totalBytes: bigint("total_bytes", { mode: "number" }).default(0),
    errorMessage: text("error_message"),
    storageProvider: storageProviderEnum("storage_provider").default("NONE"),
    localPath: text("local_path"),
    videoCodec: text("video_codec"),
    audioCodec: text("audio_codec"),
    audioChannels: text("audio_channels"),
    resolutionWidth: integer("resolution_width"),
    resolutionHeight: integer("resolution_height"),
    durationSeconds: integer("duration_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
});

// ---------------------------------------------------------
// SUBTITLES TABLE
// ---------------------------------------------------------
export const subtitles = pgTable("subtitles", {
    id: uuid("id").defaultRandom().primaryKey(),
    downloadId: uuid("download_id")
        .references(() => downloads.id, { onDelete: "cascade" })
        .notNull(),
    languageCode: text("language_code").notNull(),
    languageName: text("language_name"),
    isForced: boolean("is_forced").default(false),
    isSdh: boolean("is_sdh").default(false),
    originalFilename: text("original_filename"),
    minioPath: text("minio_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
});

// ---------------------------------------------------------
// USER PLAYBACKS TABLE
// ---------------------------------------------------------
export const userPlaybacks = pgTable(
    "user_playbacks",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: text("user_id").notNull(),
        downloadId: uuid("download_id")
            .references(() => downloads.id, { onDelete: "cascade" })
            .notNull(),
        movieId: uuid("movie_id")
            .references(() => movies.id, { onDelete: "cascade" })
            .notNull(),
        lastWatchedSeconds: doublePrecision("last_watched_seconds").default(0),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => ({
        userDownloadUnq: unique("user_download_unq").on(
            table.userId,
            table.downloadId
        ),
    })
);

export const watchHistory = pgTable(
    "watch_history",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: text("user_id").notNull(),
        movieId: uuid("movie_id")
            .references(() => movies.id, { onDelete: "cascade" })
            .notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => ({
        userMovieIdx: index("wh_user_movie_idx").on(
            table.userId,
            table.movieId
        ),
    })
);

export const userFavorites = pgTable(
    "user_favorites",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: text("user_id").notNull(),
        movieId: uuid("movie_id")
            .references(() => movies.id, { onDelete: "cascade" })
            .notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => ({
        userMovieUnq: unique("fav_user_movie_unq").on(
            table.userId,
            table.movieId
        ),
        userIdIdx: index("fav_user_id_idx").on(table.userId),
    })
);

export const movieComments = pgTable(
    "movie_comments",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        movieId: uuid("movie_id")
            .references(() => movies.id, { onDelete: "cascade" })
            .notNull(),
        userId: text("user_id").notNull(),
        username: text("username").notNull(),
        content: text("content").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => ({
        movieIdIdx: index("comment_movie_id_idx").on(table.movieId),
        createdAtIdx: index("comment_created_at_idx").on(table.createdAt),
    })
);

// ---------------------------------------------------------
// RELATIONS
// ---------------------------------------------------------

export const moviesRelations = relations(movies, ({ many }) => ({
    torrents: many(torrents),
    downloads: many(downloads),
    playbacks: many(userPlaybacks),
    directors: many(movieDirectors),
    cast: many(movieCast),
    watchHistory: many(watchHistory),
    favorites: many(userFavorites),
    comments: many(movieComments),
}));

// NEW RELATIONS BLOCK
export const movieDirectorsRelations = relations(movieDirectors, ({ one }) => ({
    movie: one(movies, {
        fields: [movieDirectors.movieId],
        references: [movies.id],
    }),
}));

// NEW RELATIONS BLOCK
export const movieCastRelations = relations(movieCast, ({ one }) => ({
    movie: one(movies, {
        fields: [movieCast.movieId],
        references: [movies.id],
    }),
}));

export const torrentsRelations = relations(torrents, ({ one, many }) => ({
    movie: one(movies, {
        fields: [torrents.movieId],
        references: [movies.id],
    }),
    downloads: many(downloads),
}));

export const downloadsRelations = relations(downloads, ({ one, many }) => ({
    movie: one(movies, {
        fields: [downloads.movieId],
        references: [movies.id],
    }),
    torrent: one(torrents, {
        fields: [downloads.torrentId],
        references: [torrents.id],
    }),
    subtitles: many(subtitles),
}));

export const subtitlesRelations = relations(subtitles, ({ one }) => ({
    download: one(downloads, {
        fields: [subtitles.downloadId],
        references: [downloads.id],
    }),
}));

export const userPlaybacksRelations = relations(userPlaybacks, ({ one }) => ({
    movie: one(movies, {
        fields: [userPlaybacks.movieId],
        references: [movies.id],
    }),
}));

export const watchHistoryRelations = relations(watchHistory, ({ one }) => ({
    movie: one(movies, {
        fields: [watchHistory.movieId],
        references: [movies.id],
    }),
}));

export const userFavoritesRelations = relations(userFavorites, ({ one }) => ({
    movie: one(movies, {
        fields: [userFavorites.movieId],
        references: [movies.id],
    }),
}));

export const movieCommentsRelations = relations(movieComments, ({ one }) => ({
    movie: one(movies, {
        fields: [movieComments.movieId],
        references: [movies.id],
    }),
}));
