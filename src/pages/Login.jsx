import { useState } from "react";
import { Boxes } from "lucide-react";
import { APP_NAME } from "../config/constants.js";

export function Login({ onLogin, onOpenPublicStock }) {
  const [error, setError] = useState("");
  const [form, setForm] = useState({ username: "", password: "" });

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      await onLogin(form.username, form.password);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="login">
      <div className="login-panel">
        <div className="login-copy">
          <h1>{APP_NAME}</h1>
          <p>Prepare requisitions, approve material requests, receive stock with Challan/DV/Bill details, and track every item in one ledger.</p>
          <div className="login-steps">
            <span>1. Request</span>
            <span>2. Approve</span>
            <span>3. Receive</span>
            <span>4. Track</span>
          </div>
        </div>
        <form className="login-form" onSubmit={submit}>
          <div>
            <h2>Sign in</h2>
            <p className="muted">Enter your assigned Yarju account credentials.</p>
          </div>
          <label>Email <input type="email" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></label>
          <label>Password <input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
          {error ? <div className="error">{error}</div> : null}
          <div className="login-actions">
            <button className="primary" type="submit">Sign in</button>
            <button type="button" className="soft-button" onClick={onOpenPublicStock}>
              <Boxes size={16} />
              <span>View stock summary</span>
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
