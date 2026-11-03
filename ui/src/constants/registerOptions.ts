export const EMP_ID_PATTERN = /^NP\d{4}$/i

export function normalizeEmpId(value: string) {
  return value.trim().toUpperCase()
}
