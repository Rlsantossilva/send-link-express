import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const CPF_LOGIN_DOMAIN = "cpf.zaptri.app";

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function cpfLoginEmail(cpf: string) {
  return `${onlyDigits(cpf)}@${CPF_LOGIN_DOMAIN}`;
}

const inviteSignupSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  cpf: z.string().transform(onlyDigits).refine((v) => v.length === 11, "CPF deve ter 11 dígitos"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida"),
  pin: z.string().transform(onlyDigits).refine((v) => v.length >= 6 && v.length <= 8, "O PIN deve ter de 6 a 8 dígitos"),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  message: z.string().trim().max(300).optional().or(z.literal("")),
});

export const registerInvitedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inviteSignupSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const inviterId = context.userId;
    const loginEmail = cpfLoginEmail(data.cpf);
    const contactEmail = data.email ? data.email.toLowerCase() : null;
    const phone = data.phone ? data.phone.replace(/[^\d+]/g, "") : null;

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .eq("cpf", data.cpf)
      .maybeSingle();

    let userId = existing?.id ?? null;

    if (!userId) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: loginEmail,
        password: data.pin,
        email_confirm: true,
        user_metadata: {
          display_name: data.fullName.split(" ")[0] ?? data.fullName,
          full_name: data.fullName,
          cpf: data.cpf,
          birth_date: data.birthDate,
          ...(contactEmail ? { contact_email: contactEmail } : {}),
          ...(phone ? { phone } : {}),
        },
      });
      if (error || !created.user) {
        throw new Error(
          error?.message?.includes("already")
            ? "Já existe uma conta com esse CPF."
            : (error?.message ?? "Não foi possível criar a conta"),
        );
      }
      userId = created.user.id;
    }

    await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName,
        cpf: data.cpf,
        birth_date: data.birthDate,
        ...(contactEmail ? { email: contactEmail } : {}),
        ...(phone ? { phone } : {}),
      })
      .eq("id", userId);

    await supabaseAdmin.from("contacts").upsert(
      [
        { owner_id: inviterId, contact_id: userId, nickname: data.fullName },
        { owner_id: userId, contact_id: inviterId, nickname: null },
      ],
      { onConflict: "owner_id,contact_id" },
    );

    await supabaseAdmin.from("invites").insert({
      inviter_id: inviterId,
      invitee_id: userId,
      invitee_email: contactEmail,
      invitee_phone: phone,
      message: data.message || null,
      status: "accepted",
    });

    return { userId, fullName: data.fullName, loginEmail, alreadyExisted: Boolean(existing) };
  });
