import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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