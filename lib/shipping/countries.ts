/**
 * Every country a Shipping method can list, grouped into the regions the
 * Settings picker shows. Client-safe: plain data and pure helpers.
 *
 * Per country:
 * - `city` — its main city. Easyship refuses an address without a city, and most
 *   quotes are made from a country and postal code alone (the delivery checker,
 *   the checkout before the address is finished), so those send this one.
 * - `postal` — a valid postal code in that city, used by the coverage check, which
 *   quotes with no address at all. Null when the country has no postal codes in
 *   general use: there the shopper's postal code is optional and quotes go
 *   without one.
 *
 * Comprehensively sanctioned destinations (CU, IR, KP, SY) are left out, as are
 * uninhabited territories. Whether a courier serves a country is not recorded
 * here: that is the live coverage check's answer (Settings → Shipping).
 */

export type Region =
  | "southeast_asia"
  | "east_asia"
  | "south_asia"
  | "oceania"
  | "middle_east_central_asia"
  | "europe"
  | "north_america"
  | "central_america_caribbean"
  | "south_america"
  | "africa";

export interface Country {
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  region: Region;
  city: string;
  /** A postal code in `city`; null when the country has none in general use. */
  postal: string | null;
}

/** Display order: the home market first. */
export const REGIONS: { key: Region; label: string }[] = [
  { key: "southeast_asia", label: "Southeast Asia" },
  { key: "east_asia", label: "East Asia" },
  { key: "south_asia", label: "South Asia" },
  { key: "oceania", label: "Oceania" },
  { key: "middle_east_central_asia", label: "Middle East & Central Asia" },
  { key: "europe", label: "Europe" },
  { key: "north_america", label: "North America" },
  { key: "central_america_caribbean", label: "Central America & Caribbean" },
  { key: "south_america", label: "South America" },
  { key: "africa", label: "Africa" },
];

type Row = [code: string, name: string, city: string, postal: string | null];

