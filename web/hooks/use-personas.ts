import useSWR from "swr";
import type { PersonaConfig } from "@pipeline/types.js";

export interface PersonaSummary {
  slug: string;
  name: string;
  isDefault: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function usePersonas() {
  const { data, isLoading, mutate } = useSWR<{ personas: PersonaSummary[] }>(
    "/api/personas",
    fetcher
  );

  return {
    personas: data?.personas ?? [],
    isLoading,
    mutate,
  };
}

export function usePersona(slug: string | null) {
  const { data, isLoading, mutate } = useSWR<PersonaConfig>(
    slug ? `/api/personas/${slug}` : null,
    fetcher
  );

  return {
    persona: data ?? null,
    isLoading,
    mutate,
  };
}
