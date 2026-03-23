import { useState } from 'react';
import { ChatMessage } from '@workspace/api-client-react';

export interface ParsedSuggestion {
  file: string;
  lineStart?: number;
  lineEnd?: number;
  newContent: string;
  explanation: string;
}

export interface StreamingMessage extends ChatMessage {
  id: string;
  suggestion?: ParsedSuggestion;
}

interface SseTextEvent {
  type: 'text';
  content: string;
}

interface SseSuggestionEvent {
  type: 'suggestion';
  suggestion: ParsedSuggestion;
  cleanText: string;
}

interface SseDoneEvent {
  type: 'done';
}

type SseEvent = SseTextEvent | SseSuggestionEvent | SseDoneEvent;

export function useChatStream() {
  const [messages, setMessages] = useState<StreamingMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = async (
    content: string, 
    fileContext?: string, 
    filename?: string
  ) => {
    const newMessageId = Date.now().toString();
    const userMsg: StreamingMessage = { id: newMessageId + '-u', role: 'user', content };
    
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    const astMsgId = newMessageId + '-a';
    setMessages(prev => [...prev, { id: astMsgId, role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          fileContext,
          filename,
          conversationHistory: messages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (!response.ok || !response.body) throw new Error('Stream failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.startsWith('data: ') || line.length <= 6) continue;
          
          try {
            const event = JSON.parse(line.slice(6)) as SseEvent;
            
            if (event.type === 'text') {
              fullContent += event.content;
              setMessages(prev => 
                prev.map(m => m.id === astMsgId ? { ...m, content: fullContent } : m)
              );
            } else if (event.type === 'suggestion') {
              setMessages(prev => 
                prev.map(m => m.id === astMsgId ? { 
                  ...m, 
                  content: event.cleanText || fullContent,
                  suggestion: event.suggestion 
                } : m)
              );
            }
          } catch {
            // Partial JSON line, will be completed in next chunk via buffer
          }
        }
      }

      if (buffer.startsWith('data: ') && buffer.length > 6) {
        try {
          const event = JSON.parse(buffer.slice(6)) as SseEvent;
          if (event.type === 'text') {
            fullContent += event.content;
            setMessages(prev => 
              prev.map(m => m.id === astMsgId ? { ...m, content: fullContent } : m)
            );
          } else if (event.type === 'suggestion') {
            setMessages(prev => 
              prev.map(m => m.id === astMsgId ? { 
                ...m, 
                content: event.cleanText || fullContent,
                suggestion: event.suggestion 
              } : m)
            );
          }
        } catch {
          // ignore
        }
      }

    } catch (err) {
      console.error(err);
      setMessages(prev => 
        prev.map(m => m.id === astMsgId ? { ...m, content: 'Sorry, I encountered an error.' } : m)
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const removeSuggestion = (messageId: string) => {
    setMessages(prev => 
      prev.map(m => m.id === messageId ? { ...m, suggestion: undefined } : m)
    );
  };

  return { messages, sendMessage, isStreaming, removeSuggestion };
}
