-- Normaliza RUTs existentes al formato estándar: 12.345.678-9
-- Excluye grupos donde 2 o más filas normalizarían al mismo valor (duplicados reales).

CREATE OR REPLACE FUNCTION format_rut_standard(raw text) RETURNS text AS $$
DECLARE
  clean text;
  body  text;
  dv    text;
BEGIN
  clean := upper(regexp_replace(raw, '[^0-9Kk]', '', 'g'));
  IF length(clean) < 2 THEN
    RETURN raw;
  END IF;
  dv   := right(clean, 1);
  body := left(clean, length(clean) - 1);

  IF length(body) > 6 THEN
    body := left(body, length(body) - 6) || '.' ||
            substring(body FROM length(body) - 5 FOR 3) || '.' ||
            right(body, 3);
  ELSIF length(body) > 3 THEN
    body := left(body, length(body) - 3) || '.' || right(body, 3);
  END IF;

  RETURN body || '-' || dv;
END;
$$ LANGUAGE plpgsql;

-- ─── Students ────────────────────────────────────────────────────────────────
-- Salta grupos donde múltiples filas tienen el mismo RUT normalizado
UPDATE students s
SET rut = format_rut_standard(s.rut)
WHERE s.rut <> format_rut_standard(s.rut)
  AND format_rut_standard(s.rut) NOT IN (
    SELECT format_rut_standard(s2.rut)
    FROM students s2
    GROUP BY format_rut_standard(s2.rut)
    HAVING count(*) > 1
  );

-- ─── Guardians ───────────────────────────────────────────────────────────────
UPDATE guardians g
SET rut = format_rut_standard(g.rut)
WHERE g.rut <> format_rut_standard(g.rut)
  AND format_rut_standard(g.rut) NOT IN (
    SELECT format_rut_standard(g2.rut)
    FROM guardians g2
    GROUP BY format_rut_standard(g2.rut)
    HAVING count(*) > 1
  );

DROP FUNCTION IF EXISTS format_rut_standard(text);
