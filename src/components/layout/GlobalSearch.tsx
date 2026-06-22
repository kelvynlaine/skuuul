import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, BookOpen, User, X, Loader } from 'lucide-react';
import { supabase } from '../../services/supabase';

interface SearchResult {
  type: 'post' | 'course' | 'user';
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
}

const typeIcon: Record<string, React.ReactNode> = {
  post:   <FileText className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark" />,
  course: <BookOpen className="w-4 h-4 text-ios-green-light dark:text-ios-green-dark" />,
  user:   <User className="w-4 h-4 text-ios-indigo-light dark:text-ios-indigo-dark" />,
};

const typeLabel: Record<string, string> = {
  post: 'Post', course: 'Cours', user: 'Membre',
};

export const GlobalSearch: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Click outside closes
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    const { data } = await supabase.rpc('global_search', { query: q.trim() });
    setResults((data ?? []) as SearchResult[]);
    setLoading(false);
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    navigate(result.url);
  };

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="p-2 rounded-ios-md hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark transition-colors flex items-center gap-1.5"
        title="Recherche globale (⌘K)"
      >
        <Search className="w-4 h-4" />
        <span className="hidden lg:inline text-xs font-medium">⌘K</span>
      </button>

      {/* Search panel */}
      {open && (
        <div className="absolute right-0 md:right-auto md:left-1/2 md:-translate-x-1/2 mt-2 w-80 glass-panel border border-black/10 dark:border-white/10 rounded-ios-xl shadow-ios-strong z-50 overflow-hidden animate-fade-in">
          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-black/5 dark:border-white/5">
            <Search className="w-4 h-4 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInput}
              placeholder="Rechercher posts, cours, membres..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-ios-label-secondaryLight dark:placeholder:text-ios-label-secondaryDark"
              autoFocus
            />
            {loading && <Loader className="w-4 h-4 animate-spin text-ios-label-secondaryLight dark:text-ios-label-secondaryDark shrink-0" />}
            {!loading && query && (
              <button onClick={() => { setQuery(''); setResults([]); }} className="shrink-0">
                <X className="w-4 h-4 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark" />
              </button>
            )}
          </div>

          {/* Results */}
          <div className="max-h-72 overflow-y-auto">
            {query.length >= 2 && results.length === 0 && !loading && (
              <div className="py-8 text-center">
                <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Aucun résultat pour "{query}"</p>
              </div>
            )}
            {query.length < 2 && (
              <div className="py-6 text-center">
                <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Tapez au moins 2 caractères</p>
              </div>
            )}
            {(['post', 'course', 'user'] as const).map(type => {
              const items = grouped[type];
              if (!items?.length) return null;
              return (
                <div key={type}>
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark bg-black/5 dark:bg-white/5">
                    {typeLabel[type]}s
                  </div>
                  {items.map(result => (
                    <button
                      key={result.id}
                      onClick={() => handleSelect(result)}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-ios-sm bg-black/5 dark:bg-white/5 flex items-center justify-center shrink-0">
                        {typeIcon[type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{result.title}</p>
                        {result.subtitle && (
                          <p className="text-[11px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark truncate">{result.subtitle}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
