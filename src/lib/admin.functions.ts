import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminUser = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Não foi possível validar suas permissões");
  if (!data) throw new Error("Acesso restrito aos administradores");
  return supabaseAdmin;
}

/** Diz se o usuário logado é administrador (usado só para exibir o menu). */
export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<boolean> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return Boolean(data);
  });

/** Lista todos os usuários do app (novos e antigos), sem expor PII completa. */
export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUser[]> => {
    const supabaseAdmin = await assertAdmin(context.userId);

    const [{ data: profiles, error }, authList] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, display_name, email, phone, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (error) throw new Error("Não foi possível carregar os usuários");

    const signIn = new Map(
      (authList.data?.users ?? []).map((user) => [user.id, user.last_sign_in_at ?? null]),
    );

    console.info(`[admin-audit] ${context.userId} listou os usuários do app`);

    return (profiles ?? []).map((profile) => ({
      id: profile.id,
      display_name: profile.display_name,
      email: profile.email,
      phone: profile.phone,
      created_at: profile.created_at,
      last_sign_in_at: signIn.get(profile.id) ?? null,
    }));
  });

/**
 * Redefine o PIN (senha) de um usuário. O valor nunca é armazenado nem exibido:
 * fica apenas no cofre de senhas criptografadas da autenticação.
 */
export const setUserPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        pin: z
          .string()
          .trim()
          .min(8, "O PIN precisa ter ao menos 8 caracteres")
          .max(72, "PIN muito longo"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.pin,
    });
    if (error) throw new Error(error.message);

    console.info(`[admin-audit] ${context.userId} redefiniu o PIN de ${data.userId}`);

    return { ok: true as const };
  });
