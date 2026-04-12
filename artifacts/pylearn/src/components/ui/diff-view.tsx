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

// --- LCS diff ----------------------------------------------------------------

type RawLine =
  | { type: 'same';   text: string; oldNum: number; newNum: number }
  | { type: 'add';    text: string; newNum: number }
  | { type: 'remove'; text: string; oldNum: number };

type DiffLine = RawLine | { type: 'hunk'; count: number };

/** Build LCS table (bottom-up DP). */
function buildLcs(a: string[], b: string[]): number[][] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? 1 + dp[i + 1][j + 1]
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

/** Compute line-level Myers/LCS diff between two file strings. */
function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const dp = buildLcs(oldLines, newLines);

  // Traceback
  const raw: RawLine[] = [];
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (
      i < oldLines.length &&
      j < newLines.length &&
      oldLines[i] === newLines[j]
    ) {
      raw.push({ type: 'same', text: oldLines[i], oldNum: i + 1, newNum: j + 1 });
      i++; j++;
    } else if (
      j < newLines.length &&
      (i >= oldLines.length || dp[i + 1][j] <= dp[i][j + 1])
    ) {
      raw.push({ type: 'add', text: newLines[j], newNum: j + 1 });
      j++;
    } else {
      raw.push({ type: 'remove', text: oldLines[i], oldNum: i + 1 });
      i++;
    }
  }

  // Collapse long runs of unchanged lines into hunk separators
  const CONTEXT = 3;
  const visible = new Set<number>();
  raw.forEach((line, idx) => {
    if (line.type !== 'same') {
      for (let d = -CONTEXT; d <= CONTEXT; d++) {
        const k = idx + d;
        if (k >= 0 && k < raw.length) visible.add(k);
      }
    }
  });

  // If nothing changed at all, show the whole file
  if (visible.size === 0) {
    return raw;
  }

  const result: DiffLine[] = [];
  let k = 0;
  while (k < raw.length) {
    if (visible.has(k)) {
      result.push(raw[k]);
      k++;
    } else {
      let count = 0;
      while (k < raw.length && !visible.has(k)) { count++; k++; }
      result.push({ type: 'hunk', count });
    }
  }
  return result;
}

// --- Component ---------------------------------------------------------------

export function DiffView({ suggestion, currentCode, onAccept, onReject, isApplying }: DiffViewProps) {
  const diffLines = computeDiff(currentCode, suggestion.newContent);
  const hasChanges = diffLines.some(l => l.type !== 'same' && l.type !== 'hunk');

  return (
    <div className="mt-3 rounded-xl border border-border bg-card overflow-hidden shadow-sm flex flex-col">
      <div className="bg-muted/50 px-3 py-2 border-b border-border flex items-center gap-2 text-sm font-medium text-foreground">
        <Code2 className="w-4 h-4 text-primary" />
        <span>Suggestion for {suggestion.file === '__current__' ? 'current file' : suggestion.file}</span>
      </div>

      <div className="p-3 text-sm text-foreground">
        <p className="mb-2 opacity-90">{suggestion.explanation}</p>

        <div className="rounded-md overflow-hidden border border-border font-mono text-xs bg-slate-950 text-slate-50 max-h-72 overflow-y-auto">
          {hasChanges ? (
            diffLines.map((line, i) => {
              if (line.type === 'hunk') {
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-0.5 bg-slate-800/60 text-slate-500 select-none">
                    <span className="w-10 shrink-0" />
                    <span>··· {line.count} unchanged {line.count === 1 ? 'line' : 'lines'} ···</span>
                  </div>
                );
              }
              const isAdd = line.type === 'add';
              const isRemove = line.type === 'remove';
              const lineNum = line.type === 'remove' ? line.oldNum
                            : line.type === 'same'   ? line.oldNum
                            : undefined;
              return (
                <div
                  key={i}
                  className={`flex ${
                    isAdd    ? 'bg-green-500/15 text-green-300' :
                    isRemove ? 'bg-red-500/15 text-red-300' : ''
                  }`}
                >
                  <span className="w-10 shrink-0 text-right pr-2 select-none opacity-40 border-r border-slate-700 mr-2">
                    {lineNum ?? ''}
                  </span>
                  <span className="w-4 shrink-0 select-none opacity-60">
                    {isAdd ? '+' : isRemove ? '-' : ' '}
                  </span>
                  <span className="flex-1 whitespace-pre">{line.text}</span>
                </div>
              );
            })
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
          <Check className="w-4 h-4 mr-1" /> {isApplying ? 'Applying...' : 'Accept Change'}
        </Button>
      </div>
    </div>
  );
}
