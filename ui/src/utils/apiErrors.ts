export type ValidationDetail = {
  loc?: (string | number)[]
  msg?: string
  type?: string
}

const REGISTER_FIELD_LABELS: Record<string, string> = {
  emp_id: 'Employee ID',
  email: 'Email',
  password: 'Password',
  name: 'Full name',
  department: 'Department',
  role: 'Role',
  job_title: 'Job title',
  mobile_number: 'Mobile number',
  current_password: 'Current password',
  new_password: 'New password',
  confirm_new_password: 'Confirm new password',
  otp: 'Verification code',
}

function fieldKeyFromLoc(loc: (string | number)[] | undefined): string | null {
  if (!loc?.length) return null
  const bodyIndex = loc.indexOf('body')
  const field = bodyIndex >= 0 ? loc[bodyIndex + 1] : loc[loc.length - 1]
  if (typeof field !== 'string') return null
  return field
}

function humanizeMessage(fieldKey: string, msg: string, type?: string): string {
  const label = REGISTER_FIELD_LABELS[fieldKey] ?? fieldKey

  if (type === 'string_too_short' || /at least \d+ character/i.test(msg)) {
    const match = msg.match(/at least (\d+)/i)
    const min = match?.[1] ?? '12'
    if (fieldKey === 'password' || fieldKey === 'new_password' || fieldKey === 'confirm_new_password') {
      return `Password must be at least ${min} characters.`
    }
    return `${label} must be at least ${min} characters.`
  }

  if (type === 'string_too_long' || /at most \d+ character/i.test(msg)) {
    const match = msg.match(/at most (\d+)/i)
    const max = match?.[1] ?? ''
    return max ? `${label} must be at most ${max} characters.` : `${label} is too long.`
  }

  if (type === 'value_error' || type === 'value_error.missing') {
    if (msg.includes('Password must include')) return msg
    if (msg.includes('Enter 7 to 15 digits')) return 'Enter 7 to 15 digits, optionally starting with +.'
    if (msg.includes('confirmation do not match')) return 'New password and confirmation do not match.'
    if (msg.toLowerCase().includes('valid email')) return 'Enter a valid email address.'
  }

  if (type === 'missing' || msg === 'Field required') {
    return `${label} is required.`
  }

  if (fieldKey === 'password' && msg.toLowerCase().includes('string')) {
    return 'Password must be at least 12 characters and include upper, lower, number, and special characters.'
  }

  if (msg.startsWith('Value error, ')) {
    return msg.replace(/^Value error, /, '')
  }

  return msg
}

export function fieldErrorsFromValidationDetail(detail: ValidationDetail[]): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const item of detail) {
    const key = fieldKeyFromLoc(item.loc)
    if (!key) continue
    const message = humanizeMessage(key, item.msg ?? 'Invalid value.', item.type)
    if (!errors[key]) errors[key] = message
  }
  return errors
}

export function parseApiErrorBody(body: unknown, status: number): { message: string; fieldErrors: Record<string, string> } {
  if (!body || typeof body !== 'object') {
    return { message: 'Request failed', fieldErrors: {} }
  }

  const detail = (body as { detail?: unknown }).detail
  const platformMessage = (body as { message?: unknown; success?: boolean }).message

  if (
    (body as { success?: boolean }).success === false &&
    typeof platformMessage === 'string' &&
    platformMessage
  ) {
    return { message: platformMessage, fieldErrors: {} }
  }

  if (typeof detail === 'string') {
    return { message: detail, fieldErrors: {} }
  }

  if (Array.isArray(detail)) {
    const fieldErrors = fieldErrorsFromValidationDetail(detail as ValidationDetail[])
    if (Object.keys(fieldErrors).length > 0) {
      return {
        message: '',
        fieldErrors,
      }
    }
    const combined = detail
      .map((item) => (typeof item === 'object' && item && 'msg' in item ? String((item as ValidationDetail).msg) : ''))
      .filter(Boolean)
      .join(' ')
    return { message: combined || 'Please fix the highlighted fields.', fieldErrors: {} }
  }

  if (status === 422) {
    return { message: 'Please check the highlighted fields.', fieldErrors: {} }
  }

  return { message: 'Request failed', fieldErrors: {} }
}
