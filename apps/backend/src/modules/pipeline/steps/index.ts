/**
 * Centralized step exports and registry
 * This file automatically collects all step classes for easy registration
 */

// Import all step classes
import { DuplicateSegmentStep } from './duplicate-segment.step';
import { RuleBasedFilterStep } from './rule-based-filter.step';
import { AiSummarizationStep } from './ai-summarization.step';
import { EmbeddingGenerationStep } from './embedding-generation.step';
import { GraphExtractionStep } from './graph-extraction.step';
import { DataSourceStep } from './datasource.step';
import { TriggerManualStep } from './trigger-manual.step';
import { TriggerScheduleStep } from './trigger-schedule.step';
import { TestStep } from './test.step';
import { LenxApiDataSourceStep } from './lenx-api-datasource.step';
import { DatasetInserterStep } from './dataset-inserter.step';

// Export all step classes
export const ALL_STEP_CLASSES = [
  DuplicateSegmentStep,
  RuleBasedFilterStep,
  AiSummarizationStep,
  EmbeddingGenerationStep,
  GraphExtractionStep,
  DataSourceStep,
  TriggerManualStep,
  TriggerScheduleStep,
  TestStep,
  LenxApiDataSourceStep,
  DatasetInserterStep,
];

// Export types for convenience
export {
  DuplicateSegmentStep,
  RuleBasedFilterStep,
  AiSummarizationStep,
  EmbeddingGenerationStep,
  GraphExtractionStep,
  DataSourceStep,
  TriggerManualStep,
  TriggerScheduleStep,
  TestStep,
  LenxApiDataSourceStep,
  DatasetInserterStep,
};
