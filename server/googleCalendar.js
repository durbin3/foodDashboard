// A minimal Google Calendar client for a service account, using only Node's
// crypto and fetch: sign a JWT with the account's key, swap it for an access
// token, then call the Calendar REST API.
import crypto from 'node:crypto'

const SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const API = 'https://www.googleapis.com/calendar/v3'

const b64url = (data) => Buffer.from(data).toString('base64url')

export function createClient(key) {
  let token = null
  let expires = 0

  async function accessToken() {
    if (token && Date.now() < expires - 60_000) return token
    const now = Math.floor(Date.now() / 1000)
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claims = b64url(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: key.token_uri, iat: now, exp: now + 3600 }))
    const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(key.private_key, 'base64url')
    const res = await fetch(key.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`)
    token = body.access_token
    expires = Date.now() + body.expires_in * 1000
    return token
  }

  async function call(method, path, { query, body } = {}) {
    const url = `${API}${path}${query ? `?${new URLSearchParams(query)}` : ''}`
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 204) return null
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // A deleted event is already gone; that's what we wanted.
      if (method === 'DELETE' && (res.status === 404 || res.status === 410)) return null
      const err = new Error(data.error?.message ?? `Google Calendar request failed: ${res.status}`)
      err.status = res.status
      throw err
    }
    return data
  }

  const events = (calendarId) => `/calendars/${encodeURIComponent(calendarId)}/events`

  return {
    email: key.client_email,
    /** Every event on the calendar tagged with `privateProperty` ('name=value') ending on or after `timeMin`. */
    async listEvents(calendarId, { privateProperty, timeMin }) {
      const out = []
      let pageToken
      do {
        const page = await call('GET', events(calendarId), {
          query: { privateExtendedProperty: privateProperty, timeMin, singleEvents: 'true', maxResults: '250', ...(pageToken ? { pageToken } : {}) },
        })
        out.push(...(page.items ?? []))
        pageToken = page.nextPageToken
      } while (pageToken)
      return out
    },
    insertEvent: (calendarId, event) => call('POST', events(calendarId), { body: event }),
    patchEvent: (calendarId, id, event) => call('PATCH', `${events(calendarId)}/${encodeURIComponent(id)}`, { body: event }),
    deleteEvent: (calendarId, id) => call('DELETE', `${events(calendarId)}/${encodeURIComponent(id)}`),
  }
}
