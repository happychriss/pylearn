import React, { useState, useRef, useEffect } from 'react';
import { useWorkspaceStore } from '@/store/workspace';
import { useChatStream, type StreamingMessage, type ParsedSuggestion } from '@/hooks/use-chat-stream';
import { DiffView } from '../ui/diff-view';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Send, Bot, User, Sparkles, Copy, Check } from 'lucide-react';
import { useAcceptSuggestion, useRejectSuggestion, getListFilesQueryKey, type ProjectFile } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ScrollArea } from '../ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from '@/lib/i18n';

interface AiPanelProps {
  credits: number;
  mode?: string;
  onCreditUsed?: () => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors py-0.5 px-1 rounded hover:bg-muted ml-auto">
      {copied ? <><Check className="w-3 h-3 text-green-500" />{t('ai_panel.copied')}</> : <><Copy className="w-3 h-3" />{t('ai_panel.copy')}</>}
    </button>
  );
}

export function AiPanel({ credits, mode, onCreditUsed }: AiPanelProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const { messages, sendMessage, isStreaming, removeSuggestion } = useChatStream();
  const noCredits = credits <= 0;
  const { activeFileId, openFiles, unsavedChanges, updateUnsavedContent, updateOpenFileContent, clearUnsavedContent } = useWorkspaceStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const acceptSuggestion = useAcceptSuggestion();
  const rejectSuggestion = useRejectSuggestion();
  const queryClient = useQueryClient();

  const activeFile = openFiles.find(f => f.id === activeFileId);
  const currentCode = activeFileId ? (unsavedChanges[activeFileId] ?? activeFile?.content ?? '') : '';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || noCredits) return;
    sendMessage(input, currentCode, activeFile?.filename);
    setInput('');
    onCreditUsed?.();
  };

  const handleAccept = (messageId: string, suggestion: ParsedSuggestion) => {
    if (!activeFileId) return;
    
    acceptSuggestion.mutate(
      { data: {
        fileId: activeFileId,
        newContent: suggestion.newContent,
        lineStart: null,
        lineEnd: null,
      } },
      {
        onSuccess: (updatedFile) => {
          // File is already saved in DB by the accept API call — sync local state.
          updateOpenFileContent(activeFileId, updatedFile.content);
          clearUnsavedContent(activeFileId);
          // The Run button builds its file list from the useListFiles query cache
          // (`unsavedChanges[id] ?? file.content`). That cache only refetches every 5s,
          // so without this write a Run fired right after Accept would execute the OLD
          // code. Patch the cache immediately to close the race.
          queryClient.setQueryData<ProjectFile[]>(getListFilesQueryKey({}), (old) =>
            old?.map(f => f.id === activeFileId ? { ...f, content: updatedFile.content } : f)
          );
          removeSuggestion(messageId);
        },
      }
    );
  };

  const handleReject = (messageId: string) => {
    rejectSuggestion.mutate({});
    removeSuggestion(messageId);
  };

  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      <div className="px-4 py-3 border-b border-border bg-muted/20 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 text-accent shrink-0" />
            <h2 className="font-display font-semibold text-foreground truncate">{t('ai_panel.title')}</h2>
          </div>
          {noCredits
            ? <span className="text-xs text-destructive font-medium shrink-0">{t('ai_panel.no_credits_badge')}</span>
            : <span className="text-xs text-muted-foreground shrink-0">{t(credits !== 1 ? 'ai_panel.credits_other' : 'ai_panel.credits_one', { count: credits })}</span>}
        </div>
        {mode && mode !== 'off' && (
          <div className="self-start px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
            {mode === 'chat' ? t('workspace.mode_chat') : mode === 'agent' ? t('workspace.mode_agent') : t('workspace.mode_suggest')}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 text-muted-foreground">
              <Bot className="w-12 h-12 mb-3 opacity-20" />
              <p>{t('ai_panel.welcome')}</p>
              <p className="text-sm mt-1">{t('ai_panel.welcome_hint')}</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => {
                // While streaming, mask everything from ---SUGGESTION--- onward in the last
                // assistant message so kids don't see raw JSON being typed out.
                const isStreamingThis = isStreaming && idx === messages.length - 1 && msg.role === 'assistant';
                const markerIdx = isStreamingThis ? msg.content.indexOf('---SUGGESTION---') : -1;
                const visibleContent = markerIdx !== -1 ? msg.content.slice(0, markerIdx).trim() : msg.content;
                const isThinking = isStreamingThis && markerIdx !== -1;

                return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 max-w-[95%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent/20 text-accent'
                  }`}>
                    {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col">
                    {(visibleContent || isThinking) && (
                      <div className={`p-3 rounded-2xl text-sm ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : 'bg-muted text-foreground rounded-tl-sm'
                      }`}>
                        {msg.role === 'user' ? (
                          <div className="whitespace-pre-wrap">{visibleContent}</div>
                        ) : visibleContent ? (
                          <ReactMarkdown
                            components={{
                              code: ({ children, className }) => {
                                const isBlock = className?.startsWith('language-');
                                const text = String(children).replace(/\n$/, '');
                                return isBlock
                                  ? <div className="mt-1 mb-1"><pre className="bg-background/60 rounded-t p-2 overflow-x-auto text-xs font-mono"><code>{children}</code></pre><div className="bg-background/40 rounded-b border-t border-border/30 flex"><CopyButton text={text} /></div></div>
                                  : <code className="bg-background/60 rounded px-1 font-mono text-xs">{children}</code>;
                              },
                              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                              ul: ({ children }) => <ul className="list-disc list-inside mb-1 space-y-0.5">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal list-inside mb-1 space-y-0.5">{children}</ol>,
                            }}
                          >
                            {visibleContent}
                          </ReactMarkdown>
                        ) : null}
                        {isThinking && (
                          <div className={`flex gap-1 items-center ${visibleContent ? 'mt-2' : ''}`}>
                            <span className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce" />
                            <span className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:0.2s]" />
                            <span className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:0.4s]" />
                          </div>
                        )}
                      </div>
                    )}
                    
                    {msg.suggestion && (
                      <DiffView 
                        suggestion={msg.suggestion}
                        currentCode={currentCode}
                        onAccept={() => handleAccept(msg.id, msg.suggestion!)}
                        onReject={() => handleReject(msg.id)}
                        isApplying={acceptSuggestion.isPending}
                      />
                    )}
                  </div>
                </motion.div>
              );
              })}
              {isStreaming && (
                <motion.div className="flex gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="p-3 bg-muted rounded-2xl rounded-tl-sm flex gap-1 items-center">
                    <span className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce" />
                    <span className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:0.2s]" />
                    <span className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:0.4s]" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>

      <div className="p-3 bg-background border-t border-border">
        {noCredits && (
          <p className="text-xs text-destructive text-center mb-2">{t('ai_panel.no_credits_hint')}</p>
        )}
        <form onSubmit={handleSend} className="relative flex items-center">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={noCredits ? t('ai_panel.placeholder_no_credits') : t('ai_panel.placeholder')}
            className="pr-12 rounded-xl border-2 focus-visible:ring-primary/20"
            disabled={isStreaming || noCredits}
          />
          <Button
            size="icon"
            type="submit"
            disabled={!input.trim() || isStreaming || noCredits}
            className="absolute right-1 w-8 h-8 rounded-lg bg-primary hover:bg-primary/90"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
