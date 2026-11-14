import { CITIES, distanceKm, type AreaKind, type City, type Suburb } from './locations';
import { RETAILERS, type Hours, type Retailer } from './retailers';
import { hash, pick } from '../lib/random';
import { clockSA, hhmm } from '../lib/date';

export interface Branch {
  id: string;
  retailerId: string;
  /** "Boxer Soweto" or "Mama Thandi's Grocer" */
  name: string;
  cityId: string;
  suburbId: string;
  suburbName: string;
  lat: number;
  lng: number;
  inMall: boolean;
  mallName?: string;
  nearTaxi: boolean;
  hours: Hours;
  /** Branches of a chain share prices; each independent grocer sets its own. */
  priceScope: string;
}

const MALLS: Record<string, string> = {
  soweto: 'Maponya Mall', 'jhb-cbd': 'Carlton Centre', sandton: 'Sandton City', randburg: 'Brightwater Commons', alex: 'Pan Africa Mall', roodepoort: 'Clearwater Mall',
  'pta-cbd': 'Sammy Marks Square', mamelodi: 'Mamelodi Crossing', centurion: 'Centurion Mall', hatfield: 'Hatfield Plaza', soshanguve: 'Soshanguve Crossing',
  'cpt-cbd': 'Golden Acre', khayelitsha: 'Khayelitsha Mall', mitchells: 'Promenade Mall', bellville: 'Bellville Centre', claremont: 'Cavendish Square',
  'dbn-cbd': 'The Workshop', umlazi: 'Umlazi Mega City', pinetown: 'Pine Crest Centre', umhlanga: 'Gateway', phoenix: 'Phoenix Plaza', chatsworth: 'Chatsworth Centre',
  'gqb-central': 'Greenacres', motherwell: 'Motherwell Shopping Centre', walmer: 'Walmer Park', 'new-brighton': 'Njoli Square',
  'bfn-cbd': 'Loch Logan Waterfront', mangaung: 'Twin City Mall', brandwag: 'Brandwag Centre', heidedal: 'Heidedal Plaza',
  'plk-cbd': 'Mall of the North', seshego: 'Seshego Plaza', bendor: 'Savannah Mall', mankweng: 'Paledi Mall',
  'mbo-cbd': "I'langa Mall", kanyamazane: 'KaNyamazane Mall', riverside: 'Riverside Mall', 'white-river': 'Casterbridge',
};

const LOCAL_NAMES = [
  "Mama Thandi's Grocer", 'Bismillah Superette', 'Corner Fresh Supermarket', 'Ekasi Value Store', 'Sizwe Wholesalers',
  'Ubuntu Grocers', 'Kwa-Mai Superette', 'Family Fresh Mart', 'Mzansi Mini Market', 'Siyakhula Foods', 'Pillay Supermarket',
  'Morena Cash Store', 'Tshwane Fresh Mart', 'Lekker Prys Kontant', 'Gogo Rose Spaza & Grocer',
];

/** Chance that a retailer has a branch in a suburb of this kind. */
function presence(r: Retailer, kind: AreaKind): number {
  if (r.id === 'woolworths') return { township: 0.08, cbd: 0.5, suburb: 0.6, affluent: 0.95 }[kind];
  if (r.id === 'makro') return 0; // placed once per city below
  if (r.id === 'boxer' || r.id === 'usave' || r.id === 'cambridge') return { township: 0.85, cbd: 0.7, suburb: 0.35, affluent: 0.05 }[kind];
  if (r.id === 'kitkat' || r.id === 'rhino') return { township: 0.6, cbd: 0.75, suburb: 0.4, affluent: 0.05 }[kind];
  if (r.id === 'roots' || r.id === 'choppies') return { township: 0.6, cbd: 0.6, suburb: 0.45, affluent: 0.2 }[kind];
  if (r.id === 'flm') return { township: 0.15, cbd: 0.3, suburb: 0.6, affluent: 0.8 }[kind];
  if (r.id === 'shoprite') return { township: 0.95, cbd: 0.9, suburb: 0.6, affluent: 0.3 }[kind];
  if (r.id === 'checkers' || r.id === 'pnp') return { township: 0.6, cbd: 0.65, suburb: 0.85, affluent: 0.95 }[kind];
  if (r.id === 'spar') return { township: 0.45, cbd: 0.5, suburb: 0.8, affluent: 0.75 }[kind];
  if (r.id === 'okfoods') return { township: 0.45, cbd: 0.4, suburb: 0.45, affluent: 0.1 }[kind];
  return 0.5;
}

