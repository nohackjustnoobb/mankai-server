export enum Genre {
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

export const GENRE_OPTIONS: { value: Genre; label: string }[] = [
  { value: Genre.All, label: "All" },
  { value: Genre.Action, label: "Action" },
  { value: Genre.Romance, label: "Romance" },
  { value: Genre.Yuri, label: "Yuri" },
  { value: Genre.BoysLove, label: "Boys Love" },
  { value: Genre.SchoolLife, label: "School Life" },
  { value: Genre.Adventure, label: "Adventure" },
  { value: Genre.Harem, label: "Harem" },
  { value: Genre.SpeculativeFiction, label: "Speculative Fiction" },
  { value: Genre.War, label: "War" },
  { value: Genre.Suspense, label: "Suspense" },
  { value: Genre.FanFiction, label: "Fan Fiction" },
  { value: Genre.Comedy, label: "Comedy" },
  { value: Genre.Magic, label: "Magic" },
  { value: Genre.Horror, label: "Horror" },
  { value: Genre.Historical, label: "Historical" },
  { value: Genre.Sports, label: "Sports" },
  { value: Genre.Mature, label: "Mature" },
  { value: Genre.Mecha, label: "Mecha" },
  { value: Genre.Otokonoko, label: "Otokonoko" },
];

export type CreateGenre = Exclude<Genre, Genre.All>;

export const CREATE_GENRE_OPTIONS: { value: CreateGenre; label: string }[] =
  GENRE_OPTIONS.filter(
    (o): o is { value: CreateGenre; label: string } => o.value !== Genre.All,
  );

export enum Status {
  Any = 0,
  OnGoing = 1,
  Completed = 2,
}

export const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: Status.Any, label: "Any" },
  { value: Status.OnGoing, label: "Ongoing" },
  { value: Status.Completed, label: "Completed" },
];

export type CreateStatus = Exclude<Status, Status.Any>;

export const CREATE_STATUS_OPTIONS: { value: CreateStatus; label: string }[] =
  STATUS_OPTIONS.filter(
    (o): o is { value: CreateStatus; label: string } => o.value !== Status.Any,
  );

export enum ReadingDirection {
  LeftToRight = 1,
  RightToLeft = 2,
  Vertical = 3,
}

export const READING_DIRECTION_OPTIONS: {
  value: ReadingDirection;
  label: string;
}[] = [
  { value: ReadingDirection.LeftToRight, label: "Left to Right" },
  { value: ReadingDirection.RightToLeft, label: "Right to Left" },
  { value: ReadingDirection.Vertical, label: "Vertical" },
];
