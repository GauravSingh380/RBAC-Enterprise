import type { FormRule } from 'antd'

// Mirrors the server rules in server/src/modules/auth/auth.dto.ts
export const passwordRules: FormRule[] = [
  { required: true, message: 'Enter a password' },
  { min: 8, message: 'At least 8 characters' },
  { max: 72, message: 'At most 72 characters' },
  { pattern: /[A-Za-z]/, message: 'Must contain a letter' },
  { pattern: /\d/, message: 'Must contain a number' },
]

/** The rules of the organization(s): longer minimum, maybe a symbol (the server checks them too). */
export function policyPasswordRules(policy: { minLength: number; requireSymbol: boolean } | null | undefined): FormRule[] {
  if (!policy) return passwordRules
  return [
    { required: true, message: 'Enter a password' },
    { min: policy.minLength, message: `At least ${policy.minLength} characters` },
    { max: 72, message: 'At most 72 characters' },
    { pattern: /[A-Za-z]/, message: 'Must contain a letter' },
    { pattern: /\d/, message: 'Must contain a number' },
    ...(policy.requireSymbol ? [{ pattern: /[^A-Za-z0-9]/, message: 'Must contain a symbol (for example ! # % or @)' }] : []),
  ]
}

/** "At least 12 characters, with a letter, a number and a symbol." */
export function describePasswordPolicy(policy: { minLength: number; requireSymbol: boolean }): string {
  return `At least ${policy.minLength} characters, with a letter, a number${policy.requireSymbol ? ' and a symbol' : ''}.`
}

/** Same rules but the field may be left empty (e.g. optional password reset). */
export const optionalPasswordRules: FormRule[] = passwordRules.slice(1)
