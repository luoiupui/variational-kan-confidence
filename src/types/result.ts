export interface ResultFigure {
  file: string;
  caption?: string;
}

export interface ResultRun {
  id: string;
  title: string;
  date: string;
  description?: string;
  dataset?: string;
  sequence?: string;
  tags?: string[];
  metrics?: Record<string, number>;
  figures?: ResultFigure[];
  series?: string;
  error?: string;
}

export interface ResultsIndex {
  generatedAt: string;
  runs: ResultRun[];
}

export const RESULTS_DATA_PREFIX = "/results-data";

export function figureUrl(runId: string, file: string): string {
  return `${RESULTS_DATA_PREFIX}/${encodeURIComponent(runId)}/${encodeURIComponent(file)}`;
}

export function seriesUrl(runId: string, file: string): string {
  return figureUrl(runId, file);
}