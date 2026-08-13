import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, KeyRound, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listAppUsers, setUserPin, type AdminUser } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administração de usuários — Zap Tri" },
      { name: "description", content: "Painel do administrador: usuários novos e antigos, dados de cadastro e PIN de acesso." },
      { property: "og:title", content: "Administração de usuários — Zap Tri" },
      { property: "og:description", content: "Veja os usuários do app e gerencie o PIN de acesso." },
    ],
  }),
  component: AdminPage,
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function AdminPage() {
  const queryClient = useQueryClient();
  const fetchUsers = useServerFn(listAppUsers);
  const savePin = useServerFn(setUserPin);
  const [term, setTerm] = useState("");
  const [order, setOrder] = useState<"new" | "old">("new");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [pin, setPin] = useState("");

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
    retry: false,
  });

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const list = users.filter((user) =>
      needle
        ? [user.display_name, user.full_name, user.email, user.phone, user.cpf]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(needle))
        : true,
    );
    return [...list].sort((a, b) =>
      order === "new"
        ? b.created_at.localeCompare(a.created_at)
        : a.created_at.localeCompare(b.created_at),
    );
  }, [users, term, order]);

  const pinMutation = useMutation({
    mutationFn: (input: { userId: string; pin: string }) => savePin({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setEditing(null);
      setPin("");
      toast.success("PIN atualizado — o usuário já pode entrar com ele");
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
            <ShieldCheck className="size-5 text-primary" /> Administração de usuários
          </h1>
          <p className="text-sm text-muted-foreground">
            Usuários novos e antigos do app, com dados de cadastro e o PIN de acesso.
          </p>
        </header>

        {error ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            {(error as Error).message}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-56 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por nome, e-mail, telefone ou CPF"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOrder((current) => (current === "new" ? "old" : "new"))}
              >
                {order === "new" ? "Mais novos primeiro" : "Mais antigos primeiro"}
              </Button>
              <span className="text-sm text-muted-foreground">{filtered.length} usuários</span>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando usuários…</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-3xl text-sm">
                  <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Usuário</th>
                      <th className="px-3 py-2">Contato</th>
                      <th className="px-3 py-2">CPF / Nascimento</th>
                      <th className="px-3 py-2">Cadastro</th>
                      <th className="px-3 py-2">Último acesso</th>
                      <th className="px-3 py-2">PIN</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((user) => (
                      <tr key={user.id} className="border-t border-border align-top">
                        <td className="px-3 py-2">
                          <p className="font-semibold">{user.display_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{user.full_name ?? "—"}</p>
                        </td>
                        <td className="px-3 py-2">
                          <p>{user.email ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{user.phone ?? "—"}</p>
                        </td>
                        <td className="px-3 py-2">
                          <p>{user.cpf ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{user.birth_date ?? "—"}</p>
                        </td>
                        <td className="px-3 py-2 text-xs">{formatDate(user.created_at)}</td>
                        <td className="px-3 py-2 text-xs">{formatDate(user.last_sign_in_at)}</td>
                        <td className="px-3 py-2">
                          {user.pin ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 font-mono text-xs"
                              onClick={() =>
                                setRevealed((current) => ({ ...current, [user.id]: !current[user.id] }))
                              }
                            >
                              {revealed[user.id] ? user.pin : "••••••••"}
                              {revealed[user.id] ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">não registrado</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => {
                              setEditing(user);
                              setPin("");
                            }}
                          >
                            <KeyRound className="size-3.5" /> Alterar PIN
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              O PIN só fica visível aqui depois de ser definido neste painel — senhas criadas pelo próprio
              usuário ficam guardadas criptografadas e não podem ser lidas.
            </p>
          </>
        )}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar PIN de acesso</DialogTitle>
            <DialogDescription>
              {editing?.display_name} — o novo PIN passa a valer imediatamente para entrar com CPF ou e-mail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="admin-pin">Novo PIN (mínimo 8 caracteres)</Label>
            <Input
              id="admin-pin"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              maxLength={72}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              disabled={pin.trim().length < 8 || pinMutation.isPending}
              onClick={() => editing && pinMutation.mutate({ userId: editing.id, pin: pin.trim() })}
            >
              Salvar PIN
            </Button>
          </DialogFooter>
        </DialogContent>

      </Dialog>
    </AppShell>
  );
}
