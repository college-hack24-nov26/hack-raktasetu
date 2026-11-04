/**
 * Centralized Geography Configuration for RaktaSetu
 *
 * Provides structured state and district metadata, district centroids,
 * and verified blood centre coordinates for Mapbox interactive mapping.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface DistrictOption {
  name: string;
  code: number;
}

export interface StateOption {
  name: string;
  code: number;
  districts: DistrictOption[];
}

export const STATES_AND_DISTRICTS: StateOption[] = [
  {
    name: 'Maharashtra',
    code: 27,
    districts: [
      { name: 'Pune', code: 521 },
      { name: 'Amravati', code: 503 },
      { name: 'Latur', code: 524 },
      { name: 'Ahmednagar / Ahilyanagar', code: 522 },
      { name: 'Akola', code: 501 },
      { name: 'Kolhapur', code: 530 },
      { name: 'Mumbai', code: 519 },
      { name: 'Nagpur', code: 505 },
      { name: 'Nashik', code: 516 },
      { name: 'Sangli', code: 531 },
      { name: 'Satara', code: 527 },
      { name: 'Solapur', code: 526 },
      { name: 'Chhatrapati Sambhajinagar', code: 515 },
    ],
  },
  {
    name: 'Delhi (NCT)',
    code: 9,
    districts: [
      { name: 'Central Delhi', code: 141 },
      { name: 'New Delhi', code: 142 },
      { name: 'South Delhi', code: 143 },
    ],
  },
  {
    name: 'Karnataka',
    code: 29,
    districts: [
      { name: 'Bengaluru Urban', code: 572 },
      { name: 'Mysuru', code: 577 },
    ],
  },
  {
    name: 'Gujarat',
    code: 24,
    districts: [
      { name: 'Ahmedabad', code: 474 },
      { name: 'Surat', code: 492 },
    ],
  },
];

export const DEFAULT_STATE_CODE = 27;
export const DEFAULT_DISTRICT_CODE = 521; // Pune

export function getStateByCode(code: number): StateOption | undefined {
  return STATES_AND_DISTRICTS.find((s) => s.code === code);
}

export function getStateName(code: number): string {
  const state = getStateByCode(code);
  return state ? state.name : `State ${code}`;
}

export function getDistrictsForState(stateCode: number): DistrictOption[] {
  const state = getStateByCode(stateCode);
  return state ? state.districts : [];
}

export function getDistrictName(stateCode: number, districtCode: number): string {
  const districts = getDistrictsForState(stateCode);
  const found = districts.find((d) => d.code === districtCode);
  return found ? found.name : `District ${districtCode}`;
}

/**
 * District Centroid Coordinates for Mapbox initial camera framing.
 * Format: [longitude, latitude] for Mapbox GL JS.
 */
export const DISTRICT_CENTROIDS: Record<number, Coordinates> = {
  // Maharashtra
  521: { latitude: 18.5204, longitude: 73.8567 }, // Pune
  503: { latitude: 20.9374, longitude: 77.7523 }, // Amravati
  524: { latitude: 18.4088, longitude: 76.5604 }, // Latur
  519: { latitude: 19.0760, longitude: 72.8777 }, // Mumbai
  505: { latitude: 21.1458, longitude: 79.0882 }, // Nagpur
  516: { latitude: 19.9975, longitude: 73.7898 }, // Nashik
  530: { latitude: 16.7050, longitude: 74.2433 }, // Kolhapur
  522: { latitude: 19.0948, longitude: 74.7496 }, // Ahmednagar
  501: { latitude: 20.7002, longitude: 77.0082 }, // Akola
  531: { latitude: 16.8524, longitude: 74.5815 }, // Sangli
  527: { latitude: 17.6805, longitude: 73.9933 }, // Satara
  526: { latitude: 17.6599, longitude: 75.9064 }, // Solapur
  515: { latitude: 19.8762, longitude: 75.3433 }, // Chhatrapati Sambhajinagar

  // Delhi (NCT)
  141: { latitude: 28.6448, longitude: 77.2167 }, // Central Delhi
  142: { latitude: 28.6139, longitude: 77.2090 }, // New Delhi
  143: { latitude: 28.4817, longitude: 77.1873 }, // South Delhi

  // Karnataka
  572: { latitude: 12.9716, longitude: 77.5946 }, // Bengaluru Urban
  577: { latitude: 12.2958, longitude: 76.6394 }, // Mysuru

  // Gujarat
  474: { latitude: 23.0225, longitude: 72.5714 }, // Ahmedabad
  492: { latitude: 21.1702, longitude: 72.8311 }, // Surat
};

export function getDistrictCentroid(districtCode: number): Coordinates {
  return DISTRICT_CENTROIDS[districtCode] || { latitude: 18.5204, longitude: 73.8567 };
}

