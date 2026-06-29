CREATE TABLE "movie_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movie_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movie_comments" ADD CONSTRAINT "movie_comments_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_movie_id_idx" ON "movie_comments" USING btree ("movie_id");--> statement-breakpoint
CREATE INDEX "comment_created_at_idx" ON "movie_comments" USING btree ("created_at");