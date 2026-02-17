# Mankai API Specification

To integrate your server with [mankai](https://github.com/nohackjustnoobb/mankai), it must follow this API specification. If you want to make your server compatible with the [mankai](https://github.com/nohackjustnoobb/mankai) in-app editor, you must also follow the [Mankai Editor API Specification](editor-api.md).

### Server Information

#### `GET` `/`

Retrieve information about the server.

**Response Body (200 OK):**

```ts
interface ServerInfoResponse {
  id: string;
  authenticationEnabled: boolean;
  editorEnabled?: boolean; // default: false
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

enum ReadingDirection {
  LeftToRight = 1,
  RightToLeft = 2,
  Vertical = 3,
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
  readingDirection?: ReadingDirection;
  latestChapter?: Chapter;
  description?: string;
  updatedAt?: number;
  authors: string[];
  genres: Genre[];
  chapters: Record<string, Chapter[]>;
  remarks: string;
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