const ROWS: Record<Region, Row[]> = {
  southeast_asia: [
    ["SG", "Singapore", "Singapore", "018956"],
    ["MY", "Malaysia", "Kuala Lumpur", "50450"],
    ["ID", "Indonesia", "Jakarta", "10110"],
    ["TH", "Thailand", "Bangkok", "10200"],
    ["PH", "Philippines", "Manila", "1000"],
    ["VN", "Vietnam", "Ho Chi Minh City", "700000"],
    ["BN", "Brunei", "Bandar Seri Begawan", "BS8811"],
    ["KH", "Cambodia", "Phnom Penh", "120101"],
    ["LA", "Laos", "Vientiane", "01000"],
    ["MM", "Myanmar", "Yangon", "11181"],
    ["TL", "Timor-Leste", "Dili", null],
  ],
  east_asia: [
    ["HK", "Hong Kong", "Hong Kong", null],
    ["MO", "Macau", "Macau", null],
    ["TW", "Taiwan", "Taipei", "100"],
    ["CN", "China", "Shanghai", "200000"],
    ["JP", "Japan", "Tokyo", "100-0001"],
    ["KR", "South Korea", "Seoul", "04524"],
    ["MN", "Mongolia", "Ulaanbaatar", "14200"],
  ],
  south_asia: [
    ["IN", "India", "Mumbai", "400001"],
    ["PK", "Pakistan", "Karachi", "74000"],
    ["BD", "Bangladesh", "Dhaka", "1000"],
    ["LK", "Sri Lanka", "Colombo", "00100"],
    ["NP", "Nepal", "Kathmandu", "44600"],
    ["BT", "Bhutan", "Thimphu", "11001"],
    ["MV", "Maldives", "Malé", "20026"],
    ["AF", "Afghanistan", "Kabul", "1001"],
  ],
  oceania: [
    ["AU", "Australia", "Sydney", "2000"],
    ["NZ", "New Zealand", "Auckland", "1010"],
    ["PG", "Papua New Guinea", "Port Moresby", "111"],
    ["FJ", "Fiji", "Suva", null],
    ["NC", "New Caledonia", "Nouméa", "98800"],
    ["PF", "French Polynesia", "Papeete", "98714"],
    ["WS", "Samoa", "Apia", null],
    ["TO", "Tonga", "Nukuʻalofa", null],
    ["VU", "Vanuatu", "Port Vila", null],
    ["SB", "Solomon Islands", "Honiara", null],
    ["KI", "Kiribati", "Tarawa", null],
    ["FM", "Micronesia", "Palikir", "96941"],
    ["MH", "Marshall Islands", "Majuro", "96960"],
    ["PW", "Palau", "Koror", "96940"],
    ["GU", "Guam", "Hagåtña", "96910"],
    ["MP", "Northern Mariana Islands", "Saipan", "96950"],
    ["AS", "American Samoa", "Pago Pago", "96799"],
    ["CK", "Cook Islands", "Avarua", null],
    ["NU", "Niue", "Alofi", null],
    ["NR", "Nauru", "Yaren", null],
    ["TV", "Tuvalu", "Funafuti", null],
    ["WF", "Wallis & Futuna", "Mata-Utu", "98600"],
    ["NF", "Norfolk Island", "Kingston", "2899"],
  ],
  middle_east_central_asia: [
    ["AE", "United Arab Emirates", "Dubai", null],
    ["SA", "Saudi Arabia", "Riyadh", "11564"],
    ["QA", "Qatar", "Doha", null],
    ["KW", "Kuwait", "Kuwait City", "13001"],
    ["BH", "Bahrain", "Manama", "317"],
    ["OM", "Oman", "Muscat", "113"],
    ["JO", "Jordan", "Amman", "11181"],
    ["LB", "Lebanon", "Beirut", null],
    ["IL", "Israel", "Tel Aviv", "6100000"],
    ["PS", "Palestine", "Ramallah", null],
    ["IQ", "Iraq", "Baghdad", "10001"],
    ["YE", "Yemen", "Sanaa", null],
    ["TR", "Türkiye", "Istanbul", "34110"],
    ["GE", "Georgia", "Tbilisi", "0105"],
    ["AM", "Armenia", "Yerevan", "0010"],
    ["AZ", "Azerbaijan", "Baku", "AZ1000"],
    ["KZ", "Kazakhstan", "Almaty", "050000"],
    ["UZ", "Uzbekistan", "Tashkent", "100000"],
    ["KG", "Kyrgyzstan", "Bishkek", "720000"],
    ["TJ", "Tajikistan", "Dushanbe", "734000"],
    ["TM", "Turkmenistan", "Ashgabat", "744000"],
  ],
  europe: [
    ["GB", "United Kingdom", "London", "SW1A 1AA"],
    ["IE", "Ireland", "Dublin", "D02 X285"],
    ["FR", "France", "Paris", "75001"],
    ["DE", "Germany", "Berlin", "10115"],
    ["NL", "Netherlands", "Amsterdam", "1012 JS"],
    ["BE", "Belgium", "Brussels", "1000"],
    ["LU", "Luxembourg", "Luxembourg", "1111"],
    ["CH", "Switzerland", "Zurich", "8001"],
    ["AT", "Austria", "Vienna", "1010"],
    ["IT", "Italy", "Milan", "20121"],
    ["ES", "Spain", "Madrid", "28001"],
    ["PT", "Portugal", "Lisbon", "1100-148"],
    ["DK", "Denmark", "Copenhagen", "1050"],
    ["SE", "Sweden", "Stockholm", "111 20"],
    ["NO", "Norway", "Oslo", "0150"],
    ["FI", "Finland", "Helsinki", "00100"],
    ["IS", "Iceland", "Reykjavík", "101"],
    ["PL", "Poland", "Warsaw", "00-001"],
    ["CZ", "Czechia", "Prague", "110 00"],
    ["SK", "Slovakia", "Bratislava", "811 01"],
    ["HU", "Hungary", "Budapest", "1051"],
    ["RO", "Romania", "Bucharest", "010011"],
    ["BG", "Bulgaria", "Sofia", "1000"],
    ["GR", "Greece", "Athens", "105 57"],
    ["HR", "Croatia", "Zagreb", "10000"],
    ["SI", "Slovenia", "Ljubljana", "1000"],
    ["RS", "Serbia", "Belgrade", "11000"],
    ["BA", "Bosnia & Herzegovina", "Sarajevo", "71000"],
    ["ME", "Montenegro", "Podgorica", "81000"],
    ["MK", "North Macedonia", "Skopje", "1000"],
    ["AL", "Albania", "Tirana", "1001"],
    ["MD", "Moldova", "Chișinău", "2001"],
    ["UA", "Ukraine", "Kyiv", "01001"],
    ["BY", "Belarus", "Minsk", "220030"],
    ["RU", "Russia", "Moscow", "101000"],
    ["EE", "Estonia", "Tallinn", "10111"],
    ["LV", "Latvia", "Riga", "LV-1050"],
    ["LT", "Lithuania", "Vilnius", "01100"],
    ["MT", "Malta", "Valletta", "VLT 1117"],
    ["CY", "Cyprus", "Nicosia", "1010"],
    ["MC", "Monaco", "Monaco", "98000"],
    ["AD", "Andorra", "Andorra la Vella", "AD500"],
    ["SM", "San Marino", "San Marino", "47890"],
    ["VA", "Vatican City", "Vatican City", "00120"],
    ["LI", "Liechtenstein", "Vaduz", "9490"],
    ["GI", "Gibraltar", "Gibraltar", "GX11 1AA"],
    ["FO", "Faroe Islands", "Tórshavn", "100"],
    ["JE", "Jersey", "St Helier", "JE1 1AA"],
    ["GG", "Guernsey", "St Peter Port", "GY1 1AA"],
    ["IM", "Isle of Man", "Douglas", "IM1 1AA"],
  ],
  north_america: [
    ["US", "United States", "New York", "10001"],
    ["CA", "Canada", "Toronto", "M5H 2N2"],
    ["MX", "Mexico", "Mexico City", "06000"],
    ["BM", "Bermuda", "Hamilton", "HM 11"],
    ["GL", "Greenland", "Nuuk", "3900"],
    ["PM", "Saint Pierre & Miquelon", "Saint-Pierre", "97500"],
  ],
  central_america_caribbean: [
    ["GT", "Guatemala", "Guatemala City", "01001"],
    ["BZ", "Belize", "Belize City", null],
    ["SV", "El Salvador", "San Salvador", null],
    ["HN", "Honduras", "Tegucigalpa", null],
    ["NI", "Nicaragua", "Managua", null],
    ["CR", "Costa Rica", "San José", "10101"],
    ["PA", "Panama", "Panama City", null],
    ["PR", "Puerto Rico", "San Juan", "00901"],
    ["DO", "Dominican Republic", "Santo Domingo", "10101"],
    ["JM", "Jamaica", "Kingston", null],
    ["HT", "Haiti", "Port-au-Prince", "HT6110"],
    ["BS", "Bahamas", "Nassau", null],
    ["BB", "Barbados", "Bridgetown", "BB11000"],
    ["TT", "Trinidad & Tobago", "Port of Spain", null],
    ["AG", "Antigua & Barbuda", "St. John's", null],
    ["DM", "Dominica", "Roseau", null],
    ["GD", "Grenada", "St. George's", null],
    ["KN", "St. Kitts & Nevis", "Basseterre", null],
    ["LC", "St. Lucia", "Castries", null],
    ["VC", "St. Vincent & Grenadines", "Kingstown", null],
    ["AW", "Aruba", "Oranjestad", null],
    ["CW", "Curaçao", "Willemstad", null],
    ["BQ", "Caribbean Netherlands", "Kralendijk", null],
    ["SX", "Sint Maarten", "Philipsburg", null],
    ["MF", "St. Martin", "Marigot", "97150"],
    ["BL", "St. Barthélemy", "Gustavia", "97133"],
    ["GP", "Guadeloupe", "Pointe-à-Pitre", "97110"],
    ["MQ", "Martinique", "Fort-de-France", "97200"],
    ["KY", "Cayman Islands", "George Town", "KY1-1000"],
    ["VG", "British Virgin Islands", "Road Town", "VG1110"],
    ["VI", "U.S. Virgin Islands", "Charlotte Amalie", "00802"],
    ["AI", "Anguilla", "The Valley", "AI-2640"],
    ["MS", "Montserrat", "Brades", null],
    ["TC", "Turks & Caicos Islands", "Cockburn Town", "TKCA 1ZZ"],
  ],
  south_america: [
    ["BR", "Brazil", "São Paulo", "01001-000"],
    ["AR", "Argentina", "Buenos Aires", "C1002"],
    ["CL", "Chile", "Santiago", "8320000"],
    ["CO", "Colombia", "Bogotá", "110111"],
    ["PE", "Peru", "Lima", "15001"],
    ["EC", "Ecuador", "Quito", "170150"],
    ["UY", "Uruguay", "Montevideo", "11000"],
    ["PY", "Paraguay", "Asunción", "1209"],
    ["BO", "Bolivia", "La Paz", null],
    ["VE", "Venezuela", "Caracas", "1010"],
    ["GY", "Guyana", "Georgetown", null],
    ["SR", "Suriname", "Paramaribo", null],
    ["GF", "French Guiana", "Cayenne", "97300"],
    ["FK", "Falkland Islands", "Stanley", "FIQQ 1ZZ"],
  ],
  africa: [
    ["ZA", "South Africa", "Johannesburg", "2001"],
    ["EG", "Egypt", "Cairo", "11511"],
    ["MA", "Morocco", "Casablanca", "20000"],
    ["DZ", "Algeria", "Algiers", "16000"],
    ["TN", "Tunisia", "Tunis", "1000"],
    ["LY", "Libya", "Tripoli", null],
    ["SD", "Sudan", "Khartoum", "11111"],
    ["SS", "South Sudan", "Juba", null],
    ["NG", "Nigeria", "Lagos", "100001"],
    ["GH", "Ghana", "Accra", null],
    ["CI", "Côte d’Ivoire", "Abidjan", null],
    ["SN", "Senegal", "Dakar", null],
    ["CM", "Cameroon", "Douala", null],
    ["KE", "Kenya", "Nairobi", "00100"],
    ["TZ", "Tanzania", "Dar es Salaam", null],
    ["UG", "Uganda", "Kampala", null],
    ["RW", "Rwanda", "Kigali", null],
    ["BI", "Burundi", "Bujumbura", null],
    ["ET", "Ethiopia", "Addis Ababa", "1000"],
    ["DJ", "Djibouti", "Djibouti", null],
    ["ER", "Eritrea", "Asmara", null],
    ["MU", "Mauritius", "Port Louis", "11302"],
    ["SC", "Seychelles", "Victoria", null],
    ["MG", "Madagascar", "Antananarivo", "101"],
    ["KM", "Comoros", "Moroni", null],
    ["RE", "Réunion", "Saint-Denis", "97400"],
    ["YT", "Mayotte", "Mamoudzou", "97600"],
    ["MZ", "Mozambique", "Maputo", "1100"],
    ["ZM", "Zambia", "Lusaka", "10101"],
    ["ZW", "Zimbabwe", "Harare", null],
    ["MW", "Malawi", "Lilongwe", null],
    ["BW", "Botswana", "Gaborone", null],
    ["NA", "Namibia", "Windhoek", null],
    ["SZ", "Eswatini", "Mbabane", "H100"],
    ["LS", "Lesotho", "Maseru", "100"],
    ["AO", "Angola", "Luanda", null],
    ["CD", "Congo (DRC)", "Kinshasa", null],
    ["CG", "Congo (Republic)", "Brazzaville", null],
    ["GA", "Gabon", "Libreville", null],
    ["GQ", "Equatorial Guinea", "Malabo", null],
    ["CF", "Central African Republic", "Bangui", null],
    ["TD", "Chad", "N’Djamena", null],
    ["NE", "Niger", "Niamey", "8001"],
    ["ML", "Mali", "Bamako", null],
    ["BF", "Burkina Faso", "Ouagadougou", null],
    ["MR", "Mauritania", "Nouakchott", null],
    ["BJ", "Benin", "Cotonou", null],
    ["TG", "Togo", "Lomé", null],
    ["GM", "Gambia", "Banjul", null],
    ["GN", "Guinea", "Conakry", null],
    ["GW", "Guinea-Bissau", "Bissau", "1000"],
    ["SL", "Sierra Leone", "Freetown", null],
    ["LR", "Liberia", "Monrovia", "1000"],
    ["CV", "Cape Verde", "Praia", "7600"],
    ["ST", "São Tomé & Príncipe", "São Tomé", null],
    ["SH", "St. Helena", "Jamestown", "STHL 1ZZ"],
  ],
};

