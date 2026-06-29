CREATE TABLE "user_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"movie_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fav_user_movie_unq" UNIQUE("user_id","movie_id")
);
--> statement-breakpoint
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fav_user_id_idx" ON "user_favorites" USING btree ("user_id");