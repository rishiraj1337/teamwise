import { platformApiRequest } from './platformClient'

export type EmailIngestionStats = {
  isProcessing?: boolean
  pendingCount?: number
  processedCount?: number
  supportCount?: number
  nonSupportCount?: number
  failedCount?: number
  lastRunAt?: string | null
  lastError?: string | null
}

export type PlaystoreIngestionStats = {
  isScraping?: boolean
  lastRunAt?: string | null
  totalScraped?: number
  lastError?: string | null
}

export type ChatbotIngestionStats = {
  isPolling?: boolean
  lastPollAt?: string | null
  totalSessions?: number
  lastError?: string | null
}

export type FilteredEmailItem = {
  id: number
  message_id: string
  from_address: string
  subject: string
  received_date_time: string
  support_flag: string
  rejection_reason: string
  file_name: string
  body_snippet: string
  created_at: string
}

export async function fetchEmailIngestionStatus() {
  const data = await platformApiRequest<{ success: boolean; stats: EmailIngestionStats }>(
    '/api/ingestion/email/status',
  )
  return data.stats
}

export async function triggerEmailIngestion() {
  return platformApiRequest<{ success: boolean; result: { processed: number; failed: number } }>(
    '/api/ingestion/email/trigger',
    { method: 'POST', body: '{}' },
  )
}

export async function fetchFilteredEmails(page = 1, limit = 10) {
  return platformApiRequest<{
    success: boolean
    items: FilteredEmailItem[]
    total: number
    page: number
    limit: number
    totalPages: number
  }>(`/api/ingestion/email/filtered?page=${page}&limit=${limit}`)
}

export async function fetchPlaystoreIngestionStatus() {
  const data = await platformApiRequest<{ success: boolean; stats: PlaystoreIngestionStats }>(
    '/api/ingestion/playstore/status',
  )
  return data.stats
}

export async function triggerPlaystoreIngestion() {
  return platformApiRequest<{ success: boolean; result: Record<string, unknown> }>(
    '/api/ingestion/playstore/trigger',
    { method: 'POST', body: '{}' },
  )
}

export async function fetchChatbotIngestionStatus() {
  const data = await platformApiRequest<{ success: boolean; stats: ChatbotIngestionStats }>(
    '/api/ingestion/chatbot/status',
  )
  return data.stats
}

export async function triggerChatbotPoll() {
  return platformApiRequest<{ success: boolean; result: Record<string, unknown> }>(
    '/api/ingestion/chatbot/poll',
    { method: 'POST', body: '{}' },
  )
}