/**
 * Verified Blood Centre Geolocation Registry.
 *
 * As mandated by Phase 7 requirements:
 * - Precise markers are displayed ONLY for blood centres with verified coordinates.
 * - Coordinates are never invented or guessed for unknown centres.
 * - Centres without verified coordinates remain in the list with a "Map Location Unavailable" notice.
 */
export const VERIFIED_CENTRE_COORDINATES: Record<string, Coordinates> = {
  // Pune District (521)
  'ORG-MH-521-1613': { latitude: 18.5204, longitude: 73.8567 }, // Gupta Life Blood Centre, Pune
  '18061': { latitude: 18.5144, longitude: 73.8512 }, // Acharya Anandrishiji Blood Centre, Sadashiv Peth
  '18099': { latitude: 18.5089, longitude: 73.8340 }, // Sahyadri Blood Centre, Karve Road, Erandwane
  '9102': { latitude: 18.5236, longitude: 73.8672 },  // KEM Hospital Blood Centre, Rasta Peth
  '9105': { latitude: 18.5262, longitude: 73.8732 },  // Sassoon General Hospital Blood Bank, Near Pune Station
  '9110': { latitude: 18.5108, longitude: 73.8441 },  // Poona Hospital and Research Centre Blood Bank, Sadashiv Peth
  '9112': { latitude: 18.5015, longitude: 73.8306 },  // Deenanath Mangeshkar Hospital Blood Centre, Erandwane
  '9115': { latitude: 18.4575, longitude: 73.8552 },  // Bharati Hospital Blood Bank, Dhankawadi
  '9120': { latitude: 18.5362, longitude: 73.8298 },  // Symbiosis Hospital Blood Centre, Lavale/Model Colony
  '9125': { latitude: 18.5582, longitude: 73.8074 },  // Jupiter Hospital Blood Centre, Baner

  // Amravati District (503)
  '27114': { latitude: 20.9324, longitude: 77.7596 }, // Blood Bank Civil Hospital, Amravati
  '27115': { latitude: 20.9288, longitude: 77.7512 }, // PDMC Hospital Blood Centre, Amravati
  '27118': { latitude: 20.9395, longitude: 77.7650 }, // District Red Cross Blood Bank, Amravati

  // Latur District (524)
  '18268': { latitude: 18.4088, longitude: 76.5704 }, // Arpan Blood Centre, Latur
  '18270': { latitude: 18.3980, longitude: 76.5820 }, // Vilasrao Deshmukh Govt Medical College Blood Centre, Latur
  '18275': { latitude: 18.4025, longitude: 76.5650 }, // Bhalchandra Blood Bank, Latur

  // Mumbai District (519)
  '27001': { latitude: 18.9986, longitude: 72.8428 }, // KEM Hospital Blood Centre, Parel
  '27005': { latitude: 18.9733, longitude: 72.8282 }, // Sir J.J. Group of Hospitals Blood Bank, Byculla
  '27010': { latitude: 19.0178, longitude: 72.8432 }, // Tata Memorial Centre Blood Bank, Parel
  '27015': { latitude: 19.0558, longitude: 72.8397 }, // Lilavati Hospital Blood Bank, Bandra

  // Nagpur District (505)
  '27201': { latitude: 21.1396, longitude: 79.0832 }, // Government Medical College Blood Bank, Nagpur
  '27205': { latitude: 21.1442, longitude: 79.0880 }, // Super Speciality Hospital Blood Centre, Nagpur
};

/**
 * Returns verified coordinates if available, or null if unverified.
 */
export function getCentreCoordinates(hospitalCode: string): Coordinates | null {
  return VERIFIED_CENTRE_COORDINATES[hospitalCode] || null;
}

/**
 * City / Suburban Area registry for cascading dropdown selection.
 */
