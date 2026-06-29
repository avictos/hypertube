import uuid
import enum
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, 
    Enum, Index, UniqueConstraint, BigInteger
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func

Base = declarative_base()

# ---------------------------------------------------------
# ENUMS
# ---------------------------------------------------------
class DownloadState(enum.Enum):
    IDLE = "IDLE"
    FETCHING_METADATA = "FETCHING_METADATA"
    DOWNLOADING = "DOWNLOADING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    ERROR = "ERROR"

class StorageProvider(enum.Enum):
    NONE = "NONE"
    LOCAL_DISK = "LOCAL_DISK"
    MINIO = "MINIO"

class SourceType(enum.Enum):
    MAGNET = "MAGNET"
    TORRENT_FILE = "TORRENT_FILE"

# ---------------------------------------------------------
# MOVIES TABLE
# ---------------------------------------------------------
class Movie(Base):
    __tablename__ = "movies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    yts_id = Column(Integer, unique=True, nullable=False)
    
    title = Column(String, nullable=False)
    title_long = Column(String)
    release_year = Column(Integer, nullable=False)
    rating = Column(Float)
    runtime_minutes = Column(Integer)
    description = Column(String)
    genres = Column(ARRAY(String))
    language = Column(String)
    mpa_rating = Column(String)

    yts_poster_url = Column(String, nullable=False)
    minio_poster_path = Column(String)
    yts_background_image_url = Column(String)
    minio_background_image_path = Column(String)

    imdb_code = Column(String)
    date_uploaded = Column(DateTime(timezone=True))

    # --- NEW FIELDS ---
    is_new_release = Column(Boolean, default=False)
    is_popular = Column(Boolean, default=False)
    
    last_checked_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    torrents = relationship("Torrent", back_populates="movie", cascade="all, delete-orphan")
    downloads = relationship("Download", back_populates="movie", cascade="all, delete-orphan")
    playbacks = relationship("UserPlayback", back_populates="movie", cascade="all, delete-orphan")
    directors = relationship("MovieDirector", back_populates="movie", cascade="all, delete-orphan")
    cast = relationship("MovieCast", back_populates="movie", cascade="all, delete-orphan")
    watch_history_entries = relationship("WatchHistory", back_populates="movie", cascade="all, delete-orphan")
    favorites = relationship("UserFavorite", back_populates="movie", cascade="all, delete-orphan")
    comments = relationship("MovieComment", back_populates="movie", cascade="all, delete-orphan")

    __table_args__ = (
        Index("yts_id_idx", "yts_id"),
        Index("title_idx", "title"),
    )

# ---------------------------------------------------------
# MOVIE DIRECTORS TABLE (NEW)
# ---------------------------------------------------------
class MovieDirector(Base):
    __tablename__ = "movie_directors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    movie_id = Column(UUID(as_uuid=True), ForeignKey("movies.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    image_url = Column(String)

    movie = relationship("Movie", back_populates="directors")

    __table_args__ = (
        Index("director_movie_id_idx", "movie_id"),
    )

