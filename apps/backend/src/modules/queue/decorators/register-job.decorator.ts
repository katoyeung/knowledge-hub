/**
 * Decorator to mark a class as a job that should be auto-registered
 *
 * @param jobType - Optional custom job type. If not provided, will be derived from class name
 * @param options - Optional configuration for the job
 *
 * @example
 * ```typescript
 * @RegisterJob('custom-job-type')
 * export class MyJob extends BaseJob {
 *   // ...
 * }
 * ```
 *
 * @example
 * ```typescript
 * @RegisterJob() // Will use class name as job type
 * export class MyJob extends BaseJob {
 *   // ...
 * }
 * ```
 */
export function RegisterJob(
  jobType?: string,
  options?: {
    priority?: number;
    description?: string;
  },
) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    // Store metadata on the class
    Reflect.defineMetadata(
      'job:type',
      jobType || constructor.name,
      constructor,
    );
    Reflect.defineMetadata('job:options', options || {}, constructor);
    Reflect.defineMetadata('job:registered', true, constructor);

    return constructor;
  };
}

/**
 * Get job type from a class (from decorator or class name)
 */
export function getJobType(jobClass: any): string {
  const metadataType = Reflect.getMetadata('job:type', jobClass);
  if (metadataType) {
    return metadataType;
  }

  // Fallback to static jobType property
  if (jobClass.jobType) {
    return jobClass.jobType;
  }

  // Final fallback: derive from class name
  return jobClass.name
    .replace(/Job$/, '')
    .toLowerCase()
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

/**
 * Check if a class is marked as a registered job
 */
export function isRegisteredJob(jobClass: any): boolean {
  return Reflect.getMetadata('job:registered', jobClass) === true;
}
