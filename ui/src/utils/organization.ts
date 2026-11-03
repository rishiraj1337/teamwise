import { employees } from '../mocks/workspaceData'
import type { Employee } from '../types/workspace'

export function getEmployee(id: string) {
  return employees.find((employee) => employee.id === id)
}

export function getDirectReports(id: string) {
  return employees.filter((employee) => employee.managerId === id)
}

export function getDescendants(id: string): Employee[] {
  const direct = getDirectReports(id)
  return direct.flatMap((person) => [person, ...getDescendants(person.id)])
}

export function getOrganizationAnchor(person: Employee) {
  const manager = person.managerId ? getEmployee(person.managerId) : undefined
  if (!manager) return person
  if (getDirectReports(person.id).length > 0) return manager
  return manager.managerId ? getEmployee(manager.managerId) ?? manager : manager
}

export function getAuthorizedPeople(person: Employee) {
  return [person, ...(getDirectReports(person.id).length ? getDescendants(person.id) : [])]
}
