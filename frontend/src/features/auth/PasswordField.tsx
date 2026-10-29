import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { FieldValues, Path, UseFormRegister } from 'react-hook-form'

type Props<FormValues extends FieldValues> = {
  id: string
  error?: string
  register: UseFormRegister<FormValues>
}

export function PasswordField<FormValues extends FieldValues>({ id, error, register }: Props<FormValues>) {
  const [visible, setVisible] = useState(false)
  return <div className="auth-field">
    <label htmlFor={id}>Password</label>
    <div className="password-control">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={id === 'register-password' ? 'new-password' : 'current-password'}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...register('password' as Path<FormValues>)}
      />
      <button className="password-toggle" type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(current => !current)}>
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
    {error && <span className="auth-error" id={`${id}-error`}>{error}</span>}
  </div>
}
