# Mankai API Specification

To integrate your server with [mankai](https://github.com/nohackjustnoobb/mankai), it must follow this API specification.

### Server Information

#### `GET` `/`

Retrieve information about the server.

**Response Body (200 OK):**

```ts
interface ServerInfoResponse {
  id: string;
  authenticationEnabled: boolean;
  name?: string;
  version?: string;
  description?: string;
  authors?: string[];
  repository?: string;
  availableGenres?: string[];
}
```

### Authentication (Optional)

If you want to enable authentication, you must implement the following endpoints.

> [!NOTE]
> When accessing any endpoint other than `/auth/*` and `/`, the client will include the `accessToken` in the `Authorization` header.

#### `POST` `/auth/login`

**Request Parameters:** None

**Request Body:**

```ts
interface LoginRequest {
  username: string;
  password: string;
}
```

**Response Body (200 OK):**

```ts
interface LoginResponse {
  message: string;
  user: {
    // User Details (Optional)
  };
  accessToken: string;
  refreshToken: string;
}
```

**Response Body (4xx Error):**

```ts
interface LoginErrorResponse {
  error: string;
}
```

#### `POST` `/auth/refresh`

**Request Parameters:** None

**Request Body:**

```ts
interface RefreshRequest {
  refreshToken: string;
}
```

**Response Body (200 OK):**

```ts
interface RefreshResponse {
  message: string;
  accessToken: string;
}
```

**Response Body (4xx Error):**

```ts
interface RefreshErrorResponse {
  error: string;
}
```

### Manga

#### `GET` `/manga`

Retrieve a list of manga.

**Request Parameters:**

| Parameter | Type     | Default   | Required | Description                                      |
| :-------- | :------- | :-------- | :------- | :----------------------------------------------- |
| `page`    | `number` | `1`       | No       | The page number to retrieve.                     |
| `genre`   | `string` | `"all"`   | No       | Filter by genre.                                 |
| `status`  | `number` | `0` (Any) | No       | Filter by status (0: Any, 1: OnGoing, 2: Ended). |

**Response Body (200 OK):**

```ts
enum Status {
  Any = 0,
  OnGoing = 1,
  Ended = 2,
}

interface Chapter {
  id: string;
  title?: string;
  locked?: boolean;
}

interface Manga {
  id: string;
  title?: string;
  cover?: string; // URL (absolute or relative to base URL)
  status?: Status;
  latestChapter?: Chapter;
}

type MangaListResponse = Manga[];
```

**Response Body (4xx Error):**

```ts
interface MangaListErrorResponse {
  error: string;
}
```

#### `POST` `/manga`

Retrieve details for a specific list of manga IDs.

**Request Parameters:** None

**Request Body:**

```ts
type MangaRequest = string[]; // An array of manga IDs
```

**Response Body (200 OK):**

```ts
enum Status {
  Any = 0,
  OnGoing = 1,
  Ended = 2,
}

interface Chapter {
  id: string;
  title?: string;
  locked?: boolean;
}

interface Manga {
  id: string;
  title?: string;
  cover?: string; // URL (absolute or relative to base URL)
  status?: Status;
  latestChapter?: Chapter;
}

type MangaListResponse = Manga[];
```

**Response Body (4xx Error):**

```ts
interface MangaErrorResponse {
  error: string;
}
```

#### `GET` `/manga/:id`

Retrieve details for a single manga.

**Request Parameters:** None (ID in path)

**Response Body (200 OK):**

```ts
enum Genre {
  All = "all",
  Action = "action",
  Romance = "romance",
  Yuri = "yuri",
  BoysLove = "boysLove",
  SchoolLife = "schoolLife",
  Adventure = "adventure",
  Harem = "harem",
  SpeculativeFiction = "speculativeFiction",
  War = "war",
  Suspense = "suspense",
  FanFiction = "fanFiction",
  Comedy = "comedy",
  Magic = "magic",
  Horror = "horror",
  Historical = "historical",
  Sports = "sports",
  Mature = "mature",
  Mecha = "mecha",
  Otokonoko = "otokonoko",
}

enum Status {
  Any = 0,
  OnGoing = 1,
  Ended = 2,
}

interface Chapter {
  id: string;
  title?: string;
  locked?: boolean;
}

interface MangaResponse {
  id: string;
  title?: string;
  cover?: string; // URL (absolute or relative to base URL)
  status?: Status;
  latestChapter?: Chapter;
  description?: string;
  updatedAt?: number;
  authors: string[];
  genres: Genre[];
  chapters: Record<string, Chapter[]>;
  remarks: string;
}
```

**Response Body (4xx Error):**

```ts
interface MangaErrorResponse {
  error: string;
}
```

#### `GET` `/manga/:id/chapter/:chapterId`

Retrieve pages for a specific chapter.

**Request Parameters:** None (ID and chapterId in path)

**Response Body (200 OK):**

```ts
// An array of URLs (absolute or relative to base URL)
type ChapterResponse = string[];
```

**Response Body (4xx Error):**

```ts
interface ChapterErrorResponse {
  error: string;
}
```

### Search

#### `GET` `/search`

Search for manga.

**Request Parameters:**

| Parameter | Type     | Default | Required | Description                  |
| :-------- | :------- | :------ | :------- | :--------------------------- |
| `query`   | `string` | `null`  | Yes      | The search query string.     |
| `page`    | `number` | `1`     | No       | The page number to retrieve. |

**Response Body (200 OK):**

```ts
enum Status {
  Any = 0,
  OnGoing = 1,
  Ended = 2,
}

interface Chapter {
  id: string;
  title?: string;
  locked?: boolean;
}

interface Manga {
  id: string;
  title?: string;
  cover?: string; // URL (absolute or relative to base URL)
  status?: Status;
  latestChapter?: Chapter;
}

type SearchResponse = Manga[];
```

**Response Body (4xx Error):**

```ts
interface SearchErrorResponse {
  error: string;
}
```

### Suggestion

#### `GET` `/suggestion`

Get search suggestions based on a query.

**Request Parameters:**

| Parameter | Type     | Default | Required | Description                              |
| :-------- | :------- | :------ | :------- | :--------------------------------------- |
| `query`   | `string` | `null`  | Yes      | The query string to get suggestions for. |

**Response Body (200 OK):**

```ts
type SuggestionResponse = string[]; // An array of manga titles
```

**Response Body (4xx Error):**

```ts
interface SuggestionErrorResponse {
  error: string;
}
```
