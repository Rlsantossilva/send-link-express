import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Archive, ArchiveRestore, ArrowLeft, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  conversationAvatarPath,
  conversationTitle,
  deleteMessage,
  leaveConversation,
  listConversations,
  listMessages,
  listReactions,
  messagePreview,
  requireUserId,
  sendMediaMessage,
  sendTextMessage,
  setConversationArchived,
  toggleReaction,
  type ConversationWithPeople,
} from "@/lib/chat";
import { AppShell } from "@/components/app-shell";
import { UserAvatar } from "@/components/user-avatar";
import { Composer } from "@/components/chat/composer";
import { MessageItem } from "@/components/chat/message-item";
import { NewConversationDialog, NewGroupDialog } from "@/components/chat/new-conversation-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/conversas")({
  head: () => ({
    meta: [
      { title: "Suas conversas — Zap Tri" },
      { name: "description", content: "Envie textos, fotos, vídeos e áudios em conversas individuais e grupos." },
      { property: "og:title", content: "Suas conversas — Zap Tri" },
      { property: "og:description", content: "Mensagens em tempo real com contatos e grupos." },
    ],
  }),
  validateSearch: z.object({ c: z.string().optional() }),
  component: ConversationsPage,
});

function ConversationsPage() {
  const { c: activeId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const [menuConversation, setMenuConversation] = useState<ConversationWithPeople | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data: myId } = useQuery({ queryKey: ["my-id"], queryFn: requireUserId });
  const { data: allConversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
  });

  const conversations = useMemo(
    () => allConversations.filter((conversation) => conversation.is_archived === showArchived),
    [allConversations, showArchived],
  );
  const archivedCount = allConversations.filter((conversation) => conversation.is_archived).length;

  const active = useMemo(
    () => allConversations.find((conversation) => conversation.id === activeId) ?? null,
    [allConversations, activeId],
  );

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", activeId],
    queryFn: () => listMessages(activeId as string),
    enabled: Boolean(activeId),
  });

  const { data: reactions = [] } = useQuery({
    queryKey: ["reactions", activeId],
    queryFn: () => listReactions(activeId as string),
    enabled: Boolean(activeId),
  });

  useEffect(() => {
    const channel = supabase
      .channel("chat-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["messages"] });
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeId]);

  const removeMessage = useMutation({
    mutationFn: deleteMessage,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reactMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      toggleReaction(messageId, emoji),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["reactions", activeId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setConversationArchived(id, archived),
    onSuccess: (_data, variables) => {
      setMenuConversation(null);
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(variables.archived ? "Conversa arquivada" : "Conversa desarquivada");
      if (variables.id === activeId) void navigate({ to: "/conversas", search: {} });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteConversation = useMutation({
    mutationFn: leaveConversation,
    onSuccess: (_data, id) => {
      setMenuConversation(null);
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Conversa excluída");
      if (id === activeId) void navigate({ to: "/conversas", search: {} });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function startPress(conversation: ConversationWithPeople) {
    longPressed.current = false;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setMenuConversation(conversation);
    }, 2000);
  }

  function endPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  function openConversation(id: string) {
    void navigate({ to: "/conversas", search: { c: id } });
  }

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-57px)] md:h-screen">
        <section
          className={cn(
            "flex w-full flex-col border-r border-border md:flex md:w-80",
            activeId ? "hidden md:flex" : "flex",
          )}
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h1 className="font-display text-lg font-bold">
              {showArchived ? "Arquivadas" : "Conversas"}
            </h1>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label={showArchived ? "Ver conversas" : "Ver arquivadas"}
                onClick={() => setShowArchived((value) => !value)}
              >
                {showArchived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              </Button>
              <NewGroupDialog onOpened={openConversation} />
              <NewConversationDialog onOpened={openConversation} />
            </div>
          </header>

          {!showArchived && archivedCount > 0 ? (
            <button
              onClick={() => setShowArchived(true)}
              className="border-b border-border/60 px-4 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              {archivedCount} conversa(s) arquivada(s)
            </button>
          ) : null}

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
            ) : conversations.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {showArchived
                  ? "Nenhuma conversa arquivada."
                  : "Nenhuma conversa ainda. Toque em “Nova” para começar."}
              </p>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => {
                    if (longPressed.current) {
                      longPressed.current = false;
                      return;
                    }
                    openConversation(conversation.id);
                  }}
                  onPointerDown={() => startPress(conversation)}
                  onPointerUp={endPress}
                  onPointerLeave={endPress}
                  onPointerCancel={endPress}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenuConversation(conversation);
                  }}
                  className={cn(
                    "flex w-full select-none items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted",
                    conversation.id === activeId && "bg-muted",
                  )}
                >
                  <UserAvatar
                    path={conversationAvatarPath(conversation, myId ?? "")}
                    name={conversationTitle(conversation, myId ?? "")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {conversationTitle(conversation, myId ?? "")}
                    </p>
                    {!conversation.is_group ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {conversation.members.find((m) => m.id !== myId)?.email ?? ""}
                      </p>
                    ) : null}
                    <p className="truncate text-xs text-muted-foreground">
                      {messagePreview(conversation.lastMessage)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <Dialog
          open={Boolean(menuConversation)}
          onOpenChange={(open) => !open && setMenuConversation(null)}
        >
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>
                {menuConversation ? conversationTitle(menuConversation, myId ?? "") : ""}
              </DialogTitle>
              <DialogDescription>O que você quer fazer com esta conversa?</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                className="justify-start"
                disabled={archiveMutation.isPending}
                onClick={() =>
                  menuConversation &&
                  archiveMutation.mutate({
                    id: menuConversation.id,
                    archived: !menuConversation.is_archived,
                  })
                }
              >
                {menuConversation?.is_archived ? (
                  <>
                    <ArchiveRestore className="mr-2 size-4" /> Desarquivar conversa
                  </>
                ) : (
                  <>
                    <Archive className="mr-2 size-4" /> Arquivar conversa
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                className="justify-start"
                disabled={deleteConversation.isPending}
                onClick={() => menuConversation && deleteConversation.mutate(menuConversation.id)}
              >
                <Trash2 className="mr-2 size-4" /> Excluir conversa
              </Button>
            </div>
          </DialogContent>
        </Dialog>


        <section className={cn("flex min-w-0 flex-1 flex-col", activeId ? "flex" : "hidden md:flex")}>
          {active ? (
            <>
              <header className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Voltar"
                  onClick={() => void navigate({ to: "/conversas", search: {} })}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <UserAvatar
                  path={conversationAvatarPath(active, myId ?? "")}
                  name={conversationTitle(active, myId ?? "")}
                  className="size-9"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{conversationTitle(active, myId ?? "")}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {active.is_group
                      ? `${active.members.length} participantes`
                      : active.members.find((m) => m.id !== myId)?.email || "Conversa individual"}
                  </p>
                </div>
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto bg-chat-canvas p-4">
                {messages.map((message) => {
                  const sender = active.members.find((member) => member.id === message.sender_id);
                  return (
                    <MessageItem
                      key={message.id}
                      message={message}
                      isOwn={message.sender_id === myId}
                      senderName={sender?.display_name ?? "Alguém"}
                      senderAvatar={sender?.avatar_url}
                      showSender={active.is_group}
                      onDelete={(id) => removeMessage.mutate(id)}
                    />
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <Composer
                onSendText={async (body) => {
                  await sendTextMessage(active.id, body);
                  void queryClient.invalidateQueries({ queryKey: ["messages", active.id] });
                }}
                onSendMedia={async (input) => {
                  await sendMediaMessage({ conversationId: active.id, ...input });
                  void queryClient.invalidateQueries({ queryKey: ["messages", active.id] });
                }}
              />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-chat-canvas p-8 text-center">
              <MessageSquare className="size-10 text-primary" />
              <p className="font-display text-lg font-semibold">Escolha uma conversa</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Selecione um chat à esquerda ou convide alguém pelos contatos.
              </p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
