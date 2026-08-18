import {
  parseStudentName,
  parseStudentRoster,
  DatasetLocalLexicon,
  normalizeName,
  tokenizeSurnameUnits,
} from './student-name-parser';

describe('StudentNameParser', () => {
  describe('normalizeName and tokenizeSurnameUnits', () => {
    it('normalizes internal and outer whitespace', () => {
      expect(normalizeName('   GONZALEZ   PEREZ   JUAN   CARLOS  ')).toBe(
        'GONZALEZ PEREZ JUAN CARLOS',
      );
      expect(normalizeName('')).toBe('');
      expect(normalizeName(null)).toBe('');
    });

    it('recognizes 3-token compound surname particles like DE LA', () => {
      const tokens = ['DE', 'LA', 'FUENTE', 'PEREZ', 'JUAN'];
      const units = tokenizeSurnameUnits(tokens);
      expect(units).toEqual(['DE LA FUENTE', 'PEREZ', 'JUAN']);
    });

    it('recognizes 2-token compound surname particles like DEL, SAN, DE', () => {
      const tokens = ['DEL', 'CANTO', 'SAN', 'MARTIN', 'ANA', 'MARIA'];
      const units = tokenizeSurnameUnits(tokens);
      expect(units).toEqual(['DEL CANTO', 'SAN MARTIN', 'ANA', 'MARIA']);
    });
  });

  describe('parseStudentName baseline patterns', () => {
    it('parses standard 4-token names into 2 surnames and 2 given names', () => {
      const result = parseStudentName('GONZALEZ PEREZ JUAN CARLOS');
      expect(result.confidence).toBe('HIGH_CONFIDENCE');
      expect(result.lastName).toBe('GONZALEZ PEREZ');
      expect(result.firstName).toBe('JUAN CARLOS');
    });

    it('parses standard 2-token names into 1 surname and 1 given name', () => {
      const result = parseStudentName('VERA MATIAS');
      expect(result.confidence).toBe('HIGH_CONFIDENCE');
      expect(result.lastName).toBe('VERA');
      expect(result.firstName).toBe('MATIAS');
    });

    it('parses 5-token names into 2 surnames and remaining given names', () => {
      const result = parseStudentName('HERNANDEZ MORALES MARIA JOSE IGNACIA');
      expect(result.confidence).toBe('HIGH_CONFIDENCE');
      expect(result.lastName).toBe('HERNANDEZ MORALES');
      expect(result.firstName).toBe('MARIA JOSE IGNACIA');
    });

    it('parses compound surname particles with DE LA', () => {
      const result = parseStudentName('DE LA FUENTE PEREZ JUAN CARLOS');
      expect(result.confidence).toBe('HIGH_CONFIDENCE');
      expect(result.lastName).toBe('DE LA FUENTE PEREZ');
      expect(result.firstName).toBe('JUAN CARLOS');
    });

    it('parses compound surname particles with DEL', () => {
      const result = parseStudentName('DEL CANTO SOTO MARCELO ANDRES');
      expect(result.confidence).toBe('HIGH_CONFIDENCE');
      expect(result.lastName).toBe('DEL CANTO SOTO');
      expect(result.firstName).toBe('MARCELO ANDRES');
    });

    it('leaves single-token names unresolved', () => {
      const result = parseStudentName('UNKNOWN');
      expect(result.confidence).toBe('UNRESOLVED_SINGLE_TOKEN');
      expect(result.firstName).toBeNull();
      expect(result.lastName).toBeNull();
    });

    it('identifies blank input as INVALID_SOURCE', () => {
      const result = parseStudentName('   ');
      expect(result.confidence).toBe('INVALID_SOURCE');
      expect(result.firstName).toBeNull();
      expect(result.lastName).toBeNull();
    });

    it('preserves already-structured records without re-parsing', () => {
      const result = parseStudentName('SILVA PEREZ JUAN', undefined, {
        firstName: 'Juan',
        lastName: 'Silva Pérez',
      });
      expect(result.confidence).toBe('ALREADY_STRUCTURED');
      expect(result.firstName).toBe('Juan');
      expect(result.lastName).toBe('Silva Pérez');
    });
  });

  describe('3-token ambiguous names with DatasetLocalLexicon', () => {
    let lexicon: DatasetLocalLexicon;

    beforeEach(() => {
      lexicon = new DatasetLocalLexicon();
      // Train with synthetic seed records
      lexicon.trainFromSeeds([
        { name: 'SILVA ROJAS JUAN CARLOS' },
        { name: 'CASTILLO PEREZ ANA MARIA' },
        { name: 'ROJAS VERA PEDRO ANTONIO' },
        { name: 'GONZALEZ SILVA MARIA JOSE' },
      ]);
    });

    it('resolves 3-token name as 2 surnames + 1 given name when middle is known surname', () => {
      // SILVA (surname) ROJAS (surname) PEDRO (given)
      const result = parseStudentName('SILVA ROJAS PEDRO', lexicon);
      expect(result.confidence).toBe('CORPUS_RESOLVED');
      expect(result.lastName).toBe('SILVA ROJAS');
      expect(result.firstName).toBe('PEDRO');
    });

    it('resolves 3-token name as 1 surname + 2 given names when middle is known given name', () => {
      // CASTILLO (surname) ANA (given) MARIA (given)
      const result = parseStudentName('CASTILLO ANA MARIA', lexicon);
      expect(result.confidence).toBe('CORPUS_RESOLVED');
      expect(result.lastName).toBe('CASTILLO');
      expect(result.firstName).toBe('ANA MARIA');
    });

    it('leaves 3-token name ambiguous if neither token has decisive evidence', () => {
      const result = parseStudentName('XYZZY FOO BAR', lexicon);
      expect(result.confidence).toBe('UNRESOLVED_AMBIGUOUS');
      expect(result.firstName).toBeNull();
      expect(result.lastName).toBeNull();
    });
  });

  describe('parseStudentRoster batch processing & invariants', () => {
    it('processes roster, trains lexicon, and maintains strict token invariants', () => {
      const roster = [
        { id: 1, name: 'GONZALEZ PEREZ JUAN CARLOS' },
        { id: 2, name: 'SILVA ROJAS PEDRO' },
        { id: 3, name: 'CASTILLO ANA MARIA' },
        { id: 4, name: 'VERA MATIAS' },
        { id: 5, name: 'DE LA FUENTE PEREZ DIEGO' },
        { id: 6, name: 'UNKNOWN' },
      ];

      const results = parseStudentRoster(roster);
      expect(results.length).toBe(6);

      for (const res of results) {
        if (res.firstName && res.lastName) {
          // Non-empty invariant
          expect(res.firstName.trim().length).toBeGreaterThan(0);
          expect(res.lastName.trim().length).toBeGreaterThan(0);

          // Token coverage invariant: all tokens from original name must be in firstName + lastName
          const combinedTokens = `${res.lastName} ${res.firstName}`
            .split(' ')
            .filter(Boolean)
            .sort();
          const origTokens = res.normalizedName
            .split(' ')
            .filter(Boolean)
            .sort();
          expect(combinedTokens).toEqual(origTokens);
        }
      }
    });
  });
});
