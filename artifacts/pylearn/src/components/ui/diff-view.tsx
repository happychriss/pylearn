import React from 'react';
import { Button } from './button';
import { Check, X, Code2 } from 'lucide-react';
import { ParsedSuggestion } from '@/hooks/use-chat-stream';

interface DiffViewProps {
  suggestion: ParsedSuggestion;
  currentCode: string;
  onAccept: () => void;
  onReject: () => void;
  isApplying?: boolean;
}

function computeDiff(oldCode: string, newCode: string): Array<{ type: 'same' | 'add' | 'remove'; text: string; lineNum: number }> {
  const oldLines = oldCode.split('\n');
  const newLines = newCode.split('\n');
  const result: Array<{ type: 'same' | 'add' | 'remove'; text: string; lineNum: number }> = [];
  
  let lineNum = 1;
  const maxLen = Math.max(oldLines.length, newLines.length);
  
  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;
    
    if (oldLine === newLine) {
      result.push({ type: 'same', text: oldLine || '', lineNum: lineNum++ });
    } else {
      if (oldLine !== undefined) {
        result.push({ type: 'remove', text: oldLine, lineNum: lineNum++ });
      }
      if (newLine !== undefined) {
        result.push({ type: 'add', text: newLine, lineNum: lineNum++ });
      }
    }
  }
  
  return result;
}

export function DiffView({ suggestion, currentCode, onAccept, onReject, isApplying }: DiffViewProps) {
  const diffLines = computeDiff(currentCode, suggestion.newContent);
  const hasChanges = diffLines.some(l => l.type !== 'same');
  
  return (
    <div className="mt-3 rounded-xl border border-border bg-card overflow-hidden shadow-sm flex flex-col">
      <div className="bg-muted/50 px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Code2 className="w-4 h-4 text-primary" />
          <span>Suggestion for {suggestion.file}</span>
        </div>
      </div>
      
      <div className="p-3 text-sm text-foreground">
        <p className="mb-2 opacity-90">{suggestion.explanation}</p>
        
        <div className="rounded-md overflow-hidden border border-border font-mono text-xs bg-slate-950 text-slate-50 max-h-64 overflow-y-auto">
          {hasChanges ? (
            diffLines.map((line, i) => (
              <div
                key={i}
                className={`flex ${
                  line.type === 'add' ? 'bg-green-500/15 text-green-300' :
                  line.type === 'remove' ? 'bg-red-500/15 text-red-300' :
                  ''
                }`}
              >
                <span className="w-10 shrink-0 text-right pr-2 select-none opacity-40 border-r border-slate-700 mr-2">
                  {line.lineNum}
                </span>
                <span className="w-4 shrink-0 select-none opacity-60">
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </span>
                <span className="flex-1 whitespace-pre">{line.text}</span>
              </div>
            ))
          ) : (
            <div className="p-3 text-slate-400">No changes detected</div>
          )}
        </div>
      </div>
      
      <div className="px-3 py-2 bg-muted/30 border-t border-border flex gap-2 justify-end">
        <Button 
          variant="outline" 
          size="sm" 
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onReject}
          disabled={isApplying}
        >
          <X className="w-4 h-4 mr-1" /> Reject
        </Button>
        <Button 
          size="sm" 
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
          onClick={onAccept}
          disabled={isApplying}
        >
          <Check className="w-4 h-4 mr-1" /> {isApplying ? "Applying..." : "Accept Change"}
        </Button>
      </div>
    </div>
  );
}
