const GROUPED_PREFIXES = ["/blog"] as const;

export const PATH_GROUP_SUFFIX = "/*";

export function isGroupedPath(path: string): boolean {
  return path.endsWith(PATH_GROUP_SUFFIX);
}

export function collapseJourneyPath(path: string): string {
  for (const prefix of GROUPED_PREFIXES) {
    if (path.startsWith(`${prefix}/`) && path.length > prefix.length + 1) {
      return `${prefix}${PATH_GROUP_SUFFIX}`;
    }
  }
  return path;
}
