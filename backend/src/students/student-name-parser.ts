/**
 * Deterministic Spanish/Chilean student name parser.
 *
 * Designed for institutional legacy naming format:
 *   [SURNAME COMPONENT(S)] [GIVEN NAME COMPONENT(S)]
 *
 * Includes compound surname particle handling and dataset-local lexicon scoring
 * for ambiguous 3-token records.
 */

export type ConfidenceClass =
  | 'HIGH_CONFIDENCE'
  | 'CORPUS_RESOLVED'
  | 'UNRESOLVED_AMBIGUOUS'
  | 'UNRESOLVED_SINGLE_TOKEN'
  | 'ALREADY_STRUCTURED'
  | 'INVALID_SOURCE';

export interface ParseResult {
  readonly originalName: string;
  readonly normalizedName: string;
  readonly confidence: ConfidenceClass;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly tokenCount: number;
  readonly surnameUnitCount: number;
  readonly reason?: string;
}

export interface StudentNameInput {
  readonly id: number;
  readonly name: string;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
}

export interface StudentParseOutput extends ParseResult {
  readonly id: number;
}

// Common Spanish multi-token surname prefixes
const THREE_TOKEN_PARTICLES = ['DE LA', 'DE LAS', 'DE LOS'];
const TWO_TOKEN_PARTICLES = ['DEL', 'DE', 'LA', 'LAS', 'LOS', 'SAN', 'SANTA'];

/**
 * Normalizes internal and boundary whitespace.
 */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Tokenizes a name into surname-aware units, recognizing multi-word surname particles.
 */
export function tokenizeSurnameUnits(tokens: readonly string[]): string[] {
  const units: string[] = [];
  let index = 0;

  while (index < tokens.length) {
    const remaining = tokens.length - index;
    const upper = tokens[index].toUpperCase();

    // Check 3-token particles: "DE LA FUENTE", "DE LOS RIOS", etc.
    if (remaining >= 3) {
      const candidate3 = `${upper} ${tokens[index + 1].toUpperCase()}`;
      if (THREE_TOKEN_PARTICLES.includes(candidate3)) {
        units.push(
          `${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]}`,
        );
        index += 3;
        continue;
      }
    }

    // Check 2-token particles: "DEL CANTO", "DE MARIA", "SAN MARTIN", etc.
    if (remaining >= 2) {
      if (TWO_TOKEN_PARTICLES.includes(upper)) {
        units.push(`${tokens[index]} ${tokens[index + 1]}`);
        index += 2;
        continue;
      }
    }

    // Single token
    units.push(tokens[index]);
    index += 1;
  }

  return units;
}

/**
 * Dataset-local frequency lexicon built from unambiguous records.
 */
export class DatasetLocalLexicon {
  private readonly surnameFreq = new Map<string, number>();
  private readonly givenNameFreq = new Map<string, number>();

  /**
   * Train the lexicon using high-confidence seed records (e.g. 4-unit or 5-unit names).
   */
  trainFromSeeds(records: readonly { name: string }[]): void {
    for (const record of records) {
      const normalized = normalizeName(record.name);
      if (!normalized) continue;

      const tokens = normalized.split(' ');
      const units = tokenizeSurnameUnits(tokens);

      // Unambiguous seed records have at least 4 units: first 2 are surnames, rest are given names
      if (units.length >= 4) {
        this.recordSurnameUnit(units[0]);
        this.recordSurnameUnit(units[1]);
        for (let i = 2; i < units.length; i++) {
          this.recordGivenNameUnit(units[i]);
        }
      }
    }
  }

  private recordSurnameUnit(unit: string): void {
    for (const token of unit.split(' ')) {
      const key = token.toUpperCase();
      this.surnameFreq.set(key, (this.surnameFreq.get(key) ?? 0) + 1);
    }
  }

  private recordGivenNameUnit(unit: string): void {
    for (const token of unit.split(' ')) {
      const key = token.toUpperCase();
      this.givenNameFreq.set(key, (this.givenNameFreq.get(key) ?? 0) + 1);
    }
  }

  getSurnameScore(token: string): number {
    return this.surnameFreq.get(token.toUpperCase()) ?? 0;
  }

