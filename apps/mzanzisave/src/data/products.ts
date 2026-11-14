import type { PackSize } from '../lib/format';

export type Category = 'staples' | 'meat' | 'produce' | 'baby' | 'toiletries' | 'beverages';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'staples', label: 'Staples' },
  { id: 'meat', label: 'Meat & Poultry' },
  { id: 'produce', label: 'Fresh Produce' },
  { id: 'baby', label: 'Baby' },
  { id: 'toiletries', label: 'Toiletries' },
  { id: 'beverages', label: 'Beverages' },
];

/** Quick-pick staples shown as pills on the Deals screen. */
export const STAPLE_PILLS: { label: string; group: string }[] = [
  { label: 'Maize Meal', group: 'maize' },
  { label: 'Rice', group: 'rice' },
  { label: 'Cooking Oil', group: 'oil' },
  { label: 'Sugar', group: 'sugar' },
  { label: 'Bread', group: 'bread' },
  { label: 'Milk', group: 'milk' },
];

export interface Product {
  id: string;
  brand: string;
  name: string;
  category: Category;
  /** Products in the same group are interchangeable for comparison, e.g. all maize meal. */
  group: string;
  size: PackSize;
  /** Typical regular shelf price in ZAR (Nov 2026 sample). */
  base: number;
  /** Small picture shown when Data-Saver is off. */
  emoji: string;
  /** House brands only sold by these retailers. */
  onlyAt?: string[];
  /** Extra words people search for: "pap", "mielie meal". */
  keywords?: string;
}

export const GROUP_LABELS: Record<string, string> = {
  maize: 'Maize Meal', rice: 'Rice', oil: 'Cooking Oil', sugar: 'Sugar', bread: 'Bread', milk: 'Milk', flour: 'Cake Flour',
  pilchards: 'Pilchards', beans: 'Sugar Beans', pasta: 'Pasta', samp: 'Samp',
  chicken: 'Chicken Portions', mince: 'Beef Mince', stew: 'Beef Stewing', wors: 'Boerewors', polony: 'Polony', lamb: 'Lamb Chops', eggs: 'Eggs',
  potatoes: 'Potatoes', onions: 'Onions', tomatoes: 'Tomatoes', bananas: 'Bananas', apples: 'Apples', cabbage: 'Cabbage', carrots: 'Carrots',
  nappies: 'Nappies', formula: 'Infant Formula', wipes: 'Baby Wipes', babyfood: 'Baby Cereal',
  dishwash: 'Dishwashing Liquid', washpowder: 'Washing Powder', soap: 'Bath Soap', toothpaste: 'Toothpaste', toiletpaper: 'Toilet Paper', bleach: 'Bleach', cleaner: 'Household Cleaner',
  cola: 'Cola', squash: 'Juice Concentrate', juice: 'Fruit Juice', tea: 'Rooibos & Tea', coffee: 'Instant Coffee', water: 'Water',
};

const kg = (qty: number): PackSize => ({ qty, unit: 'kg' });
const L = (qty: number): PackSize => ({ qty, unit: 'L' });
const n = (qty: number, countLabel: string): PackSize => ({ qty, unit: 'each', countLabel });

type Row = [id: string, brand: string, name: string, group: string, size: PackSize, base: number, emoji: string, extra?: Partial<Product>];

