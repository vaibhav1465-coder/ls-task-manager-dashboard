export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">LS</div>
        <p className="eyebrow">Presentation dashboard</p>
        <h1>Task Manager</h1>
        <p className="login-copy">Secure, read-only reporting from the Google Sheet source of truth.</p>
        {params.error ? <div className="login-error">Incorrect username or password.</div> : null}
        <form action="/api/auth/login" method="post" className="login-form">
          <label>
            Username
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Open dashboard</button>
        </form>
      </section>
    </main>
  );
}
