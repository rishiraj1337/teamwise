export function getStatusClass(status: string) {
  return status.toLowerCase().replaceAll(' ', '-')
}