export const COUNTRIES: Country[] = REGIONS.flatMap(({ key }) =>
  ROWS[key].map(([code, name, city, postal]) => ({ code, name, region: key, city, postal })),
);

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function findCountry(code: string | null | undefined): Country | undefined {
  return code ? BY_CODE.get(code.trim().toUpperCase()) : undefined;
}

/** The country's name, or the code itself for one outside the catalog. */
export function countryName(code: string): string {
  return findCountry(code)?.name ?? code.toUpperCase();
}

/** The city to quote with when the shopper has not given one; undefined outside the catalog. */
export function quoteCity(code: string): string | undefined {
  return findCountry(code)?.city;
}

/**
 * Whether a postal code is needed to quote and ship there. A country outside the
 * catalog is assumed to have postal codes: asking for one costs a shopper a few
 * keystrokes, quoting without one costs a refused label.
 */
export function usesPostalCode(code: string): boolean {
  const country = findCountry(code);
  return country ? country.postal !== null : true;
}

/** A postal code worth quoting: couriers price by it, and a partial one only misses the cache. */
export function isPostalReady(postal: string, country: string): boolean {
  if (!usesPostalCode(country)) return true;
  return postal.replace(/\s+/g, "").length >= 3;
}

/** Codes in one region, in catalog order. */
export function regionCodes(region: Region): string[] {
  return ROWS[region].map(([code]) => code);
}

