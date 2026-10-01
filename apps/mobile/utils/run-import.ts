export interface RunInputs {
  distanceKm: string;
  hours: string;
  minutes: string;
  seconds: string;
}

export type RunInputError = 'distance' | 'duration' | 'speed' | null;

export const durationParts = (totalSeconds: number) => ({
  hours: String(Math.floor(totalSeconds / 3600)),
  minutes: String(Math.floor((totalSeconds % 3600) / 60)),
  seconds: String(totalSeconds % 60),
});

/** Mirrors the API limits so obvious typos are caught before the request. */
export function parseRunInputs(inputs: RunInputs) {
  const distanceKm = Number(inputs.distanceKm.replace(',', '.'));
  const durationSeconds =
    Number(inputs.hours || 0) * 3600 +
    Number(inputs.minutes || 0) * 60 +
    Number(inputs.seconds || 0);
  let error: RunInputError = null;
  if (!Number.isFinite(distanceKm) || distanceKm < 0.1 || distanceKm > 100)
    error = 'distance';
  else if (
    !Number.isInteger(durationSeconds) ||
    durationSeconds < 60 ||
    durationSeconds > 86_400
  )
    error = 'duration';
  else if (distanceKm * 1000 / durationSeconds > 12) error = 'speed';
  return {
    error,
    distanceM: Math.round(distanceKm * 1000),
    durationSeconds,
  };
}
