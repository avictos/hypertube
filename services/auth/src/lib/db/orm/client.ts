// This file is generated from schema.sql.
// Run `npm run generate:orm` after updating the schema.

import { BaseRepository } from "./base-repository";
import {
    User,
    UsersTableName,
    UserUniqueFields,
    EmailAddress,
    EmailAddressesTableName,
    EmailAddressUniqueFields,
    Security,
    SecuritiesTableName,
    SecurityUniqueFields,
    Session,
    SessionsTableName,
    SessionUniqueFields,
    SessionCompositeUniqueFields,
    OauthClient,
    OauthClientsTableName,
    OauthClientUniqueFields,
    OauthIdentity,
    OauthIdentitiesTableName,
    OauthIdentityUniqueFields,
    OauthIdentityCompositeUniqueFields,
} from "./db-types";

export const db = {
    users: new BaseRepository<
        User,
        UserUniqueFields,
        {
            emailAddress: EmailAddress;
            security: Security;
            session: Session;
            oauthClient: OauthClient;
            oauthIdentity: OauthIdentity;
        }
    >(UsersTableName, {
        emailAddress: {
            table: EmailAddressesTableName,
            localKey: "id",
            foreignKey: "user_id",
        },
        security: {
            table: SecuritiesTableName,
            localKey: "id",
            foreignKey: "user_id",
        },
        session: {
            table: SessionsTableName,
            localKey: "id",
            foreignKey: "user_id",
        },
        oauthClient: {
            table: OauthClientsTableName,
            localKey: "id",
            foreignKey: "user_id",
        },
        oauthIdentity: {
            table: OauthIdentitiesTableName,
            localKey: "id",
            foreignKey: "user_id",
        },
    }),
    emailAddresses: new BaseRepository<
        EmailAddress,
        EmailAddressUniqueFields,
        {
            user: User;
            security: Security;
            session: Session;
            oauthClient: OauthClient;
            oauthIdentity: OauthIdentity;
        }
    >(EmailAddressesTableName, {
        user: {
            table: UsersTableName,
            localKey: "user_id",
            foreignKey: "id",
        },
        security: {
            table: SecuritiesTableName,
            localKey: "user_id",
            foreignKey: "user_id",
        },
        session: {
            table: SessionsTableName,
            localKey: "user_id",
            foreignKey: "user_id",
        },
        oauthClient: {
            table: OauthClientsTableName,
            localKey: "user_id",
            foreignKey: "user_id",
        },
        oauthIdentity: {
            table: OauthIdentitiesTableName,
            localKey: "user_id",
            foreignKey: "user_id",
        },
    }),
    securities: new BaseRepository<
        Security,
        SecurityUniqueFields,
        {
            user: User;
            emailAddress: EmailAddress;
            session: Session;
            oauthClient: OauthClient;
            oauthIdentity: OauthIdentity;
        }
    >(SecuritiesTableName, {
        user: {
            table: UsersTableName,
            localKey: "user_id",
            foreignKey: "id",
        },
        emailAddress: {
            table: EmailAddressesTableName,
            localKey: "user_id",
            foreignKey: "user_id",
        },
        session: {
            table: SessionsTableName,
            localKey: "user_id",
            foreignKey: "user_id",
        },
        oauthClient: {
            table: OauthClientsTableName,
            localKey: "user_id",
            foreignKey: "user_id",
        },
        oauthIdentity: {
            table: OauthIdentitiesTableName,
            localKey: "user_id",
            foreignKey: "user_id",
        },
    }),
    sessions: new BaseRepository<
        Session,
        SessionUniqueFields,
        {
            user: User;
            emailAddress: EmailAddress;
            security: Security;
            oauthClient: OauthClient;
            oauthIdentity: OauthIdentity;
        },
        SessionCompositeUniqueFields
    >(
        SessionsTableName,
        {
            user: {
                table: UsersTableName,
                localKey: "user_id",
                foreignKey: "id",
            },
            emailAddress: {
                table: EmailAddressesTableName,
                localKey: "user_id",
                foreignKey: "user_id",
            },
            security: {
                table: SecuritiesTableName,
                localKey: "user_id",
                foreignKey: "user_id",
            },
            oauthClient: {
                table: OauthClientsTableName,
                localKey: "user_id",
                foreignKey: "user_id",
            },
            oauthIdentity: {
                table: OauthIdentitiesTableName,
                localKey: "user_id",
                foreignKey: "user_id",
            },
        },
        [["user_id", "session_token"]]
    ),
    oauthClients: new BaseRepository<
        OauthClient,
        OauthClientUniqueFields,
        {
            user: User;
            emailAddress: EmailAddress;
            security: Security;
            session: Session;
            oauthIdentity: OauthIdentity;
        }
    >(OauthClientsTableName, {
        user: {
            table: UsersTableName,
            localKey: "user_id",
            foreignKey: "id",
        },
        emailAddress: {
            table: EmailAddressesTableName,
            localKey: "user_id",
            foreignKey: "user_id",
        },
        security: {
            table: SecuritiesTableName,
            localKey: "user_id",
            foreignKey: "user_id",
        },
        session: {
            table: SessionsTableName,
            localKey: "user_id",
            foreignKey: "user_id",
        },
        oauthIdentity: {
            table: OauthIdentitiesTableName,
            localKey: "user_id",
            foreignKey: "user_id",
        },
    }),
    oauthIdentities: new BaseRepository<
        OauthIdentity,
        OauthIdentityUniqueFields,
        {
            user: User;
            emailAddress: EmailAddress;
            security: Security;
            session: Session;
            oauthClient: OauthClient;
        },
        OauthIdentityCompositeUniqueFields
    >(
        OauthIdentitiesTableName,
        {
            user: {
                table: UsersTableName,
                localKey: "user_id",
                foreignKey: "id",
            },
            emailAddress: {
                table: EmailAddressesTableName,
                localKey: "user_id",
                foreignKey: "user_id",
            },
            security: {
                table: SecuritiesTableName,
                localKey: "user_id",
                foreignKey: "user_id",
            },
            session: {
                table: SessionsTableName,
                localKey: "user_id",
                foreignKey: "user_id",
            },
            oauthClient: {
                table: OauthClientsTableName,
                localKey: "user_id",
                foreignKey: "user_id",
            },
        },
        [["provider", "provider_user_id"]]
    ),
};
