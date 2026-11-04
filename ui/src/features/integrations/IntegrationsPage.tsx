import { EmptyState } from '../../components/ui/EmptyState'

export function IntegrationsPage() {
  return (
    <div className="integrations-page">
      <div className="welcome-row">
        <div>
          <div className="welcome-eyebrow">
            <span className="online-indicator" />
            WORKSPACE CONNECTIVITY
          </div>
          <h1>Integrations</h1>
          <p>
            Connected tools, third-party services, and workspace connectors.
          </p>
        </div>
      </div>

      <section className="panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <EmptyState message="No integrations configured yet. Connected tools and webhook integrations will appear here." />
      </section>
    </div>
  )
}
