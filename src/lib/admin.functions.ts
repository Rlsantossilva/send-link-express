import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminUser = {
  id: string;
  display_name: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  birth_date: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  pin: string | null;
  pin_updated_at: string | null;
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

/** Lista todos os usuários do app (novos e antigos) com o PIN registrado. */
export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUser[]> => {
    const supabaseAdmin = await assertAdmin(context.userId);

    const [{ data: profiles, error }, { data: pins }, authList] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, display_name, full_name, email, phone, cpf, birth_date, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("user_pins").select("user_id, pin, updated_at"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (error) throw new Error("Não foi possível carregar os usuários");

    const pinMap = new Map((pins ?? []).map((row) => [row.user_id, row]));
    const signIn = new Map(
      (authList.data?.users ?? []).map((user) => [user.id, user.last_sign_in_at ?? null]),
    );

    return (profiles ?? []).map((profile) => ({
      id: profile.id,
      display_name: profile.display_name,
      full_name: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      cpf: profile.cpf,
      birth_date: profile.birth_date,
      created_at: profile.created_at,
      last_sign_in_at: signIn.get(profile.id) ?? null,
      pin: pinMap.get(profile.id)?.pin ?? null,
      pin_updated_at: pinMap.get(profile.id)?.updated_at ?? null,
    }));
  });

/** Define/atualiza o PIN (senha) de um usuário e guarda para consulta do admin. */
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

    const { error: pinError } = await supabaseAdmin
      .from("user_pins")
      .upsert(
        { user_id: data.userId, pin: data.pin, updated_by: context.userId, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (pinError) throw new Error("PIN alterado, mas não foi possível registrá-lo");

    return { ok: true as const };
  });
