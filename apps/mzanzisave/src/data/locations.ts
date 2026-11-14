import type { Province } from './retailers';

export type AreaKind = 'township' | 'cbd' | 'suburb' | 'affluent';

export interface Suburb {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: AreaKind;
}

export interface City {
  id: string;
  name: string;
  province: Province;
  provinceName: string;
  suburbs: Suburb[];
}

const s = (id: string, name: string, lat: number, lng: number, kind: AreaKind): Suburb => ({ id, name, lat, lng, kind });

export const CITIES: City[] = [
  {
    id: 'jhb', name: 'Johannesburg', province: 'GP', provinceName: 'Gauteng',
    suburbs: [
      s('soweto', 'Soweto', -26.2485, 27.854, 'township'),
      s('jhb-cbd', 'Joburg CBD', -26.2041, 28.0473, 'cbd'),
      s('sandton', 'Sandton', -26.1076, 28.0567, 'affluent'),
      s('randburg', 'Randburg', -26.0936, 28.0064, 'suburb'),
      s('alex', 'Alexandra', -26.1036, 28.0975, 'township'),
      s('roodepoort', 'Roodepoort', -26.1625, 27.8725, 'suburb'),
    ],
  },
  {
    id: 'pta', name: 'Pretoria', province: 'GP', provinceName: 'Gauteng',
    suburbs: [
      s('pta-cbd', 'Pretoria CBD', -25.7479, 28.1879, 'cbd'),
      s('mamelodi', 'Mamelodi', -25.7085, 28.3946, 'township'),
      s('centurion', 'Centurion', -25.8603, 28.1894, 'affluent'),
      s('hatfield', 'Hatfield', -25.7487, 28.238, 'suburb'),
      s('soshanguve', 'Soshanguve', -25.5208, 28.0986, 'township'),
    ],
  },
  {
    id: 'cpt', name: 'Cape Town', province: 'WC', provinceName: 'Western Cape',
    suburbs: [
      s('cpt-cbd', 'Cape Town CBD', -33.9249, 18.4241, 'cbd'),
      s('khayelitsha', 'Khayelitsha', -34.0405, 18.6779, 'township'),
      s('mitchells', 'Mitchells Plain', -34.0496, 18.6181, 'township'),
      s('bellville', 'Bellville', -33.9022, 18.629, 'suburb'),
      s('claremont', 'Claremont', -33.9808, 18.4652, 'affluent'),
    ],
  },
  {
    id: 'dbn', name: 'Durban', province: 'KZN', provinceName: 'KwaZulu-Natal',
    suburbs: [
      s('dbn-cbd', 'Durban CBD', -29.8587, 31.0218, 'cbd'),
      s('umlazi', 'Umlazi', -29.97, 30.884, 'township'),
      s('pinetown', 'Pinetown', -29.817, 30.857, 'suburb'),
      s('umhlanga', 'Umhlanga', -29.7277, 31.0844, 'affluent'),
      s('phoenix', 'Phoenix', -29.7036, 30.9767, 'suburb'),
      s('chatsworth', 'Chatsworth', -29.91, 30.88, 'suburb'),
    ],
  },
  {
    id: 'gqb', name: 'Gqeberha', province: 'EC', provinceName: 'Eastern Cape',
    suburbs: [
      s('gqb-central', 'Central', -33.9608, 25.6022, 'cbd'),
      s('motherwell', 'Motherwell', -33.8148, 25.6, 'township'),
      s('walmer', 'Walmer', -33.98, 25.58, 'affluent'),
      s('new-brighton', 'New Brighton', -33.905, 25.61, 'township'),
    ],
  },
  {
    id: 'bfn', name: 'Bloemfontein', province: 'FS', provinceName: 'Free State',
    suburbs: [
      s('bfn-cbd', 'Bloemfontein CBD', -29.118, 26.214, 'cbd'),
      s('mangaung', 'Mangaung', -29.15, 26.27, 'township'),
      s('brandwag', 'Brandwag', -29.1, 26.19, 'suburb'),
      s('heidedal', 'Heidedal', -29.13, 26.26, 'township'),
    ],
  },
  {
    id: 'plk', name: 'Polokwane', province: 'LP', provinceName: 'Limpopo',
    suburbs: [
      s('plk-cbd', 'Polokwane CBD', -23.9045, 29.4689, 'cbd'),
      s('seshego', 'Seshego', -23.85, 29.3833, 'township'),
      s('bendor', 'Bendor', -23.88, 29.49, 'affluent'),
      s('mankweng', 'Mankweng', -23.8833, 29.7167, 'township'),
    ],
  },
  {
    id: 'mbo', name: 'Mbombela', province: 'MP', provinceName: 'Mpumalanga',
    suburbs: [
      s('mbo-cbd', 'Mbombela CBD', -25.4753, 30.9694, 'cbd'),
      s('kanyamazane', 'KaNyamazane', -25.4667, 31.1667, 'township'),
      s('riverside', 'Riverside', -25.44, 30.96, 'suburb'),
      s('white-river', 'White River', -25.33, 31.01, 'suburb'),
    ],
  },
];

export const CITY_BY_ID: Record<string, City> = Object.fromEntries(CITIES.map((c) => [c.id, c]));

export function findSuburb(cityId: string, suburbId: string): Suburb {
  const city = CITY_BY_ID[cityId] ?? CITIES[0];
  return city.suburbs.find((x) => x.id === suburbId) ?? city.suburbs[0];
}

/** Great-circle distance in km. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