# ---------------------------------------------------------
# MOVIE CAST TABLE (NEW)
# ---------------------------------------------------------
class MovieCast(Base):
    __tablename__ = "movie_cast"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    movie_id = Column(UUID(as_uuid=True), ForeignKey("movies.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    character_name = Column(String)
    image_url = Column(String)
    imdb_code = Column(String)

    movie = relationship("Movie", back_populates="cast")

    __table_args__ = (
        Index("cast_movie_id_idx", "movie_id"),
    )

# ---------------------------------------------------------
# TORRENTS TABLE
# ---------------------------------------------------------
class Torrent(Base):
    __tablename__ = "torrents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    movie_id = Column(UUID(as_uuid=True), ForeignKey("movies.id", ondelete="CASCADE"), nullable=False)

    quality = Column(String, nullable=False)
    type = Column(String, nullable=False)
    is_repack = Column(Boolean, default=False)
    is_proper = Column(Boolean, default=False)

    file_size_bytes = Column(BigInteger)
    file_size_human = Column(String)

    torrent_hash = Column(String, unique=True, nullable=False)
    torrent_file_url = Column(String, nullable=False)
    minio_torrent_path = Column(String)

    seeds = Column(Integer, default=0)
    peers = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    movie = relationship("Movie", back_populates="torrents")
    downloads = relationship("Download", back_populates="torrent")

    __table_args__ = (
        UniqueConstraint("movie_id", "quality", "type", name="movieQualityUnique"),
        Index("torrent_hash_idx", "torrent_hash"),
    )

# ---------------------------------------------------------
# DOWNLOADS TABLE
# ---------------------------------------------------------
class Download(Base):
    __tablename__ = "downloads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    torrent_id = Column(UUID(as_uuid=True), ForeignKey("torrents.id", ondelete="RESTRICT"), nullable=False)
    movie_id = Column(UUID(as_uuid=True), ForeignKey("movies.id", ondelete="CASCADE"), nullable=False)
    session_id = Column(UUID(as_uuid=True), unique=True, nullable=False)

    source_type = Column(Enum(SourceType, name="source_type"), nullable=False)
    source_uri = Column(String, nullable=False)

    state = Column(Enum(DownloadState, name="download_state"), default=DownloadState.IDLE, nullable=False)
    progress = Column(Float, default=0.0, nullable=False)
    downloaded_bytes = Column(BigInteger, default=0)
    total_bytes = Column(BigInteger, default=0)
    error_message = Column(String)

    storage_provider = Column(Enum(StorageProvider, name="storage_provider"), default=StorageProvider.NONE)
    local_path = Column(String)

    video_codec = Column(String)
    audio_codec = Column(String)
    audio_channels = Column(String)
    resolution_width = Column(Integer)
    resolution_height = Column(Integer)
    duration_seconds = Column(Integer)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    movie = relationship("Movie", back_populates="downloads")
    torrent = relationship("Torrent", back_populates="downloads")
    subtitles = relationship("Subtitle", back_populates="download", cascade="all, delete-orphan")

# ---------------------------------------------------------
# SUBTITLES TABLE
# ---------------------------------------------------------
class Subtitle(Base):
    __tablename__ = "subtitles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    download_id = Column(UUID(as_uuid=True), ForeignKey("downloads.id", ondelete="CASCADE"), nullable=False)

    language_code = Column(String, nullable=False)
    language_name = Column(String)
    is_forced = Column(Boolean, default=False)
    is_sdh = Column(Boolean, default=False)
    original_filename = Column(String)
    minio_path = Column(String, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    download = relationship("Download", back_populates="subtitles")

# ---------------------------------------------------------
# USER PLAYBACKS TABLE
# ---------------------------------------------------------
class UserPlayback(Base):
    __tablename__ = "user_playbacks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False)
    download_id = Column(UUID(as_uuid=True), ForeignKey("downloads.id", ondelete="CASCADE"), nullable=False)
    movie_id = Column(UUID(as_uuid=True), ForeignKey("movies.id", ondelete="CASCADE"), nullable=False)
    
    last_watched_seconds = Column(Float, default=0)
    
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    movie = relationship("Movie", back_populates="playbacks")

    __table_args__ = (
        UniqueConstraint("user_id", "download_id", name="user_download_unq"),
    )

class WatchHistory(Base):
    __tablename__ = "watch_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False)
    movie_id = Column(UUID(as_uuid=True), ForeignKey("movies.id", ondelete="CASCADE"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    movie = relationship("Movie", back_populates="watch_history_entries")

    __table_args__ = (
        Index("wh_user_movie_idx", "user_id", "movie_id"),
    )

class UserFavorite(Base):
    __tablename__ = "user_favorites"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False)
    movie_id = Column(UUID(as_uuid=True), ForeignKey("movies.id", ondelete="CASCADE"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    movie = relationship("Movie", back_populates="favorites")

    __table_args__ = (
        UniqueConstraint("user_id", "movie_id", name="fav_user_movie_unq"),
        Index("fav_user_id_idx", "user_id"),
    )

class MovieComment(Base):
    __tablename__ = "movie_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    movie_id = Column(UUID(as_uuid=True), ForeignKey("movies.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, nullable=False)
    username = Column(String, nullable=False)
    content = Column(String, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    movie = relationship("Movie", back_populates="comments")

    __table_args__ = (
        Index("comment_movie_id_idx", "movie_id"),
        Index("comment_created_at_idx", "created_at"),
    )
