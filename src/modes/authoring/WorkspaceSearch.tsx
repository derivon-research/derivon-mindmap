import { FileText, GitBranch, LoaderCircle, Search, X } from 'lucide-react';
import { memo, useEffect, useId, useRef, useState } from 'react';
import type { WorkspaceContent } from '../../workspace/index';
import { createWorkspaceSearch, type SearchFilter, type SearchObject, type SearchPage } from './search';
import './workspace-search.css';

export const WorkspaceSearch = memo(function WorkspaceSearch({ content, onOpenObject }: {
  content: WorkspaceContent; onOpenObject: (object: SearchObject) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [composing, setComposing] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [page, setPage] = useState<SearchPage>({ hits: [], total: 0 });
  const service = useRef<ReturnType<typeof createWorkspaceSearch>>(null);
  const revision = useRef(0);
  const resultId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    revision.current++;
    setReady(false);
    setError('');
    setPage({ hits: [], total: 0 });
    try {
      const next = createWorkspaceSearch(content, () => setReady(true), (message) => { setError(message); setPending(false); });
      service.current = next;
      return () => { revision.current++; next.dispose(); service.current = null; };
    } catch (failure) { setError(String(failure)); }
  }, [content]);
  useEffect(() => {
    const ticket = ++revision.current;
    setPage({ hits: [], total: 0 });
    setActive(0);
    if (!query.trim() || !ready || composing || error) { setPending(false); return; }
    setPending(true);
    const timer = setTimeout(() => {
      void service.current?.search(query.trim(), filter).then((results) => {
        if (ticket !== revision.current) return;
        setPage(results);
        setPending(false);
      });
    }, 60);
    return () => { clearTimeout(timer); revision.current++; };
  }, [query, filter, ready, composing, error, content]);
  const visible = open && Boolean(query.trim());
  const activeResult = page.hits[active];
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);
  function choose(object: SearchObject) { setOpen(false); onOpenObject(object); }
  return <div className="ws-search" data-search-ready={ready && !error} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label className="ws-input"><Search size={15} aria-hidden="true" /><input ref={input} type="search" role="combobox"
      aria-label="搜索概念与推导文档" aria-expanded={visible} aria-controls={resultId} aria-autocomplete="list"
      aria-activedescendant={visible && activeResult ? `${resultId}-${active}` : undefined}
      placeholder="搜索名称、ID、描述或正文" value={query} onFocus={() => setOpen(true)}
      onChange={(event) => { revision.current++; setQuery(event.target.value); setPage({ hits: [], total: 0 }); setPending(Boolean(event.target.value)); setOpen(true); }}
      onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || composing) return;
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && page.hits.length) {
          event.preventDefault(); setOpen(true);
          setActive((value) => (value + (event.key === 'ArrowDown' ? 1 : page.hits.length - 1)) % page.hits.length);
        }
        if (event.key === 'Enter' && visible && activeResult && !pending) { event.preventDefault(); choose(activeResult); }
      }} />
      {query && <button type="button" className="ws-clear" title="清空搜索" aria-label="清空搜索"
        onClick={() => { revision.current++; setQuery(''); input.current?.focus(); }}><X size={14} /></button>}
    </label>
    {visible && <div className="ws-popover"><header><div className="ws-filters" role="group" aria-label="搜索对象类型">
      {(['all', 'concept', 'derivation'] as const).map((kind) => <button key={kind} type="button" aria-pressed={filter === kind}
        onMouseDown={(event) => event.preventDefault()} onClick={() => { if (kind !== filter) { revision.current++; setPage({ hits: [], total: 0 }); setPending(true); setFilter(kind); } }}>
        {kind === 'all' ? '全部' : kind === 'concept' ? '概念' : '推导'}</button>)}
    </div><small>{!pending && ready ? `${page.hits.length} / ${page.total}` : ''}</small></header>
      <div id={resultId} ref={list} className="ws-results" role="listbox" aria-label="搜索结果" aria-busy={!ready || pending}>
        {error ? <p role="alert">搜索不可用：{error}</p> : !ready || pending ? <p role="status"><LoaderCircle size={14} className="ws-spinner" />{ready ? '正在搜索…' : '正在建立索引…'}</p>
          : page.hits.length ? page.hits.map((item, position) => <button type="button" role="option" id={`${resultId}-${position}`}
            key={`${item.kind}:${item.id}`} aria-selected={position === active} onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(position)} onClick={() => choose(item)}>
            {item.kind === 'concept' ? <FileText size={16} /> : <GitBranch size={16} />}<span><strong>{item.label}</strong>
              <small>{item.kind === 'concept' ? '概念' : '推导'} · {item.id}</small>{item.snippet && <p>{item.snippet}</p>}</span>
          </button>) : <p>没有匹配对象</p>}
      </div>
    </div>}
  </div>;
});
