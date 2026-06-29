CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES users(id),
    user_id UUID UNIQUE NOT NULL,
    gender VARCHAR(20) ENUM('male', 'female', 'non-binary', 'other') NOT NULL,
    interested VARCHAR(20) ENUM('male', 'female', 'non-binary', 'all') NOT NULL,
    biography TEXT NOT NULL,
    picture VARCHAR(1024) NOT NULL,
    geo_location VARCHAR(255) NOT NULL,
    rating FLOAT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gallery_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    image_path VARCHAR(1024) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    tag_name VARCHAR(20) UNIQUE NOT NULL
);

CREATE TABLE user_tags (
    profile_id UUID REFERENCES profiles(id),
    tag_id INTEGER REFERENCES tags(id),
    PRIMARY KEY (profile_id, tag_id)
);

CREATE TABLE likes (
    id SERIAL PRIMARY KEY,
    liker_id UUID REFERENCES profiles(id),
    liked_id UUID REFERENCES profiles(id),
    timestamp TIMESTAMP DEFAULT now()
);

CREATE TABLE matches (
    id SERIAL PRIMARY KEY,
    profile1_id UUID REFERENCES profiles(id),
    profile2_id UUID REFERENCES profiles(id),
    timestamp TIMESTAMP DEFAULT now()
);
