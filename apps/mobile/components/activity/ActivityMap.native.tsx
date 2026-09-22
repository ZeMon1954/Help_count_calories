import { forwardRef, useImperativeHandle, useRef } from 'react';
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps';

export interface ActivityMapHandle {
  centerOn(coordinate: LatLng): void;
}

export { type LatLng };

export const ActivityMap = forwardRef<ActivityMapHandle, {
  location: LatLng;
  route: LatLng[];
  following: boolean;
}>(({ location, route, following }, ref) => {
  const map = useRef<MapView>(null);
  useImperativeHandle(ref, () => ({
    centerOn(coordinate) {
      map.current?.animateCamera({ center: coordinate }, { duration: 220 });
    },
  }));
  return <MapView
    ref={map}
    style={{ flex: 1 }}
    initialRegion={{
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    }}
    showsUserLocation
    followsUserLocation={following}
    showsCompass={false}
    toolbarEnabled={false}
  >
    {route.length > 1 ? <Polyline coordinates={route} strokeColor="#10b981" strokeWidth={6} lineCap="round" lineJoin="round" /> : null}
    {route[0] ? <Marker coordinate={route[0]} pinColor="#0f172a" /> : null}
  </MapView>;
});

ActivityMap.displayName = 'ActivityMap';
