import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  deleteInvite,
  getOrCreateDirectConversation,
  listContacts,
  removeContact,
  respondToInvite,
} from "@/lib/chat";
import { listMyInvites, sendInvite, type InviteView } from "@/lib/invites.functions";
import { AppShell } from "@/components/app-shell";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/contatos")({
  head: () => ({
    meta: [
      { title: "Contatos e convites — Zap Tri" },
      {
        name: "description",
        content:
          "Convide pessoas por e-mail ou telefone no Zap Tri. O contato só é criado depois que a pessoa aceita.",
      },
      { property: "og:title", content: "Contatos e convites — Zap Tri" },
      { property: "og:description", content: "Convites com consentimento: só vira contato quem aceitar." },
    ],
  }),
  component: ContactsPage,
});

const statusLabel: Record<InviteView["status"], string> = {
  pending: "Aguardando resposta",
  accepted: "Convite aceito",
  declined: "Convite recusado",
};

function InviteRow({
  invite,
  received,
  onRespond,
  onDelete,
}: {
  invite: InviteView;
  received: boolean;
  onRespond: (accept: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{invite.counterpartName ?? invite.target}</p>
        {invite.counterpartName ? (
          <p className="truncate text-xs text-muted-foreground">{invite.target}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {invite.message ? invite.message : statusLabel[invite.status]}
        </p>
      </div>
      {received && invite.status === "pending" ? (
        <>
          <Button size="icon" variant="ghost" aria-label="Aceitar convite" onClick={() => onRespond(true)}>
            <Check className="size-4 text-primary" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Recusar convite" onClick={() => onRespond(false)}>
            <X className="size-4 text-destructive" />
          </Button>
        </>
      ) : null}
      {!received && invite.status === "pending" ? (
        <Button size="icon" variant="ghost" aria-label="Cancelar convite" onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

function ContactsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const emptyForm = { email: "", phone: "", message: "" };
  const [form, setForm] = useState(emptyForm);
  const setField = (key: keyof typeof emptyForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const createInvite = useServerFn(sendInvite);
  const fetchInvites = useServerFn(listMyInvites);

  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
  const { data: invites } = useQuery({ queryKey: ["invites"], queryFn: () => fetchInvites({}) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    void queryClient.invalidateQueries({ queryKey: ["invites"] });
  };

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const email = form.email.trim();
      const phone = form.phone.trim();
      const message = form.message.trim();
      if (!email && !phone) throw new Error("Informe um e-mail ou telefone");
      if (email && !z.string().email().safeParse(email).success) throw new Error("E-mail inválido");
      return createInvite({
        data: {
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(message ? { message } : {}),
        },
      });
    },
    onSuccess: (result) => {
      setForm(emptyForm);
      refresh();
      toast.success(
        result.alreadyOnApp
          ? `Convite enviado${result.name ? ` para ${result.name}` : ""}. O contato só é criado quando a pessoa aceitar.`
          : "Convite enviado! Ele aparece para a pessoa quando ela criar a conta.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const respondMutation = useMutation({
    mutationFn: ({ invite, accept }: { invite: InviteView; accept: boolean }) =>
      respondToInvite(invite.id, accept),
    onSuccess: async (result) => {
      refresh();
      if (!result.accepted) {
        toast.success("Convite recusado");
        return;
      }
      const conversationId = await getOrCreateDirectConversation(result.inviterId);
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Contato adicionado");
      await navigate({ to: "/conversas", search: { c: conversationId } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteInviteMutation = useMutation({
    mutationFn: deleteInvite,
    onSuccess: () => refresh(),
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: removeContact,
    onSuccess: () => refresh(),
    onError: (error: Error) => toast.error(error.message),
  });

  const openChat = useMutation({
    mutationFn: getOrCreateDirectConversation,
    onSuccess: (conversationId) => navigate({ to: "/conversas", search: { c: conversationId } }),
    onError: (error: Error) => toast.error(error.message),
  });

  const pendingReceived = (invites?.received ?? []).filter((invite) => invite.status === "pending");

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <header>
          <h1 className="font-display text-2xl font-bold">Contatos</h1>
          <p className="text-sm text-muted-foreground">
            Convide por e-mail ou telefone. Cada pessoa decide se aceita — ninguém é adicionado sem
            permissão.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-primary" /> Enviar convite
            </CardTitle>
            <CardDescription>
              O contato e a conversa só são criados depois que a pessoa aceitar o convite.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">E-mail</Label>
                <Input
                  id="invite-email"
                  value={form.email}
                  onChange={(event) => setField("email", event.target.value)}
                  maxLength={255}
                  placeholder="amigo@exemplo.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-phone">Telefone</Label>
                <Input
                  id="invite-phone"
                  value={form.phone}
                  onChange={(event) => setField("phone", event.target.value)}
                  inputMode="tel"
                  maxLength={20}
                  placeholder="+55 11 99999-0000"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-message">Mensagem (opcional)</Label>
              <Textarea
                id="invite-message"
                value={form.message}
                onChange={(event) => setField("message", event.target.value)}
                maxLength={300}
                rows={2}
              />
            </div>
            <Button disabled={inviteMutation.isPending} onClick={() => inviteMutation.mutate()}>
              <UserPlus className="size-4" /> Enviar convite
            </Button>
          </CardContent>
        </Card>

        <Tabs defaultValue="lista">
          <TabsList>
            <TabsTrigger value="lista">Meus contatos</TabsTrigger>
            <TabsTrigger value="recebidos">
              Convites recebidos{pendingReceived.length > 0 ? ` (${pendingReceived.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="enviados">Convites enviados</TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="mt-3 space-y-2">
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contato ainda.</p>
            ) : (
              contacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-3 rounded-xl border border-border px-1 py-1">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
                    disabled={openChat.isPending}
                    onClick={() => openChat.mutate(contact.contact_id)}
                  >
                    <UserAvatar
                      userId={contact.contact_id}
                      path={contact.profile?.avatar_url}
                      name={contact.profile?.display_name}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {contact.nickname || contact.profile?.display_name}
                      </span>
                      {contact.profile?.email ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {contact.profile.email}
                        </span>
                      ) : null}
                      <span className="block truncate text-xs text-muted-foreground">
                        {contact.profile?.status_text}
                      </span>
                    </span>
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remover contato"
                    onClick={() => removeMutation.mutate(contact.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="recebidos" className="mt-3 space-y-2">
            {(invites?.received ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum convite recebido.</p>
            ) : (
              invites?.received.map((invite) => (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  received
                  onRespond={(accept) => respondMutation.mutate({ invite, accept })}
                  onDelete={() => undefined}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="enviados" className="mt-3 space-y-2">
            {(invites?.sent ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum convite enviado.</p>
            ) : (
              invites?.sent.map((invite) => (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  received={false}
                  onRespond={() => undefined}
                  onDelete={() => deleteInviteMutation.mutate(invite.id)}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
