import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { api } from '@/lib/api'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { PropertyRow } from '@/components/PropertyRow'
import { CaseSidebarSection } from '@/components/CaseSidebarSection'
import { CaseFormatEditor } from '@/components/CaseFormatEditor'
import { TagChipsEditor } from '@/components/TagChipsEditor'
import { PRIORITIES, type Priority, type CustomField } from '@/components/ClassificationEditor'
import { CASE_FORMAT_LABELS, type CaseFormat } from '@/lib/useCaseFormatSwitch'
import { useProjectPermissions } from '@/lib/useProjectPermissions'
import type { components } from '@testpulse/shared/api'

type Project = components['schemas']['Project']
type Folder = components['schemas']['Folder']
type Step = components['schemas']['Step']

// Case creation as a dedicated page, reusing CaseDetailPage's shell
// (redesign-case-creation-as-page) — replaces the old 420px slide-over
// drawer, which had grown too small for the format picker + a
// potentially large content editor plus the full classification block.
export default function CreateCasePage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const [searchParams] = useSearchParams()
  const folderId = searchParams.get('folderId')
  const navigate = useNavigate()
  const permissions = useProjectPermissions(projectKey)

  const [project, setProject] = useState<Project>()
  const [folders, setFolders] = useState<Folder[]>([])
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomField[]>([])

  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<CaseFormat>('steps')
  const [steps, setSteps] = useState<Step[]>([{ action: '', expected: '' }])
  const [description, setDescription] = useState('')
  const [gherkinSource, setGherkinSource] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [tags, setTags] = useState<string[]>([])
  const [platform, setPlatform] = useState('')
  const [testType, setTestType] = useState('')
  const [automated, setAutomated] = useState(false)
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!projectKey) return
    void (async () => {
      const [{ data: p }, f, { data: fields }] = await Promise.all([
        api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
        fetchAllPages((cursor) =>
          api.GET('/api/v1/projects/{projectKey}/folders', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
        ),
        api.GET('/api/v1/projects/{projectKey}/custom-fields', { params: { path: { projectKey } } }),
      ])
      setProject(p)
      setFolders(f.items)
      setCustomFieldDefs(fields ?? [])
    })()
  }, [projectKey])

  if (!projectKey) return null
  if (!project) return null

  const root = folders.find((f) => !f.parentFolderId)
  const targetFolder = folders.find((f) => f.id === folderId) ?? root
  const folderName = targetFolder && root && targetFolder.id !== root.id ? targetFolder.name : 'Library'
  const canCreate = Boolean(permissions?.caseCreate)

  const breadcrumbSegments: Crumb[] = trimProjectBreadcrumb([
    { label: 'Projects', href: '/' },
    { label: project.name, href: `/projects/${projectKey}` },
    { label: 'Library', href: `/projects/${projectKey}/library` },
    ...(targetFolder && root && targetFolder.id !== root.id
      ? [{ label: targetFolder.name, href: `/projects/${projectKey}/library/${targetFolder.id}` }]
      : []),
    { label: 'New test case' },
  ])

  async function submitCreate() {
    if (!title.trim() || !projectKey) return
    const { data } = await api.POST('/api/v1/projects/{projectKey}/cases', {
      params: { path: { projectKey } },
      body: {
        title: title.trim(),
        folderId: (targetFolder ?? root)?.id ?? '',
        steps: steps.filter((s) => s.action.trim()),
        description,
        format,
        gherkinSource,
        priority,
        tags,
        platform: platform.trim(),
        testType: testType.trim(),
        automated,
        customFields: customFieldValues,
      },
    })
    if (data) navigate(`/projects/${projectKey}/cases/${data.key}`)
  }

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div className="flex items-center gap-3 border-b pb-4">
        <Link
          to={`/projects/${projectKey}/library/${(targetFolder ?? root)?.id ?? ''}`}
          aria-label={`Back to ${folderName}`}
          className="text-2xl leading-none text-primary hover:text-primary/70"
        >
          ←
        </Link>
        <input
          aria-label="Title"
          placeholder="e.g. Login with valid credentials"
          className="tp-heading w-full min-w-0 border-b border-transparent bg-transparent text-2xl outline-none focus-visible:border-ring"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <CaseFormatEditor
            format={format}
            steps={steps}
            description={description}
            gherkinSource={gherkinSource}
            onFormatChange={setFormat}
            onStepsChange={setSteps}
            onDescriptionChange={setDescription}
            onGherkinSourceChange={setGherkinSource}
          />

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" asChild>
              <Link to={`/projects/${projectKey}/library/${(targetFolder ?? root)?.id ?? ''}`}>Cancel</Link>
            </Button>
            <Button disabled={!title.trim() || !canCreate} onClick={() => void submitCreate()}>
              Create test case
            </Button>
          </div>
        </div>

        <div
          className="space-y-4 md:sticky md:top-6 md:self-start md:rounded-2xl md:bg-muted/60 md:p-5"
          data-testid="case-sidebar"
        >
          <CaseSidebarSection title="Properties">
            <PropertyRow label="Format" value={CASE_FORMAT_LABELS[format]} />
            <PropertyRow
              label="Priority"
              value={
                <select
                  aria-label="Priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              }
              wrap
            />
            <PropertyRow
              label="Test type"
              value={<Input aria-label="Test type" value={testType} onChange={(e) => setTestType(e.target.value)} placeholder="e.g. unit, e2e" />}
              wrap
            />
            <PropertyRow
              label="Automation"
              value={<Switch aria-label="Automated" checked={automated} onCheckedChange={setAutomated} />}
              wrap
            />
            <PropertyRow
              label="Platform"
              value={<Input aria-label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="e.g. web, iOS" />}
              wrap
            />
            <PropertyRow
              label="Tags"
              value={
                <TagChipsEditor
                  tags={tags}
                  vocabulary={[]}
                  onAdd={(tag) => setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]))}
                  onRemove={(tag) => setTags((prev) => prev.filter((t) => t !== tag))}
                />
              }
              wrap
            />
            {customFieldDefs.map((field) => (
              <PropertyRow
                key={field.id}
                label={field.name}
                value={
                  field.fieldType === 'select' ? (
                    <select
                      aria-label={field.name}
                      value={customFieldValues[field.id] ?? ''}
                      onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      <option value="">—</option>
                      {(field.options ?? []).map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.value}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      aria-label={field.name}
                      value={customFieldValues[field.id] ?? ''}
                      onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    />
                  )
                }
                wrap
              />
            ))}
          </CaseSidebarSection>
        </div>
      </div>
    </div>
  )
}