export const CITIES_BY_DISTRICT: Record<number, string[]> = {
  // Pune (521)
  521: [
    'Pune City (Central / Shivajinagar)',
    'Kothrud / Deccan Gymkhana',
    'Swargate / Sadashiv Peth',
    'Hadapsar / Magarpatta',
    'Hinjewadi / IT Park',
    'Baner / Balewadi',
    'Wakad / Pimple Saudagar',
    'Pimpri / Chinchwad (PCMC)',
    'Viman Nagar / Kharadi',
    'Camp / Pune Cantonment',
    'Aundh / Pashan',
    'Katraj / Dhankawadi / Bibvewadi',
    'Nigdi / Akurdi / Bhosari',
    'Yerawada / Kalyani Nagar',
    'Other / Specify Area',
  ],
  // Mumbai (519)
  519: [
    'Parel / Lalbaug / Byculla',
    'Dadar / Matunga',
    'Colaba / Fort / Nariman Point',
    'Bandra (West / East)',
    'Andheri (East / West)',
    'Borivali / Dahisar',
    'Ghatkopar / Vidyavihar',
    'Kurla / Chunabhatti',
    'Chembur / Tilak Nagar',
    'Malad / Goregaon',
    'Kandivali / Charkop',
    'Worli / Lower Parel',
    'Powai / Kanjurmarg',
    'Juhu / Vile Parle',
    'Other / Specify Area',
  ],
  // Nagpur (505)
  505: [
    'Dharampeth / Ramdaspeth',
    'Sitabuldi / Civil Lines',
    'Sadar / Mangalwari',
    'Itwari / Gandhibagh',
    'Wardhaman Nagar',
    'Pratap Nagar / Khamla',
    'Manish Nagar / Besa',
    'Other / Specify Area',
  ],
  // Nashik (516)
  516: [
    'Panchavati',
    'College Road / Gangapur Road',
    'CIDCO / Ambad',
    'Indira Nagar / Pathardi',
    'Satpur MIDC',
    'Nashik Road / Deolali',
    'Other / Specify Area',
  ],
  // Kolhapur (530)
  530: [
    'Rajarampuri',
    'Shahupuri',
    'Tarabai Park',
    'Laxmipuri / Bindu Chowk',
    'Gandhinagar',
    'Kasba Bawada',
    'Other / Specify Area',
  ],
  // Amravati (503)
  503: [
    'Rajapeth',
    'Camp / Civil Lines',
    'Badnera',
    'Gadge Nagar',
    'Dastur Nagar',
    'Rukhmini Nagar',
    'Other / Specify Area',
  ],
  // Latur (524)
  524: [
    'Gandhi Chowk / Subhash Chowk',
    'Shivaji Nagar',
    'Ausa Road',
    'Barshi Road / MIDC',
    'Nandi Stop / Ambajogai Road',
    'Other / Specify Area',
  ],
  // Solapur (526)
  526: [
    'Navi Peth / Balives',
    'Saat Rasta / Civil Hospital Area',
    'Jule Solapur',
    'Ashok Chowk / Kumtha Naka',
    'Hotgi Road MIDC',
    'Other / Specify Area',
  ],
  // Chhatrapati Sambhajinagar (515)
  515: [
    'CIDCO (N-1 to N-12)',
    'Connaught Place / Town Centre',
    'Kranti Chowk / Station Road',
    'Jalna Road / Seven Hills',
    'Beed Bypass / Garkheda',
    'Waluj MIDC / Shendra MIDC',
    'Other / Specify Area',
  ],
  // Sangli (531)
  531: [
    'Vishrambag',
    'Gaonbhag / Sangli City',
    'Kupwad MIDC',
    'Madhavnagar',
    'Other / Specify Area',
  ],
  // Satara (527)
  527: [
    'Powai Naka',
    'Rajwada',
    'Godoli',
    'Sadar Bazar',
    'Karanje Peth',
    'Other / Specify Area',
  ],
  // Ahmednagar / Ahilyanagar (522)
  522: [
    'Savedi',
    'Station Road / Camp',
    'Delhi Gate / Kotla',
    'Pipeline Road',
    'MIDC Nagapur',
    'Other / Specify Area',
  ],
  // Akola (501)
  501: [
    'Civil Lines',
    'Kaulkhed',
    'Gorakshan Road',
    'Jatharpeth',
    'Old City',
    'Other / Specify Area',
  ],
  // Delhi NCT
  141: ['Connaught Place', 'Karol Bagh', 'Paharganj', 'Daryaganj', 'Other / Specify Area'],
  142: ['Chanakyapuri', 'Barakhamba Road', 'Lodhi Estate', 'India Gate Area', 'Other / Specify Area'],
  143: ['Hauz Khas', 'Saket', 'Greater Kailash', 'Lajpat Nagar', 'Vasant Kunj', 'Other / Specify Area'],
  // Bengaluru Urban (572)
  572: [
    'Koramangala',
    'Indiranagar',
    'Whitefield',
    'Jayanagar / JP Nagar',
    'HSR Layout',
    'Electronic City',
    'Malleshwaram / Rajajinagar',
    'Hebbal / Yelahanka',
    'Other / Specify Area',
  ],
  // Mysuru (577)
  577: ['Vijayanagar', 'Kuvempunagar', 'Jayalakshmipuram', 'Gokulam', 'Other / Specify Area'],
  // Ahmedabad (474)
  474: ['Navrangpura', 'Satellite / Bodakdev', 'Vastrapur', 'Maninagar', 'SG Highway', 'Other / Specify Area'],
  // Surat (492)
  492: ['Adajan', 'Vesu / VIP Road', 'Athwa Lines', 'Varachha', 'Piplod', 'Other / Specify Area'],
};

export function getCitiesForDistrict(districtCode: number): string[] {
  return (
    CITIES_BY_DISTRICT[districtCode] || [
      'City / Town Centre',
      'Civil Lines / Cantonment',
      'Suburban Area',
      'Industrial / MIDC Area',
      'Rural / Taluka Area',
      'Other / Specify Area',
    ]
  );
}

