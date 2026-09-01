import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InviteView = {
  id: string;
  status: "pending" | "accepted" | "declined";
  message: string | null;
  created_at: string;
  /** E-mail ou telefone usado no convite (mascarado quando é convite recebido). */
  target: string;
  /** Nome de quem enviou (recebidos) ou de quem recebeu (enviados), quando já usa o app. */
  counterpartName: string | null;
  counterpartId: string | null;
  onApp: boolean;
};

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function maskTarget(value: string) {
  if (value.includes("@")) {
    const [user, domain] = value.split("@");
    const head = (user ?? "").slice(0, 2);
    return `${head}${"•".repeat(Math.max((user ?? "").length - 2, 2))}@${domain}`;
  }
  return `${"•".repeat(Math.max(value.length - 4, 2))}${value.slice(-4)}`;
}

const sendInviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("E-mail inválido").max(255).optional(),
    phone: z
      .string()
      .trim()
      .transform(normalizePhone)
      .refine((v) => /^\+?\d{8,15}$/.test(v), "Telefone inválido")
      .optional(),
    message: z.string().trim().max(300).optional(),
  })
  .refine((v) => Boolean(v.email || v.phone), {
    message: "Informe um e-mail ou telefone",
  });

/**
 * Convite baseado em consentimento: ninguém entra na lista de contatos de
 * outra pessoa sem que ela aceite. Toda validação (autoconvite, duplicidade,
 * bloqueio, contato existente) acontece no servidor.
 */
export const sendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendInviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const email = data.email ?? null;
    const phone = data.phone ?? null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("email, phone")
      .eq("id", context.userId)
      .maybeSingle();

    if (
      (email && me?.email && email === me.email.toLowerCase()) ||
      (phone && me?.phone && phone === normalizePhone(me.phone))
    ) {
      throw new Error("Você não pode convidar a si mesmo");
    }

    // Descobre se a pessoa já usa o app (busca exata, server-side).
    const escaped = (email ?? "").replace(/[\\%_]/g, (char) => `\\${char}`);
    const { data: found } = email
      ? await supabaseAdmin.from("profiles").select("id, display_name").ilike("email", escaped).limit(1)
      : await supabaseAdmin.from("profiles").select("id, display_name").eq("phone", phone!).limit(1);
    const invitee = found?.[0] ?? null;

    if (invitee) {
      if (invitee.id === context.userId) throw new Error("Você não pode convidar a si mesmo");

      const { data: blocks } = await supabaseAdmin
        .from("blocked_users")
        .select("blocker_id")
        .or(
          `and(blocker_id.eq.${context.userId},blocked_id.eq.${invitee.id}),and(blocker_id.eq.${invitee.id},blocked_id.eq.${context.userId})`,
        )
        .limit(1);
      if (blocks?.length) throw new Error("Não é possível convidar esta pessoa");

      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("owner_id", context.userId)
        .eq("contact_id", invitee.id)
        .limit(1);
      if (contact?.length) throw new Error("Essa pessoa já está nos seus contatos");

      const { data: incoming } = await supabaseAdmin
        .from("invites")
        .select("id")
        .eq("inviter_id", invitee.id)
        .eq("invitee_id", context.userId)
        .eq("status", "pending")
        .limit(1);
      if (incoming?.length) {
        throw new Error("Essa pessoa já te convidou. Responda em “Convites recebidos”.");
      }
    }

    const dup = supabaseAdmin
      .from("invites")
      .select("id")
      .eq("inviter_id", context.userId)
      .eq("status", "pending");
    const { data: existing } = email
      ? await dup.eq("invitee_email", email).limit(1)
      : await dup.eq("invitee_phone", phone!).limit(1);
    if (existing?.length) throw new Error("Você já tem um convite pendente para esse contato");

    const { error } = await context.supabase.from("invites").insert({
      inviter_id: context.userId,
      invitee_email: email,
      invitee_phone: phone,
      invitee_id: invitee?.id ?? null,
      message: data.message?.trim() || null,
    });
    if (error) throw new Error("Não foi possível enviar o convite");

    return { alreadyOnApp: Boolean(invitee), name: invitee?.display_name ?? null };
  });

/** Convites enviados e recebidos, com o nome da outra pessoa quando ela já usa o app. */
export const listMyInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ sent: InviteView[]; received: InviteView[] }> => {
    const { data: rows, error } = await context.supabase
      .from("invites")
      .select("id, inviter_id, invitee_id, invitee_email, invitee_phone, message, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar os convites");

    const all = rows ?? [];
    const ids = new Set<string>();
    for (const row of all) {
      ids.add(row.inviter_id);
      if (row.invitee_id) ids.add(row.invitee_id);
    }
    const names = new Map<string, string>();
    if (ids.size > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", [...ids]);
      for (const profile of profiles ?? []) names.set(profile.id, profile.display_name);
    }

    const toView = (row: (typeof all)[number], received: boolean): InviteView => {
      const rawTarget = row.invitee_email ?? row.invitee_phone ?? "";
      const counterpartId = received ? row.inviter_id : row.invitee_id;
      return {
        id: row.id,
        status: row.status,
        message: row.message,
        created_at: row.created_at,
        target: received ? maskTarget(rawTarget) : rawTarget,
        counterpartName: counterpartId ? names.get(counterpartId) ?? null : null,
        counterpartId: counterpartId ?? null,
        onApp: Boolean(row.invitee_id),
      };
    };

    return {
      sent: all.filter((row) => row.inviter_id === context.userId).map((row) => toView(row, false)),
      received: all.filter((row) => row.inviter_id !== context.userId).map((row) => toView(row, true)),
    };
  });

export const answerInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        inviteId: z.string().uuid(),
        accept: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: invite, error: readError } = await context.supabase
      .from("invites")
      .select("id, inviter_id, status")
      .eq("id", data.inviteId)
      .maybeSingle();

    if (readError) throw new Error("Não foi possível consultar o convite");
    if (!invite || invite.inviter_id === context.userId) throw new Error("Convite não encontrado");
    if (invite.status !== "pending") throw new Error("Este convite já foi respondido");

    const { data: updatedInvite, error: updateError } = await context.supabase
      .from("invites")
      .update({
        status: data.accept ? "accepted" : "declined",
        invitee_id: context.userId,
      })
      .eq("id", data.inviteId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updateError || !updatedInvite) throw new Error("Não foi possível responder ao convite");
    if (!data.accept) return { accepted: false as const, inviterId: invite.inviter_id };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: contactsError } = await supabaseAdmin.from("contacts").upsert(
      [
        { owner_id: context.userId, contact_id: invite.inviter_id },
        { owner_id: invite.inviter_id, contact_id: context.userId },
      ],
      { onConflict: "owner_id,contact_id", ignoreDuplicates: true },
    );

    if (contactsError) {
      console.error("[answerInvite] contacts", contactsError);
      throw new Error("O convite foi aceito, mas não foi possível criar os contatos");
    }

    return { accepted: true as const, inviterId: invite.inviter_id };
  });

/** Cancela um convite que eu mesmo enviei. */
export const cancelInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ inviteId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("invites")
      .delete()
      .eq("id", data.inviteId)
      .eq("inviter_id", context.userId);
    if (error) throw new Error("Não foi possível cancelar o convite");
    return { ok: true as const };
  });
