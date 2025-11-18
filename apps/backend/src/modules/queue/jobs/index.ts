/**
 * Centralized job exports and registry
 * This file automatically collects all job classes for easy registration
 *
 * To add a new job:
 * 1. Create the job class extending BaseJob
 * 2. Add @RegisterJob decorator
 * 3. Import and add to ALL_JOB_CLASSES array below
 */

// Document jobs
import { ChunkingJob } from './document/chunking.job';
import { EmbeddingJob } from './document/embedding.job';

// Graph jobs
import { GraphExtractionJob } from './graph/graph-extraction.job';
import { EntityLearningJob } from './graph/entity-learning.job';
import { EntityNormalizationJob } from './graph/entity-normalization.job';

// Pipeline jobs
import { PipelineJob } from './pipeline/pipeline.job';

// Workflow jobs
import { WorkflowJob } from './workflow/workflow.job';

// Posts jobs
import { PostApprovalJob } from './posts/post-approval.job';

// LLM Processing jobs
import { GenericLLMProcessingJob } from './llm-processing/generic-llm-processing.job';

// Export all job classes
export const ALL_JOB_CLASSES = [
  // Document jobs
  ChunkingJob,
  EmbeddingJob,

  // Graph jobs
  GraphExtractionJob,
  EntityLearningJob,
  EntityNormalizationJob,

  // Pipeline jobs
  PipelineJob,

  // Workflow jobs
  WorkflowJob,

  // Posts jobs
  PostApprovalJob,

  // LLM Processing jobs
  GenericLLMProcessingJob,
];

// Export individual job classes for convenience
export {
  ChunkingJob,
  EmbeddingJob,
  GraphExtractionJob,
  EntityLearningJob,
  EntityNormalizationJob,
  PipelineJob,
  WorkflowJob,
  PostApprovalJob,
  GenericLLMProcessingJob,
};
