CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(50) NOT NULL CHECK (char_length(first_name) >= 2 AND char_length(first_name) <= 50),
    last_name VARCHAR(50) NOT NULL CHECK (char_length(last_name) >= 2 AND char_length(last_name) <= 50),
    username VARCHAR(20) NOT NULL UNIQUE,
    CONSTRAINT chk_username_length CHECK (char_length(username) >= 2 AND char_length(username) <= 20),
    profile_picture_url TEXT,
    preferred_language VARCHAR(5) NOT NULL DEFAULT 'en',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(256) NOT NULL UNIQUE CHECK (char_length(email) >= 5 AND char_length(email) <= 256),
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verification_token TEXT NOT NULL,
    verification_expires_at TIMESTAMPTZ NOT NULL,
    verification_attempts INT NOT NULL DEFAULT 0,
    last_verification_attempt_at TIMESTAMPTZ DEFAULT NULL,
    vcode_sent_at TIMESTAMPTZ DEFAULT NULL,
    vcode_resend_count INT NOT NULL DEFAULT 0,
    is_vcode_resend_locked BOOLEAN NOT NULL DEFAULT false,
    vcode_resend_lock_expires_at TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT verification_check CHECK (
        (is_verified = false) OR (is_verified = true AND verification_token IS NOT NULL)
    ),

    is_locked BOOLEAN NOT NULL DEFAULT false,
    lock_expires_at TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT lock_check CHECK (
        (is_locked = false AND lock_expires_at IS NULL) OR 
        (is_locked = true AND lock_expires_at IS NOT NULL)
    ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE securities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    failed_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ DEFAULT NULL,
    last_failed_at TIMESTAMPTZ DEFAULT NULL,

    mfa_enabled BOOLEAN NOT NULL DEFAULT false,
    mfa_secret TEXT, -- should be encrypted at the application level
    CONSTRAINT mfa_check CHECK (
        (mfa_enabled = false) OR (mfa_enabled = true AND mfa_secret IS NOT NULL)
    ),

    recovery_codes TEXT[] DEFAULT '{}', -- should be encrypted at the application level
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    reset_token TEXT UNIQUE DEFAULT NULL, -- should be encrypted at the application level
    reset_expires_at TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT reset_check CHECK (
        (reset_token IS NULL AND reset_expires_at IS NULL) OR 
        (reset_token IS NOT NULL AND reset_expires_at IS NOT NULL)
    ),

    -- Account deletion confirmation token support
    delete_token TEXT UNIQUE DEFAULT NULL, -- should be encrypted at the application level
    delete_expires_at TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT delete_check CHECK (
        (delete_token IS NULL AND delete_expires_at IS NULL) OR
        (delete_token IS NOT NULL AND delete_expires_at IS NOT NULL)
    ),

    logged_in BOOLEAN NOT NULL DEFAULT false,
    last_login_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tracker_id TEXT NOT NULL,
    session_token TEXT NOT NULL, -- should be encrypted at the application level

    -- We create the composite unique constraint
    CONSTRAINT unique_user_session UNIQUE (user_id, session_token),

    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE oauth_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
    client_id TEXT NOT NULL UNIQUE,
    client_secret_hash TEXT NOT NULL,
    last_used_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE oauth_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('42', 'google', 'facebook')),
    provider_user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_provider_identity UNIQUE (provider, provider_user_id)
);

-- This is a function to update the updated_at field when record is changed
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    -- This condition ensures we only update if data actually changed
    IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
        NEW.updated_at = now();
        RETURN NEW;
    ELSE
        RETURN OLD;
    END IF;
END;
$$ language 'plpgsql';

-- This is a trigger of the update_modified_column for users table
CREATE TRIGGER update_users_modtime
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- This is a trigger of the update_modified_column for email_addresses table
CREATE TRIGGER update_email_addresses_modtime
    BEFORE UPDATE ON email_addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- This is a trigger of the updated_modified_column for securities table
CREATE TRIGGER update_securities_modtime
    BEFORE UPDATE ON securities
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- This is a trigger of the updated_modified_column for sessions table
CREATE TRIGGER update_sessions_modtime
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- This is a trigger of the updated_modified_column for oauth_clients table
CREATE TRIGGER update_oauth_clients_modtime
    BEFORE UPDATE ON oauth_clients
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();