const rows: Record<Category, Row[]> = {
  staples: [
    ['whitestar-5', 'White Star', 'Super Maize Meal', 'maize', kg(5), 79.99, '🌽', { keywords: 'pap mielie mealie meal' }],
    ['whitestar-10', 'White Star', 'Super Maize Meal', 'maize', kg(10), 144.99, '🌽', { keywords: 'pap mielie mealie meal' }],
    ['iwisa-10', 'Iwisa', 'Super Maize Meal', 'maize', kg(10), 139.99, '🌽', { keywords: 'pap mielie mealie meal' }],
    ['ace-10', 'Ace', 'Super Maize Meal', 'maize', kg(10), 134.99, '🌽', { keywords: 'pap mielie mealie meal' }],
    ['impala-10', 'Impala', 'Special Maize Meal', 'maize', kg(10), 119.99, '🌽', { keywords: 'pap mielie mealie meal' }],
    ['ritebrand-maize-5', 'Ritebrand', 'Super Maize Meal', 'maize', kg(5), 62.99, '🌽', { onlyAt: ['shoprite', 'usave', 'checkers'], keywords: 'pap mielie' }],
    ['tastic-2', 'Tastic', 'Long Grain Parboiled Rice', 'rice', kg(2), 54.99, '🍚'],
    ['tastic-5', 'Tastic', 'Long Grain Parboiled Rice', 'rice', kg(5), 124.99, '🍚'],
    ['spekko-2', 'Spekko', 'Long Grain Parboiled Rice', 'rice', kg(2), 49.99, '🍚'],
    ['spekko-10', 'Spekko', 'Long Grain Parboiled Rice', 'rice', kg(10), 214.99, '🍚'],
    ['auntcaroline-2', 'Aunt Caroline', 'Parboiled Rice', 'rice', kg(2), 44.99, '🍚'],
    ['sunfoil-750', 'Sunfoil', 'Sunflower Oil', 'oil', L(0.75), 36.99, '🫗', { keywords: 'cooking oil' }],
    ['sunfoil-2', 'Sunfoil', 'Sunflower Oil', 'oil', L(2), 74.99, '🫗', { keywords: 'cooking oil' }],
    ['sunfoil-5', 'Sunfoil', 'Sunflower Oil', 'oil', L(5), 179.99, '🫗', { keywords: 'cooking oil' }],
    ['excella-2', 'Excella', 'Sunflower Oil', 'oil', L(2), 66.99, '🫗', { keywords: 'cooking oil' }],
    ['dlite-2', "D'lite", 'Sunflower Oil Blend', 'oil', L(2), 71.99, '🫗', { keywords: 'cooking oil' }],
    ['ritebrand-oil-2', 'Ritebrand', 'Sunflower Oil', 'oil', L(2), 56.99, '🫗', { onlyAt: ['shoprite', 'usave', 'checkers'], keywords: 'cooking oil' }],
    ['selati-2.5', 'Selati', 'White Sugar', 'sugar', kg(2.5), 54.99, '🍬'],
    ['huletts-2.5', 'Huletts', 'White Sugar', 'sugar', kg(2.5), 56.99, '🍬'],
    ['huletts-10', 'Huletts', 'White Sugar', 'sugar', kg(10), 209.99, '🍬'],
    ['selati-brown-2', 'Selati', 'Brown Sugar', 'sugar', kg(2), 44.99, '🍬'],
    ['albany-white', 'Albany', 'Superior White Bread', 'bread', kg(0.7), 21.99, '🍞'],
    ['sasko-brown', 'Sasko', 'Brown Bread', 'bread', kg(0.7), 18.99, '🍞'],
    ['blueribbon-white', 'Blue Ribbon', 'White Bread', 'bread', kg(0.7), 19.99, '🍞'],
    ['clover-fc-2', 'Clover', 'Fresh Full Cream Milk', 'milk', L(2), 38.99, '🥛'],
    ['clover-ll-1', 'Clover', 'Long Life Full Cream Milk', 'milk', L(1), 20.99, '🥛'],
    ['douglasdale-2', 'Douglasdale', 'Fresh Full Cream Milk', 'milk', L(2), 34.99, '🥛'],
    ['ll-milk-6', 'Parmalat', 'Long Life Full Cream Milk 6 x 1L', 'milk', L(6), 109.99, '🥛'],
    ['woolies-milk-2', 'Woolworths', 'Free Range Full Cream Milk', 'milk', L(2), 37.99, '🥛', { onlyAt: ['woolworths'] }],
    ['snowflake-2.5', 'Snowflake', 'Cake Flour', 'flour', kg(2.5), 49.99, '🌾'],
    ['goldencloud-10', 'Golden Cloud', 'Cake Flour', 'flour', kg(10), 169.99, '🌾'],
    ['luckystar-400', 'Lucky Star', 'Pilchards in Tomato Sauce', 'pilchards', kg(0.4), 27.99, '🐟'],
    ['beans-500', 'Imbo', 'Sugar Beans', 'beans', kg(0.5), 29.99, '🫘'],
    ['samp-2.5', 'Iwisa', 'Samp', 'samp', kg(2.5), 39.99, '🌽'],
    ['fattis-500', 'Fatti’s & Moni’s', 'Spaghetti', 'pasta', kg(0.5), 22.99, '🍝'],
  ],
  meat: [
    ['rainbow-iqf-2', 'Rainbow', 'IQF Chicken Mixed Portions', 'chicken', kg(2), 109.99, '🍗'],
    ['countyfair-2', 'County Fair', 'IQF Chicken Mixed Portions', 'chicken', kg(2), 104.99, '🍗'],
    ['chicken-5', 'Supreme', 'Chicken Mixed Portions Bulk', 'chicken', kg(5), 239.99, '🍗'],
    ['woolies-chicken-1', 'Woolworths', 'Free Range Chicken Portions', 'chicken', kg(1), 99.99, '🍗', { onlyAt: ['woolworths'] }],
    ['mince-1', 'Butchery', 'Lean Beef Mince', 'mince', kg(1), 119.99, '🥩'],
    ['stew-1', 'Butchery', 'Beef Stewing Pieces', 'stew', kg(1), 124.99, '🥩'],
    ['wors-1', 'Butchery', 'Traditional Boerewors', 'wors', kg(1), 104.99, '🌭'],
    ['lamb-1', 'Butchery', 'Lamb Loin Chops', 'lamb', kg(1), 229.99, '🍖'],
    ['enterprise-polony-1', 'Enterprise', 'Polony', 'polony', kg(1), 49.99, '🌭'],
    ['eggs-30', 'Nulaid', 'Large Eggs', 'eggs', n(30, 'egg'), 99.99, '🥚'],
    ['eggs-18', 'Nulaid', 'Large Eggs', 'eggs', n(18, 'egg'), 64.99, '🥚'],
  ],
  produce: [
    ['potatoes-7', 'Fresh', 'Potatoes (pocket)', 'potatoes', kg(7), 69.99, '🥔'],
    ['potatoes-10', 'Fresh', 'Potatoes (pocket)', 'potatoes', kg(10), 94.99, '🥔'],
    ['onions-3', 'Fresh', 'Brown Onions', 'onions', kg(3), 36.99, '🧅'],
    ['onions-10', 'Fresh', 'Brown Onions (pocket)', 'onions', kg(10), 99.99, '🧅'],
    ['tomatoes-1', 'Fresh', 'Tomatoes', 'tomatoes', kg(1), 26.99, '🍅'],
    ['bananas-1', 'Fresh', 'Bananas (loose, per kg)', 'bananas', kg(1), 24.99, '🍌'],
    ['apples-1.5', 'Fresh', 'Golden Delicious Apples', 'apples', kg(1.5), 29.99, '🍏'],
    ['cabbage-1', 'Fresh', 'Green Cabbage (each)', 'cabbage', n(1, 'head'), 19.99, '🥬'],
    ['carrots-1', 'Fresh', 'Carrots', 'carrots', kg(1), 17.99, '🥕'],
  ],
  baby: [
    ['pampers-4', 'Pampers', 'Baby-Dry Size 4 (58)', 'nappies', n(58, 'nappy'), 299.99, '👶'],
    ['huggies-3', 'Huggies', 'Gold Size 3 (56)', 'nappies', n(56, 'nappy'), 279.99, '👶'],
    ['snuggles-4', 'Snuggles', 'Comfort Size 4 (60)', 'nappies', n(60, 'nappy'), 199.99, '👶'],
    ['nan-1', 'Nestlé', 'NAN Optipro 1 Infant Formula 800g', 'formula', kg(0.8), 339.99, '🍼'],
    ['purity-wipes', 'Purity', 'Baby Wipes 3 x 80', 'wipes', n(240, 'wipe'), 109.99, '🧻'],
    ['cerelac-500', 'Nestlé', 'Cerelac Wheat Baby Cereal 500g', 'babyfood', kg(0.5), 79.99, '🥣'],
  ],
  toiletries: [
    ['sunlight-750', 'Sunlight', 'Dishwashing Liquid Lemon', 'dishwash', L(0.75), 39.99, '🧴'],
    ['omo-2', 'OMO', 'Auto Washing Powder', 'washpowder', kg(2), 124.99, '🧺'],
    ['surf-2', 'Surf', 'Hand Washing Powder', 'washpowder', kg(2), 79.99, '🧺'],
    ['protex-150', 'Protex', 'Bath Soap 150g', 'soap', kg(0.15), 17.99, '🧼'],
    ['lux-6', 'Lux', 'Bath Soap 6 x 100g', 'soap', kg(0.6), 59.99, '🧼'],
    ['colgate-100', 'Colgate', 'Regular Toothpaste 100ml', 'toothpaste', L(0.1), 26.99, '🪥'],
    ['twinsaver-18', 'Twinsaver', '2-Ply Toilet Paper 18s', 'toiletpaper', n(18, 'roll'), 159.99, '🧻'],
    ['babysoft-9', 'Baby Soft', '2-Ply Toilet Paper 9s', 'toiletpaper', n(9, 'roll'), 84.99, '🧻'],
    ['jik-750', 'Jik', 'Regular Bleach', 'bleach', L(0.75), 27.99, '🧴'],
    ['handyandy-750', 'Handy Andy', 'Cream Cleaner', 'cleaner', L(0.75), 39.99, '🧽'],
  ],
  beverages: [
    ['coke-2', 'Coca-Cola', 'Original 2L', 'cola', L(2), 29.99, '🥤'],
    ['coke-6x300', 'Coca-Cola', 'Original 6 x 300ml', 'cola', L(1.8), 49.99, '🥤'],
    ['oros-2', 'Oros', 'Orange Squash 2L', 'squash', L(2), 59.99, '🍊'],
    ['liquifruit-1', 'Liqui-Fruit', 'Red Grape 1L', 'juice', L(1), 27.99, '🧃'],
    ['ceres-1', 'Ceres', 'Medley of Fruits 1L', 'juice', L(1), 33.99, '🧃'],
    ['fiveroses-100', 'Five Roses', 'Tagless Tea Bags 100s', 'tea', n(100, 'bag'), 64.99, '🫖'],
    ['joko-100', 'Joko', 'Tagless Tea Bags 100s', 'tea', n(100, 'bag'), 62.99, '🫖'],
    ['freshpak-80', 'Freshpak', 'Rooibos Tea Bags 80s', 'tea', n(80, 'bag'), 49.99, '🫖'],
    ['ricoffy-750', 'Ricoffy', 'Instant Coffee 750g', 'coffee', kg(0.75), 124.99, '☕'],
    ['frisco-750', 'Frisco', 'Instant Coffee 750g', 'coffee', kg(0.75), 104.99, '☕'],
    ['bonaqua-5', 'Bonaqua', 'Still Water 5L', 'water', L(5), 26.99, '💧'],
  ],
};

export const PRODUCTS: Product[] = (Object.keys(rows) as Category[]).flatMap((category) =>
  rows[category].map(([id, brand, name, group, size, base, emoji, extra]) => ({ id, brand, name, group, size, base, emoji, category, ...extra })),
);

export const PRODUCT_BY_ID: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

export function productTitle(p: Product): string {
  return p.brand === 'Fresh' || p.brand === 'Butchery' ? p.name : `${p.brand} ${p.name}`;
}

export function searchText(p: Product): string {
  return `${p.brand} ${p.name} ${GROUP_LABELS[p.group] ?? ''} ${p.keywords ?? ''}`.toLowerCase();
}
