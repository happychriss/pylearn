import React, { useState, useRef, useEffect } from 'react';
import { useChatStream } from '@/hooks/use-chat-stream';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Send, Bot, User, Sparkles, Plus } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';

interface AiChatPanelProps {
  credits: number;
  onCreditUsed?: () => void;
  initialPrompt?: string;
  onPromptConsumed?: () => void;
}

export function AiChatPanel({ credits, onCreditUsed, initialPrompt, onPromptConsumed }: AiChatPanelProps) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, isStreaming, clearMessages } = useChatStream();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // When a prompt file is selected, populate the input
  useEffect(() => {
    if (initialPrompt) {
      setInput(initialPrompt);
      onPromptConsumed?.();
    }
  }, [initialPrompt, onPromptConsumed]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    if (credits <= 0) {
      setErrorMsg('No credits remaining. Contact your teacher for more credits.');
      return;
    }

    setErrorMsg(null);
    sendMessage(input);
    setInput('');
    onCreditUsed?.();
  };

  const handleNewChat = () => {
    clearMessages();
    setInput('');
    setErrorMsg(null);
  };

  const noCredits = credits <= 0;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h2 className="font-display font-bold text-lg text-foreground">AI Chat</h2>
            <p className="text-xs text-muted-foreground">
              {noCredits ? (
                <span className="text-destructive font-medium">No credits remaining</span>
              ) : (
                <>{credits} credit{credits !== 1 ? 's' : ''} remaining</>
              )}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleNewChat} className="rounded-xl">
          <Plus className="w-4 h-4 mr-2" /> New Chat
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden relative">
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 text-muted-foreground">
              <Bot className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">Hello! Ask me anything about AI.</p>
              <p className="text-sm mt-2 max-w-md">
                I'm here to help you learn about artificial intelligence. Ask me questions, explore ideas, and discover how AI works!
              </p>
              {noCredits && (
                <div className="mt-6 p-4 rounded-xl bg-destructive/10 text-destructive text-sm font-medium">
                  No credits remaining. Contact your teacher for more credits.
                </div>
              )}
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-4 max-w-3xl mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent/20 text-accent'
                  }`}>
                    {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                  </div>
                  <div className={`flex-1 min-w-0 p-4 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-muted text-foreground rounded-tl-sm'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </motion.div>
              ))}
              {isStreaming && (
                <motion.div className="flex gap-4 max-w-3xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="w-10 h-10 rounded-full bg-accent/20 text-accent flex items-center justify-center">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="p-4 bg-muted rounded-2xl rounded-tl-sm flex gap-1 items-center">
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

      {/* Error message */}
      {errorMsg && (
        <div className="px-6 py-2 bg-destructive/10 text-destructive text-sm text-center">
          {errorMsg}
        </div>
      )}

      {/* Input */}
      <div className="p-4 bg-card border-t border-border">
        <form onSubmit={handleSend} className="relative flex items-center max-w-3xl mx-auto">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={noCredits ? "No credits remaining — contact your teacher" : "Ask a question..."}
            className="pr-14 rounded-xl border-2 focus-visible:ring-primary/20 text-base py-6"
            disabled={isStreaming || noCredits}
          />
          <Button
            size="icon"
            type="submit"
            disabled={!input.trim() || isStreaming || noCredits}
            className="absolute right-2 w-10 h-10 rounded-lg bg-primary hover:bg-primary/90"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
