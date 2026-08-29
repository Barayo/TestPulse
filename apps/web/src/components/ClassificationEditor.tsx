import type { components } from '@testpulse/shared/api'

export type Priority = components['schemas']['Priority']
export type CustomField = components['schemas']['CustomField']

export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical']
