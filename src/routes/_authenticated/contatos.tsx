import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  addContact,
  deleteInvite,
  findProfileByEmailOrPhone,
  getOrCreateDirectConversation,
  listContacts,
  listInvites,
  removeContact,
  respondToInvite,
  type Invite,
} from "@/lib/chat";
import { registerInvitedUser } from "@/lib/invites.functions";
import { formatCpf, onlyDigits } from "@/lib/cpf";
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
        content: "Adicione contatos e envie convites por e-mail ou número de telefone no Zap Tri.",
      },
      { property: "og:title", content: "Contatos e convites — Zap Tri" },
      { property: "og:description", content: "Gerencie contatos e convide pessoas para conversar." },
    ],
  }),
  component: ContactsPage,
});

const identifierSchema = z
  .string()
  .trim()
  .min(5, "Informe um e-mail ou telefone válido")
  .max(255, "Valor muito longo");


function InviteRow({
  invite,
  received,
  onRespond,
  onDelete,
}: {
  invite: Invite;
  received: boolean;
  onRespond: (accept: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{invite.invitee_email || invite.invitee_phone}</p>
        <p className="text-xs text-muted-foreground">
          {invite.message ? invite.message : invite.status === "pending" ? "Aguardando resposta" : invite.status}
        </p>
      </div>
      {received && invite.status === "pending" ? (
        <>
          <Button size="icon" variant="ghost" aria-label="Aceitar" onClick={() => onRespond(true)}>
            <Check className="size-4 text-primary" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Recusar" onClick={() => onRespond(false)}>
            <X className="size-4 text-destructive" />
          </Button>
        </>
      ) : null}
      {!received ? (
        <Button size="icon" variant="ghost" aria-label="Excluir convite" onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

function ContactsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const emptyForm = {
    fullName: "",
    cpf: "",
    birthDate: "",
    pin: "",
    email: "",
    phone: "",
    message: "",
  };
  const [form, setForm] = useState(emptyForm);
  const setField = (key: keyof typeof emptyForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));


  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: listContacts });
  const { data: invites } = useQuery({ queryKey: ["invites"], queryFn: listInvites });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    void queryClient.invalidateQueries({ queryKey: ["invites"] });
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const parsed = identifierSchema.safeParse(identifier);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Valor inválido");
      const profile = await findProfileByEmailOrPhone(parsed.data);
      if (!profile) throw new Error("Ninguém encontrado. Envie um convite.");
      await addContact(profile.id);
      return profile.display_name;
    },
    onSuccess: (name) => {
      setIdentifier("");
      refresh();
      toast.success(`${name} foi adicionado aos contatos`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const parsed = z
        .object({
          fullName: z.string().trim().min(3, "Informe o nome completo").max(120),
          cpf: z
            .string()
            .transform(onlyDigits)
            .refine((v) => v.length === 11, "CPF deve ter 11 dígitos"),
          birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de nascimento"),
          pin: z
            .string()
            .transform(onlyDigits)
            .refine((v) => v.length >= 6 && v.length <= 8, "O PIN deve ter de 6 a 8 dígitos"),
          email: z.string().trim().max(255).optional(),
          phone: z.string().trim().max(20).optional(),
          message: z.string().trim().max(300).optional(),
        })
        .safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      if (parsed.data.email && !z.string().email().safeParse(parsed.data.email).success) {
        throw new Error("E-mail inválido");
      }
      const result = await registerInvitedUser({ data: parsed.data });
      const conversationId = await getOrCreateDirectConversation(result.userId);
      return { ...result, conversationId };
    },
    onSuccess: (result) => {
      setForm(emptyForm);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(
        result.alreadyExisted
          ? `${result.fullName} já tinha conta e virou seu contato.`
          : `Conta de ${result.fullName} criada! Ela entra com o CPF e o PIN.`,
      );
      void navigate({ to: "/conversas", search: { c: result.conversationId } });
    },
    onError: (error: Error) => toast.error(error.message),
  });


  const respondMutation = useMutation({
    mutationFn: ({ invite, accept }: { invite: Invite; accept: boolean }) => respondToInvite(invite, accept),
    onSuccess: () => refresh(),
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

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <header>
          <h1 className="font-display text-2xl font-bold">Contatos</h1>
          <p className="text-sm text-muted-foreground">
            Adicione quem já usa o app ou convide por e-mail e telefone.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adicionar contato</CardTitle>
            <CardDescription>Busque por e-mail ou telefone cadastrado.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="email@exemplo.com ou +55 11 99999-0000"
              maxLength={255}
            />
            <Button disabled={addMutation.isPending} onClick={() => addMutation.mutate()}>
              <UserPlus className="size-4" /> Adicionar
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Convidar e cadastrar pessoa</CardTitle>
            <CardDescription>
              A conta é criada na hora: ela entra com o CPF e o PIN que você definir aqui.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Nome completo</Label>
              <Input
                id="invite-name"
                value={form.fullName}
                onChange={(event) => setField("fullName", event.target.value)}
                maxLength={120}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="invite-cpf">CPF</Label>
                <Input
                  id="invite-cpf"
                  value={formatCpf(form.cpf)}
                  onChange={(event) => setField("cpf", onlyDigits(event.target.value).slice(0, 11))}
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-birth">Data de nascimento</Label>
                <Input
                  id="invite-birth"
                  type="date"
                  value={form.birthDate}
                  onChange={(event) => setField("birthDate", event.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="invite-pin">Senha PIN (6 a 8 dígitos)</Label>
                <Input
                  id="invite-pin"
                  value={form.pin}
                  onChange={(event) => setField("pin", onlyDigits(event.target.value).slice(0, 8))}
                  inputMode="numeric"
                  placeholder="123456"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-phone">Telefone (opcional)</Label>
                <Input
                  id="invite-phone"
                  value={form.phone}
                  onChange={(event) => setField("phone", event.target.value)}
                  inputMode="tel"
                  placeholder="+55 11 99999-0000"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">E-mail (opcional)</Label>
              <Input
                id="invite-email"
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                maxLength={255}
                placeholder="amigo@exemplo.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-message">Mensagem de boas-vindas (opcional)</Label>
              <Textarea
                id="invite-message"
                value={form.message}
                onChange={(event) => setField("message", event.target.value)}
                maxLength={300}
                rows={2}
              />
            </div>
            <Button
              variant="secondary"
              disabled={inviteMutation.isPending}
              onClick={() => inviteMutation.mutate()}
            >
              <UserPlus className="size-4" /> Cadastrar e conversar
            </Button>

          </CardContent>
        </Card>

        <Tabs defaultValue="lista">
          <TabsList>
            <TabsTrigger value="lista">Meus contatos</TabsTrigger>
            <TabsTrigger value="recebidos">Convites recebidos</TabsTrigger>
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
                    <UserAvatar path={contact.profile?.avatar_url} name={contact.profile?.display_name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {contact.nickname || contact.profile?.display_name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {contact.profile?.status_text || contact.profile?.email}
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
                  onDelete={() => deleteInviteMutation.mutate(invite.id)}
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
