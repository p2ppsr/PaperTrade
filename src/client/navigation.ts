export function shouldShowAdminNavigation (isAdmin: boolean | null | undefined): boolean {
  return isAdmin === true
}
