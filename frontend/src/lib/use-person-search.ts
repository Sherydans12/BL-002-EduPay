"use client";

import { useEffect, useRef, useState } from "react";

import {
  normalizePersonQuery,
  PERSON_SEARCH_DEBOUNCE_MS,
  type PersonSearchResult,
} from "@/lib/person-search";

export interface PersonSearchState<T> {
  /** Consulta normalizada en curso, o null si es demasiado corta. */
  query: string | null;
  items: T[];
  total: number;
  /** Hay una consulta pendiente o en curso para el texto actual. */
  loading: boolean;
  error: string | null;
  /** Repite la consulta actual (p. ej. tras un error de red). */
  retry: () => void;
}

interface SettledSearch<T> {
  key: string;
  items: T[];
  total: number;
  error: string | null;
}

/**
 * Consulta al servidor tras una pausa al escribir. Ignora respuestas de
 * consultas anteriores y nunca muestra resultados de otra consulta.
 * `scopeKey` vuelve a consultar cuando cambia un filtro externo (p. ej. curso).
 */
export function usePersonSearch<T>(
  raw: string,
  search: (query: string) => Promise<PersonSearchResult<T>>,
  options: { enabled?: boolean; scopeKey?: string } = {},
): PersonSearchState<T> {
  const enabled = options.enabled ?? true;
  const scopeKey = options.scopeKey ?? "";
  const query = enabled ? normalizePersonQuery(raw) : null;
  const [attempt, setAttempt] = useState(0);
  const requestKey =
    query === null ? null : `${scopeKey}\u0000${attempt}\u0000${query}`;
  const [settled, setSettled] = useState<SettledSearch<T> | null>(null);
  const sequence = useRef(0);
  const searchRef = useRef(search);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    const current = ++sequence.current;
    if (requestKey === null || query === null) return;
    const timer = window.setTimeout(() => {
      searchRef
        .current(query)
        .then((result) => {
          if (current !== sequence.current) return;
          setSettled({
            key: requestKey,
            items: result.items,
            total: result.total,
            error: null,
          });
        })
        .catch(() => {
          if (current !== sequence.current) return;
          setSettled({
            key: requestKey,
            items: [],
            total: 0,
            error: "No se pudo buscar. Revisa la conexión e inténtalo de nuevo.",
          });
        });
    }, PERSON_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, requestKey]);

  const current =
    requestKey !== null && settled?.key === requestKey ? settled : null;
  return {
    query,
    items: current?.items ?? [],
    total: current?.total ?? 0,
    loading: requestKey !== null && current === null,
    error: current?.error ?? null,
    retry: () => setAttempt((value) => value + 1),
  };
}
