import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { UserAvatar } from "@/components/user-avatar";
import { createGroupConversation, getOrCreateDirectConversation, listContacts } from "@/lib/chat";

export function NewConversationDialog({ onOpened }: { onOpened: (conversationId: string) => void }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: listContacts });

  const directMutation = useMutation({
    mutationFn: getOrCreateDirectConversation,
    onSuccess: (conversationId) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setOpen(false);
      onOpened(conversationId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-xl">
          <Plus className="size-4" /> Nova
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
          <DialogDescription>Toque em um contato para começar a conversar.</DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {contacts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Você ainda não tem contatos. Adicione ou convide alguém na aba Contatos.
            </p>
          ) : (
            contacts.map((contact) => (
              <button
                key={contact.id}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted"
                disabled={directMutation.isPending}
                onClick={() => directMutation.mutate(contact.contact_id)}
              >
                <UserAvatar path={contact.profile?.avatar_url} name={contact.profile?.display_name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {contact.nickname || contact.profile?.display_name || contact.profile?.email}
                  </span>
                  {contact.profile?.email ? (
                    <span className="block truncate text-xs text-muted-foreground">{contact.profile.email}</span>
                  ) : null}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function NewGroupDialog({ onOpened }: { onOpened: (conversationId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: listContacts });

  const groupMutation = useMutation({
    mutationFn: () => createGroupConversation(groupName, selected),
    onSuccess: (conversationId) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setOpen(false);
      setGroupName("");
      setSelected([]);
      onOpened(conversationId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-xl">
          <Users className="size-4" /> Grupo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo grupo</DialogTitle>
          <DialogDescription>Escolha um nome e selecione os participantes.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder="Nome do grupo"
            maxLength={60}
          />
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {contacts.map((contact) => (
              <label
                key={contact.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted"
              >
                <Checkbox
                  checked={selected.includes(contact.contact_id)}
                  onCheckedChange={(checked) =>
                    setSelected((prev) =>
                      checked ? [...prev, contact.contact_id] : prev.filter((id) => id !== contact.contact_id),
                    )
                  }
                />
                <UserAvatar
                  path={contact.profile?.avatar_url}
                  name={contact.profile?.display_name}
                  className="size-8"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {contact.nickname || contact.profile?.display_name || contact.profile?.email}
                  </span>
                  {contact.profile?.email ? (
                    <span className="block truncate text-xs text-muted-foreground">{contact.profile.email}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
          <Button className="w-full" disabled={groupMutation.isPending} onClick={() => groupMutation.mutate()}>
            <Users className="size-4" /> Criar grupo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
