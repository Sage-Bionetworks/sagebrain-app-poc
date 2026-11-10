import { useEffect, useState } from "react";
import { AskTab } from "./ask/AskTab";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { SignIn } from "./auth/SignIn";
import { API_BASE_URL } from "./config";
import { DemoTab } from "./demo/DemoTab";

type Tab = "ask" | "demo";
const TABS: { id: Tab; label: string }[] = [
  { id: "ask", label: "Ask" },
  { id: "demo", label: "Guided demo" },
];
const tabFromHash = (): Tab => (window.location.hash === "#demo" ? "demo" : "ask");

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const { status } = useAuth();
  if (status === "loading") return <p className="boot status busy">Signing in…</p>;
  if (status === "signedOut") return <><TopBar /><SignIn /></>;
  return <SignedIn />;
}

function SignedIn() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  const select = (t: Tab) => { history.replaceState(null, "", `#${t}`); setTab(t); };

  return (
    <>
      <TopBar tab={tab} onSelect={select} />
      {!API_BASE_URL && (
        <div className="frame config-warning">
          <p className="callout" role="alert">
            The Sage Brain API isn’t configured: set <code>API_BASE_URL</code> on the server
            (see <code>.env.example</code>). Questions and demo queries will fail until it is.
          </p>
        </div>
      )}
      {/* Both tabs stay mounted so a running question or demo progress survives switching. */}
      <div className="frame" hidden={tab !== "ask"} role="tabpanel" id="panel-ask" aria-labelledby="tab-ask">
        <AskTab />
      </div>
      <div className="frame" hidden={tab !== "demo"} role="tabpanel" id="panel-demo" aria-labelledby="tab-demo">
        <DemoTab active={tab === "demo"} />
      </div>
    </>
  );
}

function TopBar({ tab, onSelect }: { tab?: Tab; onSelect?: (t: Tab) => void }) {
  const { status, user, signOut } = useAuth();
  return (
    <div className="appbar">
      <div className="appbar-inner">
        <span className="brand">Sage Brain</span>
        {tab && onSelect && (
          <div className="tabs" role="tablist" aria-label="Views">
            {TABS.map(t => (
              <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" className="tab"
                      aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => onSelect(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="header-actions">
          {status === "signedIn" && user && (
            <span className="user" title={user.email || user.userName}>
              <span className="key-dot signed-in" aria-hidden="true" />
              {user.displayName}
            </span>
          )}
          <ThemeButton />
          {status === "signedIn" && (
            <button className="theme-btn" type="button" onClick={() => signOut()}>Sign out</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* Theme toggle from the demo: an explicit choice wins; otherwise follow the OS. */
function ThemeButton() {
  const root = document.documentElement;
  const isDark = () => root.dataset.theme === "dark" ||
    (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  const [dark, setDark] = useState(isDark);
  const toggle = () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("sb_theme", next); } catch { /* unavailable */ }
    setDark(next === "dark");
  };
  return (
    <button className="theme-btn" type="button" onClick={toggle}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
      {dark ? "Light" : "Dark"}
    </button>
  );
}
