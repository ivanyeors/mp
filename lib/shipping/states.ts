/**
 * The state or province sent to Easyship, in the countries where it needs one.
 *
 * Easyship refuses an address without a state in AU, CA, CN, ID, MX, MY, TH, US
 * and VN ("destination_address.state can't be blank"), and most quotes are made
 * from a country and postal code alone: the delivery checker, the checkout before
 * the address is finished, Settings' test and coverage check. The postal code
 * says which state it is in, so the state is read from it. Indonesia and Vietnam
 * have no table here: their postal codes do not follow province lines cleanly,
 * and Vietnam's provinces were merged in 2025.
 *
 * A quote whose postal code does not say (partial, mistyped, or ID/VN) sends the
 * state of the country's main city (`quoteCity`), because couriers zone rates by
 * postal code and a quote is better than a refusal. A label never guesses: it
 * carries the shopper's state or the one their postal code is in.
 *
 * Easyship asks for abbreviations in the US, Canada and Australia, and for full
 * names where there are provinces, so a US, Canadian or Australian state the
 * shopper typed as a name is sent as its abbreviation. Client-safe: plain data
 * and pure helpers.
 */

type Range = [lo: number, hi: number, state: string];

/** United States: the first three digits of the ZIP code. */
const US: Range[] = [
  [5, 5, "NY"], [6, 7, "PR"], [8, 8, "VI"], [9, 9, "PR"],
  [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"], [50, 54, "VT"], [55, 55, "MA"],
  [56, 59, "VT"], [60, 69, "CT"], [70, 89, "NJ"], [90, 99, "AE"],
  [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"],
  [200, 200, "DC"], [201, 201, "VA"], [202, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"],
  [247, 268, "WV"], [270, 289, "NC"], [290, 299, "SC"],
  [300, 319, "GA"], [320, 339, "FL"], [340, 340, "AA"], [341, 349, "FL"], [350, 369, "AL"],
  [370, 385, "TN"], [386, 397, "MS"], [398, 399, "GA"],
  [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"], [480, 499, "MI"],
  [500, 528, "IA"], [530, 549, "WI"], [550, 567, "MN"], [569, 569, "DC"], [570, 577, "SD"],
  [580, 588, "ND"], [590, 599, "MT"],
  [600, 629, "IL"], [630, 658, "MO"], [660, 679, "KS"], [680, 693, "NE"],
  [700, 714, "LA"], [716, 729, "AR"], [730, 731, "OK"], [733, 733, "TX"], [734, 749, "OK"],
  [750, 799, "TX"],
  [800, 816, "CO"], [820, 831, "WY"], [832, 838, "ID"], [840, 847, "UT"], [850, 865, "AZ"],
  [870, 884, "NM"], [885, 885, "TX"], [889, 898, "NV"],
  [900, 961, "CA"], [962, 966, "AP"], [967, 968, "HI"], [969, 969, "GU"], [970, 979, "OR"],
  [980, 994, "WA"], [995, 999, "AK"],
];

/** Australia: the four-digit postcode. */
const AU: Range[] = [
  [200, 299, "ACT"], [800, 999, "NT"], [1000, 2599, "NSW"], [2600, 2618, "ACT"],
  [2619, 2899, "NSW"], [2900, 2920, "ACT"], [2921, 2999, "NSW"], [3000, 3999, "VIC"],
  [4000, 4999, "QLD"], [5000, 5999, "SA"], [6000, 6999, "WA"], [7000, 7999, "TAS"],
  [8000, 8999, "VIC"], [9000, 9999, "QLD"],
];

/** Malaysia: the five-digit postcode. */
const MY: Range[] = [
  [1000, 2999, "Perlis"], [5000, 9999, "Kedah"], [10000, 14999, "Penang"],
  [15000, 18999, "Kelantan"], [20000, 24999, "Terengganu"], [25000, 28999, "Pahang"],
  [30000, 36999, "Perak"], [39000, 39999, "Pahang"], [40000, 48999, "Selangor"],
  [49000, 49999, "Pahang"], [50000, 60999, "Kuala Lumpur"], [62000, 62999, "Putrajaya"],
  [63000, 68999, "Selangor"], [69000, 69999, "Pahang"], [70000, 73999, "Negeri Sembilan"],
  [75000, 78999, "Melaka"], [79000, 86999, "Johor"], [87000, 87999, "Labuan"],
  [88000, 91999, "Sabah"], [93000, 98999, "Sarawak"],
];

/** Mexico: the first two digits of the código postal. */
const MX: Range[] = [
  [1, 16, "Ciudad de México"], [20, 20, "Aguascalientes"], [21, 22, "Baja California"],
  [23, 23, "Baja California Sur"], [24, 24, "Campeche"], [25, 27, "Coahuila"], [28, 28, "Colima"],
  [29, 30, "Chiapas"], [31, 33, "Chihuahua"], [34, 35, "Durango"], [36, 38, "Guanajuato"],
  [39, 41, "Guerrero"], [42, 43, "Hidalgo"], [44, 49, "Jalisco"], [50, 57, "Estado de México"],
  [58, 61, "Michoacán"], [62, 62, "Morelos"], [63, 63, "Nayarit"], [64, 67, "Nuevo León"],
  [68, 71, "Oaxaca"], [72, 75, "Puebla"], [76, 76, "Querétaro"], [77, 77, "Quintana Roo"],
  [78, 79, "San Luis Potosí"], [80, 82, "Sinaloa"], [83, 85, "Sonora"], [86, 86, "Tabasco"],
  [87, 89, "Tamaulipas"], [90, 90, "Tlaxcala"], [91, 96, "Veracruz"], [97, 97, "Yucatán"],
  [98, 99, "Zacatecas"],
];

/** China: the first two digits of the six-digit postcode. */
const CN: Range[] = [
  [1, 2, "Inner Mongolia"], [3, 4, "Shanxi"], [5, 7, "Hebei"], [10, 10, "Beijing"],
  [11, 12, "Liaoning"], [13, 13, "Jilin"], [15, 16, "Heilongjiang"], [20, 20, "Shanghai"],
  [21, 22, "Jiangsu"], [23, 24, "Anhui"], [25, 27, "Shandong"], [30, 30, "Tianjin"],
  [31, 32, "Zhejiang"], [33, 34, "Jiangxi"], [35, 36, "Fujian"], [40, 40, "Chongqing"],
  [41, 42, "Hunan"], [43, 44, "Hubei"], [45, 47, "Henan"], [51, 52, "Guangdong"],
  [53, 54, "Guangxi"], [55, 56, "Guizhou"], [57, 57, "Hainan"], [61, 64, "Sichuan"],
  [65, 67, "Yunnan"], [71, 72, "Shaanxi"], [73, 74, "Gansu"], [75, 75, "Ningxia"],
  [81, 81, "Qinghai"], [83, 84, "Xinjiang"], [85, 86, "Tibet"],
];

/** Thailand: the first two digits of the five-digit postcode. */
const TH: Record<string, string> = {
  "10": "Bangkok", "11": "Nonthaburi", "12": "Pathum Thani", "13": "Phra Nakhon Si Ayutthaya",
  "14": "Ang Thong", "15": "Lopburi", "16": "Sing Buri", "17": "Chai Nat", "18": "Saraburi",
  "20": "Chonburi", "21": "Rayong", "22": "Chanthaburi", "23": "Trat", "24": "Chachoengsao",
  "25": "Prachinburi", "26": "Nakhon Nayok", "27": "Sa Kaeo",
  "30": "Nakhon Ratchasima", "31": "Buriram", "32": "Surin", "33": "Sisaket",
  "34": "Ubon Ratchathani", "35": "Yasothon", "36": "Chaiyaphum", "37": "Amnat Charoen",
  "38": "Bueng Kan", "39": "Nong Bua Lamphu",
  "40": "Khon Kaen", "41": "Udon Thani", "42": "Loei", "43": "Nong Khai", "44": "Maha Sarakham",
  "45": "Roi Et", "46": "Kalasin", "47": "Sakon Nakhon", "48": "Nakhon Phanom", "49": "Mukdahan",
  "50": "Chiang Mai", "51": "Lamphun", "52": "Lampang", "53": "Uttaradit", "54": "Phrae",
  "55": "Nan", "56": "Phayao", "57": "Chiang Rai", "58": "Mae Hong Son",
  "60": "Nakhon Sawan", "61": "Uthai Thani", "62": "Kamphaeng Phet", "63": "Tak",
  "64": "Sukhothai", "65": "Phitsanulok", "66": "Phichit", "67": "Phetchabun",
  "70": "Ratchaburi", "71": "Kanchanaburi", "72": "Suphan Buri", "73": "Nakhon Pathom",
  "74": "Samut Sakhon", "75": "Samut Songkhram", "76": "Phetchaburi", "77": "Prachuap Khiri Khan",
  "80": "Nakhon Si Thammarat", "81": "Krabi", "82": "Phang Nga", "83": "Phuket",
  "84": "Surat Thani", "85": "Ranong", "86": "Chumphon",
  "90": "Songkhla", "91": "Satun", "92": "Trang", "93": "Phatthalung", "94": "Pattani",
  "95": "Yala", "96": "Narathiwat",
};

/** Canada: the first letter of the postal code. X0A–X0C is Nunavut, the rest of X the Northwest Territories. */
const CA_LETTER: Record<string, string> = {
  A: "NL", B: "NS", C: "PE", E: "NB", G: "QC", H: "QC", J: "QC",
  K: "ON", L: "ON", M: "ON", N: "ON", P: "ON", R: "MB", S: "SK", T: "AB",
  V: "BC", X: "NT", Y: "YT",
};

const inRanges = (ranges: Range[], n: number) => ranges.find(([lo, hi]) => n >= lo && n <= hi)?.[2];

/** The postal code's digits when it is exactly `length` of them (spaces and dashes ignored). */
const digits = (postal: string, length: number) => {
  const d = postal.replace(/[\s-]+/g, "");
  return new RegExp(`^\\d{${length}}$`).test(d) ? d : null;
};

interface StateRule {
  /** The state a postal code is in; undefined when it does not say. */
  fromPostal?: (postal: string) => string | undefined;
  /** The main city's state, for a quote whose postal code does not say. */
  mainCity: string;
  /** Names a shopper may type, lowercased, to the abbreviation Easyship wants. */
  abbreviations?: Record<string, string>;
}

const RULES: Record<string, StateRule> = {
  US: {
    fromPostal: (postal) => {
      const zip = postal.replace(/\s+/g, "").match(/^(\d{5})(-?\d{4})?$/)?.[1];
      return zip ? inRanges(US, Number(zip.slice(0, 3))) : undefined;
    },
    mainCity: "NY",
    abbreviations: {
      alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
      connecticut: "CT", delaware: "DE", "district of columbia": "DC", "washington dc": "DC",
      "washington d.c.": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
      indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME",
      maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
      missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
      "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
      "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
      "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
      utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
      wisconsin: "WI", wyoming: "WY", "puerto rico": "PR", guam: "GU",
    },
  },
  CA: {
    fromPostal: (postal) => {
      const code = postal.replace(/\s+/g, "").toUpperCase();
      if (!/^[A-Z]\d[A-Z](\d[A-Z]\d)?$/.test(code)) return undefined;
      return /^X0[ABC]/.test(code) ? "NU" : CA_LETTER[code[0]];
    },
    mainCity: "ON",
    abbreviations: {
      alberta: "AB", "british columbia": "BC", manitoba: "MB", "new brunswick": "NB",
      "newfoundland and labrador": "NL", newfoundland: "NL", "nova scotia": "NS",
      "northwest territories": "NT", nunavut: "NU", ontario: "ON", "prince edward island": "PE",
      quebec: "QC", "québec": "QC", saskatchewan: "SK", yukon: "YT",
    },
  },
  AU: {
    fromPostal: (postal) => {
      const code = digits(postal, 4);
      return code ? inRanges(AU, Number(code)) : undefined;
    },
    mainCity: "NSW",
    abbreviations: {
      "new south wales": "NSW", victoria: "VIC", queensland: "QLD", "south australia": "SA",
      "western australia": "WA", tasmania: "TAS", "northern territory": "NT",
      "australian capital territory": "ACT",
    },
  },
  MX: {
    fromPostal: (postal) => {
      const code = digits(postal, 5);
      return code ? inRanges(MX, Number(code.slice(0, 2))) : undefined;
    },
    mainCity: "Ciudad de México",
  },
  MY: {
    fromPostal: (postal) => {
      const code = digits(postal, 5);
      return code ? inRanges(MY, Number(code)) : undefined;
    },
    mainCity: "Kuala Lumpur",
  },
  TH: {
    fromPostal: (postal) => {
      const code = digits(postal, 5);
      return code ? TH[code.slice(0, 2)] : undefined;
    },
    mainCity: "Bangkok",
  },
  CN: {
    fromPostal: (postal) => {
      const code = digits(postal, 6);
      return code ? inRanges(CN, Number(code.slice(0, 2))) : undefined;
    },
    mainCity: "Shanghai",
  },
  ID: { mainCity: "DKI Jakarta" },
  VN: { mainCity: "Ho Chi Minh" },
};

/** The countries this file has a rule for; the tests check it is `STATE_COUNTRIES`. */
export const STATE_RULE_COUNTRIES = Object.keys(RULES);

/**
 * The state to send to Easyship: the shopper's own (as the abbreviation where
 * Easyship wants one), else the one the postal code is in, else, for a quote,
 * the main city's. Undefined where the country needs none and the shopper gave
 * none, or for a label whose postal code does not say.
 */
export function destinationState(
  destination: { country: string; postal_code?: string | null; state?: string | null },
  { guess = true }: { guess?: boolean } = {},
): string | undefined {
  const rule = RULES[destination.country.trim().toUpperCase()];
  const given = destination.state?.trim();
  if (given) return rule?.abbreviations?.[given.toLowerCase()] ?? given;
  if (!rule) return undefined;
  return rule.fromPostal?.(destination.postal_code?.trim() ?? "") ?? (guess ? rule.mainCity : undefined);
}
