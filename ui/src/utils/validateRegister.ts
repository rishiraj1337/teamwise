import { EMP_ID_PATTERN, normalizeEmpId } from '../constants/registerOptions'
import type { UserRegister } from '../types/auth'

export function validateRegisterForm(payload: UserRegister): Record<string, string> {
  const errors: Record<string, string> = {}

  const empId = normalizeEmpId(payload.emp_id)
  if (!empId) errors.emp_id = 'Employee ID is required.'
  else if (!EMP_ID_PATTERN.test(empId)) {
    errors.emp_id = 'Use NP followed by 4 digits (for example, NP1001).'
  }

  if (!payload.email.trim()) errors.email = 'Email is required.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }
  if (!payload.name.trim()) errors.name = 'Full name is required.'
  if (!payload.department_id || payload.department_id < 1) {
    errors.department_id = 'Select a department from the list loaded from teamwisedb.'
  }
  if (!payload.role_id || payload.role_id < 1) {
    errors.role_id = 'Select a role from the list loaded from teamwisedb.'
  }
  if (!payload.job_title.trim()) errors.job_title = 'Job title is required.'

  if (!payload.password) {
    errors.password = 'Password is required.'
  } else if (payload.password.length < 12) {
    errors.password = 'Password must be at least 12 characters.'
  } else {
    const requirements = [
      /[a-z]/.test(payload.password),
      /[A-Z]/.test(payload.password),
      /\d/.test(payload.password),
      /[^A-Za-z0-9]/.test(payload.password),
    ]
    if (!requirements.every(Boolean)) {
      errors.password = 'Include lowercase, uppercase, a number, and a special character.'
    }
  }

  if (!payload.mobile_number.trim()) {
    errors.mobile_number = 'Mobile number is required.'
  } else if (!/^\+?[0-9]{7,15}$/.test(payload.mobile_number.trim())) {
    errors.mobile_number = 'Enter 7 to 15 digits, optionally starting with +.'
  }

  return errors
}
