import { useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import { toast } from '../../components/ui/Toast'

type IntegrationCategory = 'all' | 'messaging' | 'tickets' | 'developer' | 'hr'

type IntegrationItem = {
  id: string
  name: string
  category: IntegrationCategory
  description: string
  iconName: string
  status: 'connected' | 'configured' | 'available' | 'coming_soon'
  badge: string
  actionLabel: string
}

const INTEGRATIONS_CATALOG: IntegrationItem[] = [
  {
    id: 'github',
    name: 'GitHub Enterprise / Actions',
    category: 'developer',
    description: 'Repository dispatch hooks and CI/CD event webhooks for automated workflow dispatch.',
    iconName: 'terminal',
    status: 'connected',
    badge: 'Connected',
    actionLabel: 'Manage Webhook',
  },
  {
    id: 'slack',
    name: 'Slack Alerts & Notifications',
    category: 'messaging',
    description: 'Stream urgent customer escalations and review sentiment summaries to dedicated channels.',
    iconName: 'spark',
    status: 'configured',
    badge: 'Ready to Link',
    actionLabel: 'Configure Channel',
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    category: 'messaging',
    description: 'Incoming webhook connector for real-time notification cards and incident broadcasts.',
    iconName: 'plug',
    status: 'available',
    badge: 'Available',
    actionLabel: 'Connect Teams',
  },
  {
    id: 'jira',
    name: 'Atlassian Jira Software',
    category: 'tickets',
    description: 'Synchronize 1-star reviews and urgent payment defects directly to engineering sprint boards.',
    iconName: 'layers',
    status: 'available',
    badge: 'Available',
    actionLabel: 'Link Jira Board',
  },
  {
    id: 'openproject',
    name: 'OpenProject Enterprise',
    category: 'tickets',
    description: 'Bi-directional work package creation and bug tracking across operational departments.',
    iconName: 'check',
    status: 'connected',
    badge: 'Connected',
    actionLabel: 'Sync Settings',
  },
  {
    id: 'keka',
    name: 'Keka HRMS & Directory',
    category: 'hr',
    description: 'Automated employee directory lookup and organizational assignment synchronization.',
    iconName: 'user',
    status: 'connected',
    badge: 'Active Sync',
    actionLabel: 'View Directory',
  },
  {
    id: 'webhooks',
    name: 'Custom Outgoing Webhooks',
    category: 'developer',
    description: 'Dispatch authenticated HTTPS events to internal microservices on review status updates.',
    iconName: 'arrow',
    status: 'available',
    badge: 'Extensible',
    actionLabel: 'Add Webhook URL',
  },
]

export function IntegrationsPage() {
  const [selectedCategory, setSelectedCategory] = useState<IntegrationCategory>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredItems = INTEGRATIONS_CATALOG.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  function handleAction(item: IntegrationItem) {
    if (item.status === 'connected') {
      toast.info(`${item.name} is connected and syncing actively.`)
    } else {
      toast.info(`${item.actionLabel} modal opened for ${item.name}`)
    }
  }

  return (
    <div className="integrations-page">
      <div className="welcome-row">
        <div>
          <div className="welcome-eyebrow">
            <span className="online-indicator" />
            WORKSPACE TOOLS & CONNECTIVITY
          </div>
          <h1>Integrations & Connected Apps</h1>
          <p>
            Connect and manage external platforms, issue tracking services, communication tools, and webhooks.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="integrations-toolbar">
        <div className="quick-date-presets" role="tablist" aria-label="Category filter">
          <button
            type="button"
            className={`preset-pill ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            All Tools
          </button>
          <button
            type="button"
            className={`preset-pill ${selectedCategory === 'messaging' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('messaging')}
          >
            Messaging
          </button>
          <button
            type="button"
            className={`preset-pill ${selectedCategory === 'tickets' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('tickets')}
          >
            Issue Trackers
          </button>
          <button
            type="button"
            className={`preset-pill ${selectedCategory === 'developer' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('developer')}
          >
            Developer & Webhooks
          </button>
          <button
            type="button"
            className={`preset-pill ${selectedCategory === 'hr' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('hr')}
          >
            Directory & HR
          </button>
        </div>

        <div className="integrations-search-wrap">
          <input
            type="search"
            value={searchQuery}
            placeholder="Search integrations..."
            onChange={(e) => setSearchQuery(e.target.value)}
            className="integrations-search-input"
          />
        </div>
      </div>

      {/* Integrations Grid */}
      <div className="integrations-modern-grid">
        {filteredItems.map((item) => (
          <article key={item.id} className="panel integration-modern-card">
            <div className="integration-card-top">
              <div className="integration-icon-wrap">
                <Icon name={item.iconName} size={22} />
              </div>
              <span className={`integration-status-chip integration-status-chip--${item.status}`}>
                {item.badge}
              </span>
            </div>

            <div className="integration-card-content">
              <h3>{item.name}</h3>
              <p>{item.description}</p>
            </div>

            <div className="integration-card-footer">
              <button
                type="button"
                className={`secondary-button ${item.status === 'connected' ? 'connected-btn' : ''}`}
                onClick={() => handleAction(item)}
              >
                {item.actionLabel}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
