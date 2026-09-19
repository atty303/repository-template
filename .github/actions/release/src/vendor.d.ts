declare module "@semantic-release/commit-analyzer" {
  export function analyzeCommits(config: unknown, context: any): Promise<string | null>;
}
declare module "@semantic-release/release-notes-generator" {
  export function generateNotes(config: unknown, context: any): Promise<string>;
}
declare module "@semantic-release/github" {
  export function verifyConditions(config: unknown, context: any): Promise<void>;
  export function publish(config: unknown, context: any): Promise<Record<string, unknown>>;
}
