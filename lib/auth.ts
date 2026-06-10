export interface SteamUser {
  steamId: string
  displayName: string
  avatar: string
  profileUrl: string
  timecreated?: number | null
  // Derived server-side on every getCurrentUser() call from
  // env.ADMIN_STEAM_ID, never stored in the session cookie. Keeps admin
  // changes from requiring users to re-login.
  isAdmin?: boolean
}
