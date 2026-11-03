export type UserPublic = {
  emp_id: string
  email: string
  name: string
  department_id: number
  department: string
  role: string
  job_title: string
  mobile_number: string
  permissions: string[]
}

export type UserRegister = {
  emp_id: string
  email: string
  password: string
  name: string
  department_id: number
  role_id: number
  job_title: string
  mobile_number: string
}

export type TokenResponse = {
  access_token: string
  token_type: 'bearer'
  user: UserPublic
}

export type ChangePasswordPayload = {
  current_password: string
  new_password: string
  confirm_new_password: string
}
