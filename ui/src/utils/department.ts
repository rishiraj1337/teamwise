export const OPERATIONS_DEPARTMENT_ID = 101

export function normalizeDepartmentName(department: string) {
  return department.trim().toLowerCase()
}

export function isOperationsDepartment(department: string) {
  return normalizeDepartmentName(department) === 'operations'
}

export function isOperationsUser(user: { department_id: number; department?: string }) {
  return user.department_id === OPERATIONS_DEPARTMENT_ID
    || isOperationsDepartment(user.department ?? '')
}