  getGivenNameScore(token: string): number {
    return this.givenNameFreq.get(token.toUpperCase()) ?? 0;
  }

  /**
   * Scores an ambiguous 3-unit name: [U0, U1, U2]
   * Candidate A: lastName = U0 + U1, firstName = U2 (2 surnames + 1 given name)
   * Candidate B: lastName = U0, firstName = U1 + U2 (1 surname + 2 given names)
   */
  scoreThreeUnitPartition(
    u0: string,
    u1: string,
    u2: string,
  ): {
    choice: 'A' | 'B' | 'AMBIGUOUS';
    scoreA: number;
    scoreB: number;
    reason: string;
  } {
    const u1Surname = this.getSurnameScore(u1);
    const u1Given = this.getGivenNameScore(u1);
    const u2Surname = this.getSurnameScore(u2);
    const u2Given = this.getGivenNameScore(u2);

    const scoreA = u1Surname - u1Given + (u2Given - u2Surname);
    const scoreB = u1Given - u1Surname + (u2Given - u2Surname);

    if (u1Given > 0 && u1Surname === 0) {
      return {
        choice: 'B',
        scoreA,
        scoreB,
        reason: `Middle token '${u1}' has given-name evidence (${u1Given}) and no surname evidence.`,
      };
    }

    if (u1Surname > 0 && u1Given === 0) {
      return {
        choice: 'A',
        scoreA,
        scoreB,
        reason: `Middle token '${u1}' has surname evidence (${u1Surname}) and no given-name evidence.`,
      };
    }

    if (u1Surname > u1Given * 2) {
      return {
        choice: 'A',
        scoreA,
        scoreB,
        reason: `Middle token '${u1}' predominantly surname (${u1Surname} vs ${u1Given}).`,
      };
    }

    if (u1Given > u1Surname * 2) {
      return {
        choice: 'B',
        scoreA,
        scoreB,
        reason: `Middle token '${u1}' predominantly given-name (${u1Given} vs ${u1Surname}).`,
      };
    }

    if (u1Surname === 0 && u1Given === 0) {
      if (u2Given > 0 && u2Surname === 0) {
        return {
          choice: 'A',
          scoreA,
          scoreB,
          reason: `Third token '${u2}' is known given name (${u2Given}); institutional default 2 surnames + 1 given name applies.`,
        };
      }
      return {
        choice: 'AMBIGUOUS',
        scoreA,
        scoreB,
        reason: `Zero corpus evidence for middle token '${u1}'.`,
      };
    }

    return {
      choice: 'AMBIGUOUS',
      scoreA,
      scoreB,
      reason: `Ambiguous evidence for '${u1}': surname=${u1Surname}, given=${u1Given}.`,
    };
  }
}

/**
 * Parses a single student name record.
 */
