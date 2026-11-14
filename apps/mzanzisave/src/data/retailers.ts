import type { Category } from './products';

export type RetailerTier = 'national' | 'regional' | 'independent';
export type Province = 'GP' | 'WC' | 'KZN' | 'EC' | 'FS' | 'LP' | 'MP';

export interface Retailer {
  id: string;
  name: string;
  short: string;
  tier: RetailerTier;
  /** Pill colours: background and text. Distinct per retailer, not brand artwork. */
  bg: string;
  fg: string;
  /** Where it trades. */
  provinces: Province[];
  /** Price level against the market (1 = average). */
  priceLevel: number;
  /** Extra price level per category, e.g. a butchery is cheap on meat. */
  categoryLevel?: Partial<Record<Category, number>>;
  /** Categories it stocks, and how much of each it carries (0–1). */
  range: Partial<Record<Category, number>>;
  /** How often its products go on special (0–1). */
  specialRate: number;
  /** Loyalty programme needed for some specials. */
  loyalty?: string;
  hours: Hours;
  /** Chance a branch is in a mall, and near a taxi rank. */
  mallChance: number;
  taxiChance: number;
}

/** Opening hours in minutes after midnight: [open, close]. null = closed. */
export interface Hours {
  weekday: [number, number];
  sat: [number, number] | null;
  sun: [number, number] | null;
}

const h = (t: string) => {
  const [a, b] = t.split(':').map(Number);
  return a * 60 + b;
};
const span = (o: string, c: string): [number, number] => [h(o), h(c)];

const ALL: Province[] = ['GP', 'WC', 'KZN', 'EC', 'FS', 'LP', 'MP'];
const FULL_RANGE = { staples: 1, meat: 0.9, produce: 0.95, baby: 0.85, toiletries: 0.9, beverages: 0.95 } as const;
const CHAIN_HOURS: Hours = { weekday: span('08:00', '20:00'), sat: span('08:00', '18:00'), sun: span('09:00', '15:00') };

