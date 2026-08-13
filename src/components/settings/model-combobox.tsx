'use client';

import { useState, useMemo } from 'react';
import { Check, ChevronDown, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { ProviderModelOption } from '@/lib/ai/defaults';
import type { AiProvider } from '@/lib/ai/types';
import { cn } from '@/lib/utils';

interface ModelComboboxProps {
  value: string;
  onChange: (val: string) => void;
  provider: AiProvider;
  models: ProviderModelOption[];
  loadingModels: boolean;
  fetchedLive: boolean;
  onRefreshModels: () => void;
  disabled?: boolean;
  placeholder?: string;
  tSearchPlaceholder?: string;
  tLiveBadge?: string;
  tDefaultBadge?: string;
  tCustomModelOption?: string;
}

export function ModelCombobox({
  value,
  onChange,
  provider,
  models,
  loadingModels,
  fetchedLive,
  onRefreshModels,
  disabled = false,
  placeholder = 'Select or type model...',
  tSearchPlaceholder = 'Search model...',
  tLiveBadge = 'Live API models',
  tDefaultBadge = 'Default models list',
  tCustomModelOption = 'Use custom model',
}: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Ensure current value is included in list options if custom/not fetched
  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.name && m.name.toLowerCase().includes(q)),
    );
  }, [models, search]);

  const hasExactMatch = useMemo(() => {
    const trimmedSearch = search.trim().toLowerCase();
    if (!trimmedSearch) return true;
    return models.some(
      (m) =>
        m.id.toLowerCase() === trimmedSearch ||
        (m.name && m.name.toLowerCase() === trimmedSearch),
    );
  }, [models, search]);

  const selectedOption = useMemo(
    () => models.find((m) => m.id === value),
    [models, value],
  );

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="ai-model"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="pr-9 font-mono text-sm"
          />
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                />
              }
            >
              {loadingModels ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[340px] p-0 shadow-lg">
              <div className="p-2 border-b border-border space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={tSearchPlaceholder}
                    className="h-8 pl-8 pr-2 text-xs"
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        fetchedLive ? 'bg-emerald-500' : 'bg-amber-500/70',
                      )}
                    />
                    {fetchedLive ? tLiveBadge : tDefaultBadge}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onRefreshModels();
                    }}
                    disabled={loadingModels}
                    className="flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
                  >
                    <RefreshCw
                      className={cn(
                        'h-3 w-3',
                        loadingModels && 'animate-spin',
                      )}
                    />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
                {filteredModels.length === 0 && hasExactMatch && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No matching models found.
                  </div>
                )}

                {filteredModels.map((m) => {
                  const isSelected = m.id === value;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onChange(m.id);
                        setOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-2.5 py-1.5 text-left rounded-sm text-xs transition-colors hover:bg-accent hover:text-accent-foreground',
                        isSelected && 'bg-accent/60 font-medium text-accent-foreground',
                      )}
                    >
                      <div className="flex flex-col truncate pr-2">
                        <span className="font-mono text-xs">{m.id}</span>
                        {m.name && m.name !== m.id && (
                          <span className="text-[10px] text-muted-foreground">
                            {m.name}
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}

                {search.trim() && !hasExactMatch && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(search.trim());
                      setOpen(false);
                      setSearch('');
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-left rounded-sm text-xs text-primary hover:bg-primary/10 transition-colors border-t border-border mt-1"
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {tCustomModelOption}: <strong className="font-mono">{search.trim()}</strong>
                    </span>
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onRefreshModels}
          disabled={disabled || loadingModels}
          title="Fetch available models via API"
          className="shrink-0 h-9 w-9"
        >
          <RefreshCw className={cn('h-4 w-4', loadingModels && 'animate-spin')} />
        </Button>
      </div>

      {selectedOption?.name && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span className="font-medium text-foreground">{selectedOption.name}</span>
          <span>•</span>
          <span>{provider.toUpperCase()}</span>
        </p>
      )}
    </div>
  );
}
