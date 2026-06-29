CREATE TYPE "public"."download_state" AS ENUM('IDLE', 'FETCHING_METADATA', 'DOWNLOADING', 'PROCESSING', 'COMPLETED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('MAGNET', 'TORRENT_FILE');--> statement-breakpoint
CREATE TYPE "public"."storage_provider" AS ENUM('NONE', 'LOCAL_DISK', 'MINIO');--> statement-breakpoint
CREATE TABLE "downloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"torrent_id" uuid NOT NULL,
	"movie_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"source_type" "source_type" NOT NULL,
	"source_uri" text NOT NULL,
	"state" "download_state" DEFAULT 'IDLE' NOT NULL,
	"progress" double precision DEFAULT 0 NOT NULL,
	"downloaded_bytes" bigint DEFAULT 0,
	"total_bytes" bigint DEFAULT 0,
	"error_message" text,
	"storage_provider" "storage_provider" DEFAULT 'NONE',
	"local_path" text,
	"video_codec" text,
	"audio_codec" text,
	"audio_channels" text,
	"resolution_width" integer,
	"resolution_height" integer,
	"duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "downloads_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "movies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"yts_id" integer NOT NULL,
	"title" text NOT NULL,
	"title_long" text,
	"release_year" integer NOT NULL,
	"rating" double precision,
	"runtime_minutes" integer,
	"description" text,
	"genres" text[],
	"language" text,
	"mpa_rating" text,
	"yts_poster_url" text NOT NULL,
	"minio_poster_path" text,
	"yts_background_image_url" text,
	"minio_background_image_path" text,
	"imdb_code" text,
	"date_uploaded" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movies_yts_id_unique" UNIQUE("yts_id")
);
--> statement-breakpoint
CREATE TABLE "subtitles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"download_id" uuid NOT NULL,
	"language_code" text NOT NULL,
	"language_name" text,
	"is_forced" boolean DEFAULT false,
	"is_sdh" boolean DEFAULT false,
	"original_filename" text,
	"minio_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "torrents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movie_id" uuid NOT NULL,
	"quality" text NOT NULL,
	"type" text NOT NULL,
	"is_repack" boolean DEFAULT false,
	"is_proper" boolean DEFAULT false,
	"file_size_bytes" bigint,
	"file_size_human" text,
	"torrent_hash" text NOT NULL,
	"torrent_file_url" text NOT NULL,
	"minio_torrent_path" text,
	"seeds" integer DEFAULT 0,
	"peers" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "torrents_torrent_hash_unique" UNIQUE("torrent_hash"),
	CONSTRAINT "movieQualityUnique" UNIQUE("movie_id","quality","type")
);
--> statement-breakpoint
CREATE TABLE "user_playbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"download_id" uuid NOT NULL,
	"movie_id" uuid NOT NULL,
	"last_watched_seconds" double precision DEFAULT 0,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_download_unq" UNIQUE("user_id","download_id")
);
--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_torrent_id_torrents_id_fk" FOREIGN KEY ("torrent_id") REFERENCES "public"."torrents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtitles" ADD CONSTRAINT "subtitles_download_id_downloads_id_fk" FOREIGN KEY ("download_id") REFERENCES "public"."downloads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torrents" ADD CONSTRAINT "torrents_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_playbacks" ADD CONSTRAINT "user_playbacks_download_id_downloads_id_fk" FOREIGN KEY ("download_id") REFERENCES "public"."downloads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_playbacks" ADD CONSTRAINT "user_playbacks_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "yts_id_idx" ON "movies" USING btree ("yts_id");--> statement-breakpoint
CREATE INDEX "title_idx" ON "movies" USING btree ("title");--> statement-breakpoint
CREATE INDEX "torrent_hash_idx" ON "torrents" USING btree ("torrent_hash");