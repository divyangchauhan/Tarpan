/** Shared environment/naming config referenced by all stacks. */
export const APP_NAME = 'tarpan';
export const APP_PREFIX = 'Tarpan';

/** Resource name helper — kebab-case for AWS resource names. */
export function resourceName(suffix: string): string {
  return `${APP_NAME}-${suffix}`;
}

/** Logical ID prefix — PascalCase for CDK construct IDs. */
export function constructId(suffix: string): string {
  return `${APP_PREFIX}${suffix}`;
}
