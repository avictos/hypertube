// This file is generated from schema.sql.
// Run `npm run generate:orm` after updating the schema.

import { BaseRepository } from "../base-repository";
import {
    Profile,
    ProfilesTableName,
    ProfileUniqueFields,
    GalleryImage,
    GalleryImagesTableName,
    GalleryImageUniqueFields,
    Tag,
    TagsTableName,
    TagUniqueFields,
    UserTag,
    UserTagsTableName,
    UserTagUniqueFields,
    UserTagCompositeUniqueFields,
    Like,
    LikesTableName,
    LikeUniqueFields,
    Matche,
    MatchesTableName,
    MatcheUniqueFields,
} from "./db-types";

export const db = {
    profiles: new BaseRepository<
        Profile,
        ProfileUniqueFields,
        {
            galleryImage: GalleryImage;
            userTag: UserTag;
            like: Like;
            like2: Like;
            matche: Matche;
            matche2: Matche;
        }
    >(ProfilesTableName, {
        galleryImage: {
            table: GalleryImagesTableName,
            localKey: "id",
            foreignKey: "profile_id",
        },
        userTag: {
            table: UserTagsTableName,
            localKey: "id",
            foreignKey: "profile_id",
        },
        like: {
            table: LikesTableName,
            localKey: "id",
            foreignKey: "liker_id",
        },
        like2: {
            table: LikesTableName,
            localKey: "id",
            foreignKey: "liked_id",
        },
        matche: {
            table: MatchesTableName,
            localKey: "id",
            foreignKey: "profile1_id",
        },
        matche2: {
            table: MatchesTableName,
            localKey: "id",
            foreignKey: "profile2_id",
        },
    }),
    galleryImages: new BaseRepository<
        GalleryImage,
        GalleryImageUniqueFields,
        {
            profile: Profile;
            userTag: UserTag;
            like: Like;
            like2: Like;
            matche: Matche;
            matche2: Matche;
        }
    >(GalleryImagesTableName, {
        profile: {
            table: ProfilesTableName,
            localKey: "profile_id",
            foreignKey: "id",
        },
        userTag: {
            table: UserTagsTableName,
            localKey: "profile_id",
            foreignKey: "profile_id",
        },
        like: {
            table: LikesTableName,
            localKey: "profile_id",
            foreignKey: "liker_id",
        },
        like2: {
            table: LikesTableName,
            localKey: "profile_id",
            foreignKey: "liked_id",
        },
        matche: {
            table: MatchesTableName,
            localKey: "profile_id",
            foreignKey: "profile1_id",
        },
        matche2: {
            table: MatchesTableName,
            localKey: "profile_id",
            foreignKey: "profile2_id",
        },
    }),
    tags: new BaseRepository<Tag, TagUniqueFields, { userTag: UserTag }>(TagsTableName, {
        userTag: {
            table: UserTagsTableName,
            localKey: "id",
            foreignKey: "tag_id",
        },
    }),
    userTags: new BaseRepository<
        UserTag,
        UserTagUniqueFields,
        {
            profile: Profile;
            galleryImage: GalleryImage;
            like: Like;
            like2: Like;
            matche: Matche;
            matche2: Matche;
            tag: Tag;
        },
        UserTagCompositeUniqueFields
    >(
        UserTagsTableName,
        {
            profile: {
                table: ProfilesTableName,
                localKey: "profile_id",
                foreignKey: "id",
            },
            galleryImage: {
                table: GalleryImagesTableName,
                localKey: "profile_id",
                foreignKey: "profile_id",
            },
            like: {
                table: LikesTableName,
                localKey: "profile_id",
                foreignKey: "liker_id",
            },
            like2: {
                table: LikesTableName,
                localKey: "profile_id",
                foreignKey: "liked_id",
            },
            matche: {
                table: MatchesTableName,
                localKey: "profile_id",
                foreignKey: "profile1_id",
            },
            matche2: {
                table: MatchesTableName,
                localKey: "profile_id",
                foreignKey: "profile2_id",
            },
            tag: {
                table: TagsTableName,
                localKey: "tag_id",
                foreignKey: "id",
            },
        },
        [["profile_id", "tag_id"]]
    ),
    likes: new BaseRepository<
        Like,
        LikeUniqueFields,
        {
            profile: Profile;
            galleryImage: GalleryImage;
            userTag: UserTag;
            matche: Matche;
            matche2: Matche;
            profile2: Profile;
            galleryImage2: GalleryImage;
            userTag2: UserTag;
            matche3: Matche;
            matche4: Matche;
        }
    >(LikesTableName, {
        profile: {
            table: ProfilesTableName,
            localKey: "liker_id",
            foreignKey: "id",
        },
        galleryImage: {
            table: GalleryImagesTableName,
            localKey: "liker_id",
            foreignKey: "profile_id",
        },
        userTag: {
            table: UserTagsTableName,
            localKey: "liker_id",
            foreignKey: "profile_id",
        },
        matche: {
            table: MatchesTableName,
            localKey: "liker_id",
            foreignKey: "profile1_id",
        },
        matche2: {
            table: MatchesTableName,
            localKey: "liker_id",
            foreignKey: "profile2_id",
        },
        profile2: {
            table: ProfilesTableName,
            localKey: "liked_id",
            foreignKey: "id",
        },
        galleryImage2: {
            table: GalleryImagesTableName,
            localKey: "liked_id",
            foreignKey: "profile_id",
        },
        userTag2: {
            table: UserTagsTableName,
            localKey: "liked_id",
            foreignKey: "profile_id",
        },
        matche3: {
            table: MatchesTableName,
            localKey: "liked_id",
            foreignKey: "profile1_id",
        },
        matche4: {
            table: MatchesTableName,
            localKey: "liked_id",
            foreignKey: "profile2_id",
        },
    }),
    matches: new BaseRepository<
        Matche,
        MatcheUniqueFields,
        {
            profile: Profile;
            galleryImage: GalleryImage;
            userTag: UserTag;
            like: Like;
            like2: Like;
            profile2: Profile;
            galleryImage2: GalleryImage;
            userTag2: UserTag;
            like3: Like;
            like4: Like;
        }
    >(MatchesTableName, {
        profile: {
            table: ProfilesTableName,
            localKey: "profile1_id",
            foreignKey: "id",
        },
        galleryImage: {
            table: GalleryImagesTableName,
            localKey: "profile1_id",
            foreignKey: "profile_id",
        },
        userTag: {
            table: UserTagsTableName,
            localKey: "profile1_id",
            foreignKey: "profile_id",
        },
        like: {
            table: LikesTableName,
            localKey: "profile1_id",
            foreignKey: "liker_id",
        },
        like2: {
            table: LikesTableName,
            localKey: "profile1_id",
            foreignKey: "liked_id",
        },
        profile2: {
            table: ProfilesTableName,
            localKey: "profile2_id",
            foreignKey: "id",
        },
        galleryImage2: {
            table: GalleryImagesTableName,
            localKey: "profile2_id",
            foreignKey: "profile_id",
        },
        userTag2: {
            table: UserTagsTableName,
            localKey: "profile2_id",
            foreignKey: "profile_id",
        },
        like3: {
            table: LikesTableName,
            localKey: "profile2_id",
            foreignKey: "liker_id",
        },
        like4: {
            table: LikesTableName,
            localKey: "profile2_id",
            foreignKey: "liked_id",
        },
    }),
};
