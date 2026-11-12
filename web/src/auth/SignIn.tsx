import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import { oauthConfigured } from "./oauth";

export function SignIn() {
  const { signIn, signInWithToken, error, status } = useAuth();
  const canOAuth = oauthConfigured();
  const [pat, setPat] = useState("");
  const [showPat, setShowPat] = useState(!canOAuth);

  const submitPat = (e: FormEvent) => {
    e.preventDefault();
    if (pat.trim()) void signInWithToken(pat);
  };

  return (
    <div className="signin">
      <div className="card signin-card">
        <div className="eyebrow">Sage Brain</div>
        <h1 className="signin-title">Biomedical knowledge graph explorer</h1>
        <p className="claim">
          Ask questions of the Sage Brain knowledge graph, or walk through the guided demo
          from three data portals to one patient. Access requires a Synapse account on the
          Sage Brain team.
        </p>

        {error && <p className="status err" role="alert">{error}</p>}

        {canOAuth ? (
          <button className="run-btn signin-btn" type="button" onClick={signIn} disabled={status === "loading"}>
            Sign in with Synapse
          </button>
        ) : (
          <p className="callout">
            Synapse OAuth isn’t configured for this deployment (set <code>SYNAPSE_CLIENT_ID</code>{" "}
            and <code>SYNAPSE_CLIENT_SECRET</code> on the server — see <code>.env.example</code>). You can still sign
            in with a personal access token.
          </p>
        )}

        {canOAuth && (
          <button className="link-btn" type="button" aria-expanded={showPat} onClick={() => setShowPat(v => !v)}>
            {showPat ? "Hide" : "Use a personal access token instead"}
          </button>
        )}
        {showPat && (
          <form className="pat-form" onSubmit={submitPat}>
            <label htmlFor="pat">Synapse personal access token</label>
            <div className="drawer-row">
              <input id="pat" type="password" autoComplete="off" spellCheck={false}
                     placeholder="Paste access token" value={pat} onChange={e => setPat(e.target.value)} />
              <button className="ghost-btn" type="submit" disabled={!pat.trim() || status === "loading"}>
                Use token
              </button>
            </div>
            <p className="drawer-note">Kept in this tab only, and cleared when the tab closes.</p>
          </form>
        )}
      </div>
    </div>
  );
}
