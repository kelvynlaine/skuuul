import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useCollaborativeStore, Canvas } from '../../store/collaborativeStore';
import { supabase } from '../../services/supabase';
import { 
  ArrowLeft, 
  Link as LinkIcon, 
  Users, 
  Clock, 
  UserMinus, 
  Check, 
  ShieldAlert,
  Underline as UnderlineIcon,
  Italic as ItalicIcon,
  VolumeX,
  UserPlus,
  Table,
  Undo,
  Redo
} from 'lucide-react';

const saveSelection = (containerNode: HTMLElement) => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  try {
    const range = sel.getRangeAt(0);
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(containerNode);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const start = preSelectionRange.toString().length;

    return {
      start: start,
      end: start + range.toString().length,
    };
  } catch (e) {
    console.error('Error saving selection:', e);
    return null;
  }
};

const restoreSelection = (containerNode: HTMLElement, savedSel: { start: number; end: number } | null) => {
  if (!savedSel) return;
  const sel = window.getSelection();
  if (!sel) return;

  try {
    let charIndex = 0;
    const range = document.createRange();
    range.setStart(containerNode, 0);
    range.collapse(true);

    const nodeStack: Node[] = [containerNode];
    let node: Node | undefined;
    let foundStart = false;
    let foundEnd = false;

    while ((node = nodeStack.pop())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const nextCharIndex = charIndex + (node.textContent || '').length;
        if (!foundStart && savedSel.start >= charIndex && savedSel.start <= nextCharIndex) {
          range.setStart(node, savedSel.start - charIndex);
          foundStart = true;
        }
        if (!foundEnd && savedSel.end >= charIndex && savedSel.end <= nextCharIndex) {
          range.setEnd(node, savedSel.end - charIndex);
          foundEnd = true;
        }
        if (foundStart && foundEnd) {
          break;
        }
        charIndex = nextCharIndex;
      } else {
        let i = node.childNodes.length;
        while (i--) {
          nodeStack.push(node.childNodes[i]);
        }
      }
    }

    if (!foundStart) {
      range.setStart(containerNode, containerNode.childNodes.length);
    }
    if (!foundEnd) {
      range.setEnd(containerNode, containerNode.childNodes.length);
    }

    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) {
    console.error('Error restoring selection:', e);
  }
};

const getRawEditorTextWithSpans = (html: string): string => {
  let text = html;
  // Convert block elements to newlines
  text = text.replace(/<div[^>]*>/gi, '\n').replace(/<\/div>/gi, '');
  text = text.replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  
  // Remove other tags EXCEPT span
  text = text.replace(/<(?!span|\/span|br)[^>]+>/gi, '');
  return text;
};

