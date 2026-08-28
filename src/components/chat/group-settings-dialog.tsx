import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Ban, UserPlus, Save } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/user-avatar";
import {
  addGroupMembers,
  blockUser,
  listContacts,
  removeGroupMember,
  updateGroupInfo,
  uploadGroupAvatar,
  type ConversationWithPeople,
} from "@/lib/chat";

export function GroupSettingsDialog({
  conversation,
  myId,
  open,
  onOpenChange,
}: {
  conversation: ConversationWithPeople | null;
  myId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(conversation?.name ?? "");
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: listContacts });

  const isOwner = conversation?.created_by === myId;
  const memberIds = new Set((conversation?.members ?? []).map((member) => member.id));
  const addable = contacts.filter((contact) => !memberIds.has(contact.contact_id));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  const renameMutation = useMutation({
    mutationFn: () => updateGroupInfo(conversation!.id, { name: name.trim() }),
    onSuccess: () => {
      refresh();
      toast.success("Nome do grupo atualizado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const photoMutation = useMutation({
    mutationFn: (file: File) => uploadGroupAvatar(conversation!.id, file),
    onSuccess: () => {
      refresh();
      toast.success("Foto do grupo atualizada");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addMutation = useMutation({
    mutationFn: (userId: string) => addGroupMembers(conversation!.id, [userId]),
    onSuccess: () => {
      refresh();
      toast.success("Participante adicionado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const blockMutation = useMutation({
    mutationFn: async (userId: string) => {
      await blockUser(userId);
      await removeGroupMember(conversation!.id, userId);
    },
    onSuccess: () => {
      refresh();
      toast.success("Contato bloqueado e removido do grupo");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!conversation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações do grupo</DialogTitle>
          <DialogDescription>
            Quem criou o grupo (ou administradores) pode alterar a foto, renomear, adicionar e bloquear contatos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <UserAvatar path={conversation.avatar_url} name={conversation.name} className="size-16" />
            <div>
              <Label htmlFor="group-photo" className="cursor-pointer">
                <span className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                  <Camera className="size-4" /> Alterar foto
                </span>
              </Label>
              <input
                id="group-photo"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) photoMutation.mutate(file);
                  event.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-name">Nome do grupo</Label>
            <div className="flex gap-2">
              <Input
                id="group-name"
                value={name}
                maxLength={60}
                disabled={!isOwner}
                onChange={(event) => setName(event.target.value)}
              />
              <Button
                disabled={!isOwner || !name.trim() || renameMutation.isPending}
                onClick={() => renameMutation.mutate()}
              >
                <Save className="size-4" />
              </Button>
            </div>
            {!isOwner ? (
              <p className="text-xs text-muted-foreground">Só quem criou o grupo pode alterar o nome.</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Participantes ({conversation.members.length})</p>
            {conversation.members.map((member) => (
              <div key={member.id} className="flex items-center gap-3 rounded-xl border border-border px-2 py-2">
                <UserAvatar userId={member.id} path={member.avatar_url} name={member.display_name} className="size-8" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {member.id === myId ? "Você" : member.display_name || member.email}
                  </span>
                  {member.email ? (
                    <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
                  ) : null}
                </span>
                {isOwner && member.id !== myId ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Bloquear contato"
                    disabled={blockMutation.isPending}
                    onClick={() => blockMutation.mutate(member.id)}
                  >
                    <Ban className="size-4 text-destructive" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          {isOwner ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Adicionar contatos</p>
              {addable.length === 0 ? (
                <p className="text-xs text-muted-foreground">Todos os seus contatos já estão no grupo.</p>
              ) : (
                addable.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted"
                    disabled={addMutation.isPending}
                    onClick={() => addMutation.mutate(contact.contact_id)}
                  >
                    <UserAvatar
                      userId={contact.contact_id}
                      path={contact.profile?.avatar_url}
                      name={contact.profile?.display_name}
                      className="size-8"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {contact.nickname || contact.profile?.display_name || contact.profile?.email}
                    </span>
                    <UserPlus className="size-4 text-primary" />
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
