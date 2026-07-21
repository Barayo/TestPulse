import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ListChecksIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PropertyRow } from '@/components/PropertyRow'
import { CaseSidebarSection } from '@/components/CaseSidebarSection'
import { CaseResultsPanel } from '@/components/CaseResultsPanel'
import { ClassificationEditor, type Priority } from '@/components/ClassificationEditor'
import { StepEditor, type Step } from '@/components/StepEditor'
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
  const { projectId, caseId } = useParams<{ projectId: string; caseId: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project>()
  const [folders, setFolders] = useState<Folder[]>([])
  const [testCase, setTestCase] = useState<TestCase>()
  const [versions, setVersions] = useState<CaseVersion[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [notFound, setNotFound] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [steps, setSteps] = useState<Step[]>([])
  const [priority, setPriority] = useState<Priority>('medium')
  const [tagsText, setTagsText] = useState('')
  const [platform, setPlatform] = useState('')
  const [testType, setTestType] = useState('')
  const [automated, setAutomated] = useState(false)

  const load = useCallback(async () => {
    if (!projectId || !caseId) return
    setNotFound(false)
    const [{ data: p }, { data: f }, { data: c }, { data: v }, { data: s }] = await Promise.all([
      api.GET('/api/v1/projects/{projectId}', { params: { path: { projectId } } }),
      api.GET('/api/v1/projects/{projectId}/folders', { params: { path: { projectId } } }),
      api.GET('/api/v1/cases/{caseId}', { params: { path: { caseId } } }),
      api.GET('/api/v1/cases/{caseId}/versions', { params: { path: { caseId } } }),
      api.GET('/api/v1/projects/{projectId}/suites', { params: { path: { projectId } } }),
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
  }, [projectId, caseId])

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

  if (!projectId || !caseId) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Case not found. <Link to={`/projects/${projectId}/library`} className="underline">Go to Library</Link>
      </p>
    )
  }
  if (!project || !testCase) return null

  const root = folders.find((f) => !f.parentFolderId)
  const folder = folders.find((f) => f.id === testCase.folderId)
  const folderName = folder && root && folder.id !== root.id ? folder.name : 'Library'
  const suiteNames = suites.filter((s) => s.caseIds.includes(testCase.id)).map((s) => s.name)

  async function saveEdit() {
    if (!title.trim() || !caseId) return
    await api.PUT('/api/v1/cases/{caseId}', {
      params: { path: { caseId } },
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

  const breadcrumbSegments: Crumb[] = [
    { label: 'Projects', href: '/' },
    { label: project.name, href: `/projects/${projectId}` },
    { label: 'Library', href: `/projects/${projectId}/library` },
    ...(folder && root && folder.id !== root.id
      ? [{ label: folder.name, href: `/projects/${projectId}/library/${folder.id}` }]
      : []),
    { label: testCase.content.title },
  ]

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="tp-heading text-2xl">{testCase.content.title}</h1>
          <p className="text-sm text-muted-foreground">in {folderName}</p>
        </div>
        {!isEditing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/projects/${projectId}/library`)}>
              Close
            </Button>
            <Button onClick={() => setIsEditing(true)}>Edit</Button>
          </div>
        )}
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
            {testCase.content.steps?.length ? (
              <Card>
                <CardContent className="p-0">
                  <ol className="list-none">
                    {testCase.content.steps.map((s, i) => (
                      <li key={i} className="flex gap-3 border-b px-(--card-spacing) py-4 last:border-b-0">
                        <span
                          data-testid={`step-number-${i}`}
                          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                          aria-hidden="true"
                        >
                          {i + 1}
                        </span>
                        <div className="space-y-2 pt-0.5">
                          <p className="text-base font-medium leading-relaxed">{s.action}</p>
                          {s.expected && (
                            <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                              <p className="text-base leading-relaxed text-foreground">
                                <span className="tp-label mr-1.5 text-primary">Expected:</span>
                                {s.expected}
                              </p>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-2xl border border-dashed p-10 text-center">
                <ListChecksIcon className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
                <p className="mb-1 text-sm font-medium">No steps yet</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  Add steps to describe how to run this test.
                </p>
                <Button onClick={() => setIsEditing(true)}>+ Add steps</Button>
              </div>
            )}
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
                  <li key={v.version} className="flex items-center justify-between px-2 py-1.5">
                    <span>v{v.version}</span>
                    {v.version === testCase.currentVersion ? (
                      <Badge variant="default">current</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {new Date(v.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </CaseSidebarSection>
          </div>
        </div>
      )}
    </div>
  )
}
