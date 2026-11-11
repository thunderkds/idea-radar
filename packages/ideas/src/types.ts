// Hand-written to match ideas/schema.json (schema_version 1). A test validates the example file against both.

export const SCHEMA_VERSION = 1;

export type SignalKind = "repo" | "article" | "post" | "discussion" | "other";

export interface Signal {
  kind: SignalKind;
  url: string;
  note: string;
}

export interface Idea {
  id: string;
  title: string;
  summary: string;
  why_now?: string;
  tags: string[];
  signals: Signal[];
  related_repos: string[];
}

export interface IdeaFile {
  schema_version: 1;
  date: string;
  routine: string;
  ideas: Idea[];
}
