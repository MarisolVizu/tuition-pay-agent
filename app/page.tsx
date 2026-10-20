"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentEvent, Tier } from "@/lib/types";
import type { Currency } from "@/lib/currencies";
import type { AgentMeta } from "@/lib/agent";
import { Logo, post, type Msg, type Session, type View } from "./components/shared";
import Home from "./components/Home";
import PayFlow from "./components/PayFlow";
import Chat from "./components/Chat";
import Rates from "./components/Rates";
import Activity from "./components/Activity";
import Settings from "./components/Settings";
import Onboarding from "./components/Onboarding";
import Report, { type ReportKind } from "./components/Report";

const STORAGE_KEY = "kuntur-session-v5";
const TOUR_KEY = "kuntur-tour-done-v1";

const NAV: { view: View; label: string }[] = [
  { view: "home", label: "Home" },
  { view: "pay", label: "Pay a bill" },
  { view: "chat", label: "Ask Kuntur" },
  { view: "rates", label: "Rates & alerts" },
  { view: "activity", label: "Activity" },
  { view: "settings", label: "Settings" }
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [view, setView] = useState<View>("home");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tour, setTour] = useState(false);
  const [preselect, setPreselect] = useState<string | null>(null);
  const [report, setReport] = useState<ReportKind | null>(null);

  const save = useCallback((s: Session, msgs: Msg[]) => {
    setSession(s);
    setMessages(msgs);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ session: s, messages: msgs }));
    } catch {}
  }, []);

  const newSession = useCallback(
    async (home: Currency = "PEN", tier?: Tier) => {
      let data = await post("/api/session", { home });
      if (tier !== undefined && tier !== data.state.tier) data = await post("/api/settings", { state: data.state, sig: data.sig, tier });
      save(data, []);
      setView("home");
    },
    [save]
  );

  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) setTour(true);
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.session?.state?.home) {
          setSession(parsed.session);
          setMessages(parsed.messages ?? []);
          return;
        }
      }
    } catch {}
    newSession().catch((e) => setNotice(e.message));
  }, [newSession]);

  // Print the report once it has rendered; clear it afterwards.
  useEffect(() => {
    if (!report) return;
    const t = setTimeout(() => window.print(), 80);
    const done = () => setReport(null);
    window.addEventListener("afterprint", done, { once: true });
    return () => clearTimeout(t);
  }, [report]);

  const guard = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setNotice(null);
    try {
      return await fn();
    } catch (e) {
      setNotice((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const runAgent = (text: string) =>
    guard(async () => {
      if (!session) return null as never;
      const next: Msg[] = [...messages, { role: "user", content: text }];
      setMessages(next);
      const data = await post("/api/agent", { state: session.state, sig: session.sig, messages: next.map(({ role, content }) => ({ role, content })) });
      save(data, [...next, { role: "assistant", content: data.reply, events: data.events, meta: data.agent }]);
      return { reply: data.reply as string, events: data.events as AgentEvent[], meta: data.agent as AgentMeta };
    });

  const decide = (pendingId: string, approve: boolean) =>
    guard(async () => {
      if (!session) return null as never;
      const data = await post("/api/confirm", { state: session.state, sig: session.sig, pendingId, approve });
      const line = approve ? (data.result.ok ? `Done. ${data.result.message}` : `I couldn’t complete ${pendingId}: ${data.result.message}`) : `Cancelled ${pendingId}. Nothing was paid.`;
      save(data, [...messages, { role: "assistant", content: line }]);
      return data.result as { ok: boolean; message: string; transaction?: { id: string } };
    });

  const changeTier = (tier: Tier) =>
    guard(async () => {
      if (!session) return;
      save(await post("/api/settings", { state: session.state, sig: session.sig, tier }), messages);
    });

  const market = (reset: boolean) =>
    guard(async () => {
      if (!session) return;
      save(await post("/api/tick", { state: session.state, sig: session.sig, reset }), messages);
    });

  const alertAction = (payload: Record<string, unknown>) =>
    guard(async () => {
      if (!session) return null as never;
      const data = await post("/api/alerts", { state: session.state, sig: session.sig, ...payload });
      save(data, messages);
      return data.result as { ok: boolean; message: string };
    });

  const goto = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };
  const payBill = (id: string) => {
    setPreselect(id);
    goto("pay");
  };
  const finishTour = (home?: Currency, tier?: Tier) => {
    try { localStorage.setItem(TOUR_KEY, "1"); } catch {}
    setTour(false);
    if (home && session && (home !== session.state.home || tier !== session.state.tier)) guard(() => newSession(home, tier));
  };

  if (!session) {
    return (
      <main className="loading">
        <Logo size={48} />
        <p>{notice ?? "Opening your sandbox account…"}</p>
      </main>
    );
  }

  const s = session.state;

  return (
    <>
      <div className="app">
        <header className="top">
          <div className="brand">
            <Logo />
            <div>
              <h1>Kuntur</h1>
              <p>AI agent for paying tuition and fees abroad</p>
            </div>
          </div>
          <span className="status" title={session.mode === "llm" ? "Connected to a language model" : "No model key configured; deterministic planner in use"}>
            <span className={`dot ${session.mode === "llm" ? "" : "warn"}`} />
            {session.mode === "llm" ? "AI agent online" : "Rule-based mode"}
          </span>
          <span className="status">{s.home} account · sandbox</span>
        </header>

        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <button key={n.view} className={view === n.view ? "on" : ""} aria-current={view === n.view ? "page" : undefined} onClick={() => goto(n.view)}>
              {n.label}
              {n.view === "pay" && s.pending.length > 0 && <span className="badge-count">{s.pending.length}</span>}
            </button>
          ))}
        </nav>

        {notice && <div className="banner bad page-wide" role="alert">{notice}</div>}

        <main className={`main ${view === "chat" ? "main-chat" : ""}`}>
          {view === "home" && <Home session={session} goto={goto} payBill={payBill} />}
          {view === "pay" && (
            <PayFlow session={session} busy={busy} preselect={preselect} clearPreselect={() => setPreselect(null)} runAgent={runAgent} decide={decide} goto={goto} print={setReport} />
          )}
          {view === "chat" && <Chat session={session} messages={messages} busy={busy} send={(t) => runAgent(t)} decide={(id, a) => decide(id, a)} />}
          {view === "rates" && <Rates session={session} busy={busy} alertAction={alertAction} market={market} />}
          {view === "activity" && <Activity session={session} print={setReport} />}
          {view === "settings" && <Settings session={session} busy={busy} changeTier={changeTier} newSession={(h) => guard(() => newSession(h))} showTour={() => setTour(true)} />}
        </main>
      </div>

      {tour && <Onboarding initialHome={s.home} initialTier={s.tier} onFinish={(h, t) => finishTour(h, t)} onSkip={() => finishTour()} />}
      <Report session={session} kind={report} />
    </>
  );
}
