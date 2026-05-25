import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import styles from './LeafletMap.module.scss';

const LNG = 7.2607;
const LAT = 43.7006;

const TILE_URL = 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png';
const ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

export function LeafletMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [LAT, LNG],
      zoom: 16,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    L.tileLayer(TILE_URL, {
      attribution: ATTRIBUTION,
      maxZoom: 20,
    }).addTo(map);

    const markerIcon = L.divIcon({
      className: '',
      html: `<div class="${styles.marker}"><span class="${styles.markerPin}"></span><span class="${styles.markerPulse}"></span></div>`,
      iconSize: [32, 40],
      iconAnchor: [16, 40],
      popupAnchor: [0, -42],
    });

    L.marker([LAT, LNG], { icon: markerIcon })
      .bindPopup(`
        <div class="${styles.popup}">
          <div class="${styles.popupTitle}">ТЕТ·А·ТЕТ</div>
          <div class="${styles.popupAddr}">24 Rue Rossini, Nice</div>
        </div>
      `, { className: styles.popupWrapper, maxWidth: 200 })
      .addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className={styles.map} />;
}