/**
 * Countries as a person reads them: "Worldwide" when every catalog country is
 * there, a region's name when all of that region is, the country names otherwise.
 * Codes outside the catalog are shown as codes.
 */
export function summarizeCountries(codes: string[]): string[] {
  const set = new Set(codes.map((c) => c.trim().toUpperCase()));
  if (COUNTRIES.every((c) => set.has(c.code))) {
    return ["Worldwide", ...[...set].filter((c) => !BY_CODE.has(c))];
  }
  const labels: string[] = [];
  for (const { key, label } of REGIONS) {
    const inRegion = ROWS[key].filter(([code]) => set.has(code));
    if (inRegion.length === ROWS[key].length) labels.push(label);
    else labels.push(...inRegion.map(([, name]) => name));
  }
  return [...labels, ...[...set].filter((c) => !BY_CODE.has(c))];
}

/**
 * Where the store delivers: every country an active method lists, by name, the
 * home country first. There is no second list to keep in step — adding a country
 * to a method is what offers it at checkout.
 */
export function deliveryCountries(
  methods: { countries?: string[] | null; is_active?: boolean | null }[],
  home = "SG",
): string[] {
  const codes = new Set<string>();
  for (const m of methods) {
    if (m.is_active === false) continue;
    for (const c of m.countries ?? []) {
      const code = c.trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(code)) codes.add(code);
    }
  }
  return [...codes].sort((a, b) =>
    a === home ? -1 : b === home ? 1 : countryName(a).localeCompare(countryName(b)),
  );
}
