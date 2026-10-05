import { Injectable } from '@angular/core';

export interface Place {
  label: string;
  latitude: number;
  longitude: number;
}

/**
 * Geocodes a place name with OpenStreetMap Nominatim (free, no key).
 * Nominatim's usage policy forbids search-as-you-type, so call this only on an explicit search.
 */
@Injectable({ providedIn: 'root' })
export class GeocodingService {
  async search(query: string): Promise<Place[]> {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '5');
    url.searchParams.set('addressdetails', '0');
    url.searchParams.set('accept-language', navigator.language || 'fr');

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const rows: { display_name: string; lat: string; lon: string }[] = await res.json();
    return rows.map((r) => ({
      label: r.display_name,
      latitude: Number(r.lat),
      longitude: Number(r.lon),
    }));
  }
}
