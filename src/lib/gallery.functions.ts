import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Nomes de exibição de quem reagiu às fotos — funciona mesmo para pessoas que
 * não estão na lista de contatos. Só devolve o nome público, nada sensível.
 */
export const resolveDisplayNames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(200) }).parse(input),
  )
  .handler(async ({ data }): Promise<Record<string, string>> => {
    const ids = [...new Set(data.ids)];
    if (ids.length === 0) return {};
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .in("id", ids);
    if (error) return {};
    const map: Record<string, string> = {};
    for (const row of rows ?? []) map[row.id] = row.display_name || "Alguém";
    return map;
  });
