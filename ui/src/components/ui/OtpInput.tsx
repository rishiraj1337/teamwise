import { useRef, type KeyboardEvent } from 'react'

type OtpInputProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  invalid?: boolean
}

export function OtpInput({ value, onChange, disabled = false, invalid = false }: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? '')

  function updateDigit(index: number, digit: string) {
    const next = digits.slice()
    next[index] = digit
    onChange(next.join('').replace(/\s/g, ''))
  }

  function handleChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, '')
    if (!cleaned) {
      updateDigit(index, '')
      return
    }
    if (cleaned.length > 1) {
      const pasted = cleaned.slice(0, 6)
      onChange(pasted)
      const focusIndex = Math.min(pasted.length, 5)
      inputsRef.current[focusIndex]?.focus()
      return
    }
    updateDigit(index, cleaned)
    if (index < 5) inputsRef.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
  }

  return (
    <div className={`otp-input-row${invalid ? ' otp-input-row-invalid' : ''}`} role="group" aria-label="6-digit verification code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => { inputsRef.current[index] = element }}
          className="otp-digit-input"
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          disabled={disabled}
          value={digit}
          aria-label={`Digit ${index + 1}`}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
        />
      ))}
    </div>
  )
}