export const RETAILERS: Retailer[] = [
  { id: 'shoprite', name: 'Shoprite', short: 'Shoprite', tier: 'national', bg: '#E11D2E', fg: '#FFFFFF', provinces: ALL, priceLevel: 0.96, range: FULL_RANGE, specialRate: 0.34, loyalty: 'Xtra Savings', hours: { weekday: span('07:30', '20:00'), sat: span('07:30', '18:00'), sun: span('08:00', '15:00') }, mallChance: 0.55, taxiChance: 0.6 },
  { id: 'checkers', name: 'Checkers', short: 'Checkers', tier: 'national', bg: '#0F766E', fg: '#FFFFFF', provinces: ALL, priceLevel: 1.0, range: FULL_RANGE, specialRate: 0.36, loyalty: 'Xtra Savings', hours: CHAIN_HOURS, mallChance: 0.8, taxiChance: 0.25 },
  { id: 'pnp', name: 'Pick n Pay', short: 'PnP', tier: 'national', bg: '#1D4ED8', fg: '#FFFFFF', provinces: ALL, priceLevel: 1.01, range: FULL_RANGE, specialRate: 0.34, loyalty: 'Smart Shopper', hours: CHAIN_HOURS, mallChance: 0.75, taxiChance: 0.25 },
  { id: 'woolworths', name: 'Woolworths', short: 'Woolies', tier: 'national', bg: '#111111', fg: '#FFFFFF', provinces: ALL, priceLevel: 1.2, range: { staples: 0.6, meat: 0.9, produce: 0.95, baby: 0.4, toiletries: 0.45, beverages: 0.7 }, specialRate: 0.22, loyalty: 'WRewards', hours: { weekday: span('08:00', '19:00'), sat: span('08:00', '18:00'), sun: span('09:00', '16:00') }, mallChance: 0.9, taxiChance: 0.05 },
  { id: 'spar', name: 'SPAR', short: 'SPAR', tier: 'national', bg: '#15803D', fg: '#FFFFFF', provinces: ALL, priceLevel: 1.04, range: FULL_RANGE, specialRate: 0.3, loyalty: 'SPAR Rewards', hours: { weekday: span('07:00', '20:00'), sat: span('07:00', '19:00'), sun: span('08:00', '17:00') }, mallChance: 0.4, taxiChance: 0.3 },
  { id: 'makro', name: 'Makro', short: 'Makro', tier: 'national', bg: '#1E3A8A', fg: '#FDE047', provinces: ALL, priceLevel: 0.94, range: { staples: 1, meat: 0.6, produce: 0.4, baby: 0.95, toiletries: 1, beverages: 1 }, specialRate: 0.3, loyalty: 'mCard', hours: { weekday: span('08:30', '18:00'), sat: span('08:30', '17:00'), sun: span('09:00', '14:00') }, mallChance: 0.1, taxiChance: 0.2 },
  { id: 'boxer', name: 'Boxer', short: 'Boxer', tier: 'national', bg: '#F59E0B', fg: '#111111', provinces: ['GP', 'KZN', 'EC', 'FS', 'LP', 'MP'], priceLevel: 0.92, range: { staples: 1, meat: 0.95, produce: 0.8, baby: 0.7, toiletries: 0.85, beverages: 0.9 }, specialRate: 0.36, hours: { weekday: span('07:30', '19:00'), sat: span('07:30', '17:00'), sun: span('08:00', '14:00') }, mallChance: 0.35, taxiChance: 0.75 },
  { id: 'flm', name: "Food Lover's Market", short: "Food Lover's", tier: 'national', bg: '#65A30D', fg: '#FFFFFF', provinces: ALL, priceLevel: 1.0, categoryLevel: { produce: 0.84, meat: 0.95 }, range: { staples: 0.7, meat: 1, produce: 1, baby: 0.3, toiletries: 0.3, beverages: 0.7 }, specialRate: 0.32, hours: { weekday: span('08:00', '20:00'), sat: span('08:00', '19:00'), sun: span('08:00', '17:00') }, mallChance: 0.6, taxiChance: 0.15 },
  { id: 'cambridge', name: 'Cambridge Food', short: 'Cambridge', tier: 'regional', bg: '#7E22CE', fg: '#FFFFFF', provinces: ['GP', 'KZN', 'EC', 'FS', 'LP', 'MP'], priceLevel: 0.91, range: { staples: 1, meat: 0.7, produce: 0.6, baby: 0.6, toiletries: 0.8, beverages: 0.85 }, specialRate: 0.3, hours: { weekday: span('07:30', '18:30'), sat: span('07:30', '17:00'), sun: span('08:00', '13:00') }, mallChance: 0.15, taxiChance: 0.8 },
  { id: 'okfoods', name: 'OK Foods', short: 'OK Foods', tier: 'regional', bg: '#B91C1C', fg: '#FDE047', provinces: ALL, priceLevel: 1.03, range: FULL_RANGE, specialRate: 0.28, hours: { weekday: span('07:00', '19:00'), sat: span('07:00', '18:00'), sun: span('08:00', '14:00') }, mallChance: 0.3, taxiChance: 0.45 },
  { id: 'usave', name: 'Usave', short: 'Usave', tier: 'regional', bg: '#EA580C', fg: '#FFFFFF', provinces: ALL, priceLevel: 0.93, range: { staples: 1, meat: 0.5, produce: 0.5, baby: 0.6, toiletries: 0.8, beverages: 0.8 }, specialRate: 0.3, loyalty: 'Xtra Savings', hours: { weekday: span('07:30', '19:00'), sat: span('07:30', '17:00'), sun: span('08:00', '13:00') }, mallChance: 0.1, taxiChance: 0.85 },
  { id: 'rhino', name: 'Rhino Cash & Carry', short: 'Rhino', tier: 'regional', bg: '#57534E', fg: '#FFFFFF', provinces: ['KZN'], priceLevel: 0.89, range: { staples: 1, meat: 0.3, produce: 0.3, baby: 0.6, toiletries: 0.85, beverages: 0.9 }, specialRate: 0.32, hours: { weekday: span('07:00', '17:30'), sat: span('07:00', '15:00'), sun: span('08:00', '13:00') }, mallChance: 0, taxiChance: 0.7 },
  { id: 'kitkat', name: 'Kit Kat Cash & Carry', short: 'Kit Kat', tier: 'regional', bg: '#BE123C', fg: '#FFFFFF', provinces: ['GP', 'LP', 'MP', 'KZN'], priceLevel: 0.89, range: { staples: 1, meat: 0.4, produce: 0.4, baby: 0.7, toiletries: 0.9, beverages: 0.95 }, specialRate: 0.32, hours: { weekday: span('07:00', '17:30'), sat: span('07:00', '15:00'), sun: span('08:00', '13:00') }, mallChance: 0, taxiChance: 0.75 },
  { id: 'choppies', name: 'Choppies', short: 'Choppies', tier: 'regional', bg: '#0891B2', fg: '#FFFFFF', provinces: ['LP', 'GP', 'FS', 'MP'], priceLevel: 0.94, range: { staples: 1, meat: 0.8, produce: 0.7, baby: 0.6, toiletries: 0.8, beverages: 0.85 }, specialRate: 0.3, hours: { weekday: span('07:30', '19:00'), sat: span('07:30', '17:00'), sun: span('08:00', '14:00') }, mallChance: 0.3, taxiChance: 0.6 },
  { id: 'roots', name: 'Roots Butchery', short: 'Roots', tier: 'regional', bg: '#7C2D12', fg: '#FFFFFF', provinces: ['GP', 'LP', 'MP'], priceLevel: 0.97, categoryLevel: { meat: 0.86 }, range: { meat: 1, staples: 0.35, produce: 0.2, beverages: 0.3 }, specialRate: 0.38, hours: { weekday: span('07:00', '18:00'), sat: span('07:00', '17:00'), sun: span('08:00', '14:00') }, mallChance: 0.2, taxiChance: 0.6 },
  { id: 'local', name: 'Local grocer', short: 'Local', tier: 'independent', bg: '#374151', fg: '#FFFFFF', provinces: ALL, priceLevel: 1.06, range: { staples: 0.85, meat: 0.35, produce: 0.6, baby: 0.35, toiletries: 0.55, beverages: 0.85 }, specialRate: 0.24, hours: { weekday: span('06:30', '21:00'), sat: span('06:30', '21:00'), sun: span('07:00', '20:00') }, mallChance: 0, taxiChance: 0.6 },
];

export const RETAILER_BY_ID: Record<string, Retailer> = Object.fromEntries(RETAILERS.map((r) => [r.id, r]));
