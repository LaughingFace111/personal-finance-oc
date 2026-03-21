export type Session = { userId: string; email: string } | null;

export async function getSession(): Promise<Session> {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  if (!res.ok) return null;
  return res.json();
}
