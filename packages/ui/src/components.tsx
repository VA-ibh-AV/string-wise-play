import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

export function GlassPanel({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`panel ${className}`} {...rest}>
      {children}
    </div>
  );
}

/** A state pill. Always shows text (R/S/D/T/Z), never colour alone. */
export function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="pill" style={{ color }}>
      {children}
    </span>
  );
}

export function StatGrid({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="stats">
      {items.map(it => (
        <div key={it.label}>
          <span>{it.label}</span>
          <b>{it.value}</b>
        </div>
      ))}
    </div>
  );
}

/** A shell command that copies itself on click, falling back to selecting the text. */
export function CmdButton({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const selectText = () => {
    if (!ref.current) return;
    const r = document.createRange();
    r.selectNodeContents(ref.current);
    const s = getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  };
  const copy = () => {
    const done = () => {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 900);
    };
    try {
      navigator.clipboard.writeText(cmd).then(done, selectText);
    } catch {
      selectText();
    }
  };
  return (
    <button ref={ref} type="button" className="cmd" onClick={copy} title="Copy to clipboard">
      {copied ? 'copied' : cmd}
    </button>
  );
}

export function CmdList({ cmds, title = 'Try it on a real machine' }: { cmds: string[]; title?: string }) {
  return (
    <div>
      <h4 className="kicker">{title}</h4>
      <div className="cmds">
        {cmds.map(c => (
          <CmdButton key={c} cmd={c} />
        ))}
      </div>
    </div>
  );
}

/** Renders **bold** and `code` inside plain copy strings. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : p,
      )}
    </>
  );
}

export function Toast({ kicker, title, body, onDone, ms = 5200 }: { kicker: string; title: string; body: string; onDone: () => void; ms?: number }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    setShown(true);
    const a = window.setTimeout(() => setShown(false), ms);
    const b = window.setTimeout(onDone, ms + 500);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [title, ms, onDone]);
  const style: CSSProperties = { opacity: shown ? 1 : 0 };
  return (
    <div className="toast panel" style={style} role="status">
      <small>{kicker}</small>
      <b>{title}</b>
      <span>{body}</span>
    </div>
  );
}
