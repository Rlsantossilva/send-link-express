import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Primeiro cadastro: nome, data de nascimento, e-mail e PIN (mínimo 6 dígitos).
 * Cria a conta já ativa e registra o PIN para consulta do administrador.
 */
export const registerWithPin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        fullName: z.string().trim().min(3).max(120),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        email: z.string().trim().email().max(255),
        pin: z
          .string()
          .trim()
          .regex(/^\d{6,12}$/, "O PIN deve ter de 6 a 12 dígitos"),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.pin,
      email_confirm: true,
      user_metadata: {
        display_name: data.fullName.split(" ")[0] ?? data.fullName,
        full_name: data.fullName,
        birth_date: data.birthDate,
      },
    });
    if (error || !created.user) {
      throw new Error(
        error?.message?.includes("already")
          ? "Este e-mail já está cadastrado"
          : error?.message ?? "Não foi possível criar a conta",
      );
    }

    return { ok: true };

  });
