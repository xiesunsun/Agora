export function MissingSessionPage() {
  return (
    <main className="missing-session-page">
      <section className="missing-session-card">
        <p className="missing-session-eyebrow">Session Required</p>
        <h1>Missing session context</h1>
        <p>
          Open the page with an explicit runtime mode instead of falling back to
          demo implicitly.
        </p>
        <code>?sessionId=demo</code>
        <code>?sessionId=&lt;real-session-id&gt;</code>
        <code>?transport=fixture</code>
      </section>
    </main>
  );
}
