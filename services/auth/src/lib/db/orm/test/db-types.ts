import z from "zod";

// This file is generated from schema.sql.
// Run `npm run generate:orm` after updating the schema.

// -------------- Profile and related types --------------

export const ProfilesTableName = "profiles";
export const Profiles = {
    id: "id",
    user_id: "user_id",
    gender: "gender",
    interested: "interested",
    biography: "biography",
    picture: "picture",
    geo_location: "geo_location",
    rating: "rating",
    created_at: "created_at",
    updated_at: "updated_at",
} as const;

export const BaseProfileSchema = z.object({
    id: z.uuid(),
    user_id: z.uuid(),
    gender: z.string().max(20),
    interested: z.string().max(20),
    biography: z.string(),
    picture: z.string().max(1024),
    geo_location: z.string().max(255),
    rating: z.string(),
    created_at: z.date(),
    updated_at: z.date(),
});
export const ProfileSchema = BaseProfileSchema;
export type Profile = z.infer<typeof ProfileSchema>;
export const UpsertProfileSchema = BaseProfileSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
});
export type UpsertProfile = z.infer<typeof UpsertProfileSchema>;

export type ProfileUniqueFields = "id" | "user_id";

// -------------- GalleryImage and related types --------------

export const GalleryImagesTableName = "gallery_images";
export const GalleryImages = {
    id: "id",
    profile_id: "profile_id",
    image_path: "image_path",
    created_at: "created_at",
} as const;

export const BaseGalleryImageSchema = z.object({
    id: z.uuid(),
    profile_id: z.uuid().nullable(),
    image_path: z.string().max(1024),
    created_at: z.date().nullable(),
});
export const GalleryImageSchema = BaseGalleryImageSchema;
export type GalleryImage = z.infer<typeof GalleryImageSchema>;
export const UpsertGalleryImageSchema = BaseGalleryImageSchema.omit({ id: true, created_at: true });
export type UpsertGalleryImage = z.infer<typeof UpsertGalleryImageSchema>;

export type GalleryImageUniqueFields = "id";

// -------------- Tag and related types --------------

export const TagsTableName = "tags";
export const Tags = {
    id: "id",
    tag_name: "tag_name",
} as const;

export const BaseTagSchema = z.object({
    id: z.string(),
    tag_name: z.string().max(20),
});
export const TagSchema = BaseTagSchema;
export type Tag = z.infer<typeof TagSchema>;
export const UpsertTagSchema = BaseTagSchema.omit({ id: true });
export type UpsertTag = z.infer<typeof UpsertTagSchema>;

export type TagUniqueFields = "id" | "tag_name";

// -------------- UserTag and related types --------------

export const UserTagsTableName = "user_tags";
export const UserTags = {
    profile_id: "profile_id",
    tag_id: "tag_id",
} as const;

export const BaseUserTagSchema = z.object({
    profile_id: z.uuid().nullable(),
    tag_id: z.number().int().nullable(),
});
export const UserTagSchema = BaseUserTagSchema;
export type UserTag = z.infer<typeof UserTagSchema>;
export const UpsertUserTagSchema = BaseUserTagSchema.omit({});
export type UpsertUserTag = z.infer<typeof UpsertUserTagSchema>;

export type UserTagUniqueFields = never;
export type UserTagCompositeUniqueFields = ["profile_id", "tag_id"];

// -------------- Like and related types --------------

export const LikesTableName = "likes";
export const Likes = {
    id: "id",
    liker_id: "liker_id",
    liked_id: "liked_id",
    timestamp: "timestamp",
} as const;

export const BaseLikeSchema = z.object({
    id: z.string(),
    liker_id: z.uuid().nullable(),
    liked_id: z.uuid().nullable(),
    timestamp: z.date().nullable(),
});
export const LikeSchema = BaseLikeSchema;
export type Like = z.infer<typeof LikeSchema>;
export const UpsertLikeSchema = BaseLikeSchema.omit({ id: true });
export type UpsertLike = z.infer<typeof UpsertLikeSchema>;

export type LikeUniqueFields = "id";

// -------------- Matche and related types --------------

export const MatchesTableName = "matches";
export const Matches = {
    id: "id",
    profile1_id: "profile1_id",
    profile2_id: "profile2_id",
    timestamp: "timestamp",
} as const;

export const BaseMatcheSchema = z.object({
    id: z.string(),
    profile1_id: z.uuid().nullable(),
    profile2_id: z.uuid().nullable(),
    timestamp: z.date().nullable(),
});
export const MatcheSchema = BaseMatcheSchema;
export type Matche = z.infer<typeof MatcheSchema>;
export const UpsertMatcheSchema = BaseMatcheSchema.omit({ id: true });
export type UpsertMatche = z.infer<typeof UpsertMatcheSchema>;

export type MatcheUniqueFields = "id";

// -------------- Other functions --------------
export const getTableFields = (tableName: string) => {
    switch (tableName) {
        case ProfilesTableName:
            return Profiles;
        case GalleryImagesTableName:
            return GalleryImages;
        case TagsTableName:
            return Tags;
        case UserTagsTableName:
            return UserTags;
        case LikesTableName:
            return Likes;
        case MatchesTableName:
            return Matches;
        default:
            throw new Error(`Unknown table name: ${tableName}`);
    }
};

// -------------- End of types --------------
