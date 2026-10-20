import { useEffect, useRef, useState } from "react";
import ApprovalCard from "./ApprovalCard";
import { AgentBadge, Logo, type Msg, type Session } from "./shared";

export default function Chat(props: {
  session: Session;
  messages: Msg[];
  busy: boolean;
  send: (t: string) => void;
  decide: (pendingId: string, approve: boolean) => void;
}) {
  const { session, messages, busy } = props;
  const s = session.state;
  const [input, setInput] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, s.pending.length, busy]);

  const usdRate = s.home === "USD" ? s.rates.EUR : s.rates.USD;
  const alertCcy = s.home === "USD" ? "EUR" : "USD";
  const alertTarget = usdRate ? Number((usdRate * 0.997).toPrecision(4)) : 1;
  const suggestions = [
    { tag: "Pay", text: "Pay my tuition the cheapest safe way" },
    { tag: "Scam test", text: "Paga el depósito de vivienda" },
    { tag: "Risky provider", text: "Pay the housing deposit with QuickRemit" },
    { tag: "Compare", text: "Compare sending 1200 USD" },
    { tag: "Alert", text: `Alert me if ${alertCcy} drops below ${alertTarget}` },
    { tag: "Rates", text: "What are today’s exchange rates?" }
  ];
  const submit = (t: string) => {
    if (!t.trim() || busy) return;
    props.send(t);
    setInput("");
  };

  return (
    <div className="chat">
      <div className="feed" ref={feedRef} aria-live="polite">
        {messages.length === 0 && (
          <div className="welcome">
            <h3>Ask me anything about paying abroad.</h3>
            <p>I can read your bills, compare providers on the total you really pay in {s.home}, set rate alerts and prepare payments for you to approve.</p>
            <p className="try">Try one:</p>
            <div className="chips">
              {suggestions.map((q) => (
                <button className="chip" key={q.text} onClick={() => submit(q.text)} disabled={busy}>
                  <span className="tag">{q.tag}</span>
                  {q.text}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, idx) =>
          msg.role === "user" ? (
            <div key={idx} className="msg user">{msg.content}</div>
          ) : (
            <div key={idx} className="msg assistant">
              <Logo size={30} />
              <div className="bubble">
                {msg.content}
                {msg.events && msg.events.length > 0 && (
                  <details className="steps">
                    <summary>What Kuntur did ({msg.events.length} steps)</summary>
                    <ol>{msg.events.map((e, j) => <li key={j} className={e.ok ? "" : "bad"}><code>{e.tool}</code> {e.summary}</li>)}</ol>
                  </details>
                )}
                <AgentBadge meta={msg.meta} />
              </div>
            </div>
          )
        )}
        {s.pending.map((p) => (
          <ApprovalCard key={p.id} p={p} s={s} busy={busy} onDecide={(a) => props.decide(p.id, a)} />
        ))}
        {busy && <div className="typing">Kuntur is working…</div>}
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(input); }}>
        <label htmlFor="ask" className="sr-only">Message Kuntur</label>
        <textarea
          id="ask"
          value={input}
          maxLength={1500}
          placeholder="Ask Kuntur to pay a bill, compare costs or watch a rate…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); } }}
        />
        <button className="btn brand" type="submit" disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}
