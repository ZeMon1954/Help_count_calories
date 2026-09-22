import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export type LatLng = { latitude: number; longitude: number };
export interface ActivityMapHandle {
  centerOn(coordinate: LatLng): void;
}

export const ActivityMap = forwardRef<ActivityMapHandle, {
  location: LatLng;
  route: LatLng[];
  following: boolean;
}>(({ location, route, following }, ref) => {
  const element = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const userMarker = useRef<L.CircleMarker | null>(null);
  const trail = useRef<L.Polyline | null>(null);

  useImperativeHandle(ref, () => ({
    centerOn(coordinate) {
      map.current?.panTo([coordinate.latitude, coordinate.longitude]);
    },
  }));

  useEffect(() => {
    if (!element.current || map.current) return;
    const instance = L.map(element.current, { zoomControl: false }).setView(
      [location.latitude, location.longitude],
      17,
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(instance);
    L.control.zoom({ position: 'topright' }).addTo(instance);
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
    };
  }, [location.latitude, location.longitude]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const point: L.LatLngExpression = [location.latitude, location.longitude];
    if (!userMarker.current) {
      userMarker.current = L.circleMarker(point, {
        radius: 9,
        color: '#ffffff',
        weight: 3,
        fillColor: '#10b981',
        fillOpacity: 1,
      }).addTo(instance);
    } else userMarker.current.setLatLng(point);
    if (following) instance.panTo(point, { animate: true, duration: 0.2 });
  }, [following, location.latitude, location.longitude]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const points = route.map((point) => [point.latitude, point.longitude] as L.LatLngTuple);
    if (!trail.current) {
      trail.current = L.polyline(points, { color: '#10b981', weight: 6, opacity: 0.95 }).addTo(instance);
    } else trail.current.setLatLngs(points);
  }, [route]);

  return <div ref={element} style={{ width: '100%', height: '100%', backgroundColor: '#0f172a' }} />;
});

ActivityMap.displayName = 'ActivityMap';
