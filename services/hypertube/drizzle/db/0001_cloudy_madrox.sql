CREATE TABLE "movie_cast" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movie_id" uuid NOT NULL,
	"name" text NOT NULL,
	"character_name" text,
	"image_url" text,
	"imdb_code" text
);
--> statement-breakpoint
CREATE TABLE "movie_directors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movie_id" uuid NOT NULL,
	"name" text NOT NULL,
	"image_url" text
);
--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "is_new_release" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "is_popular" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "movie_cast" ADD CONSTRAINT "movie_cast_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movie_directors" ADD CONSTRAINT "movie_directors_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cast_movie_id_idx" ON "movie_cast" USING btree ("movie_id");--> statement-breakpoint
CREATE INDEX "director_movie_id_idx" ON "movie_directors" USING btree ("movie_id");