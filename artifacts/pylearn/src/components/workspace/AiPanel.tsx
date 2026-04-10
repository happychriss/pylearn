import React, { useState, useRef, useEffect } from 'react';
import { useWorkspaceStore } from '@/store/workspace';
import { useChatStream, type StreamingMessage, type ParsedSuggestion } from '@/hooks/use-chat-stream';
import { DiffView } from '../ui/diff-view';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import { useAcceptSuggestion, useRejectSuggestion } from '@workspace/api-client-react';
import { ScrollArea } from '../ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';

interface AiPanelProps {
  credits: number;
  onCreditUsed?: () => void;
}

export function AiPanel({ credits, onCreditUsed }: AiPanelProps) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, isStreaming, removeSuggestion } = useChatStream();
  const noCredits = credits <= 0;
  const { activeFileId, openFiles, unsavedChanges, updateUnsavedContent } = useWorkspaceStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const acceptSuggestion = useAcceptSuggestion();
  const rejectSuggestion = useRejectSuggestion();

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
          updateUnsavedContent(activeFileId, updatedFile.content);
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
      <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" />
          <h2 className="font-display font-semibold text-foreground">AI Assistant</h2>
        </div>
        {noCredits
          ? <span className="text-xs text-destructive font-medium">No credits</span>
          : <span className="text-xs text-muted-foreground">{credits} credit{credits !== 1 ? 's' : ''}</span>}
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 text-muted-foreground">
              <Bot className="w-12 h-12 mb-3 opacity-20" />
              <p>Hello! I'm your AI coding assistant.</p>
              <p className="text-sm mt-1">Ask me to explain code, find bugs, or suggest improvements.</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
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
                    {msg.content && (
                      <div className={`p-3 rounded-2xl text-sm ${
                        msg.role === 'user' 
                          ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                          : 'bg-muted text-foreground rounded-tl-sm'
                      }`}>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
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
              ))}
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
          <p className="text-xs text-destructive text-center mb-2">No credits remaining — contact your teacher</p>
        )}
        <form onSubmit={handleSend} className="relative flex items-center">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={noCredits ? "No credits remaining" : "Ask a question..."}
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
