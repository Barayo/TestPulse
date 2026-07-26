import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '@/lib/api'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PropertyRow } from '@/components/PropertyRow'
import { CaseSidebarSection } from '@/components/CaseSidebarSection'
import { CaseResultsPanel } from '@/components/CaseResultsPanel'
import { CaseStepsList } from '@/components/CaseStepsList'
import { ClassificationEditor, type Priority } from '@/components/ClassificationEditor'
import { StepEditor, type Step } from '@/components/StepEditor'
import { VersionDetailDialog } from '@/components/VersionDetailDialog'
import type { components } from '@testpulse/shared/api'

type TestCase = components['schemas']['TestCase']
type Project = components['schemas']['Project']
type Folder = components['schemas']['Folder']
type CaseVersion = components['schemas']['CaseVersion']
type Suite = components['schemas']['Suite']

function tagsToText(tags: string[]): string {
  return tags.join(', ')
}

function textToTags(text: string): string[] {
  return text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export default function CaseDetailPage() {
  const { projectKey, caseKey } = useParams<{ projectKey: string; caseKey: string }>()

  const [project, setProject] = useState<Project>()
  const [folders, setFolders] = useState<Folder[]>([])
  const [testCase, setTestCase] = useState<TestCase>()
  const [versions, setVersions] = useState<CaseVersion[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [notFound, setNotFound] = useState(false)

  const [viewingVersion, setViewingVersion] = useState<number | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [steps, setSteps] = useState<Step[]>([])
  const [priority, setPriority] = useState<Priority>('medium')
  const [tagsText, setTagsText] = useState('')
  const [platform, setPlatform] = useState('')
  const [testType, setTestType] = useState('')
  const [automated, setAutomated] = useState(false)

  const load = useCallback(async () => {
    if (!projectKey || !caseKey) return
    setNotFound(false)
    const [{ data: p }, { data: f }, { data: c }, { data: v }, { data: s }] = await Promise.all([
      api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
      api.GET('/api/v1/projects/{projectKey}/folders', { params: { path: { projectKey } } }),
      api.GET('/api/v1/cases/{caseKey}', { params: { path: { caseKey } } }),
      api.GET('/api/v1/cases/{caseKey}/versions', { params: { path: { caseKey } } }),
      api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey } } }),
    ])
    if (!p || !c) {
      setNotFound(true)
      return
    }
    setProject(p)
    setFolders(f ?? [])
    setTestCase(c)
    setVersions((v ?? []).slice().sort((a, b) => b.version - a.version))
    setSuites(s ?? [])
  }, [projectKey, caseKey])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!testCase) return
    setTitle(testCase.content.title)
    setSteps((testCase.content.steps ?? []).map((s) => ({ action: s.action, expected: s.expected ?? '' })))
    setPriority(testCase.content.priority ?? 'medium')
    setTagsText(tagsToText(testCase.content.tags ?? []))
    setPlatform(testCase.content.platform ?? '')
    setTestType(testCase.content.testType ?? '')
    setAutomated(testCase.content.automated ?? false)
    setIsEditing(false)
  }, [testCase])

  if (!projectKey || !caseKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Case not found. <Link to={`/projects/${projectKey}/library`} className="underline">Go to Library</Link>
      </p>
    )
  }
  if (!project || !testCase) return null

  const root = folders.find((f) => !f.parentFolderId)
  const folder = folders.find((f) => f.id === testCase.folderId)
  const folderName = folder && root && folder.id !== root.id ? folder.name : 'Library'
  const suiteNames = suites.filter((s) => s.caseIds.includes(testCase.id)).map((s) => s.name)

  async function saveEdit() {
    if (!title.trim() || !caseKey) return
    await api.PUT('/api/v1/cases/{caseKey}', {
      params: { path: { caseKey } },
      body: {
        title: title.trim(),
        steps: steps.filter((s) => s.action.trim()),
        description: testCase!.content.description ?? '',
        expectedResult: testCase!.content.expectedResult ?? '',
        priority,
        tags: textToTags(tagsText),
        platform: platform.trim(),
        testType: testType.trim(),
        automated,
      },
    })
    await load()
  }

  // Ends at the parent folder, not the case itself — the case's own <h1>
  // right below already shows its title, and (unlike a breadcrumb crumb)
  // can wrap instead of truncating a long one mid-word.
  const breadcrumbSegments: Crumb[] = [
    { label: 'Projects', href: '/' },
    { label: project.name, href: `/projects/${projectKey}` },
    { label: 'Library', href: `/projects/${projectKey}/library` },
    ...(folder && root && folder.id !== root.id
      ? [{ label: folder.name, href: `/projects/${projectKey}/library/${folder.id}` }]
      : []),
  ]

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-3">
            {!isEditing && (
              <Link
                to={`/projects/${projectKey}/library/${(folder ?? root)?.id}`}
                aria-label={`Back to ${folderName}`}
                className="text-2xl leading-none text-primary hover:text-primary/70"
              >
                ←
              </Link>
            )}
            <h1 className="tp-heading text-2xl">{testCase.content.title}</h1>
          </div>
        </div>
        {!isEditing && <Button onClick={() => setIsEditing(true)}>Edit</Button>}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="case-title" className="text-sm font-medium">
              Title
            </label>
            <Input id="case-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <ClassificationEditor
            priority={priority}
            tagsText={tagsText}
            platform={platform}
            testType={testType}
            automated={automated}
            onPriorityChange={setPriority}
            onTagsTextChange={setTagsText}
            onPlatformChange={setPlatform}
            onTestTypeChange={setTestType}
            onAutomatedChange={setAutomated}
          />
          <StepEditor steps={steps} onChange={setSteps} />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                void saveEdit()
              }}
            >
              Save changes
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-7 md:grid-cols-[1fr_320px]">
          <div className="space-y-2">
            <p className="panel-title text-xs font-semibold tracking-wide text-muted-foreground uppercase">Steps</p>
            <CaseStepsList
              steps={testCase.content.steps}
              emptyStateAction={<Button onClick={() => setIsEditing(true)}>+ Add steps</Button>}
            />
          </div>

          <div
            className="space-y-4 md:sticky md:top-6 md:self-start md:rounded-2xl md:bg-muted/60 md:p-5"
            data-testid="case-sidebar"
          >
            <CaseSidebarSection title="Properties">
              <PropertyRow label="Priority" value={<Badge>{testCase.content.priority ?? 'medium'}</Badge>} />
              <PropertyRow label="Test type" value={testCase.content.testType} />
              <PropertyRow
                label="Automation"
                value={testCase.content.automated ? 'Automated' : 'Manual'}
              />
              <PropertyRow label="Platform" value={testCase.content.platform} />
              <PropertyRow label="Tags" value={(testCase.content.tags ?? []).join(', ')} />
              <PropertyRow label="Version" value={`v${testCase.currentVersion}`} />
              <PropertyRow label="In suites" value={suiteNames.join(', ')} />
            </CaseSidebarSection>

            <CaseSidebarSection title="Results">
              <CaseResultsPanel />
            </CaseSidebarSection>

            <CaseSidebarSection title="Version history">
              <ul aria-label="Version history" className="divide-y rounded-md border text-sm">
                {versions.map((v) => (
                  <li key={v.version}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-accent"
                      onClick={() => setViewingVersion(v.version)}
                    >
                      <span>v{v.version}</span>
                      {v.version === testCase.currentVersion ? (
                        <Badge variant="default">current</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {new Date(v.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </CaseSidebarSection>
          </div>
        </div>
      )}

      {viewingVersion !== null && (
        <VersionDetailDialog
          open
          onOpenChange={(open) => !open && setViewingVersion(null)}
          caseKey={caseKey}
          version={viewingVersion}
          versions={versions}
        />
      )}
    </div>
  )
}
