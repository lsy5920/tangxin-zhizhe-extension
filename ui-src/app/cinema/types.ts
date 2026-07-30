export type CinemaOrientation = "landscape" | "portrait" | "square";
export type CinemaAccess = "free" | "vip" | "coin";
export type CinemaCatalogMode = "discover" | "browse" | "search";
export type CinemaCatalogPhase = "idle" | "loading" | "loading-more" | "ready" | "error";

export type CinemaMovie = {
  id: string;
  title: string;
  posterUrl: string;
  creator: string;
  avatarUrl?: string;
  durationSeconds: number;
  durationLabel: string;
  orientation: CinemaOrientation;
  access: CinemaAccess;
  price: number;
  views?: string;
  likes?: string;
  favorites?: string;
  score?: string;
  publishedAt?: string;
  badge?: string;
  isCollection?: boolean;
};

export type CinemaCatalogFilters = {
  order?: string;
  pay_type?: string;
  canvas?: string;
  tag_id?: string;
  cat_id?: string;
  position?: string;
};

export type CinemaSection = {
  id: string;
  title: string;
  filter: CinemaCatalogFilters;
  items: CinemaMovie[];
};

export type CinemaCatalogState = {
  schemaVersion?: number;
  mode?: CinemaCatalogMode;
  phase?: CinemaCatalogPhase;
  requestId?: string;
  query?: string;
  queryKey?: string;
  filters?: CinemaCatalogFilters;
  sections?: CinemaSection[];
  items?: CinemaMovie[];
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  fetchedAt?: string;
  error?: string;
};

export type CinemaCollectionState = {
  phase?: "idle" | "loading" | "ready" | "error";
  requestId?: string;
  parentMovieId?: string;
  title?: string;
  items?: CinemaMovie[];
  fetchedAt?: string;
  error?: string;
};
