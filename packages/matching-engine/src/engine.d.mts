export type Dimension =
  | 'skills'
  | 'ratings'
  | 'jobs'
  | 'credentials'
  | 'reliability'
  | 'proximity'
  | 'response'
  | 'recommendations';
export type Weights = Record<Dimension, number>;
export type Candidate = {
  id: string;
  verification: string;
  available: boolean;
  suspended: boolean;
  categories: string[];
  distanceKm: number;
  radiusKm: number;
  capacity: number;
  features: Partial<Record<Dimension, number>>;
};
export type RankedProvider = {
  id: string;
  version: string;
  score: number;
  components: Record<Dimension, { value: number | null; contribution: number }>;
  explanation: string;
};
export const defaultWeights: Readonly<Weights>;
export function rank(
  candidates: Candidate[],
  category: string,
  weights?: Weights,
): RankedProvider[];
