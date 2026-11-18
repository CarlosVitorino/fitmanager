/** Copies Better Auth's Set-Cookie headers onto a redirect, so server-side form posts log the user in or out. */
export function redirectWithCookies(location: string, from: Response): Response {
  const headers = new Headers({ Location: location });
  for (const cookie of from.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

/** Only allow redirects back into this app. */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export async function readAuthError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}