export function parseStudentName(
  rawName: string | null | undefined,
  lexicon?: DatasetLocalLexicon,
  existing?: { firstName?: string | null; lastName?: string | null },
): ParseResult {
  const originalName = rawName ?? '';
  const normalizedName = normalizeName(rawName);

  if (
    existing?.firstName &&
    existing?.lastName &&
    existing.firstName.trim().length > 0 &&
    existing.lastName.trim().length > 0
  ) {
    return {
      originalName,
      normalizedName,
      confidence: 'ALREADY_STRUCTURED',
      firstName: existing.firstName.trim(),
      lastName: existing.lastName.trim(),
      tokenCount: normalizedName.split(' ').filter(Boolean).length,
      surnameUnitCount: 0,
      reason: 'Record already has valid structured firstName and lastName.',
    };
  }

  if (!normalizedName) {
    return {
      originalName,
      normalizedName,
      confidence: 'INVALID_SOURCE',
      firstName: null,
      lastName: null,
      tokenCount: 0,
      surnameUnitCount: 0,
      reason: 'Name is empty or whitespace.',
    };
  }

  const tokens = normalizedName.split(' ');
  const units = tokenizeSurnameUnits(tokens);

  // Single token
  if (tokens.length === 1 || units.length === 1) {
    return {
      originalName,
      normalizedName,
      confidence: 'UNRESOLVED_SINGLE_TOKEN',
      firstName: null,
      lastName: null,
      tokenCount: tokens.length,
      surnameUnitCount: units.length,
      reason: 'Single-token names cannot be safely partitioned.',
    };
  }

  // 2 units: SURNAME GIVEN
  if (units.length === 2) {
    return {
      originalName,
      normalizedName,
      confidence: 'HIGH_CONFIDENCE',
      firstName: units[1],
      lastName: units[0],
      tokenCount: tokens.length,
      surnameUnitCount: units.length,
      reason: '2-token standard pattern: [Surname] [GivenName].',
    };
  }

  // 4 units: SURNAME1 SURNAME2 GIVEN1 GIVEN2
  if (units.length === 4) {
    return {
      originalName,
      normalizedName,
      confidence: 'HIGH_CONFIDENCE',
      firstName: `${units[2]} ${units[3]}`,
      lastName: `${units[0]} ${units[1]}`,
      tokenCount: tokens.length,
      surnameUnitCount: units.length,
      reason: '4-unit standard pattern: [Surname1 Surname2] [Given1 Given2].',
    };
  }

  // 5+ units: first 2 surname units, remaining given names
  if (units.length >= 5) {
    return {
      originalName,
      normalizedName,
      confidence: 'HIGH_CONFIDENCE',
      firstName: units.slice(2).join(' '),
      lastName: `${units[0]} ${units[1]}`,
      tokenCount: tokens.length,
      surnameUnitCount: units.length,
      reason: '5+ unit standard pattern: [Surname1 Surname2] [GivenNames...].',
    };
  }

  // 3 units: Ambiguous between (Surname1 Surname2 + Given1) and (Surname1 + Given1 Given2)
  if (units.length === 3) {
    if (!lexicon) {
      return {
        originalName,
        normalizedName,
        confidence: 'UNRESOLVED_AMBIGUOUS',
        firstName: null,
        lastName: null,
        tokenCount: tokens.length,
        surnameUnitCount: units.length,
        reason: '3-unit name requires dataset-local lexicon to resolve.',
      };
    }

    const resolution = lexicon.scoreThreeUnitPartition(
      units[0],
      units[1],
      units[2],
    );

    if (resolution.choice === 'A') {
      return {
        originalName,
        normalizedName,
        confidence: 'CORPUS_RESOLVED',
        firstName: units[2],
        lastName: `${units[0]} ${units[1]}`,
        tokenCount: tokens.length,
        surnameUnitCount: units.length,
        reason: `3-unit resolved to [Surname1 Surname2] [Given1]: ${resolution.reason}`,
      };
    }

    if (resolution.choice === 'B') {
      return {
        originalName,
        normalizedName,
        confidence: 'CORPUS_RESOLVED',
        firstName: `${units[1]} ${units[2]}`,
        lastName: units[0],
        tokenCount: tokens.length,
        surnameUnitCount: units.length,
        reason: `3-unit resolved to [Surname1] [Given1 Given2]: ${resolution.reason}`,
      };
    }

    return {
      originalName,
      normalizedName,
      confidence: 'UNRESOLVED_AMBIGUOUS',
      firstName: null,
      lastName: null,
      tokenCount: tokens.length,
      surnameUnitCount: units.length,
      reason: `3-unit could not be resolved with confidence: ${resolution.reason}`,
    };
  }

  return {
    originalName,
    normalizedName,
    confidence: 'UNRESOLVED_AMBIGUOUS',
    firstName: null,
    lastName: null,
    tokenCount: tokens.length,
    surnameUnitCount: units.length,
    reason: 'Unrecognized name structure.',
  };
}

/**
 * Parses an entire roster of students, automatically training the local lexicon on the dataset first.
 */
export function parseStudentRoster(
  students: readonly StudentNameInput[],
): StudentParseOutput[] {
  const lexicon = new DatasetLocalLexicon();
  lexicon.trainFromSeeds(students);

  return students.map((student) => {
    const result = parseStudentName(student.name, lexicon, {
      firstName: student.firstName,
      lastName: student.lastName,
    });
    return {
      id: student.id,
      ...result,
    };
  });
}
