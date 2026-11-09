import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { isLoggedIn, login, register } from "../api/auth";
import "./auth.css";

const PHONE = /^\+?\d{9,14}$/;
const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);

function LeafMark() {
  return (
    <svg className="auth__mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="#237a32" />
      <path d="M16 25V13" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 17c-4.5 0-7-2.6-7-6.5 4.5 0 7 2.6 7 6.5Z" fill="#bfe98f" />
      <path d="M16 14c0-4.2 2.6-6.8 7-6.8 0 4.2-2.6 6.8-7 6.8Z" fill="#fff" />
    </svg>
  );
}

function Field({ id, label, hint, error, children }) {
  return (
    <div className={error ? "field field--error" : "field"}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className="field__error" id={`${id}-error`}>{error}</p>
      ) : hint ? (
        <p className="field__hint" id={`${id}-hint`}>{hint}</p>
      ) : null}
    </div>
  );
}

const describe = (id, error, hint) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

function PasswordInput({ id, value, onChange, autoComplete, error, hint }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="pw">
      <input
        id={id}
        className="input"
        type={shown ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={describe(id, error, hint)}
      />
      <button
        type="button"
        className="pw__toggle"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-label={shown ? "Hide password" : "Show password"}
      >
        {shown ? "Hide" : "Show"}
      </button>
    </div>
  );
}

/* ---------- Log in ---------- */
function LoginForm({ onDone }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await login(username, password);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <h1 className="form__title">Welcome back</h1>
      <p className="form__lead">Log in to continue your farm.</p>

      {error && <p className="alert" role="alert">{error}</p>}

      <Field id="login-username" label="Username">
        <input
          id="login-username"
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck="false"
        />
      </Field>

      <Field id="login-password" label="Password">
        <PasswordInput
          id="login-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </Field>

      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Logging in…" : "Log in"}
      </button>

      <p className="note">
        In a class group? Use the username and password your teacher gave your group. You do
        not need to sign up.
      </p>
    </form>
  );
}

/* ---------- Sign up (solo practice) ---------- */
function validate({ username, password, parentContact }) {
  const errors = {};
  if (!username.trim()) errors.username = "Choose a username.";
  else if (!/^[\w.@+-]+$/.test(username.trim()))
    errors.username = "Use letters, numbers and . @ + - _ only.";
  if (password.length < 8) errors.password = "Use at least 8 characters.";
  if (!PHONE.test(parentContact.replace(/\s/g, "")))
    errors.parentContact = "Enter a phone number, for example 0712345678.";
  return errors;
}

function SignupForm({ onDone }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [parentContact, setParentContact] = useState("");
  const [grade, setGrade] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const found = validate({ username, password, parentContact });
    setErrors(found);
    setFormError("");
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await register({
        username,
        password,
        parentContact: parentContact.replace(/\s/g, ""),
        yearOfStudy: grade,
      });
      onDone();
    } catch (err) {
      const fields = err.fields ?? {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? "" : err.message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <h1 className="form__title">Create your account</h1>
      <p className="form__lead">
        For practising on your own. Class groups get their login from their teacher.
      </p>

      {formError && <p className="alert" role="alert">{formError}</p>}

      <Field id="signup-username" label="Username" error={errors.username}>
        <input
          id="signup-username"
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck="false"
          aria-invalid={Boolean(errors.username)}
          aria-describedby={describe("signup-username", errors.username)}
        />
      </Field>

      <Field
        id="signup-password"
        label="Password"
        error={errors.password}
        hint="At least 8 characters. Not only numbers, and not a common password."
      >
        <PasswordInput
          id="signup-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          error={errors.password}
          hint="x"
        />
      </Field>

      <Field
        id="signup-parent"
        label="Parent or guardian's phone"
        error={errors.parentContact}
        hint="We keep this so a parent can be reached about your account."
      >
        <input
          id="signup-parent"
          className="input"
          value={parentContact}
          onChange={(e) => setParentContact(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          aria-invalid={Boolean(errors.parentContact)}
          aria-describedby={describe("signup-parent", errors.parentContact, true)}
        />
      </Field>

      <Field id="signup-grade" label="Grade (optional)" error={errors.yearOfStudy}>
        <select
          id="signup-grade"
          className="input"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        >
          <option value="">Choose your grade</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>Grade {g}</option>
          ))}
        </select>
      </Field>

      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

/* ---------- The page: /login and /signup ---------- */
export default function AuthScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const mode = location.pathname.endsWith("/signup") ? "signup" : "login";
  const from = location.state?.from ?? "/";

  useEffect(() => {
    document.title = mode === "signup" ? "Sign up · AgriLearn Kenya" : "Log in · AgriLearn Kenya";
  }, [mode]);

  if (isLoggedIn()) return <Navigate to={from} replace />;

  const done = () => navigate(from, { replace: true });

  return (
    <main className="auth">
      <div className="auth__wrap">
        <header className="auth__brand">
          <LeafMark />
          <span>AgriLearn Kenya</span>
        </header>

        <div className="auth__frame">
          <nav className="tabs" role="tablist" aria-label="Log in or sign up">
            <Link
              to="/login"
              state={location.state}
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "tab tab--on" : "tab"}
            >
              Log in
            </Link>
            <Link
              to="/signup"
              state={location.state}
              role="tab"
              aria-selected={mode === "signup"}
              className={mode === "signup" ? "tab tab--on" : "tab"}
            >
              Sign up
            </Link>
          </nav>

          {mode === "login" ? <LoginForm onDone={done} /> : <SignupForm onDone={done} />}
        </div>
      </div>
    </main>
  );
}