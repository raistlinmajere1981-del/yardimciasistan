// First visit to a code-split page: keep the workspace frame populated
// without introducing a separate full-screen loading route.
export function PageLoadingFallback() {
  return (
    <section className="page-loading-skeleton" role="status" aria-label="Sayfa açılıyor">
      <div className="page-loading-skeleton__top" aria-hidden="true">
        <span className="page-loading-skeleton__line page-loading-skeleton__line--title" />
        <span className="page-loading-skeleton__line page-loading-skeleton__line--short" />
      </div>
      <div className="page-loading-skeleton__cards" aria-hidden="true">
        <span /><span /><span />
      </div>
      <div className="page-loading-skeleton__body" aria-hidden="true">
        <span className="page-loading-skeleton__line" />
        <span className="page-loading-skeleton__line page-loading-skeleton__line--short" />
        <span className="page-loading-skeleton__line" />
      </div>
    </section>
  );
}
