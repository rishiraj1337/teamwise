import { useState, type FormEvent } from 'react'
import { changePassword } from '../../api/auth'
import { ApiError } from '../../api/client'
import { Avatar } from '../../components/ui/Avatar'
import { Icon } from '../../components/ui/Icon'
import type { UserPublic } from '../../types/auth'
import { avatarColorForId, initialsFromName } from '../../utils/user'

type AccountProfilePanelProps = {
  user: UserPublic
  onClose: () => void
  onLogout: () => void
}

export function AccountProfilePanel({ user, onClose, onLogout }: AccountProfilePanelProps) {
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<Record<string, string>>({})
  const [passwordFormError, setPasswordFormError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  const avatarPerson = {
    name: user.name,
    initials: initialsFromName(user.name),
    color: avatarColorForId(user.emp_id),
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordFieldErrors({})
    setPasswordFormError('')
    setPasswordSuccess('')

    const clientErrors: Record<string, string> = {}
    if (!currentPassword) clientErrors.current_password = 'Current password is required.'
    if (!newPassword) clientErrors.new_password = 'New password is required.'
    else if (newPassword.length < 12) clientErrors.new_password = 'Password must be at least 12 characters.'
    else if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      clientErrors.new_password = 'Password must include lowercase, uppercase, a number, and a special character.'
    }
    if (!confirmPassword) clientErrors.confirm_new_password = 'Please confirm your new password.'
    else if (newPassword !== confirmPassword) clientErrors.confirm_new_password = 'New password and confirmation do not match.'
    if (Object.keys(clientErrors).length > 0) {
      setPasswordFieldErrors(clientErrors)
      return
    }

    setSaving(true)
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: confirmPassword,
      })
      setPasswordSuccess('Password updated successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowPasswordForm(false)
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        setPasswordFieldErrors(error.fieldErrors)
      } else if (error instanceof ApiError && error.status === 401) {
        setPasswordFieldErrors({ current_password: error.message || 'Current password is incorrect.' })
      } else {
        setPasswordFormError(error instanceof ApiError ? error.message : 'Could not change password.')
      }
    } finally {
      setSaving(false)
    }
  }

  function clearPasswordFieldError(key: string) {
    if (!passwordFieldErrors[key]) return
    setPasswordFieldErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const fields: { label: string; value: string }[] = [
    { label: 'Employee ID', value: user.emp_id },
    { label: 'Email', value: user.email },
    { label: 'Name', value: user.name },
    { label: 'Department', value: user.department },
    { label: 'Role', value: user.role },
    { label: 'Job title', value: user.job_title },
    { label: 'Mobile', value: user.mobile_number },
  ]

  return (
    <div className="account-popover" role="dialog" aria-label="Your account">
      <div className="popover-heading">
        <b>Your account</b>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <div className="account-popover-body">
        <div className="account-popover-hero">
          <Avatar person={avatarPerson} size="large" />
          <div>
            <h3>{user.name}</h3>
            <p>{user.job_title}</p>
            <span className="account-role-chip">{user.role}</span>
          </div>
        </div>
        <dl className="account-detail-grid">
          {fields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
        {passwordSuccess && <p className="account-success" role="status">{passwordSuccess}</p>}
        {showPasswordForm ? (
          <form className="account-password-form" onSubmit={handleChangePassword} noValidate>
            <span className="section-kicker">SECURITY</span>
            <h4>Change password</h4>
            <label htmlFor="current-password">Current password</label>
            <input id="current-password" type="password" autoComplete="current-password" className={passwordFieldErrors.current_password ? 'input-invalid' : ''} aria-invalid={Boolean(passwordFieldErrors.current_password)} value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); clearPasswordFieldError('current_password') }} />
            {passwordFieldErrors.current_password && <p className="field-error" role="alert">{passwordFieldErrors.current_password}</p>}
            <label htmlFor="new-password">New password</label>
            <input id="new-password" type="password" autoComplete="new-password" className={passwordFieldErrors.new_password ? 'input-invalid' : ''} aria-invalid={Boolean(passwordFieldErrors.new_password)} value={newPassword} onChange={(event) => { setNewPassword(event.target.value); clearPasswordFieldError('new_password') }} />
            {passwordFieldErrors.new_password && <p className="field-error" role="alert">{passwordFieldErrors.new_password}</p>}
            <label htmlFor="confirm-password">Confirm new password</label>
            <input id="confirm-password" type="password" autoComplete="new-password" className={passwordFieldErrors.confirm_new_password ? 'input-invalid' : ''} aria-invalid={Boolean(passwordFieldErrors.confirm_new_password)} value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); clearPasswordFieldError('confirm_new_password') }} />
            {passwordFieldErrors.confirm_new_password && <p className="field-error" role="alert">{passwordFieldErrors.confirm_new_password}</p>}
            {passwordFormError && <p className="login-error form-level-error" role="alert">{passwordFormError}</p>}
            <div className="account-password-actions">
              <button type="button" className="text-button" onClick={() => { setShowPasswordForm(false); setPasswordFieldErrors({}); setPasswordFormError('') }}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Update password'}</button>
            </div>
          </form>
        ) : (
          <button type="button" className="secondary-button account-change-password" onClick={() => setShowPasswordForm(true)}>
            <Icon name="layers" size={16} />Change password
          </button>
        )}
        <button type="button" className="account-sign-out" onClick={onLogout}>
          <Icon name="logout" size={16} />Sign out
        </button>
      </div>
    </div>
  )
}
