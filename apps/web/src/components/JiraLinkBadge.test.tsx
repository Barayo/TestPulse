import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JiraLinkBadge } from './JiraLinkBadge'

const RECENT = new Date().toISOString()
const OLD = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString() // 30h ago, past the 24h stale threshold

describe('JiraLinkBadge', () => {
  describe('property variant', () => {
    it('shows a plain dash when unlinked and the viewer cannot edit', () => {
      render(
        <JiraLinkBadge
          variant="property"
          jiraIssueKey={null}
          jiraIssueStatus={null}
          jiraLastSyncedAt={null}
          jiraBaseUrl=""
          canEdit={false}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByText('—')).toBeInTheDocument()
    })

    it('shows a "Link Jira issue" affordance when unlinked and the viewer can edit', () => {
      render(
        <JiraLinkBadge
          variant="property"
          jiraIssueKey={null}
          jiraIssueStatus={null}
          jiraLastSyncedAt={null}
          jiraBaseUrl=""
          canEdit
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByRole('button', { name: /link jira issue/i })).toBeInTheDocument()
    })

    it('renders the key and status as a working link when jiraBaseUrl is configured', () => {
      render(
        <JiraLinkBadge
          variant="property"
          jiraIssueKey="PROJ-123"
          jiraIssueStatus="In Progress"
          jiraLastSyncedAt={RECENT}
          jiraBaseUrl="https://mycompany.atlassian.net"
          canEdit={false}
          onSave={vi.fn()}
        />,
      )
      const link = screen.getByRole('link', { name: /proj-123/i })
      expect(link).toHaveAttribute('href', 'https://mycompany.atlassian.net/browse/PROJ-123')
      expect(screen.getByText('In Progress')).toBeInTheDocument()
    })

    it('renders a non-clickable key when jiraBaseUrl is not configured', () => {
      render(
        <JiraLinkBadge
          variant="property"
          jiraIssueKey="PROJ-123"
          jiraIssueStatus="In Progress"
          jiraLastSyncedAt={RECENT}
          jiraBaseUrl=""
          canEdit={false}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByText('PROJ-123')).toBeInTheDocument()
      // An <a> without an href has no "link" accessibility role — correctly
      // signals "not actually navigable" rather than a working link with an
      // empty target.
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('shows a staleness indicator when jiraLastSyncedAt is older than 24h', () => {
      render(
        <JiraLinkBadge
          variant="property"
          jiraIssueKey="PROJ-123"
          jiraIssueStatus="In Progress"
          jiraLastSyncedAt={OLD}
          jiraBaseUrl="https://mycompany.atlassian.net"
          canEdit={false}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByRole('link')).toHaveAttribute('title', expect.stringContaining('may be out of date'))
    })

    it('shows a never-synced tooltip when jiraLastSyncedAt is null', () => {
      render(
        <JiraLinkBadge
          variant="property"
          jiraIssueKey="PROJ-123"
          jiraIssueStatus={null}
          jiraLastSyncedAt={null}
          jiraBaseUrl="https://mycompany.atlassian.net"
          canEdit={false}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByRole('link')).toHaveAttribute('title', 'Not yet synced with Jira')
    })

    it('does not show an edit affordance when canEdit is false, even when linked', () => {
      render(
        <JiraLinkBadge
          variant="property"
          jiraIssueKey="PROJ-123"
          jiraIssueStatus="Done"
          jiraLastSyncedAt={RECENT}
          jiraBaseUrl=""
          canEdit={false}
          onSave={vi.fn()}
        />,
      )
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('entering edit mode, typing a key, and saving calls onSave with the uppercased key', async () => {
      const onSave = vi.fn()
      render(
        <JiraLinkBadge
          variant="property"
          jiraIssueKey={null}
          jiraIssueStatus={null}
          jiraLastSyncedAt={null}
          jiraBaseUrl=""
          canEdit
          onSave={onSave}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: /link jira issue/i }))
      const input = screen.getByRole('textbox', { name: /jira issue key/i })
      await userEvent.type(input, 'proj-999')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSave).toHaveBeenCalledWith('PROJ-999')
    })

    it('saving an empty field clears the link (calls onSave with null)', async () => {
      const onSave = vi.fn()
      render(
        <JiraLinkBadge
          variant="property"
          jiraIssueKey="PROJ-123"
          jiraIssueStatus={null}
          jiraLastSyncedAt={null}
          jiraBaseUrl=""
          canEdit
          onSave={onSave}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: /change jira link/i }))
      const input = screen.getByRole('textbox', { name: /jira issue key/i })
      await userEvent.clear(input)
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSave).toHaveBeenCalledWith(null)
    })

    it('pressing Escape while editing cancels without calling onSave', async () => {
      const onSave = vi.fn()
      render(
        <JiraLinkBadge
          variant="property"
          jiraIssueKey={null}
          jiraIssueStatus={null}
          jiraLastSyncedAt={null}
          jiraBaseUrl=""
          canEdit
          onSave={onSave}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: /link jira issue/i }))
      await userEvent.type(screen.getByRole('textbox', { name: /jira issue key/i }), 'PROJ-1{Escape}')
      expect(onSave).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: /link jira issue/i })).toBeInTheDocument()
    })
  })

  describe('row variant', () => {
    it('renders nothing when unlinked and the viewer cannot edit', () => {
      const { container } = render(
        <JiraLinkBadge
          variant="row"
          jiraIssueKey={null}
          jiraIssueStatus={null}
          jiraLastSyncedAt={null}
          jiraBaseUrl=""
          canEdit={false}
          onSave={vi.fn()}
        />,
      )
      expect(container).toBeEmptyDOMElement()
    })

    it('renders a compact link affordance when unlinked and the viewer can edit', () => {
      render(
        <JiraLinkBadge
          variant="row"
          jiraIssueKey={null}
          jiraIssueStatus={null}
          jiraLastSyncedAt={null}
          jiraBaseUrl=""
          canEdit
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByRole('button', { name: /link jira issue/i })).toBeInTheDocument()
    })

    it('renders just the key (no status text) when linked', () => {
      render(
        <JiraLinkBadge
          variant="row"
          jiraIssueKey="PROJ-456"
          jiraIssueStatus="In Progress"
          jiraLastSyncedAt={RECENT}
          jiraBaseUrl="https://mycompany.atlassian.net"
          canEdit={false}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByRole('link', { name: /proj-456/i })).toHaveAttribute(
        'href',
        'https://mycompany.atlassian.net/browse/PROJ-456',
      )
      expect(screen.queryByText('In Progress')).not.toBeInTheDocument()
    })

    it('shows staleness via the tooltip in the compact row too', () => {
      render(
        <JiraLinkBadge
          variant="row"
          jiraIssueKey="PROJ-456"
          jiraIssueStatus="In Progress"
          jiraLastSyncedAt={OLD}
          jiraBaseUrl="https://mycompany.atlassian.net"
          canEdit={false}
          onSave={vi.fn()}
        />,
      )
      expect(screen.getByRole('link')).toHaveAttribute('title', expect.stringContaining('may be out of date'))
    })
  })
})
