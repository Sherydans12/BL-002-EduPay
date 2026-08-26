/**
 * Helper resiliente para clasificación de conceptos de pago escolares
 * Blindado contra variaciones de texto en producción (acentos, mayúsculas, cuotas numeradas, sinónimos).
 */

export type FeeQuotaSlot =
  | 'matricula'
  | 'marzo'
  | 'abril'
  | 'mayo'
  | 'junio'
  | 'julio'
  | 'agosto'
  | 'septiembre'
  | 'octubre'
  | 'noviembre'
  | 'diciembre'
  | 'otro';

const MONTH_KEYWORDS: Record<string, FeeQuotaSlot> = {
  marzo: 'marzo',
  mar: 'marzo',
  cuota1: 'marzo',
  'cuota 1': 'marzo',
  'cuota 01': 'marzo',
  'mes 1': 'marzo',
  'mes 01': 'marzo',

  abril: 'abril',
  abr: 'abril',
  cuota2: 'abril',
  'cuota 2': 'abril',
  'cuota 02': 'abril',
  'mes 2': 'abril',
  'mes 02': 'abril',

  mayo: 'mayo',
  may: 'mayo',
  cuota3: 'mayo',
  'cuota 3': 'mayo',
  'cuota 03': 'mayo',
  'mes 3': 'mayo',
  'mes 03': 'mayo',

  junio: 'junio',
  jun: 'junio',
  cuota4: 'junio',
  'cuota 4': 'junio',
  'cuota 04': 'junio',
  'mes 4': 'junio',
  'mes 04': 'junio',

  julio: 'julio',
  jul: 'julio',
  cuota5: 'julio',
  'cuota 5': 'julio',
  'cuota 05': 'julio',
  'mes 5': 'julio',
  'mes 05': 'julio',

  agosto: 'agosto',
  ago: 'agosto',
  cuota6: 'agosto',
  'cuota 6': 'agosto',
  'cuota 06': 'agosto',
  'mes 6': 'agosto',
  'mes 06': 'agosto',

  septiembre: 'septiembre',
  setiembre: 'septiembre',
  sep: 'septiembre',
  cuota7: 'septiembre',
  'cuota 7': 'septiembre',
  'cuota 07': 'septiembre',
  'mes 7': 'septiembre',
  'mes 07': 'septiembre',

  octubre: 'octubre',
  oct: 'octubre',
  cuota8: 'octubre',
  'cuota 8': 'octubre',
  'cuota 08': 'octubre',
  'mes 8': 'octubre',
  'mes 08': 'octubre',

  noviembre: 'noviembre',
  nov: 'noviembre',
  cuota9: 'noviembre',
  'cuota 9': 'noviembre',
  'cuota 09': 'noviembre',
  'mes 9': 'noviembre',
  'mes 09': 'noviembre',

  diciembre: 'diciembre',
  dic: 'diciembre',
  cuota10: 'diciembre',
  'cuota 10': 'diciembre',
  'mes 10': 'diciembre',
};

const MONTH_BY_INDEX: Record<number, FeeQuotaSlot> = {
  2: 'marzo',
  3: 'abril',
  4: 'mayo',
  5: 'junio',
  6: 'julio',
  7: 'agosto',
  8: 'septiembre',
  9: 'octubre',
  10: 'noviembre',
  11: 'diciembre',
};

/**
 * Normaliza cadenas removiendo tildes, signos y espacios extra
 */
export function normalizeConceptString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Determina de forma infalible si un concepto o cargo corresponde a Matrícula / Inscripción
 */
export function isMatriculaConcept(conceptName?: string | null): boolean {
  if (!conceptName) return false;
  const norm = normalizeConceptString(conceptName);
  const matriculaSynonyms = [
    'matricul',
    'matr',
    'inscrip',
    'incorporac',
    'admision',
    'derecho de matricula',
    'arancel inicial',
    'cuota inicial',
  ];

  return matriculaSynonyms.some((synonym) => norm.includes(synonym));
}

/**
 * Asigna un cargo a su casilla correspondiente en la matriz escolar anual
 * (1 Matrícula + 10 Cuotas de Marzo a Diciembre).
 */
export function classifyChargeSlot(
  conceptName?: string | null,
  dueDate?: Date | string | null,
): FeeQuotaSlot {
  if (isMatriculaConcept(conceptName)) {
    return 'matricula';
  }

  const norm = conceptName ? normalizeConceptString(conceptName) : '';

  // Búsqueda por palabras clave en el nombre
  for (const [keyword, slot] of Object.entries(MONTH_KEYWORDS)) {
    if (norm.includes(keyword)) {
      return slot;
    }
  }

  // Fallback seguro por fecha de vencimiento (dueDate)
  if (dueDate) {
    const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
    if (!isNaN(d.getTime())) {
      const monthIdx = d.getUTCMonth(); // 0 = Ene, 2 = Mar, 11 = Dic
      if (MONTH_BY_INDEX[monthIdx]) {
        return MONTH_BY_INDEX[monthIdx];
      }
    }
  }

  return 'otro';
}
