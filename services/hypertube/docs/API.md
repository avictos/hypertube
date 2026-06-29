# Hypertube REST API

A RESTful API, secured with OAuth2 (bearer tokens), for retrieving basic
information about users, movies, and comments.

## Base URL

All spec'd endpoints are reachable from a single base URL — the Next.js
gateway, which proxies user/auth-related calls to the auth service
internally:

```
http://localhost:3000
```

(The auth service also listens directly on `http://localhost:3333`, under
`/api/v1/...` — useful for debugging, but API consumers should use the
gateway above.)

## Authentication

Every endpoint below requires a valid **Bearer token** in the
`Authorization` header, **except `POST /oauth/token`** itself, which is how
a client without a token obtains one.

```
Authorization: Bearer <access_token>
```

A browser session (the website's own `__session` cookie, set on login) is
verified through the exact same check, so the same routes serve both the
website's own frontend and external API clients.

Any request to a protected endpoint without a valid token returns:

```json
401 Unauthorized
{ "error": "Unauthorized" }
```

Any call to a path that isn't one of the routes documented below returns
a `404 Not Found` (or a redirect to `/login` for an unauthenticated browser
navigation to an unknown page).

---

## `POST /oauth/token`

Exchanges credentials for an access token. No `Authorization` header
required — this is the one public endpoint.

**Body** — one of two grants:

| Grant | `client` | `secret` |
|---|---|---|
| Resource-owner password | account's email or username | account password |
| Client credentials | a `client_id` (from a registered API client, prefixed `client_`) | the client's secret |

```json
{ "client": "someone@example.com", "secret": "their-password" }
```

**Response — `200 OK`**

```json
{ "access_token": "<jwt>", "token_type": "Bearer", "expires_in": 900 }
```

**Errors**

| Status | Code | When |
|---|---|---|
| 401 | `OAUTH_INVALID_CREDENTIALS` | Unknown client, or wrong secret |
| 401 | `AUTH_EMAIL_NOT_VERIFIED` | Account exists but its email isn't verified yet |

---

## `GET /users`

Returns every user's id and username.

**Response — `200 OK`**

```json
{
  "status": "success",
  "users": [{ "id": "uuid", "username": "string" }, ...]
}
```

---

## `GET /users/:id`

Returns a user's public profile. The **email address and preferred
language are only included when the requester is viewing their own
profile** — otherwise they're omitted entirely.

**Response — `200 OK`**

```json
{
  "status": "success",
  "user": {
    "id": "uuid",
    "username": "string",
    "profilePictureUrl": "string | null",
    "email": "string",            // only present when requester === :id
    "preferredLanguage": "string"  // only present when requester === :id
  }
}
```

**Errors**: `404` `USER_NOT_FOUND` if no such user.

---

## `PATCH /users/:id`

Updates the authenticated user's own profile. **Always returns `403` if
`:id` doesn't match the requester's own id** — there is no path by which
one user can modify another's profile.

**Body** (all optional, at least one required):

| Field | Notes |
|---|---|
| `username` | 2–20 chars, letters/numbers/underscores only, must be unique |
| `email` | must be unique |
| `password` | min length + must contain upper, lower, digit, and special char |
| `profilePictureUrl` | a URL |
| `preferredLanguage` | one of `en es fr de it pt ar hi ja ko zh ru tr` |

**Response — `200 OK`**: same shape as `GET /users/:id` (with email +
preferredLanguage included, since the requester is always the owner here).

**Errors**

| Status | Code | When |
|---|---|---|
| 403 | `USER_FORBIDDEN` | `:id` is not the requester's own id |
| 409 | `USERNAME_EXISTS` / `EMAIL_EXISTS` | New username/email already taken by someone else |

---

## `GET /movies`

Returns the movies available on the front page.

**Query params** (all optional): `page`, `pageSize`, `search`, `genres`
(comma-separated), `language`, `yearFrom`, `yearTo`, `ratingMin`,
`ratingMax`, `durMin`, `durMax`, `sort` (`year` \| `rating` \| `title`),
`mode` (`new-releases` \| `popular`).

**Response — `200 OK`**

```json
{
  "movies": [
    { "id": "uuid", "name": "string", "title": "string", "...": "all other movie columns" }
  ],
  "total": 123,
  "page": 1,
  "pageSize": 30,
  "pages": 5
}
```

---

## `GET /movies/:id`

Returns everything collected about a single movie — including the
metadata it was a separate endpoint to retrieve previously (cast,
directors, available subtitles, comment count). Movie metadata is
refreshed from YTS automatically if it's more than 24h stale.

**Response — `200 OK`**

```json
{
  "id": "uuid",
  "name": "string",
  "title": "string",
  "imdbRating": 7.8,
  "releaseYear": 2021,
  "runtimeMinutes": 148,
  "imdbCode": "string",
  "directors": ["string"],
  "cast": ["string"],
  "subtitles": [{ "languageCode": "en", "languageName": "English" }],
  "commentsCount": 4,
  "...": "all other movie columns"
}
```

**Errors**: `404` if the movie doesn't exist.

> Note: this same URL also serves the movie-player web page when visited
> from a browser (content negotiation on the `Accept` header) — API
> clients get this JSON, browsers get the HTML page.

---

## `GET /comments`

Returns the latest comments across all movies (or, with `?movie_id=`,
just that movie's comments).

**Response — `200 OK`**

```json
[
  { "id": "uuid", "username": "string", "userId": "uuid", "content": "string", "date": "ISO 8601" }
]
```

---

## `GET /comments/:id`

**Response — `200 OK`**: a single comment, same shape as above.
**Errors**: `404` if not found.

---

## `PATCH /comments/:id`

Updates a comment's text. Only the comment's author may do this.

**Body**: `{ "comment": "new text" }`

**Response — `200 OK`**: the updated comment, same shape as `GET /comments/:id`.

**Errors**: `403` if the requester isn't the comment's author; `404` if not found.

---

## `DELETE /comments/:id`

Deletes a comment. Only the comment's author may do this.

**Response — `200 OK`**: `{ "success": true, "message": "Comment deleted" }`
**Errors**: `403` if the requester isn't the comment's author; `404` if not found.

---

## `POST /comments` or `POST /movies/:movie_id/comments`

Posts a new comment. `id`, author identity, and timestamp are always
filled in server-side from the authenticated requester — they cannot be
supplied in the body.

**Body**:
- `POST /comments`: `{ "comment": "text", "movie_id": "uuid" }`
- `POST /movies/:movie_id/comments`: `{ "comment": "text" }` (movie id comes from the URL)

**Response — `201 Created`**: the new comment, same shape as `GET /comments/:id`.

**Errors**: `400` if `comment` (or `movie_id`, for the bare form) is missing.
