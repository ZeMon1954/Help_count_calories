import type { ActivityPointInput, ActivityType } from '../schemas/activity.js';

const EARTH_RADIUS_M = 6_371_000;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function distanceMeters(a: ActivityPointInput, b: ActivityPointInput) {
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) *
      Math.cos(latitudeB) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(haversine));
}

export function calculateActivity(
  type: ActivityType,
  source: ActivityPointInput[],
  weightKg = 70,
) {
  const points = [...source]
    .filter((point) => point.accuracy_m === null || point.accuracy_m <= 50)
    .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  let distanceM = 0;
  let movingSeconds = 0;
  let elevationGainM = 0;
  const accepted: ActivityPointInput[] = points.length ? [points[0]!] : [];
  const maximumSpeed = type === 'cycle' ? 35 : type === 'run' ? 12 : 5;
  for (let index = 1; index < points.length; index += 1) {
    const previous = accepted.at(-1)!;
    const point = points[index]!;
    const seconds =
      (Date.parse(point.recorded_at) - Date.parse(previous.recorded_at)) / 1000;
    if (seconds <= 0) continue;
    // A long gap normally means the user paused tracking. Keep the new point
    // as the next route anchor without counting the gap or drawing a jump.
    if (seconds > 120) {
      accepted.push(point);
      continue;
    }
    const segment = distanceMeters(previous, point);
    if (segment / seconds > maximumSpeed) continue;
    accepted.push(point);
    distanceM += segment;
    if (segment / seconds >= 0.5) movingSeconds += seconds;
    if (
      point.altitude_m !== null &&
      previous.altitude_m !== null &&
      point.altitude_m - previous.altitude_m > 1
    )
      elevationGainM += point.altitude_m - previous.altitude_m;
  }
  const elapsedSeconds = accepted.length
    ? Math.max(
        0,
        Math.round(
          (Date.parse(accepted.at(-1)!.recorded_at) -
            Date.parse(accepted[0]!.recorded_at)) /
            1000,
        ),
      )
    : 0;
  const averageSpeedMps = movingSeconds ? distanceM / movingSeconds : null;
  const averagePaceSecondsPerKm = distanceM
    ? Math.round(movingSeconds / (distanceM / 1000))
    : null;
  const met = type === 'run' ? 8 : type === 'cycle' ? 6.8 : 3.5;
  const calories = met * Math.max(30, weightKg) * (movingSeconds / 3600);
  return {
    accepted,
    elapsedSeconds,
    movingSeconds: Math.round(movingSeconds),
    distanceM: Math.round(distanceM * 100) / 100,
    elevationGainM: Math.round(elevationGainM * 100) / 100,
    averageSpeedMps:
      averageSpeedMps === null
        ? null
        : Math.round(averageSpeedMps * 1000) / 1000,
    averagePaceSecondsPerKm,
    calories: Math.round(calories * 100) / 100,
  };
}

// Running MET by speed (km/h), from the 2011 Compendium of Physical Activities.
// Calories scale with how fast the run was, not just how long it lasted.
const RUN_MET_BY_SPEED_KMH: readonly (readonly [number, number])[] = [
  [4.8, 3.5],
  [6.4, 6.0],
  [8.0, 8.3],
  [9.7, 9.8],
  [11.3, 11.0],
  [12.9, 11.8],
  [14.5, 12.8],
  [16.1, 14.5],
  [19.3, 19.0],
  [22.5, 23.0],
];

export function runMetForSpeed(speedKmh: number) {
  const table = RUN_MET_BY_SPEED_KMH;
  if (speedKmh <= table[0]![0]) return table[0]![1];
  for (let index = 1; index < table.length; index += 1) {
    const [upperSpeed, upperMet] = table[index]!;
    if (speedKmh > upperSpeed) continue;
    const [lowerSpeed, lowerMet] = table[index - 1]!;
    return (
      lowerMet +
      ((speedKmh - lowerSpeed) / (upperSpeed - lowerSpeed)) *
        (upperMet - lowerMet)
    );
  }
  return table.at(-1)![1];
}

/** Summary of a run recorded by another app (distance + moving time only). */
export function calculateImportedRun(
  distanceM: number,
  durationSeconds: number,
  weightKg = 70,
) {
  const speedMps = distanceM / durationSeconds;
  const met = runMetForSpeed(speedMps * 3.6);
  const calories = met * Math.max(30, weightKg) * (durationSeconds / 3600);
  return {
    met: Math.round(met * 100) / 100,
    averageSpeedMps: Math.round(speedMps * 1000) / 1000,
    averagePaceSecondsPerKm: Math.round(durationSeconds / (distanceM / 1000)),
    calories: Math.round(calories * 100) / 100,
  };
}