function offset(key: string, lat: number, lng: number, minKm: number, maxKm: number) {
  const angle = hash(key + ':a') * Math.PI * 2;
  const dist = minKm + hash(key + ':d') * (maxKm - minKm);
  const dLat = (dist / 111) * Math.cos(angle);
  const dLng = (dist / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
  return { lat: lat + dLat, lng: lng + dLng };
}

function makeBranch(r: Retailer, city: City, sub: Suburb, n: number, nameOverride?: string): Branch {
  const id = `${r.id}-${sub.id}${n ? '-' + n : ''}`;
  const pos = offset(id, sub.lat, sub.lng, 0.2, n ? 3.2 : 1.8);
  const inMall = !!MALLS[sub.id] && hash(id + ':mall') < r.mallChance * (n ? 0.3 : 1);
  const taxiBoost = sub.kind === 'township' || sub.kind === 'cbd' ? 1.15 : 0.6;
  const nearTaxi = hash(id + ':taxi') < Math.min(0.95, r.taxiChance * taxiBoost);
  const name = nameOverride ?? (inMall ? `${r.name} ${MALLS[sub.id]}` : `${r.name} ${sub.name}${n ? ' ' + ['', 'North', 'South', 'Central'][n] : ''}`);
  return {
    id, retailerId: r.id, name, cityId: city.id, suburbId: sub.id, suburbName: sub.name,
    lat: pos.lat, lng: pos.lng, inMall, mallName: inMall ? MALLS[sub.id] : undefined, nearTaxi,
    hours: r.hours, priceScope: r.tier === 'independent' ? id : r.id,
  };
}

function generate(): Branch[] {
  const out: Branch[] = [];
  for (const city of CITIES) {
    for (const sub of city.suburbs) {
      for (const r of RETAILERS) {
        if (!r.provinces.includes(city.province) || r.tier === 'independent') continue;
        if (hash(`${r.id}|${sub.id}`) < presence(r, sub.kind)) out.push(makeBranch(r, city, sub, 0));
      }
      // One or two independent neighbourhood grocers per suburb.
      const local = RETAILERS.find((r) => r.tier === 'independent')!;
      const count = sub.kind === 'affluent' ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const name = pick(`${sub.id}:local:${i}`, LOCAL_NAMES);
        out.push(makeBranch(local, city, sub, i, `${name}${i && name === pick(`${sub.id}:local:0`, LOCAL_NAMES) ? ' 2' : ''}`));
      }
    }
    // Makro: one warehouse store per city, on the suburban edge.
    const makro = RETAILERS.find((r) => r.id === 'makro')!;
    const host = city.suburbs.find((x) => x.kind === 'suburb') ?? city.suburbs[0];
    out.push(makeBranch(makro, city, host, 0));
    // Every city gets a Shoprite and a Checkers somewhere so comparisons always have anchors.
    for (const rid of ['shoprite', 'checkers', 'pnp']) {
      if (!out.some((b) => b.cityId === city.id && b.retailerId === rid)) {
        out.push(makeBranch(RETAILERS.find((r) => r.id === rid)!, city, city.suburbs[0], 0));
      }
    }
  }
  return out;
}

export const BRANCHES: Branch[] = generate();
export const BRANCH_BY_ID: Record<string, Branch> = Object.fromEntries(BRANCHES.map((b) => [b.id, b]));

export interface AreaFilter {
  cityId: string;
  suburbId: string;
  radiusKm: number;
  nearTaxi: boolean;
  inMall: boolean;
  openNow: boolean;
}

export interface NearbyBranch extends Branch {
  distanceKm: number;
}

export function nearbyBranches(f: AreaFilter, now: number = Date.now()): NearbyBranch[] {
  const city = CITIES.find((c) => c.id === f.cityId) ?? CITIES[0];
  const sub = city.suburbs.find((x) => x.id === f.suburbId) ?? city.suburbs[0];
  return BRANCHES.filter((b) => b.cityId === city.id)
    .map((b) => ({ ...b, distanceKm: distanceKm(sub.lat, sub.lng, b.lat, b.lng) }))
    .filter((b) => b.distanceKm <= f.radiusKm)
    .filter((b) => (!f.nearTaxi && !f.inMall) || (f.nearTaxi && b.nearTaxi) || (f.inMall && b.inMall))
    .filter((b) => !f.openNow || openStatus(b.hours, now).open)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export interface OpenStatus {
  open: boolean;
  label: string;
  closingSoon: boolean;
}

function hoursFor(hours: Hours, weekday: number): [number, number] | null {
  if (weekday === 0) return hours.sun;
  if (weekday === 6) return hours.sat;
  return hours.weekday;
}

/** "Open · closes 20:00", "Closes soon · 19:30", "Closed · opens 08:00" (SAST). */
export function openStatus(hours: Hours, now: number = Date.now()): OpenStatus {
  const { minutes, weekday } = clockSA(now);
  const today = hoursFor(hours, weekday);
  if (today && minutes >= today[0] && minutes < today[1]) {
    const soon = today[1] - minutes <= 60;
    return { open: true, closingSoon: soon, label: soon ? `Closes soon · ${hhmm(today[1])}` : `Open · closes ${hhmm(today[1])}` };
  }
  if (today && minutes < today[0]) return { open: false, closingSoon: false, label: `Closed · opens ${hhmm(today[0])}` };
  for (let i = 1; i <= 7; i++) {
    const next = hoursFor(hours, (weekday + i) % 7);
    if (next) return { open: false, closingSoon: false, label: `Closed · opens ${i === 1 ? 'tomorrow ' : ''}${hhmm(next[0])}` };
  }
  return { open: false, closingSoon: false, label: 'Closed' };
}
