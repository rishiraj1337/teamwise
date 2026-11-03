import { useState } from 'react'
import { Icon } from './Icon'

type PasswordInputProps = {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  placeholder?: string
  invalid?: boolean
}

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete = 'new-password',
  placeholder,
  invalid = false,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className={`password-input-wrap${invalid ? ' password-input-invalid' : ''}`}>
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible((current) => !current)}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} size={16} />
      </button>
    </div>
  )
}
