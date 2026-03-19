'use client';

const MFA_REMINDER_KEY = 'mfa_reminder_dismissed_v1';

export function isMfaReminderDismissed() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MFA_REMINDER_KEY) === '1';
}

export function dismissMfaReminder() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MFA_REMINDER_KEY, '1');
}

export function clearMfaReminderDismissed() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(MFA_REMINDER_KEY);
}
