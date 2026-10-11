export const BARANGAYS = [
  'Barangay 1 - San Francisco (Pob.)',
  'Barangay 2 - San Baltazar (Pob.)',
  'Barangay 3 - San Ildefonso (Pob.)',
  'Barangay 4 - San Bartolome (Pob.)',
  'Barangay 5 - San Silvestre (Pob.)',
  'Barangay 6 - San Juan Bautista (Pob.)',
  'Barangay 7 - San Miguel (Pob.)',
  'Barangay 8 - San Rufino (Pob.)',
  'Barangay 9 - San Lucas (Pob.)',
  'Barangay 10 - San Paulo (Pob.)',
  'Barangay 11 - San Fernando (Pob.)',
  'Barangay 12 - San Cayetano (Pob.)',
  'Barangay 13 - San Eugenio (Pob.)',
  'Barangay 14 - San Gregorio (Pob.)',
  'Barangay 15 - San Jose (Pob.)',
  'Barangay 16 - San Marcos (Payas)',
  'Barangay 17 - Sta. Asuncion (Samac)',
  'Barangay 18 - San Pedro (Bingao)',
  'Barangay 19 - San Lorenzo',
  'Barangay 20 - San Pablo',
  'Barangay 21 - San Agustin (Bugnay)',
  'Barangay 22 - San Guillermo (Catuguing)',
  'Barangay 23 - Sta. Cecilia (Barabar)',
  'Barangay 24 - Sta. Monica (Nagrebcan)'
];

export function normalizePhPhone(raw) {
  const d = String(raw || '').replace(/[\s\-().]/g, '');
  const m = d.match(/^(?:\+63|63|0)(9\d{9})$/);
  return m ? `+63${m[1]}` : null;
}

export const PH_PHONE_HINT = '+63 9XX XXX XXXX';
export const stripPhoneChars = (v) => v.replace(/[^\d+\s()-]/g, '');