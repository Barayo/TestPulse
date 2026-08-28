{{- define "testpulse.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{- define "testpulse.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "testpulse.labels" -}}
app.kubernetes.io/name: {{ include "testpulse.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "testpulse.selectorLabels" -}}
app.kubernetes.io/name: {{ include "testpulse.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "testpulse.image" -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) -}}
{{- end -}}

{{/* Database host: bundled service name or external host. */}}
{{- define "testpulse.dbHost" -}}
{{- if .Values.postgresql.enabled -}}
{{ include "testpulse.fullname" . }}-db
{{- else -}}
{{ required "externalDatabase.host is required when postgresql.enabled is false" .Values.externalDatabase.host }}
{{- end -}}
{{- end -}}

{{- define "testpulse.dbSecretName" -}}
{{- if .Values.postgresql.enabled -}}
{{- default (printf "%s-db" (include "testpulse.fullname" .)) .Values.postgresql.existingSecret -}}
{{- else -}}
{{- default (printf "%s-db" (include "testpulse.fullname" .)) .Values.externalDatabase.existingSecret -}}
{{- end -}}
{{- end -}}

{{- define "testpulse.jiraConnectorImage" -}}
{{- printf "%s:%s" .Values.jiraConnector.image.repository (default .Chart.AppVersion .Values.jiraConnector.image.tag) -}}
{{- end -}}

{{- define "testpulse.jiraConnectorSecretName" -}}
{{- default (printf "%s-jira-connector" (include "testpulse.fullname" .)) .Values.jiraConnector.existingSecret -}}
{{- end -}}
