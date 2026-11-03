# Teamwise workspace prototype

A frontend-only React prototype for a unified company workspace. All people, project, task, and integration records are illustrative and hardcoded. There is no backend, real authentication, external service connection, or functioning AI integration.

## Run locally

```sh
npm install
npm run dev
```

Use the demo sign-in screen to select an account. Every listed username uses the password `password`.

## Frontend structure

```text
src/
├── app/                 # Application shell and top-level UI state
├── components/ui/       # Shared avatars, icons, and empty states
├── features/            # Dashboard, people, organization, tasks, projects, integrations
├── mocks/               # Hardcoded demo workspace data
├── styles/              # Global reset and shared application theme
├── types/               # Shared TypeScript domain types
├── utils/               # Organization hierarchy and status helpers
└── main.tsx             # Vite/React entry point
```

## Prototype interactions

- Department-specific overview dashboards for Technology, Compliance, Product, Legal, HR, Sales, Operations, Finance, and Leadership.
- People & teams shows the manager's reporting group, including peer teams, with names and designations. Work details are limited to the signed-in user and their own reporting hierarchy.
- The company-wide organization chart is view-only and contains names and designations, with expandable reporting relationships.
- Authorized employee profiles include illustrative projects, tasks, blockers, workload, and activity. Profiles outside that scope show organizational details only.
- Work and project pages include status filters; global search respects organizational visibility for people and work-detail permissions for tasks and projects.
- Integration controls, notifications, and the AI assistant are local UI demonstrations. They do not change external systems or contact services.