const parseMarkdown = (markdown: string): string => {
  if (!markdown) return '';
  
  let html = markdown;

  // 1. Tables
  const lines = html.split('\n');
  let inTable = false;
  let tableRows: string[] = [];
  const parsedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match line starting and ending with | (ignoring span wrappers if any)
    const rawLine = line.replace(/<[^>]+>/g, '').trim();
    if (rawLine.startsWith('|') && rawLine.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(line);
    } else {
      if (inTable) {
        const tableHtml = parseMarkdownTable(tableRows);
        parsedLines.push(tableHtml);
        inTable = false;
      }
      parsedLines.push(lines[i]);
    }
  }
  if (inTable) {
    parsedLines.push(parseMarkdownTable(tableRows));
  }
  html = parsedLines.join('\n');

  function parseMarkdownTable(rows: string[]): string {
    if (rows.length < 2) return rows.join('\n');
    
    // Strip spans to find separator row
    const secondRowClean = rows[1].replace(/<[^>]+>/g, '').replace(/[\s|:-]/g, '');
    const hasSeparator = secondRowClean === '';
    const startRow = hasSeparator ? 2 : 1;
    
    // Parse columns
    const getCols = (rowStr: string) => {
      const cols = rowStr.split('|');
      if (cols[0].trim() === '') cols.shift();
      if (cols[cols.length - 1]?.trim() === '') cols.pop();
      return cols.map(s => s.trim());
    };

    const headerCols = getCols(rows[0]);
    
    let table = '<table class="editor-table"><thead><tr>';
    headerCols.forEach(col => {
      table += `<th>${col}</th>`;
    });
    table += '</tr></thead><tbody>';

    for (let r = startRow; r < rows.length; r++) {
      const cols = getCols(rows[r]);
      table += '<tr>';
      for (let c = 0; c < headerCols.length; c++) {
        table += `<td>${cols[c] || '&nbsp;'}</td>`;
      }
      table += '</tr>';
    }
    table += '</tbody></table>';
    return table;
  }

  // 2. Headings (must be at start of block / line, ignoring span tag wrapping if at start)
  html = html.replace(/^(<span[^>]*>)?### (.*?)(<\/span>)?$/gm, '$1<h3>$2</h3>$3');
  html = html.replace(/^(<span[^>]*>)?## (.*?)(<\/span>)?$/gm, '$1<h2>$2</h2>$3');
  html = html.replace(/^(<span[^>]*>)?# (.*?)(<\/span>)?$/gm, '$1<h1>$2</h1>$3');

  // Also support standard markdown headings without span tags
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

  // 3. Bold (**text** or __text__)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // 4. Italic (*text* or _text_)
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');

  // 5. Code blocks (```code```)
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // 6. Inline code (`code`)
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // 7. Lists
  html = html.replace(/^\s*[-*]\s+(.*?)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>)/g, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  html = html.replace(/^\s*\d+\.\s+(.*?)$/gm, '<li class="ordered">$1</li>');
  html = html.replace(/((<li class="ordered">.*?<\/li>)+)/g, '<ol>$1</ol>');
  html = html.replace(/<li class="ordered">/g, '<li>');
  html = html.replace(/<\/ol>\s*<ol>/g, '');

  // 8. Blockquotes (> text)
  html = html.replace(/^\s*>\s+(.*?)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/<\/blockquote>\s*<blockquote>/g, '<br>');

  // 9. Links [text](url)
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // 10. Paragraphs wrapping
  const paragraphs = html.split(/\n\s*\n/);
  html = paragraphs.map(p => {
    const trimmed = p.trim();
    if (!trimmed) return '';
    if (/^\s*<(h1|h2|h3|table|ul|ol|blockquote|pre)/i.test(trimmed)) {
      return trimmed;
    }
    if (/^\s*<span[^>]*>\s*<(h1|h2|h3|table|ul|ol|blockquote|pre)/i.test(trimmed)) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return html;
};

export const CollaborativeCanvas: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile, profilesList, fetchProfilesList } = useAuthStore();
  
  const {
    activeCanvas,
    participants,
    auditLogs,
    loading,
    fetchCanvasDetails,
    updateCanvas,
    fetchParticipants,
    updateParticipantRole,
    removeParticipant,
    addParticipant,
    fetchAuditLogs,
    logCanvasAction
  } = useCollaborativeStore();

  // Local state for the editor
  const [fontFamily, setFontFamily] = useState('system-ui');
  const [textSize, setTextSize] = useState('16px');
  const [isUnderlined, setIsUnderlined] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [highlightColor, setHighlightColor] = useState<string | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [searchMember, setSearchMember] = useState('');
  const [showAuthors, setShowAuthors] = useState(true);

  const [blockFormat, setBlockFormat] = useState('p');
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [hoveredGrid, setHoveredGrid] = useState({ r: 0, c: 0 });
  const tablePickerRef = useRef<HTMLDivElement | null>(null);

  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [rawTextBeforePreview, setRawTextBeforePreview] = useState('');

  const typingTimeoutRef = useRef<any | null>(null);
  const isTypingRef = useRef(false);
  const isPreviewModeRef = useRef(false);
  const editorRef = useRef<HTMLDivElement | null>(null);

  // Close table picker when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (tablePickerRef.current && !tablePickerRef.current.contains(e.target as Node)) {
        setShowTablePicker(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Load details and logs
  useEffect(() => {
    if (id) {
      fetchCanvasDetails(id);
      fetchParticipants(id);
      fetchAuditLogs(id);
    }
  }, [id, fetchCanvasDetails, fetchParticipants, fetchAuditLogs]);

  // Sync state once canvas is loaded
  useEffect(() => {
    if (activeCanvas && !isTyping) {
      if (editorRef.current) {
        const newContent = activeCanvas.content || '';
        if (isPreviewMode) {
          setRawTextBeforePreview(newContent);
          const parsedHtml = parseMarkdown(getRawEditorTextWithSpans(newContent));
          if (editorRef.current.innerHTML !== parsedHtml) {
            editorRef.current.innerHTML = parsedHtml;
          }
        } else {
          if (editorRef.current.innerHTML !== newContent) {
            const isFocused = document.activeElement === editorRef.current;
            const savedSel = isFocused ? saveSelection(editorRef.current) : null;
            editorRef.current.innerHTML = newContent;
            if (savedSel) {
              restoreSelection(editorRef.current, savedSel);
            }
          }
        }
      }
      setFontFamily(activeCanvas.font_family || 'system-ui');
      setTextSize(activeCanvas.text_size || '16px');
      setIsUnderlined(activeCanvas.is_underlined || false);
      setIsItalic(activeCanvas.is_italic || false);
      setHighlightColor(activeCanvas.highlight_color || null);
    }
  }, [activeCanvas, isTyping, isPreviewMode]);

  // Keep refs in sync so the subscription callback doesn't capture stale state
  useEffect(() => { isTypingRef.current = isTyping; }, [isTyping]);
  useEffect(() => { isPreviewModeRef.current = isPreviewMode; }, [isPreviewMode]);

  // Real-time Supabase subscription — deps: [id] only to avoid teardown on every keystroke
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`canvas_db_changes:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'collaborative_canvases',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const newDoc = payload.new as Canvas;
          // Only sync if local user is not actively writing to avoid cursor jumps
          if (!isTypingRef.current) {
            if (editorRef.current) {
              const newContent = newDoc.content || '';
              if (isPreviewModeRef.current) {
                setRawTextBeforePreview(newContent);
                const parsedHtml = parseMarkdown(getRawEditorTextWithSpans(newContent));
                if (editorRef.current.innerHTML !== parsedHtml) {
                  editorRef.current.innerHTML = parsedHtml;
                }
              } else {
                if (editorRef.current.innerHTML !== newContent) {
                  const isFocused = document.activeElement === editorRef.current;
                  const savedSel = isFocused ? saveSelection(editorRef.current) : null;
                  editorRef.current.innerHTML = newContent;
                  if (savedSel) {
                    restoreSelection(editorRef.current, savedSel);
                  }
                }
              }
            }
            setFontFamily(newDoc.font_family || 'system-ui');
            setTextSize(newDoc.text_size || '16px');
            setIsUnderlined(newDoc.is_underlined || false);
            setIsItalic(newDoc.is_italic || false);
            setHighlightColor(newDoc.highlight_color || null);
          }
          fetchParticipants(id);
          fetchAuditLogs(id);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'canvas_participants', filter: `canvas_id=eq.${id}` },
        () => { fetchParticipants(id); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'canvas_audit_logs', filter: `canvas_id=eq.${id}` },
        () => { fetchAuditLogs(id); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Access rights check
  const isOwner = activeCanvas?.creator_id === user?.id;
  const isAdmin = profile?.role === 'admin';
  const myParticipantRecord = participants.find(p => p.user_id === user?.id);
  const isParticipant = !!myParticipantRecord || isOwner || isAdmin;
  const isViewer = myParticipantRecord?.role === 'viewer' && !isOwner && !isAdmin;

  // Load profiles list for creator/admin search
  useEffect(() => {
    if (isOwner || isAdmin) {
      fetchProfilesList();
    }
  }, [isOwner, isAdmin, fetchProfilesList]);

  // Filter members that match the search query
  const availableMembers = profilesList.filter((m) => {
    if (m.id === user?.id) return false;
    if (participants.some((p) => p.user_id === m.id)) return false;
    const query = searchMember.toLowerCase().trim();
    if (!query) return false;
    return (
      m.username.toLowerCase().includes(query) ||
      (m.full_name && m.full_name.toLowerCase().includes(query))
    );
  }).slice(0, 5);

  const getAuthorColor = (username: string) => {
    const colors = [
      '#3b82f6', // blue
      '#ec4899', // pink
      '#10b981', // green
      '#f59e0b', // orange
      '#8b5cf6', // purple
      '#06b6d4', // cyan
    ];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const applySelectionStyle = (styleName: string, styleValue: string) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.toString() === '') return;
    const range = selection.getRangeAt(0);

    const span = document.createElement('span');
    span.style[styleName as any] = styleValue;
    
    const currentAuthor = profile?.username || 'Anonyme';
    span.setAttribute('data-author', currentAuthor);
    const authorColor = getAuthorColor(currentAuthor);
    span.style.setProperty('--author-color', authorColor);
    span.style.borderBottom = `1.5px dashed ${authorColor}`;

    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddMember = async (memberId: string) => {
    if (!id) return;
    const success = await addParticipant(id, memberId);
    if (success) {
      setSearchMember('');
    } else {
      alert("Erreur lors de l'ajout du membre.");
    }
  };

  // Debounced auto-save function
  const triggerAutoSave = (
    text: string, 
    font: string, 
    size: string, 
    under: boolean, 
    ital: boolean, 
    highlight: string | null
  ) => {
    setSaveStatus('saving');

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(async () => {
      if (!id) return;
      
      const success = await updateCanvas(id, {
        content: text,
        font_family: font,
        text_size: size,
        is_underlined: under,
        is_italic: ital,
        highlight_color: highlight
      });

      if (success) {
        setSaveStatus('saved');
        setIsTyping(false);
      } else {
        setSaveStatus('error');
      }
    }, 1500); // Save 1.5 seconds after user stops typing
  };

  const handleEditorInput = (e: React.FormEvent<HTMLDivElement>) => {
    if (isViewer) return;
    const html = e.currentTarget.innerHTML;
    setIsTyping(true);
    triggerAutoSave(html, fontFamily, textSize, isUnderlined, isItalic, highlightColor);
  };

  const getActiveBlockFormat = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return 'p';
    try {
      const range = selection.getRangeAt(0);
      let parent = range.commonAncestorContainer;
      if (parent.nodeType === Node.TEXT_NODE) {
        parent = parent.parentNode!;
      }
      
      let current: Node | null = parent;
      while (current && current !== editorRef.current) {
        if (current.nodeName === 'H1') return 'h1';
        if (current.nodeName === 'H2') return 'h2';
        if (current.nodeName === 'H3') return 'h3';
        if (current.nodeName === 'P') return 'p';
        current = current.parentNode;
      }
    } catch (e) {
      console.error(e);
    }
    return 'p';
  };

  const handleSelectionChange = () => {
    const format = getActiveBlockFormat();
    setBlockFormat(format);
  };

  const handleEditorClickOrKeyUp = () => {
    handleSelectionChange();
  };

  const applyBlockFormat = (tag: string) => {
    if (isViewer) return;
    
    if (editorRef.current && document.activeElement !== editorRef.current) {
      editorRef.current.focus();
    }
    
    document.execCommand('formatBlock', false, tag);
    setBlockFormat(tag);
    
    if (editorRef.current) {
      handleEditorInput({ currentTarget: editorRef.current } as any);
    }
  };

  const insertTable = (cols: number, rows: number) => {
    if (isViewer) return;
    
    if (editorRef.current && document.activeElement !== editorRef.current) {
      editorRef.current.focus();
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    try {
      const range = selection.getRangeAt(0);
      
      let container = range.commonAncestorContainer;
      if (container.nodeType === Node.TEXT_NODE) {
        container = container.parentNode!;
      }
      if (!editorRef.current || !editorRef.current.contains(container)) return;

      const table = document.createElement('table');
      table.className = 'editor-table';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const th = document.createElement('th');
        th.innerHTML = `En-tête ${c + 1}`;
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (let r = 0; r < rows; r++) {
        const row = document.createElement('tr');
        for (let c = 0; c < cols; c++) {
          const td = document.createElement('td');
          td.innerHTML = '&nbsp;';
          row.appendChild(td);
        }
        tbody.appendChild(row);
      }
      table.appendChild(tbody);

      range.deleteContents();
      range.insertNode(table);

      const p = document.createElement('p');
      p.innerHTML = '&nbsp;';
      table.parentNode?.insertBefore(p, table.nextSibling);

      const firstTd = table.querySelector('td');
      if (firstTd) {
        const newRange = document.createRange();
        newRange.setStart(firstTd, 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }

      handleEditorInput({ currentTarget: editorRef.current } as any);
    } catch (e) {
      console.error('Error inserting table:', e);
    }
  };

  const handleTogglePreview = () => {
    if (isPreviewMode) {
      if (editorRef.current) {
        editorRef.current.innerHTML = rawTextBeforePreview || '';
      }
      setIsPreviewMode(false);
    } else {
      if (editorRef.current) {
        const currentHtml = editorRef.current.innerHTML;
        setRawTextBeforePreview(currentHtml);
        
        const rawText = getRawEditorTextWithSpans(currentHtml);
        const parsedHtml = parseMarkdown(rawText);
        
        editorRef.current.innerHTML = parsedHtml;
      }
      setIsPreviewMode(true);
    }
  };

  const handleUndoRedo = (action: 'undo' | 'redo') => {
    if (isViewer) return;
    
    // Focus the editor
    if (editorRef.current && document.activeElement !== editorRef.current) {
      editorRef.current.focus();
    }

    try {
      document.execCommand(action, false);
      // Trigger save
      if (editorRef.current) {
        handleEditorInput({ currentTarget: editorRef.current } as any);
      }
    } catch (e) {
      console.error(`Error performing ${action}:`, e);
    }
  };

  const ensureAuthorSpan = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    
    let parent = range.commonAncestorContainer;
    if (parent.nodeType === Node.TEXT_NODE) {
      parent = parent.parentNode!;
    }
    
    const currentAuthor = profile?.username || 'Anonyme';
    
    // If we're already inside our own author span, check if style matches
    if (
      parent && 
      (parent as HTMLElement).tagName === 'SPAN' && 
      (parent as HTMLElement).getAttribute('data-author') === currentAuthor
    ) {
      const parentEl = parent as HTMLElement;
      const parentUnderlined = parentEl.style.textDecoration.includes('underline');
      const parentItalic = parentEl.style.fontStyle === 'italic';
      const parentFont = parentEl.style.fontFamily || '';
      const parentSize = parentEl.style.fontSize || '';
      
      const fontMatches = !fontFamily || parentFont.toLowerCase().replace(/['"]/g, '') === fontFamily.toLowerCase().replace(/['"]/g, '');
      const sizeMatches = !textSize || parentSize === textSize;
      const underMatches = parentUnderlined === isUnderlined;
      const italMatches = parentItalic === isItalic;
      
      let expectedBg = '';
      if (highlightColor === 'yellow') expectedBg = 'rgb(254, 240, 138)';
      else if (highlightColor === 'green') expectedBg = 'rgb(187, 247, 208)';
      else if (highlightColor === 'pink') expectedBg = 'rgb(251, 207, 232)';
      else if (highlightColor === 'blue') expectedBg = 'rgb(191, 219, 254)';
      
      const parentBg = parentEl.style.backgroundColor || '';
      const bgMatches = !highlightColor ? (!parentBg || parentBg === 'initial' || parentBg === 'transparent') : (parentBg === expectedBg || parentBg.replace(/\s/g, '') === expectedBg.replace(/\s/g, ''));

      if (fontMatches && sizeMatches && underMatches && italMatches && bgMatches) {
        return;
      }
    }
    
    const span = document.createElement('span');
    span.setAttribute('data-author', currentAuthor);
    const authorColor = getAuthorColor(currentAuthor);
    span.style.setProperty('--author-color', authorColor);
    span.style.borderBottom = `1.5px dashed ${authorColor}`;
    
    // Inherit active styling state
    if (fontFamily) span.style.fontFamily = fontFamily;
    if (textSize) span.style.fontSize = textSize;
    if (isUnderlined) span.style.textDecoration = 'underline';
    if (isItalic) span.style.fontStyle = 'italic';
    if (highlightColor) {
      let bg = '';
      if (highlightColor === 'yellow') bg = '#fef08a';
      else if (highlightColor === 'green') bg = '#bbf7d0';
      else if (highlightColor === 'pink') bg = '#fbcfe8';
      else if (highlightColor === 'blue') bg = '#bfdbfe';
      span.style.backgroundColor = bg;
    }

    // Insert an invisible zero-width space inside the span so the cursor is placed inside
    const textNode = document.createTextNode('\u200B');
    span.appendChild(textNode);
    
    range.insertNode(span);
    
    // Position cursor inside the span after the zero-width space
    range.setStart(textNode, 1);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isViewer) return;
    
    // Let control/navigation keys bypass completely
    if (e.key.length > 1) return;

    // Check if ctrlKey, metaKey (Cmd), or altKey are pressed to avoid messing with shortcuts
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Place the cursor inside the correct author span prior to text insertion
    ensureAuthorSpan();
  };

  const handleStyleChange = (type: 'font' | 'size' | 'under' | 'ital' | 'highlight', value: any) => {
    if (isViewer) return;

    let font = fontFamily;
    let size = textSize;
    let under = isUnderlined;
    let ital = isItalic;
    let highlight = highlightColor;

    if (type === 'font') {
      font = value;
      setFontFamily(value);
      applySelectionStyle('fontFamily', value);
    } else if (type === 'size') {
      size = value;
      setTextSize(value);
      applySelectionStyle('fontSize', value);
    } else if (type === 'under') {
      under = !isUnderlined;
      setIsUnderlined(under);
      applySelectionStyle('textDecoration', under ? 'underline' : 'none');
    } else if (type === 'ital') {
      ital = !isItalic;
      setIsItalic(ital);
      applySelectionStyle('fontStyle', ital ? 'italic' : 'normal');
    } else if (type === 'highlight') {
      highlight = value;
      setHighlightColor(value);
      let bg = '';
      if (value === 'yellow') bg = '#fef08a';
      else if (value === 'green') bg = '#bbf7d0';
      else if (value === 'pink') bg = '#fbcfe8';
      else if (value === 'blue') bg = '#bfdbfe';
      applySelectionStyle('backgroundColor', bg);
    }

    setIsTyping(true);
    // Write edit audit log
    if (id) {
      logCanvasAction(id, 'edited', `Mise en forme mise à jour par ${profile?.full_name || profile?.username}.`);
    }
    
    if (editorRef.current) {
      triggerAutoSave(editorRef.current.innerHTML, font, size, under, ital, highlight);
    }
  };

  const handleCopyInvite = () => {
    if (!id) return;
    const inviteUrl = `${window.location.origin}/collaborative/join/${id}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleKickUser = async (userId: string) => {
    if (!id) return;
    if (confirm("Voulez-vous exclure ce participant du document ?")) {
      await removeParticipant(id, userId);
    }
  };

  const handleToggleRole = async (userId: string, currentRole: 'editor' | 'viewer') => {
    if (!id) return;
    const nextRole = currentRole === 'editor' ? 'viewer' : 'editor';
    await updateParticipantRole(id, userId, nextRole);
  };

  // Check if non-participant tries to access
  if (!loading && activeCanvas && !isParticipant) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 relative z-10">
        <div className="glass-panel max-w-sm w-full p-8 rounded-ios-2xl border border-black/5 dark:border-white/5 shadow-ios-strong text-center space-y-6 animate-scale-in">
          <div className="w-16 h-16 bg-ios-pink-light/10 text-ios-pink-light dark:bg-ios-pink-dark/15 dark:text-ios-pink-dark rounded-full flex items-center justify-center text-2xl mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h3 className="font-extrabold text-lg">Accès non autorisé</h3>
          <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark leading-relaxed">
            Vous ne faites pas partie de ce projet collaboratif. Demandez un lien d'invitation à son créateur pour y participer.
          </p>
          <button
            onClick={() => navigate('/collaborative')}
            className="w-full py-3 bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-ios-xl text-sm font-bold shadow-ios-glow hover:opacity-95 transition"
          >
            Retour aux documents
          </button>
        </div>
      </div>
    );
  }



  return (
    <div className="space-y-6 animate-fade-in relative z-10">
      
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/collaborative')}
            className="p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors border border-black/5 dark:border-white/5 bg-white/60 dark:bg-neutral-900"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-extrabold flex items-center gap-2">
              📝 {activeCanvas?.title || "Chargement..."}
            </h1>
            <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-medium">
              Créé par @{activeCanvas?.creator?.username}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Saved / saving indicator */}
          <div className="text-xs font-semibold flex items-center gap-1.5 bg-black/5 dark:bg-white/5 px-3 py-2 rounded-ios-md">
            {saveStatus === 'saved' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span className="text-emerald-500">Enregistré</span>
              </>
            )}
            {saveStatus === 'saving' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-ios-orange-light dark:bg-ios-orange-dark animate-pulse"></span>
                <span className="text-ios-orange-light dark:text-ios-orange-dark">Enregistrement...</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-ios-pink-light dark:bg-ios-pink-dark"></span>
                <span className="text-ios-pink-light dark:text-ios-pink-dark">Erreur de sauvegarde</span>
              </>
            )}
          </div>

          <button
            onClick={handleCopyInvite}
            className="bg-ios-blue-light/10 dark:bg-ios-blue-dark/25 text-ios-blue-light dark:text-ios-blue-dark border border-ios-blue-light/20 px-4 py-2 rounded-ios-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95 transition"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Lien Copié !</span>
              </>
            ) : (
              <>
                <LinkIcon className="w-3.5 h-3.5" />
                <span>Lien d'invitation</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Rich Editor Workspace */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* Styled Formatting Toolbar */}
          <div className="glass-panel p-2.5 rounded-ios-xl border border-black/5 dark:border-white/5 flex flex-wrap items-center gap-2 bg-white/70 dark:bg-[#1c1c1e]/80 shadow-sm relative z-20">
            
            {/* Paragraph formatting dropdown */}
            <select
              disabled={isViewer || isPreviewMode}
              value={blockFormat}
              onChange={(e) => applyBlockFormat(e.target.value)}
              className="glass-input text-xs font-bold py-1.5 px-3 rounded appearance-none cursor-pointer pr-7 outline-none dark:bg-neutral-900 bg-white"
              title="Style de paragraphe"
            >
              <option value="p">Paragraphe (Normal)</option>
              <option value="h1">Titre 1 (Principal)</option>
              <option value="h2">Titre 2 (Section)</option>
              <option value="h3">Sous-titre (H3)</option>
            </select>

            <div className="h-6 w-[1px] bg-black/10 dark:bg-white/10 mx-1"></div>

            {/* Undo/Redo Buttons */}
            <button
              disabled={isViewer || isPreviewMode}
              type="button"
              onClick={() => handleUndoRedo('undo')}
              className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark transition disabled:opacity-30 flex items-center justify-center"
              title="Annuler (Ctrl+Z)"
            >
              <Undo className="w-4 h-4" />
            </button>

            <button
              disabled={isViewer || isPreviewMode}
              type="button"
              onClick={() => handleUndoRedo('redo')}
              className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark transition disabled:opacity-30 flex items-center justify-center"
              title="Rétablir (Ctrl+Y)"
            >
              <Redo className="w-4 h-4" />
            </button>

            <div className="h-6 w-[1px] bg-black/10 dark:bg-white/10 mx-1"></div>

            {/* Fonts list */}
            <select
              disabled={isViewer || isPreviewMode}
              value={fontFamily}
              onChange={(e) => handleStyleChange('font', e.target.value)}
              className="glass-input text-xs font-bold py-1.5 px-3 rounded appearance-none cursor-pointer pr-7 outline-none dark:bg-neutral-900 bg-white"
            >
              <option value="system-ui">Sans-serif (System)</option>
              <option value="Courier New">Monospace (Courier)</option>
              <option value="Georgia">Serif (Georgia)</option>
              <option value="Times New Roman">Classic (Times)</option>
              <option value="Playfair Display" style={{ fontFamily: 'Playfair Display' }}>Playfair Display (Élégant)</option>
              <option value="Montserrat" style={{ fontFamily: 'Montserrat' }}>Montserrat (Moderne)</option>
              <option value="Poppins" style={{ fontFamily: 'Poppins' }}>Poppins (Géométrique)</option>
              <option value="Fira Code" style={{ fontFamily: 'Fira Code' }}>Fira Code (Code)</option>
              <option value="Lora" style={{ fontFamily: 'Lora' }}>Lora (Littéraire)</option>
              <option value="Merriweather" style={{ fontFamily: 'Merriweather' }}>Merriweather (Serif)</option>
              <option value="Oswald" style={{ fontFamily: 'Oswald' }}>Oswald (Condensé)</option>
              <option value="Rubik" style={{ fontFamily: 'Rubik' }}>Rubik (Arrondi)</option>
              <option value="Work Sans" style={{ fontFamily: 'Work Sans' }}>Work Sans (Pro)</option>
              <option value="Roboto Mono" style={{ fontFamily: 'Roboto Mono' }}>Roboto Mono (Mono Tech)</option>
            </select>

            {/* Text sizes list */}
            <select
              disabled={isViewer || isPreviewMode}
              value={textSize}
              onChange={(e) => handleStyleChange('size', e.target.value)}
              className="glass-input text-xs font-bold py-1.5 px-3 rounded appearance-none cursor-pointer pr-7 outline-none dark:bg-neutral-900 bg-white"
            >
              <option value="12px">Petit (12px)</option>
              <option value="14px">Normal (14px)</option>
              <option value="16px">Moyen (16px)</option>
              <option value="18px">Grand (18px)</option>
              <option value="24px">Titre 2 (24px)</option>
              <option value="32px">Titre 1 (32px)</option>
            </select>

            <div className="h-6 w-[1px] bg-black/10 dark:bg-white/10 mx-1"></div>

            {/* Underline toggle */}
            <button
              disabled={isViewer || isPreviewMode}
              onClick={() => handleStyleChange('under', null)}
              className={`p-1.5 rounded transition ${
                isUnderlined 
                  ? 'bg-ios-blue-light/15 text-ios-blue-light dark:bg-ios-blue-dark/25 dark:text-ios-blue-dark font-extrabold' 
                  : 'hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'
              } disabled:opacity-30`}
              title="Souligner (U)"
            >
              <UnderlineIcon className="w-4 h-4" />
            </button>

            {/* Italic toggle */}
            <button
              disabled={isViewer || isPreviewMode}
              onClick={() => handleStyleChange('ital', null)}
              className={`p-1.5 rounded transition ${
                isItalic 
                  ? 'bg-ios-blue-light/15 text-ios-blue-light dark:bg-ios-blue-dark/25 dark:text-ios-blue-dark' 
                  : 'hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'
              } disabled:opacity-30`}
              title="Italique (I)"
            >
              <ItalicIcon className="w-4 h-4" />
            </button>

            <div className="h-6 w-[1px] bg-black/10 dark:bg-white/10 mx-1"></div>

            {/* Surlignage (Highlight) colors */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mr-1">Surligner:</span>
              {(['yellow', 'green', 'pink', 'blue'] as const).map((color) => {
                const isSelected = highlightColor === color;
                let colorClass = '';
                if (color === 'yellow') colorClass = 'bg-yellow-400';
                else if (color === 'green') colorClass = 'bg-green-400';
                else if (color === 'pink') colorClass = 'bg-pink-400';
                else if (color === 'blue') colorClass = 'bg-blue-400';

                return (
                  <button
                    key={color}
                    type="button"
                    disabled={isViewer || isPreviewMode}
                    onClick={() => handleStyleChange('highlight', color)}
                    className={`w-5 h-5 rounded-full ${colorClass} border-2 ${
                      isSelected ? 'border-ios-blue-light dark:border-ios-blue-dark scale-110 shadow' : 'border-transparent'
                    } transition hover:scale-105 disabled:opacity-30`}
                  />
                );
              })}
              {highlightColor && (
                <button
                  type="button"
                  disabled={isViewer || isPreviewMode}
                  onClick={() => handleStyleChange('highlight', null)}
                  className="text-[10px] font-bold text-ios-pink-light dark:text-ios-pink-dark hover:underline ml-1.5 disabled:opacity-30"
                >
                  Effacer
                </button>
              )}
            </div>

            <div className="h-6 w-[1px] bg-black/10 dark:bg-white/10 mx-1"></div>

            {/* Visual Table Creator Grid */}
            <div className="relative" ref={tablePickerRef}>
              <button
                disabled={isViewer || isPreviewMode}
                type="button"
                onClick={() => {
                  setShowTablePicker(!showTablePicker);
                  setHoveredGrid({ r: 0, c: 0 });
                }}
                className={`p-1.5 rounded transition flex items-center justify-center ${
                  showTablePicker 
                    ? 'bg-ios-blue-light/15 text-ios-blue-light dark:bg-ios-blue-dark/25 dark:text-ios-blue-dark' 
                    : 'hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'
                } disabled:opacity-30`}
                title="Insérer un tableau (Grille Word)"
              >
                <Table className="w-4 h-4" />
              </button>

              {showTablePicker && (
                <div className="absolute top-full left-0 mt-2 p-3 bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-ios-xl shadow-ios-strong z-50 animate-scale-in w-[210px]">
                  <div className="grid grid-cols-10 gap-0.5 mb-2">
                    {Array.from({ length: 8 }).map((_, rIndex) => {
                      const r = rIndex + 1;
                      return Array.from({ length: 10 }).map((_, cIndex) => {
                        const c = cIndex + 1;
                        const isHighlighted = r <= hoveredGrid.r && c <= hoveredGrid.c;
                        return (
                          <div
                            key={`${r}-${c}`}
                            onMouseEnter={() => setHoveredGrid({ r, c })}
                            onClick={() => {
                              insertTable(c, r);
                              setShowTablePicker(false);
                            }}
                            className={`w-4 h-4 border border-black/10 dark:border-white/10 rounded-sm cursor-pointer transition-all ${
                              isHighlighted 
                                ? 'bg-ios-blue-light dark:bg-ios-blue-dark border-ios-blue-light/50 dark:border-ios-blue-dark/50 scale-105 shadow-sm' 
                                : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
                            }`}
                            style={{ width: '15px', height: '15px' }}
                          />
                        );
                      });
                    })}
                  </div>
                  <div className="text-[10px] text-center font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark pt-1 border-t border-black/5 dark:border-white/5">
                    {hoveredGrid.r > 0 && hoveredGrid.c > 0 
                      ? `${hoveredGrid.c} x ${hoveredGrid.r} (${hoveredGrid.c * hoveredGrid.r} cases)` 
                      : 'Glisser pour définir la taille'
                    }
                  </div>
                </div>
              )}
            </div>

            {/* Show Authors toggle button */}
            <button
              onClick={() => setShowAuthors(!showAuthors)}
              className={`text-[10px] uppercase font-extrabold px-3 py-1.5 rounded-full ml-auto transition ${
                showAuthors 
                  ? 'bg-ios-indigo-light/15 text-ios-indigo-light dark:bg-ios-indigo-dark/25 dark:text-ios-indigo-dark' 
                  : 'hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'
              }`}
              title="Différencier qui a écrit quoi"
            >
              👥 Auteurs : {showAuthors ? 'OUI' : 'NON'}
            </button>

            {/* Markdown Preview Toggle */}
            <button
              type="button"
              onClick={handleTogglePreview}
              className={`text-[10px] uppercase font-extrabold px-3 py-1.5 rounded-full transition ${
                isPreviewMode 
                  ? 'bg-ios-emerald-light/15 text-ios-emerald-light dark:bg-ios-emerald-dark/25 dark:text-ios-emerald-dark' 
                  : 'hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark border border-black/10 dark:border-white/10 bg-white/60 dark:bg-neutral-900 font-bold'
              }`}
              title="Visualiser le rendu Markdown"
            >
              👁️ {isPreviewMode ? 'Mode Édition' : 'Aperçu Markdown'}
            </button>

            {isViewer && (
              <span className="text-[10px] uppercase font-bold bg-ios-pink-light/10 text-ios-pink-light dark:bg-ios-pink-dark/20 px-2 py-1 rounded-full ml-2 flex items-center gap-1.5">
                <VolumeX className="w-3.5 h-3.5" /> Lecture Seule
              </span>
            )}
          </div>

          {/* Text Editor contentEditable div panel */}
          <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-2xl overflow-hidden shadow-ios-soft flex flex-col h-[65vh]">
            <div
              ref={editorRef}
              contentEditable={!isViewer && !isPreviewMode}
              onInput={handleEditorInput}
              onKeyDown={handleKeyDown}
              onKeyUp={handleEditorClickOrKeyUp}
              onClick={handleEditorClickOrKeyUp}
              data-placeholder={
                isViewer 
                  ? "Ce document est en mode lecture seule." 
                  : isPreviewMode
                    ? "Rendu du document en cours..."
                    : "Commencez à rédiger votre projet collaboratif ici... Les modifications s'enregistrent automatiquement pour tous ! Les balises Markdown (#, **, *, -, etc.) sont prises en charge."
              }
              className={`w-full h-full p-6 bg-white dark:bg-[#1c1c1e] text-ios-label-primaryLight dark:text-white border-0 focus:ring-0 focus:outline-none overflow-y-auto outline-none leading-relaxed prose dark:prose-invert max-w-none ${
                isViewer || isPreviewMode ? 'cursor-not-allowed opacity-80' : 'cursor-text'
              } ${showAuthors ? 'show-authors' : ''}`}
              style={{
                fontSize: textSize,
                fontFamily: fontFamily,
                textDecoration: isUnderlined ? 'underline' : 'none',
                fontStyle: isItalic ? 'italic' : 'normal',
                minHeight: '100%',
              }}
            />
          </div>
        </div>

        {/* Right Column: CRM Collaborator Manager & Audit Logs */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Creator CRM Dashboard Panel */}
          <div className="glass-panel p-5 border border-black/5 dark:border-white/5 rounded-ios-2xl shadow-ios-soft space-y-4">
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex items-center gap-2">
              <Users className="w-4 h-4 text-ios-blue-light" /> Invités & Rôles (CRM)
            </h3>

            {/* Direct Member Search & Add (Creator / Admin only) */}
            {(isOwner || isAdmin) && (
              <div className="space-y-2.5 pt-1.5 border-b border-black/5 dark:border-white/5 pb-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ajouter un membre (pseudo / nom)..."
                    value={searchMember}
                    onChange={(e) => setSearchMember(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-xl text-xs focus:outline-none focus:ring-1 focus:ring-ios-blue-light font-medium"
                  />
                  <UserPlus className="w-3.5 h-3.5 text-ios-label-secondaryLight/50 absolute left-3 top-2.5" />
                </div>

                {/* Search Results dropdown */}
                {searchMember.trim() !== '' && (
                  <div className="bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/5 rounded-ios-lg p-1.5 space-y-1.5 shadow-ios-soft max-h-[160px] overflow-y-auto z-30 relative animate-fade-in">
                    {availableMembers.length === 0 ? (
                      <p className="text-[10px] text-ios-label-secondaryLight/60 italic p-1.5">
                        Aucun membre trouvé ou déjà membre.
                      </p>
                    ) : (
                      availableMembers.map((m) => (
                        <div key={m.id} className="flex items-center justify-between p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded transition">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {m.avatar_url ? (
                              <img src={m.avatar_url} alt={m.username} className="w-6 h-6 rounded-full object-cover" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 flex items-center justify-center text-[9px] text-ios-blue-light dark:text-ios-blue-dark font-bold">
                                {m.username[0].toUpperCase()}
                              </div>
                            )}
                            <div className="flex flex-col min-w-0">
                              <span className="text-[10px] font-bold truncate">{m.full_name || m.username}</span>
                              <span className="text-[8px] text-ios-label-secondaryLight/60">@{m.username}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleAddMember(m.id)}
                            className="bg-ios-blue-light dark:bg-ios-blue-dark text-white px-2 py-1 rounded text-[9px] font-extrabold shadow hover:opacity-90 transition"
                          >
                            Ajouter
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div className="divide-y divide-black/5 dark:divide-white/5 max-h-[30vh] overflow-y-auto space-y-2.5 pr-1.5">
              {participants.length === 0 ? (
                <p className="text-xs text-ios-label-secondaryLight/60 italic py-2">
                  Aucun invité sur ce canva.
                </p>
              ) : (
                participants.map((part) => {
                  const isParticipantOwner = part.user_id === activeCanvas?.creator_id;
                  return (
                    <div key={part.id} className="flex items-center justify-between pt-2.5 first:pt-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {part.user?.avatar_url ? (
                          <img 
                            src={part.user.avatar_url} 
                            alt={part.user.username} 
                            className="w-8 h-8 rounded-full object-cover border border-black/10 dark:border-white/10"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 flex items-center justify-center text-[10px] text-ios-blue-light dark:text-ios-blue-dark font-bold">
                            {part.user?.username[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold truncate">
                            {part.user?.full_name || part.user?.username}
                          </span>
                          <span className="text-[10px] text-ios-label-secondaryLight/70 dark:text-ios-label-secondaryDark/60">
                            Niv. {part.user?.level || 1} • {isParticipantOwner ? 'Créateur (Prop.)' : part.role === 'editor' ? 'Éditeur' : 'Lecteur'}
                          </span>
                        </div>
                      </div>

                      {/* Control buttons (Visible to Document Owner or Admin only, and cannot edit own role/prop) */}
                      {(isOwner || isAdmin) && !isParticipantOwner && part.user_id !== user?.id && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleToggleRole(part.user_id, part.role)}
                            className={`text-[9px] font-extrabold uppercase px-2 py-1 rounded ${
                              part.role === 'editor' 
                                ? 'bg-ios-blue-light/10 text-ios-blue-light hover:bg-ios-blue-light/20' 
                                : 'bg-ios-orange-light/10 text-ios-orange-light hover:bg-ios-orange-light/20'
                            } transition`}
                            title={part.role === 'editor' ? "Changer en Lecteur" : "Changer en Éditeur"}
                          >
                            {part.role === 'editor' ? 'Éditeur' : 'Lecteur'}
                          </button>
                          
                          <button
                            onClick={() => handleKickUser(part.user_id)}
                            className="p-1 hover:bg-ios-pink-light/10 rounded text-ios-pink-light transition"
                            title="Exclure le participant"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-black/5 dark:border-white/5 pt-3">
              <p className="text-[10px] text-ios-label-secondaryLight/60 font-semibold leading-relaxed">
                * Les Éditeurs peuvent modifier le document et le formatage. Les Lecteurs ont un accès restreint en lecture seule.
              </p>
            </div>
          </div>

          {/* Audit Logs panel */}
          <div className="glass-panel p-5 border border-black/5 dark:border-white/5 rounded-ios-2xl shadow-ios-soft space-y-4">
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex items-center gap-2">
              <Clock className="w-4 h-4 text-ios-indigo-light" /> Historique d'activité (Logs)
            </h3>
            
            <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-1.5 divide-y divide-black/5 dark:divide-white/5">
              {auditLogs.length === 0 ? (
                <p className="text-xs text-ios-label-secondaryLight/60 italic py-2">
                  Aucun journal d'activité disponible.
                </p>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="pt-2 first:pt-0 flex flex-col gap-0.5">
                    <p className="text-xs text-ios-label-primaryLight dark:text-ios-label-primaryDark leading-snug font-medium">
                      {log.details}
                    </p>
                    <span className="text-[9px] text-ios-label-secondaryLight/60 dark:text-ios-label-secondaryDark/50">
                      {new Date(log.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} • @{log.user?.username}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
