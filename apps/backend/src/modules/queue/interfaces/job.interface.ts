export interface JobData {
  [key: string]: any;
}

export interface JobOptions {
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  timeout?: number;
  priority?: number;
}

export interface Job {
  type: string;
  data: JobData;
  options?: JobOptions;
}

export interface JobHandler {
  handle(data: JobData): Promise<void>;
}
