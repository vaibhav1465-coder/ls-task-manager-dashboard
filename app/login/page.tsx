export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-card">
        <span className="eyebrow">
          LOKSATTA OPERATIONS
        </span>
        <h1>Task Manager Dashboard</h1>
        <p>
          Secure operations dashboard connected to the
          live Google Sheet.
        </p>

        {query.error ? (
          <div className="login-error">
            {query.error === "config"
              ? "Login configuration is incomplete."
              : "Incorrect username or password."}
          </div>
        ) : null}

        <form
          action="/api/auth/login"
          method="post"
          className="login-form"
        >
          <label>
            <span>Username</span>
            <input
              name="username"
              autoComplete="username"
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>

          <button
            className="primary-button"
            type="submit"
          >
            Open Dashboard
          </button>
        </form>
      </section>
    </main>
  );
}
