import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { requestForgotPassword, resetPassword, verifyResetOtp } from '../../api/auth'
import { ApiError } from '../../api/client'
import { fetchRegistrationOptions, formatRoleLabel, type RegistrationOptionsResponse } from '../../api/registrationOptions'
import { normalizeEmpId } from '../../constants/registerOptions'
import { Icon } from '../../components/ui/Icon'
import { OtpInput } from '../../components/ui/OtpInput'
import { PasswordInput } from '../../components/ui/PasswordInput'
import type { UserRegister } from '../../types/auth'
import { validateRegisterForm } from '../../utils/validateRegister'

const emptyRegister: UserRegister = {
  emp_id: '',
  email: '',
  password: '',
  name: '',
  department_id: 0,
  role_id: 0,
  job_title: '',
  mobile_number: '',
}

type AuthScreenProps = {
  loading: boolean
  onLogin: (email: string, password: string) => Promise<void>
  onRegister: (payload: UserRegister) => Promise<void>
}

function FieldFeedback({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return <p className="field-error" id={id} role="alert">{message}</p>
}

function FormField({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <div className="form-field-control" data-invalid={error ? 'true' : undefined}>
        {children}
      </div>
      <FieldFeedback id={`${id}-error`} message={error} />
    </div>
  )
}

export function AuthScreen({ loading, onLogin, onRegister }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset-otp'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotFieldError, setForgotFieldError] = useState('')
  const [forgotFormError, setForgotFormError] = useState('')
  const [forgotSuccess, setForgotSuccess] = useState('')
  const [forgotBusy, setForgotBusy] = useState(false)
  const [resetOtp, setResetOtp] = useState('')
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetFieldError, setResetFieldError] = useState('')
  const [resetFormError, setResetFormError] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetStep, setResetStep] = useState<'otp' | 'password' | 'success'>('otp')
  const [registerForm, setRegisterForm] = useState<UserRegister>(emptyRegister)
  const [loginFieldErrors, setLoginFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [loginFormError, setLoginFormError] = useState('')
  const [registerFieldErrors, setRegisterFieldErrors] = useState<Record<string, string>>({})
  const [registerFormError, setRegisterFormError] = useState('')
  const [registerOptions, setRegisterOptions] = useState<RegistrationOptionsResponse | null>(null)
  const [registerOptionsLoading, setRegisterOptionsLoading] = useState(false)
  const [registerOptionsError, setRegisterOptionsError] = useState('')

  const loadRegisterOptions = useCallback(() => {
    setRegisterOptionsLoading(true)
    setRegisterOptionsError('')
    return fetchRegistrationOptions()
      .then((options) => {
        setRegisterOptions(options)
        setRegisterForm((current) => ({
          ...current,
          department_id: current.department_id > 0
            ? current.department_id
            : options.departments[0]?.id ?? 0,
          role_id: current.role_id > 0
            ? current.role_id
            : options.roles.find((item) => item.name === 'employee')?.id ?? options.roles[0]?.id ?? 0,
        }))
      })
      .catch((error) => {
        setRegisterOptions(null)
        const message = error instanceof ApiError
          ? error.message
          : 'Could not load departments and roles from teamwisedb. Is the API running on port 8000?'
        setRegisterOptionsError(message)
      })
      .finally(() => {
        setRegisterOptionsLoading(false)
      })
  }, [])

  useEffect(() => {
    if (mode !== 'register') return
    loadRegisterOptions()
  }, [mode, loadRegisterOptions])

  function clearLoginErrors() {
    setLoginFieldErrors({})
    setLoginFormError('')
  }

  function clearRegisterErrors() {
    setRegisterFieldErrors({})
    setRegisterFormError('')
  }

  function applyApiError(error: unknown, mode: 'login' | 'register') {
    if (!(error instanceof ApiError)) {
      const message = mode === 'login'
        ? 'Sign in failed. Check that the API is running.'
        : 'Registration failed. Check that the API is running.'
      if (mode === 'login') setLoginFormError(message)
      else setRegisterFormError(message)
      return
    }

    if (Object.keys(error.fieldErrors).length > 0) {
      if (mode === 'login') {
        setLoginFieldErrors({
          email: error.fieldErrors.email,
          password: error.fieldErrors.password ?? error.fieldErrors.email,
        })
      } else {
        setRegisterFieldErrors(error.fieldErrors)
      }
      return
    }

    if (mode === 'login') {
      if (error.status === 401) {
        setLoginFieldErrors({ password: error.message || 'Invalid email or password.' })
      } else if (error.status === 429) {
        setLoginFormError(error.message || 'Too many failed sign-in attempts. Try again later.')
      } else {
        setLoginFormError(error.message)
      }
    } else if (error.status === 409) {
      setRegisterFormError(error.message)
    } else {
      setRegisterFormError(error.message || 'Registration failed.')
    }
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setForgotFieldError('')
    setForgotFormError('')
    setForgotSuccess('')
    const trimmed = forgotEmail.trim()
    if (!trimmed) {
      setForgotFieldError('Email is required.')
      return
    }
    setForgotBusy(true)
    try {
      const response = await requestForgotPassword(trimmed)
      setForgotSuccess(response.message)
      setResetStep('otp')
      setResetOtp('')
      setResetPasswordValue('')
      setResetConfirm('')
      setMode('reset-otp')
    } catch (error) {
      setForgotFormError(error instanceof ApiError ? error.message : 'Could not send reset email.')
    } finally {
      setForgotBusy(false)
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResetFieldError('')
    setResetFormError('')
    const trimmedEmail = forgotEmail.trim()
    const otp = resetOtp.trim()
    if (!trimmedEmail) {
      setResetFieldError('Email is required.')
      return
    }
    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      setResetFieldError('Enter the 6-digit code from your email.')
      return
    }
    setResetBusy(true)
    try {
      await verifyResetOtp(trimmedEmail, otp)
      setResetStep('password')
      setResetFieldError('')
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        setResetFieldError(error.fieldErrors.otp ?? 'Invalid code.')
      } else {
        setResetFormError(error instanceof ApiError ? error.message : 'Could not verify code.')
      }
    } finally {
      setResetBusy(false)
    }
  }

  async function handleSetNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResetFieldError('')
    setResetFormError('')
    const trimmedEmail = forgotEmail.trim()
    const otp = resetOtp.trim()
    if (!resetPasswordValue || !resetConfirm) {
      setResetFieldError('Enter and confirm your new password.')
      return
    }
    if (resetPasswordValue !== resetConfirm) {
      setResetFieldError('Passwords do not match.')
      return
    }
    setResetBusy(true)
    try {
      await resetPassword({
        email: trimmedEmail,
        otp,
        new_password: resetPasswordValue,
        confirm_new_password: resetConfirm,
      })
      setResetStep('success')
      setForgotSuccess('')
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        setResetFieldErrorsFromApi(error.fieldErrors)
      } else {
        setResetFormError(error instanceof ApiError ? error.message : 'Could not reset password.')
      }
    } finally {
      setResetBusy(false)
    }
  }

  function setResetFieldErrorsFromApi(fieldErrors: Record<string, string>) {
    const combined = fieldErrors.new_password
      ?? fieldErrors.confirm_new_password
      ?? fieldErrors.otp
      ?? fieldErrors.email
      ?? 'Please check your entries.'
    setResetFieldError(combined)
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearLoginErrors()
    const trimmedEmail = email.trim()
    const nextErrors: { email?: string; password?: string } = {}
    if (!trimmedEmail) nextErrors.email = 'Email is required.'
    if (!password) nextErrors.password = 'Password is required.'
    if (Object.keys(nextErrors).length > 0) {
      setLoginFieldErrors(nextErrors)
      return
    }
    try {
      await onLogin(trimmedEmail, password)
    } catch (error) {
      applyApiError(error, 'login')
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearRegisterErrors()

    if (registerOptionsError || !registerOptions) {
      setRegisterFormError(registerOptionsError || 'Departments and roles are not loaded yet.')
      if (registerOptionsError) {
        setRegisterFieldErrors({
          department_id: registerOptionsError,
          role_id: registerOptionsError,
        })
      }
      return
    }

    const payload: UserRegister = {
      ...registerForm,
      emp_id: normalizeEmpId(registerForm.emp_id),
      email: registerForm.email.trim(),
      name: registerForm.name.trim(),
      department_id: registerForm.department_id,
      role_id: registerForm.role_id,
      job_title: registerForm.job_title.trim(),
      mobile_number: registerForm.mobile_number.trim(),
    }
    const clientErrors = validateRegisterForm(payload)
    if (Object.keys(clientErrors).length > 0) {
      setRegisterFieldErrors(clientErrors)
      return
    }
    try {
      await onRegister(payload)
    } catch (error) {
      applyApiError(error, 'register')
    }
  }

  function updateRegisterField<K extends keyof UserRegister>(key: K, value: UserRegister[K]) {
    setRegisterForm((current) => ({ ...current, [key]: value }))
    if (registerFieldErrors[key]) {
      setRegisterFieldErrors((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
    }
  }

  function inputClass(hasError: boolean) {
    return hasError ? 'input-invalid' : ''
  }

  const departmentLoadError = registerOptionsError || (
    !registerOptionsLoading && registerOptions && registerOptions.departments.length === 0
      ? 'No departments found in teamwisedb. Run database migrations.'
      : undefined
  )
  const roleLoadError = registerOptionsError || (
    !registerOptionsLoading && registerOptions && registerOptions.roles.length === 0
      ? 'No roles found in teamwisedb. Run database migrations.'
      : undefined
  )

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="login-brand"><span className="brand-mark"><Icon name="spark" size={18} /></span><span>teamwise</span></div>
        <div className="visual-copy">
          <span className="eyebrow light-eyebrow">YOUR WORK, IN CONTEXT</span>
          <h1>Good work happens<br />when everything<br /><span>works together.</span></h1>
          <p>One thoughtful workspace for your people, projects, and tools.</p>
        </div>
        <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
        <span className="login-footer">A clearer view of work, together.</span>
      </section>
      <section className="login-panel">
        <div className="login-mobile-brand"><span className="brand-mark"><Icon name="spark" size={18} /></span><span>teamwise</span></div>
        <div className="login-card">
          <div className="login-intro">
            <span className="eyebrow">WELCOME TO TEAMWISE</span>
            <h2>{
              mode === 'login'
                ? 'Sign in to your workspace'
                : mode === 'forgot'
                  ? 'Reset your password'
                  : mode === 'reset-otp'
                    ? (resetStep === 'success'
                      ? 'Password updated'
                      : resetStep === 'password'
                        ? 'Create a new password'
                        : 'Verify your code')
                    : 'Create your account'
            }</h2>
            <p>{
              mode === 'login'
                ? 'Use the email and password from your TeamWise account.'
                : mode === 'forgot'
                  ? 'Enter your work email and we will send a one-time code.'
                  : mode === 'reset-otp'
                    ? (resetStep === 'success'
                      ? 'Password is successfully updated.'
                      : resetStep === 'password'
                        ? 'Choose a strong password for your Teamwise account.'
                        : 'Enter the 6-digit code we sent to your email.')
                    : 'Register once, then sign in with the same credentials.'
            }</p>
          </div>
          {mode !== 'forgot' && mode !== 'reset-otp' && (
          <div className="auth-mode-toggle">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); clearRegisterErrors() }}>Sign in</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); clearLoginErrors() }}>Register</button>
          </div>
          )}
          {mode === 'forgot' ? (
            <form className="login-form" onSubmit={(event) => void handleForgotPassword(event)} noValidate>
              <FormField id="forgot-email" label="Email" error={forgotFieldError}>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className={inputClass(Boolean(forgotFieldError))}
                  value={forgotEmail}
                  onChange={(event) => { setForgotEmail(event.target.value); setForgotFieldError('') }}
                />
              </FormField>
              {forgotFormError && <p className="login-error form-level-error" role="alert">{forgotFormError}</p>}
              {forgotSuccess && <p className="login-success form-level-error" role="status">{forgotSuccess}</p>}
              <button className="primary-button login-submit" type="submit" disabled={forgotBusy || loading}>
                {forgotBusy ? 'Sending…' : 'Send code'} <Icon name="arrow" size={17} />
              </button>
              <button
                type="button"
                className="text-button login-forgot-link"
                onClick={() => { setMode('login'); setForgotFormError(''); setForgotSuccess('') }}
              >
                Back to sign in
              </button>
            </form>
          ) : mode === 'reset-otp' ? (
            resetStep === 'success' ? (
              <>
                <p className="login-success form-level-error" role="status">Password is successfully updated.</p>
                <button
                  type="button"
                  className="primary-button login-submit"
                  onClick={() => {
                    setMode('login')
                    setResetStep('otp')
                    setResetOtp('')
                    setResetPasswordValue('')
                    setResetConfirm('')
                    setEmail(forgotEmail.trim())
                  }}
                >
                  Back to sign in <Icon name="arrow" size={17} />
                </button>
              </>
            ) : resetStep === 'password' ? (
              <form className="login-form" onSubmit={(event) => void handleSetNewPassword(event)} noValidate>
                <FormField id="reset-email-readonly" label="Email">
                  <input id="reset-email-readonly" type="email" value={forgotEmail} readOnly />
                </FormField>
                <FormField id="reset-new-password" label="New password" error={resetFieldError && !resetFormError ? resetFieldError : undefined}>
                  <PasswordInput
                    id="reset-new-password"
                    value={resetPasswordValue}
                    invalid={Boolean(resetFieldError)}
                    onChange={(value) => { setResetPasswordValue(value); setResetFieldError('') }}
                  />
                </FormField>
                <FormField id="reset-confirm-password" label="Confirm password">
                  <PasswordInput
                    id="reset-confirm-password"
                    value={resetConfirm}
                    invalid={Boolean(resetFieldError)}
                    onChange={(value) => { setResetConfirm(value); setResetFieldError('') }}
                  />
                </FormField>
                {resetFormError && <p className="login-error form-level-error" role="alert">{resetFormError}</p>}
                <button className="primary-button login-submit" type="submit" disabled={resetBusy}>
                  {resetBusy ? 'Saving…' : 'Update password'} <Icon name="arrow" size={17} />
                </button>
                <button
                  type="button"
                  className="text-button login-forgot-link"
                  onClick={() => { setResetStep('otp'); setResetFormError(''); setResetFieldError('') }}
                >
                  Back to code entry
                </button>
              </form>
            ) : (
              <form className="login-form" onSubmit={(event) => void handleVerifyOtp(event)} noValidate>
                <FormField id="reset-email" label="Email">
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    value={forgotEmail}
                    readOnly
                  />
                </FormField>
                <div className="form-field">
                  <label>6-digit code</label>
                  <div className="form-field-control">
                    <OtpInput
                      value={resetOtp}
                      invalid={Boolean(resetFieldError || resetFormError)}
                      disabled={resetBusy}
                      onChange={(value) => { setResetOtp(value); setResetFieldError(''); setResetFormError('') }}
                    />
                  </div>
                  {resetFieldError && <FieldFeedback id="reset-otp-error" message={resetFieldError} />}
                </div>
                {forgotSuccess && <p className="login-success form-level-error" role="status">{forgotSuccess}</p>}
                {resetFormError && !resetFieldError && <p className="login-error form-level-error" role="alert">{resetFormError}</p>}
                <button className="primary-button login-submit" type="submit" disabled={resetBusy}>
                  {resetBusy ? 'Verifying…' : 'Verify code'} <Icon name="arrow" size={17} />
                </button>
                <button
                  type="button"
                  className="text-button login-forgot-link"
                  onClick={() => { setMode('forgot'); setResetFieldError(''); setResetFormError('') }}
                >
                  Resend code
                </button>
                <button
                  type="button"
                  className="text-button login-forgot-link"
                  onClick={() => {
                    setMode('login')
                    setResetStep('otp')
                    setResetFieldError('')
                    setResetFormError('')
                    setForgotSuccess('')
                  }}
                >
                  Back to sign in
                </button>
              </form>
            )
          ) : mode === 'login' ? (
            <form className="login-form" onSubmit={handleLogin} noValidate>
              <FormField id="email" label="Email" error={loginFieldErrors.email}>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className={inputClass(Boolean(loginFieldErrors.email))}
                  aria-invalid={Boolean(loginFieldErrors.email)}
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); if (loginFieldErrors.email) setLoginFieldErrors((e) => ({ ...e, email: undefined })) }}
                />
              </FormField>
              <FormField id="password" label="Password" error={loginFieldErrors.password}>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className={inputClass(Boolean(loginFieldErrors.password))}
                  aria-invalid={Boolean(loginFieldErrors.password)}
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); if (loginFieldErrors.password) setLoginFieldErrors((e) => ({ ...e, password: undefined })) }}
                />
              </FormField>
              <button
                type="button"
                className="text-button login-forgot-link"
                onClick={() => {
                  setMode('forgot')
                  setForgotEmail(email.trim())
                  setForgotSuccess('')
                  setForgotFormError('')
                  clearLoginErrors()
                }}
              >
                Forgot password?
              </button>
              {loginFormError && <p className="login-error form-level-error" role="alert">{loginFormError}</p>}
              <button className="primary-button login-submit" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Continue to workspace'} <Icon name="arrow" size={17} /></button>
            </form>
          ) : (
            <form className="login-form register-form" onSubmit={handleRegister} noValidate>
              <FormField id="emp_id" label="Employee ID" error={registerFieldErrors.emp_id}>
                <input
                  id="emp_id"
                  autoComplete="off"
                  placeholder="NP1001"
                  inputMode="text"
                  className={inputClass(Boolean(registerFieldErrors.emp_id))}
                  aria-invalid={Boolean(registerFieldErrors.emp_id)}
                  value={registerForm.emp_id}
                  onChange={(event) => updateRegisterField('emp_id', event.target.value.toUpperCase())}
                />
              </FormField>
              <FormField id="reg-email" label="Email" error={registerFieldErrors.email}>
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className={inputClass(Boolean(registerFieldErrors.email))}
                  aria-invalid={Boolean(registerFieldErrors.email)}
                  value={registerForm.email}
                  onChange={(event) => updateRegisterField('email', event.target.value)}
                />
              </FormField>
              <FormField id="reg-password" label="Password" error={registerFieldErrors.password}>
                <input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  className={inputClass(Boolean(registerFieldErrors.password))}
                  aria-invalid={Boolean(registerFieldErrors.password)}
                  value={registerForm.password}
                  onChange={(event) => updateRegisterField('password', event.target.value)}
                />
              </FormField>
              <FormField id="name" label="Full name" error={registerFieldErrors.name}>
                <input
                  id="name"
                  autoComplete="name"
                  placeholder="Your full name"
                  className={inputClass(Boolean(registerFieldErrors.name))}
                  aria-invalid={Boolean(registerFieldErrors.name)}
                  value={registerForm.name}
                  onChange={(event) => updateRegisterField('name', event.target.value)}
                />
              </FormField>
              <FormField
                id="department"
                label="Department"
                error={registerFieldErrors.department_id || (registerOptionsError ? departmentLoadError : undefined)}
              >
                <select
                  id="department"
                  disabled={registerOptionsLoading || !registerOptions?.departments.length}
                  className={inputClass(Boolean(registerFieldErrors.department_id || departmentLoadError))}
                  aria-invalid={Boolean(registerFieldErrors.department_id || departmentLoadError)}
                  value={registerForm.department_id || ''}
                  onChange={(event) => updateRegisterField('department_id', Number(event.target.value))}
                >
                  {registerOptionsLoading && <option value="">Loading from teamwisedb…</option>}
                  {!registerOptionsLoading && !registerOptions?.departments.length && (
                    <option value="">No departments in database</option>
                  )}
                  {registerOptions?.departments.map((department) => (
                    <option key={department.id} value={department.id}>{department.name}</option>
                  ))}
                </select>
              </FormField>
              <FormField
                id="role"
                label="Role"
                error={registerFieldErrors.role_id || (registerOptionsError ? roleLoadError : undefined)}
              >
                <select
                  id="role"
                  disabled={registerOptionsLoading || !registerOptions?.roles.length}
                  className={inputClass(Boolean(registerFieldErrors.role_id || roleLoadError))}
                  aria-invalid={Boolean(registerFieldErrors.role_id || roleLoadError)}
                  value={registerForm.role_id || ''}
                  onChange={(event) => updateRegisterField('role_id', Number(event.target.value))}
                >
                  {registerOptionsLoading && <option value="">Loading from teamwisedb…</option>}
                  {!registerOptionsLoading && !registerOptions?.roles.length && (
                    <option value="">No roles in database</option>
                  )}
                  {registerOptions?.roles.map((role) => (
                    <option key={role.id} value={role.id}>{formatRoleLabel(role.name)}</option>
                  ))}
                </select>
              </FormField>
              {registerOptionsError && (
                <div className="register-options-retry">
                  <p className="login-error form-level-error" role="alert">{registerOptionsError}</p>
                  <button type="button" className="text-button" onClick={() => loadRegisterOptions()}>Retry loading from database</button>
                </div>
              )}
              <FormField id="job_title" label="Job title" error={registerFieldErrors.job_title}>
                <input
                  id="job_title"
                  autoComplete="organization-title"
                  placeholder="Your job title"
                  className={inputClass(Boolean(registerFieldErrors.job_title))}
                  aria-invalid={Boolean(registerFieldErrors.job_title)}
                  value={registerForm.job_title}
                  onChange={(event) => updateRegisterField('job_title', event.target.value)}
                />
              </FormField>
              <FormField id="mobile_number" label="Mobile number" error={registerFieldErrors.mobile_number}>
                <input
                  id="mobile_number"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+919876543210"
                  className={inputClass(Boolean(registerFieldErrors.mobile_number))}
                  aria-invalid={Boolean(registerFieldErrors.mobile_number)}
                  value={registerForm.mobile_number}
                  onChange={(event) => updateRegisterField('mobile_number', event.target.value)}
                />
              </FormField>
              {registerFormError && <p className="login-error form-level-error" role="alert">{registerFormError}</p>}
              <button
                className="primary-button login-submit"
                type="submit"
                disabled={loading || registerOptionsLoading || !registerOptions?.departments.length || !registerOptions?.roles.length}
              >
                {loading ? 'Creating account…' : 'Create account'} <Icon name="arrow" size={17} />
              </button>
            </form>
          )}
          <p className="login-disclaimer">Authentication is connected to the TeamWise API on your configured backend.</p>
        </div>
      </section>
    </main>
  )
}
