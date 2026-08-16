import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const lookupSchema = z.object({
  value: z.string().trim().min(3).max(255),
});

export type PublicProfileLookup = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  status_text: string | null;
};

/**
 * Exact-match lookup so a signed-in user can find someone to invite or add as a
 * contact. Returns only non-sensitive display fields — never email, phone, cpf,
 * birth date or full name.
 */
export const lookupProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => lookupSchema.parse(input))
  .handler(async ({ data }): Promise<PublicProfileLookup | null> => {
    const value = data.value.trim();
    const isEmail = value.includes("@");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Escape LIKE metacharacters so the email lookup stays an exact match.
    const escaped = value.replace(/[\\%_]/g, (char) => `\\${char}`);
    const query = supabaseAdmin.from("profiles").select("id, display_name, avatar_url, status_text");
    const { data: rows, error } = isEmail
      ? await query.ilike("email", escaped).limit(1)
      : await query.eq("phone", value.replace(/[^\d+]/g, "")).limit(1);


    if (error) {
      console.error("[lookupProfile]", error);
      throw new Error("Não foi possível buscar essa pessoa");
    }
    return rows?.[0] ?? null;
  });
