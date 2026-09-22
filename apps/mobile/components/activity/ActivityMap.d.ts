export type LatLng = { latitude: number; longitude: number };
export interface ActivityMapHandle { centerOn(coordinate: LatLng): void }
export const ActivityMap: import('react').ForwardRefExoticComponent<{
  location: LatLng;
  route: LatLng[];
  following: boolean;
} & import('react').RefAttributes<ActivityMapHandle>>;
