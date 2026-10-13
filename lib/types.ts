export type TournamentFormat = "single" | "double";
export type TournamentStatus = "active" | "completed";
export type TournamentType = "league" | "knockout";

export type Tournament = {
  id: string;
  slug: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  /** Missing on tournaments created before knockout support: treat as "league". */
  type?: TournamentType;
  owner_id: string;
  created_at: string;
};

export type Team = {
  id: string;
  tournament_id: string;
  name: string;
};

export type Match = {
  id: string;
  tournament_id: string;
  round: number;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  played: boolean;
  played_at: string | null;
  published: boolean;
};

export type StandingRow = {
  rank: number;
  teamId: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
};
