/** Uppercases the first character and leaves the rest as written. */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
