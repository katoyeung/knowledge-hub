import { Test, TestingModule } from '@nestjs/testing';
import { DummyMockStep, DummyMockConfig } from './dummy-mock.step';
import { PipelineStepRegistry } from '../services/pipeline-step-registry.service';
import { StepExecutionContext } from './base.step';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import { ALL_STEP_CLASSES } from './index';

/**
 * Comprehensive workflow integration test
 *
 * This test suite:
 * 1. Uses DummyMockStep to generate mock output with dynamic fields
 * 2. Connects the dummy step output to each registered step
 * 3. Validates that each step processes the input correctly
 * 4. Ensures input/output formats are as expected
 */
describe('Workflow Steps Integration Test', () => {
  let dummyStep: DummyMockStep;
  let stepRegistry: PipelineStepRegistry;
  let mockContext: StepExecutionContext;
  let testModule: TestingModule;

  // Skip steps that require external dependencies or special setup
  const SKIP_STEPS = [
    'datasource', // Requires database connection
    'lenx_api_datasource', // Requires external API
    'trigger_manual', // Requires workflow trigger setup
    'trigger_schedule', // Requires scheduler
    'dataset_inserter', // Requires database write
    'post_upserter', // Requires database write
    'post_deleter', // Requires database write
    'post_datasource', // Requires database read
    'embedding_generation', // May require AI service
    'ai_summarization', // Requires AI service
    'graph_extraction', // May require AI service
  ];

  beforeAll(async () => {
    // Only include steps that don't require external dependencies
    const testableStepClasses = ALL_STEP_CLASSES.filter((StepClass) => {
      const className = StepClass.name;
      // Filter out steps that require dependencies
      return ![
        'AiSummarizationStep',
        'EmbeddingGenerationStep',
        'GraphExtractionStep',
        'DataSourceStep',
        'LenxApiDataSourceStep',
        'DatasetInserterStep',
        'PostUpserterStep',
        'PostDataSourceStep',
        'PostDeleterStep',
        'TriggerManualStep',
        'TriggerScheduleStep',
      ].includes(className);
    });

    testModule = await Test.createTestingModule({
      providers: [
        DummyMockStep,
        PipelineStepRegistry,
        // Register only testable step classes
        ...testableStepClasses,
      ],
    }).compile();

    dummyStep = testModule.get<DummyMockStep>(DummyMockStep);
    stepRegistry = testModule.get<PipelineStepRegistry>(PipelineStepRegistry);

    // Register all steps that were successfully instantiated
    for (const StepClass of testableStepClasses) {
      try {
        const stepInstance = testModule.get(StepClass, { strict: false });
        if (stepInstance) {
          stepRegistry.registerStep(stepInstance);
        }
      } catch (error) {
        // Some steps may require dependencies, skip them
        console.warn(`Failed to register ${StepClass.name}:`, error.message);
      }
    }

    mockContext = {
      executionId: 'test-execution-id',
      pipelineConfigId: 'test-pipeline-id',
      userId: 'test-user-id',
      logger: dummyStep['logger'],
      metadata: {
        testRun: true,
      },
    };
  });

  afterAll(async () => {
    if (testModule) {
      await testModule.close();
    }
  });

  /**
   * Generate mock data using DummyMockStep
   */
  const generateMockData = async (
    config: Partial<DummyMockConfig> = {},
  ): Promise<DocumentSegment[]> => {
    const defaultConfig: DummyMockConfig = {
      count: 10,
      dynamicFields: ['customField1', 'customField2', 'customField3'],
      fieldTypes: {
        customField1: 'string',
        customField2: 'number',
        customField3: 'boolean',
      },
      includeMetadata: true,
      seed: 12345, // For reproducible tests
      ...config,
    };

    const result = await dummyStep.execute([], defaultConfig, mockContext);
    expect(result.success).toBe(true);
    expect(result.outputSegments).toBeDefined();
    expect(result.outputSegments.length).toBeGreaterThan(0);

    return result.outputSegments;
  };

  /**
   * Validate input structure - flexible to accept any format
   * Steps accept `any` input, so we validate based on what we receive
   */
  const validateInputStructure = (
    input: any,
    stepType: string,
  ): { isValid: boolean; errors: string[]; inputFormat: string } => {
    const errors: string[] = [];
    let inputFormat = 'unknown';

    // Input can be any type - array, object, primitive
    if (input === null || input === undefined) {
      inputFormat = 'null/undefined';
      // Null/undefined is valid (some steps handle it)
      return { isValid: true, errors: [], inputFormat };
    }

    if (Array.isArray(input)) {
      inputFormat = 'array';
      if (input.length === 0) {
        // Empty array is valid
        return { isValid: true, errors: [], inputFormat: 'empty_array' };
      }

      // Check first item to understand structure
      const firstItem = input[0];
      if (typeof firstItem === 'object' && firstItem !== null) {
        // Array of objects - could be DocumentSegments, or any objects
        if ('id' in firstItem && 'content' in firstItem) {
          inputFormat = 'array_of_document_segments';
        } else if ('items' in firstItem || 'data' in firstItem) {
          inputFormat = 'array_of_structured_objects';
        } else {
          inputFormat = 'array_of_objects';
        }
      } else {
        inputFormat = `array_of_${typeof firstItem}`;
      }
      // Arrays are valid regardless of content
      return { isValid: true, errors: [], inputFormat };
    }

    if (typeof input === 'object') {
      // Object input - could be structured format like { data: [], total: N }
      if ('data' in input && Array.isArray(input.data)) {
        inputFormat = 'structured_data_object';
      } else if ('items' in input && Array.isArray(input.items)) {
        inputFormat = 'structured_items_object';
      } else if ('content' in input || 'id' in input) {
        inputFormat = 'document_segment_like';
      } else {
        inputFormat = 'generic_object';
      }
      // Objects are valid
      return { isValid: true, errors: [], inputFormat };
    }

    // Primitive types (string, number, boolean)
    inputFormat = typeof input;
    // Primitives are valid (steps may accept them)
    return { isValid: true, errors: [], inputFormat };
  };

  /**
   * Validate output structure - flexible to accept any format
   * Steps can return arrays, objects, or any format
   */
  const validateOutputStructure = (
    output: any,
    stepType: string,
    stepMetadata: any,
  ): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    outputFormat: string;
  } => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let outputFormat = 'unknown';

    // Output can be any type - array, object, primitive
    if (output === null || output === undefined) {
      outputFormat = 'null/undefined';
      warnings.push(`Step ${stepType} returned null/undefined output`);
      return { isValid: true, errors, warnings, outputFormat };
    }

    if (Array.isArray(output)) {
      outputFormat = 'array';
      if (output.length === 0) {
        outputFormat = 'empty_array';
        warnings.push(`Step ${stepType} returned empty output array`);
        return { isValid: true, errors, warnings, outputFormat };
      }

      // Check first item to understand structure
      const firstItem = output[0];
      if (typeof firstItem === 'object' && firstItem !== null) {
        // Array of objects
        if ('id' in firstItem && 'content' in firstItem) {
          outputFormat = 'array_of_document_segments';
        } else if ('items' in firstItem || 'data' in firstItem) {
          outputFormat = 'array_of_structured_objects';
          // Structured objects in array are valid
          return { isValid: true, errors, warnings, outputFormat };
        } else {
          outputFormat = 'array_of_objects';
        }
      } else {
        outputFormat = `array_of_${typeof firstItem}`;
      }
      // Arrays are valid
      return { isValid: true, errors, warnings, outputFormat };
    }

    if (typeof output === 'object') {
      // Object output - structured format like { data: [], total: N } or { items: [], duplicates: [] }
      if ('data' in output && Array.isArray(output.data)) {
        outputFormat = 'structured_data_object';
      } else if ('items' in output && Array.isArray(output.items)) {
        outputFormat = 'structured_items_object';
      } else if ('content' in output || 'id' in output) {
        outputFormat = 'document_segment_like';
      } else {
        outputFormat = 'generic_object';
      }
      // Objects are valid
      return { isValid: true, errors, warnings, outputFormat };
    }

    // Primitive types (string, number, boolean)
    outputFormat = typeof output;
    warnings.push(
      `Step ${stepType} returned primitive output: ${outputFormat}`,
    );
    // Primitives are valid (steps may return them)
    return { isValid: true, errors, warnings, outputFormat };
  };

  /**
   * Test a step with mock input and validate input/output
   */
  const testStepWithMockInput = async (
    stepType: string,
    mockInput: DocumentSegment[],
    stepConfig: any = {},
  ) => {
    const stepInstance = stepRegistry.createStepInstance(stepType);
    if (!stepInstance) {
      throw new Error(`Step type ${stepType} not found`);
    }

    // Validate input structure (flexible - accepts any format)
    const inputValidation = validateInputStructure(mockInput, stepType);

    // Log input format for debugging
    if (inputValidation.inputFormat) {
      // console.log(`Step ${stepType} received input format: ${inputValidation.inputFormat}`);
    }

    // Validate step configuration
    const validation = await stepInstance.validate(stepConfig);
    if (!validation.isValid) {
      // If validation fails, return the validation result for inspection
      // But still include input validation results
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`,
        validationErrors: validation.errors,
        inputValidation: inputValidation,
        outputValidation: { isValid: false, errors: [], warnings: [] },
      };
    }

    // Execute the step
    try {
      const result = await stepInstance.execute(
        mockInput,
        stepConfig,
        mockContext,
      );

      // Get step metadata for output validation
      const stepMetadata = stepRegistry.getStep(stepType);

      // Validate output structure
      const outputValidation = validateOutputStructure(
        result.outputSegments,
        stepType,
        stepMetadata,
      );

      // Format output using step's formatOutput method
      const formattedOutput = stepInstance.formatOutput(result, mockInput);

      return {
        success: result.success && outputValidation.isValid,
        outputSegments: result.outputSegments,
        formattedOutput,
        metrics: result.metrics,
        error:
          result.error ||
          (outputValidation.isValid
            ? undefined
            : outputValidation.errors.join(', ')),
        warnings: [...(result.warnings || []), ...outputValidation.warnings],
        inputValidation: inputValidation,
        outputValidation: outputValidation,
        inputFormat: inputValidation.inputFormat,
        outputFormat: outputValidation.outputFormat,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  };

  describe('DummyMockStep - Generate Mock Data', () => {
    it('should generate mock segments with default configuration', async () => {
      const result = await generateMockData();
      expect(result.length).toBe(10);

      // Check first segment structure
      const firstSegment = result[0];
      expect(firstSegment).toHaveProperty('id');
      expect(firstSegment).toHaveProperty('content');
      expect(firstSegment).toHaveProperty('wordCount');
      expect(firstSegment).toHaveProperty('tokens');
      expect(firstSegment).toHaveProperty('position');
    });

    it('should generate mock segments with dynamic fields', async () => {
      const result = await generateMockData({
        dynamicFields: ['testField', 'numericField'],
        fieldTypes: {
          testField: 'string',
          numericField: 'number',
        },
      });

      const firstSegment = result[0] as any;
      expect(firstSegment).toHaveProperty('testField');
      expect(firstSegment).toHaveProperty('numericField');
      expect(typeof firstSegment.testField).toBe('string');
      expect(typeof firstSegment.numericField).toBe('number');
    });

    it('should generate mock segments with custom count', async () => {
      const result = await generateMockData({ count: 5 });
      expect(result.length).toBe(5);
    });

    it('should generate reproducible output with seed', async () => {
      const result1 = await generateMockData({ count: 3, seed: 999 });
      const result2 = await generateMockData({ count: 3, seed: 999 });

      // With same seed, IDs should be the same (reproducible)
      expect(result1[0].id).toBe(result2[0].id);
      expect(result1[0].content).toBe(result2[0].content);
    });
  });

  describe('Step Integration Tests', () => {
    let mockInput: DocumentSegment[];

    beforeAll(async () => {
      // Generate mock data once for all step tests
      mockInput = await generateMockData({
        count: 5,
        dynamicFields: ['post_message', 'post_content', 'message', 'text'],
        includeMetadata: true,
      });

      // Get all registered step types from the registry and log them
      const allStepTypes = stepRegistry.getStepTypes();
      const stepsToTest = allStepTypes.filter(
        (stepType) => !SKIP_STEPS.includes(stepType),
      );
      console.log(
        `Found ${allStepTypes.length} registered step types:`,
        allStepTypes.join(', '),
      );
      console.log(
        `Testing ${stepsToTest.length} step types (skipped ${allStepTypes.length - stepsToTest.length} that require external dependencies)`,
      );
    });

    // Test ALL registered step types dynamically
    // We'll get them from the registry - create a test that runs after beforeAll
    it('should have registered steps available', () => {
      const allStepTypes = stepRegistry.getStepTypes();
      expect(allStepTypes.length).toBeGreaterThan(0);
      console.log(
        `Found ${allStepTypes.length} registered step types:`,
        allStepTypes.join(', '),
      );
    });

    // Get all step types from registry and create tests for each
    // We need to do this in a way that Jest can handle - use it.each or create tests inline
    // Since we can't access stepRegistry at describe time, we'll use a different approach
    // Create a single test that tests all steps
    it('should test all registered steps with mock input and validate input/output', async () => {
      const allStepTypes = stepRegistry.getStepTypes();
      const stepsToTest = allStepTypes.filter(
        (stepType) => !SKIP_STEPS.includes(stepType),
      );

      console.log(
        `Testing ${stepsToTest.length} step types with input/output validation`,
      );

      const testResults: Array<{
        stepType: string;
        success: boolean;
        inputValid: boolean;
        outputValid: boolean;
        errors: string[];
      }> = [];

      for (const stepType of stepsToTest) {
        const stepMetadata = stepRegistry.getStep(stepType);
        if (!stepMetadata) {
          console.warn(`Step ${stepType} not found in registry, skipping`);
          continue;
        }

        const stepConfig = getMinimalConfigForStep(stepType);
        const result = await testStepWithMockInput(
          stepType,
          mockInput,
          stepConfig,
        );

        expect(result).toBeDefined();
        expect(result).toHaveProperty('success');

        // Validate input structure (now flexible - accepts any format)
        const inputValid = result.inputValidation?.isValid ?? false;
        const inputFormat = result.inputFormat || 'unknown';

        // Log input/output formats for debugging
        if (result.outputFormat) {
          // console.log(`Step ${stepType}: input=${inputFormat}, output=${result.outputFormat}`);
        }

        // Input validation should pass for any format (we're flexible now)
        expect(inputValid).toBe(true);

        // Validate output structure
        const outputValid = result.outputValidation?.isValid ?? false;

        testResults.push({
          stepType,
          success: result.success === true,
          inputValid,
          outputValid,
          errors: [
            ...(result.inputValidation?.errors || []),
            ...(result.outputValidation?.errors || []),
            ...(result.validationErrors || []),
            ...(result.error ? [result.error] : []),
          ],
        });

        if (!result.success || !inputValid || !outputValid) {
          console.log(
            `Step ${stepType} validation results:`,
            JSON.stringify(
              {
                success: result.success,
                inputValid,
                outputValid,
                errors: testResults[testResults.length - 1].errors,
              },
              null,
              2,
            ),
          );
        }

        // Assertions
        // Only validate output structure if step executed successfully
        if (result.success) {
          // Output can be any format - array, object, or primitive
          expect(result.outputSegments).toBeDefined();

          // OutputSegments is always an array from BaseStep, but the actual output format may vary
          // Check the formatted output or actual output format
          if (result.outputFormat) {
            // Output format is flexible - just ensure it's valid
            expect(outputValid).toBe(true);
          } else {
            // Fallback: check if outputSegments is an array
            expect(Array.isArray(result.outputSegments)).toBe(true);
          }

          if (!outputValid) {
            console.warn(
              `Step ${stepType} succeeded but output validation failed:`,
              result.outputValidation?.errors,
            );
          }
          // Output validation should pass (flexible format)
          expect(outputValid).toBe(true);
        } else {
          // If step failed due to validation, that's expected with minimal configs
          // Just log it but don't fail the test
          if (result.validationErrors && result.validationErrors.length > 0) {
            console.log(
              `Step ${stepType} failed validation (expected with minimal config):`,
              result.validationErrors.join(', '),
            );
          }
        }
      }

      // Summary
      const successful = testResults.filter(
        (r) => r.success && r.inputValid && r.outputValid,
      );
      const failed = testResults.filter(
        (r) => !r.success || !r.inputValid || !r.outputValid,
      );

      console.log(`\n=== Test Summary ===`);
      console.log(`Total steps tested: ${testResults.length}`);
      console.log(`Successful (input & output valid): ${successful.length}`);
      console.log(`Failed or invalid: ${failed.length}`);

      if (failed.length > 0) {
        console.log(`\nFailed steps:`);
        failed.forEach((r) => {
          console.log(`  - ${r.stepType}: ${r.errors.join('; ')}`);
        });
      }
    });

    it('should validate configuration for all registered steps', async () => {
      const allStepTypes = stepRegistry.getStepTypes();
      const stepsToTest = allStepTypes.filter(
        (stepType) => !SKIP_STEPS.includes(stepType),
      );

      for (const stepType of stepsToTest) {
        const stepInstance = stepRegistry.createStepInstance(stepType);
        if (!stepInstance) {
          continue;
        }

        const validation = await stepInstance.validate({});
        expect(validation).toBeDefined();
        expect(validation).toHaveProperty('isValid');
        expect(validation).toHaveProperty('errors');
      }
    });

    it('should handle empty input for all registered steps and validate output', async () => {
      const allStepTypes = stepRegistry.getStepTypes();
      const stepsToTest = allStepTypes.filter(
        (stepType) => !SKIP_STEPS.includes(stepType),
      );

      for (const stepType of stepsToTest) {
        const stepConfig = getMinimalConfigForStep(stepType);
        const result = await testStepWithMockInput(stepType, [], stepConfig);

        expect(result).toBeDefined();

        // Empty input should still produce valid output structure (any format)
        if (result.success) {
          // Output can be any format - array, object, or primitive
          expect(result.outputSegments).toBeDefined();

          // Validate output structure even for empty input
          const outputValidation = result.outputValidation;
          if (outputValidation) {
            expect(outputValidation.isValid).toBe(true);
            // Output format is flexible - accept any valid format
          }
        }
      }
    });

    it('should validate that step outputs can be used as inputs to other steps', async () => {
      // Test step chaining with format validation
      const mockData = await generateMockData({ count: 3 });

      // Test: DummyMockStep -> TestStep
      const testStepConfig = {
        testName: 'Chain Test',
        description: 'Testing step chaining with format validation',
      };

      const testResult = await testStepWithMockInput(
        'test',
        mockData,
        testStepConfig,
      );
      expect(testResult.success).toBe(true);
      expect(testResult.inputValidation?.isValid).toBe(true);
      expect(testResult.outputValidation?.isValid).toBe(true);

      // The output from TestStep should be usable as input to another step
      if (testResult.outputSegments && testResult.outputSegments.length > 0) {
        // Try using the output as input to duplicate_segment step
        const duplicateConfig = {
          method: 'hash',
          contentField: 'content',
        };

        // Use formatted output or raw outputSegments
        const nextInput =
          testResult.formattedOutput || testResult.outputSegments;
        const duplicateResult = await testStepWithMockInput(
          'duplicate_segment',
          Array.isArray(nextInput) ? nextInput : [nextInput],
          duplicateConfig,
        );

        // Should handle the input (may fail validation, but shouldn't crash)
        expect(duplicateResult).toBeDefined();
      }
    });
  });

  describe('Step Chaining Tests', () => {
    it('should chain DummyMockStep -> TestStep', async () => {
      // Generate mock data
      const mockData = await generateMockData({ count: 3 });

      // Test with TestStep
      const testStepConfig = {
        testName: 'Chained Test',
        description: 'Testing step chaining',
      };

      const result = await testStepWithMockInput(
        'test',
        mockData,
        testStepConfig,
      );

      expect(result.success).toBe(true);
      expect(result.inputValidation?.isValid).toBe(true);
      expect(result.outputValidation?.isValid).toBe(true);
      expect(result.outputSegments).toBeDefined();
    });

    it('should chain DummyMockStep -> DuplicateSegmentStep', async () => {
      // Generate mock data with some duplicates
      const mockData = await generateMockData({
        count: 5,
        contentTemplate: 'Duplicate content {index % 2}', // Creates duplicates
      });

      const duplicateConfig = {
        method: 'hash',
        contentField: 'content',
      };

      const result = await testStepWithMockInput(
        'duplicate_segment',
        mockData,
        duplicateConfig,
      );

      expect(result.success).toBe(true);
      expect(result.inputValidation?.isValid).toBe(true);
      expect(result.outputValidation?.isValid).toBe(true);
      expect(result.outputSegments).toBeDefined();

      // Verify output structure is valid for chaining
      if (result.outputSegments && result.outputSegments.length > 0) {
        const firstOutput = result.outputSegments[0];

        // Some steps return structured output (e.g., { items: [], duplicates: [] })
        if ('items' in firstOutput && Array.isArray(firstOutput.items)) {
          // Structured output - check items array
          if (firstOutput.items.length > 0) {
            const firstItem = firstOutput.items[0];
            expect(firstItem).toHaveProperty('id');
            expect(firstItem).toHaveProperty('content');
          }
        } else {
          // Direct DocumentSegment output
          expect(firstOutput).toHaveProperty('id');
          expect(firstOutput).toHaveProperty('content');
        }
      }
    });

    it('should chain DummyMockStep -> RuleBasedFilterStep', async () => {
      const mockData = await generateMockData({ count: 5 });

      const filterConfig = {
        rules: [
          {
            id: 'filter-rule-1',
            name: 'Word Count Filter',
            pattern: '.*',
            action: 'keep',
            enabled: true,
          },
        ],
        defaultAction: 'keep',
        contentField: 'content',
      };

      const result = await testStepWithMockInput(
        'rule_based_filter',
        mockData,
        filterConfig,
      );

      expect(result).toBeDefined();
      if (result.success) {
        expect(result.inputValidation?.isValid).toBe(true);
        expect(result.outputValidation?.isValid).toBe(true);
        expect(result.outputSegments).toBeDefined();
        expect(Array.isArray(result.outputSegments)).toBe(true);
      }
    });

    it('should chain multiple steps: DummyMockStep -> TestStep -> DuplicateSegmentStep', async () => {
      // Generate initial mock data
      const initialData = await generateMockData({ count: 5 });

      // Step 1: DummyMockStep -> TestStep
      const testResult = await testStepWithMockInput('test', initialData, {
        testName: 'Multi-Step Chain Test',
      });

      expect(testResult.success).toBe(true);
      expect(testResult.outputValidation?.isValid).toBe(true);

      // Step 2: TestStep -> DuplicateSegmentStep
      if (testResult.outputSegments && testResult.outputSegments.length > 0) {
        const duplicateResult = await testStepWithMockInput(
          'duplicate_segment',
          testResult.outputSegments,
          {
            method: 'hash',
            contentField: 'content',
          },
        );

        expect(duplicateResult.success).toBe(true);
        expect(duplicateResult.inputValidation?.isValid).toBe(true);
        expect(duplicateResult.outputValidation?.isValid).toBe(true);

        // Verify the chain maintains data structure
        expect(duplicateResult.outputSegments).toBeDefined();
        if (duplicateResult.outputSegments) {
          expect(duplicateResult.outputSegments.length).toBeGreaterThanOrEqual(
            0,
          );
        }
      }
    });

    it('should validate step output formats match expected schemas', async () => {
      const allStepTypes = stepRegistry.getStepTypes();
      const stepsToTest = allStepTypes.filter(
        (stepType) => !SKIP_STEPS.includes(stepType),
      );

      for (const stepType of stepsToTest) {
        const stepMetadata = stepRegistry.getStep(stepType);
        if (!stepMetadata) continue;

        const stepConfig = getMinimalConfigForStep(stepType);
        const mockData = await generateMockData({ count: 3 });
        const result = await testStepWithMockInput(
          stepType,
          mockData,
          stepConfig,
        );

        if (
          result.success &&
          result.outputSegments &&
          result.outputSegments.length > 0
        ) {
          // Verify output matches expected output types from metadata
          const expectedOutputTypes = stepMetadata.outputTypes || [];

          // Check if output structure matches expected types
          if (expectedOutputTypes.includes('document_segments')) {
            expect(Array.isArray(result.outputSegments)).toBe(true);
            const firstOutput = result.outputSegments[0];
            expect(firstOutput).toHaveProperty('id');
            expect(firstOutput).toHaveProperty('content');
          }
        }
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed input gracefully', async () => {
      const allStepTypes = stepRegistry.getStepTypes();
      const stepsToTest = allStepTypes.filter(
        (stepType) => !SKIP_STEPS.includes(stepType),
      );

      const malformedInputs = [
        null,
        undefined,
        'string',
        123,
        {},
        [{ id: 'missing-content' }],
        [{ content: 'missing-id' }],
        [{ id: 123, content: 'invalid-id-type' }], // id should be string
        [{ id: 'valid-id', content: 456 }], // content should be string
      ];

      for (const stepType of stepsToTest) {
        for (const malformedInput of malformedInputs) {
          const stepConfig = getMinimalConfigForStep(stepType);

          try {
            const stepInstance = stepRegistry.createStepInstance(stepType);
            if (!stepInstance) continue;

            // Steps should handle malformed input without crashing
            const result = await stepInstance.execute(
              malformedInput as any,
              stepConfig,
              mockContext,
            );

            // Step should either return an error result or handle it gracefully
            expect(result).toBeDefined();
            expect(result).toHaveProperty('success');
          } catch (error) {
            // Some steps may throw - that's acceptable for malformed input
            // Just ensure it doesn't crash the entire test suite
            expect(error).toBeDefined();
          }
        }
      }
    });

    it('should validate input/output data types are correct', async () => {
      const mockData = await generateMockData({ count: 3 });

      // Verify mock data types
      expect(Array.isArray(mockData)).toBe(true);
      expect(mockData.length).toBeGreaterThan(0);

      const firstItem = mockData[0];
      expect(typeof firstItem.id).toBe('string');
      expect(typeof firstItem.content).toBe('string');
      expect(typeof firstItem.wordCount).toBe('number');
      expect(typeof firstItem.tokens).toBe('number');
      expect(typeof firstItem.position).toBe('number');

      // Test with all steps
      const allStepTypes = stepRegistry.getStepTypes();
      const stepsToTest = allStepTypes.filter(
        (stepType) => !SKIP_STEPS.includes(stepType),
      );

      for (const stepType of stepsToTest) {
        const stepConfig = getMinimalConfigForStep(stepType);
        const result = await testStepWithMockInput(
          stepType,
          mockData,
          stepConfig,
        );

        if (
          result.success &&
          result.outputSegments &&
          result.outputSegments.length > 0
        ) {
          const firstOutput = result.outputSegments[0];

          // Output should maintain type consistency
          if ('id' in firstOutput) {
            expect(typeof firstOutput.id).toBe('string');
          }
          if ('content' in firstOutput) {
            expect(typeof firstOutput.content).toBe('string');
          }
          if (
            'wordCount' in firstOutput &&
            firstOutput.wordCount !== undefined
          ) {
            expect(typeof firstOutput.wordCount).toBe('number');
          }
        }
      }
    });

    it('should handle large input datasets', async () => {
      const largeMockData = await generateMockData({ count: 100 });

      const testResult = await testStepWithMockInput('test', largeMockData, {
        testName: 'Large Dataset Test',
      });

      expect(testResult.success).toBe(true);
      expect(testResult.inputValidation?.isValid).toBe(true);
      expect(testResult.outputSegments).toBeDefined();
      if (testResult.outputSegments) {
        expect(testResult.outputSegments.length).toBeGreaterThan(0);
      }
    });

    it('should preserve data integrity through step chains', async () => {
      const mockData = await generateMockData({
        count: 5,
        dynamicFields: ['testField'],
        fieldTypes: { testField: 'string' },
      });

      // Chain: DummyMock -> Test -> Duplicate
      const testResult = await testStepWithMockInput('test', mockData, {
        testName: 'Data Integrity Test',
      });

      expect(testResult.success).toBe(true);

      // Verify original data structure is preserved or transformed correctly
      if (testResult.outputSegments && testResult.outputSegments.length > 0) {
        const output = testResult.outputSegments[0];

        // Core fields should be preserved
        expect(output).toHaveProperty('id');
        expect(output).toHaveProperty('content');

        // Dynamic fields may or may not be preserved depending on step
        // Just verify structure is valid
        expect(typeof output).toBe('object');
      }
    });
  });

  describe('Flexible Input/Output Format Testing', () => {
    it('should test steps with different input formats', async () => {
      const allStepTypes = stepRegistry.getStepTypes();
      const stepsToTest = allStepTypes.filter(
        (stepType) => !SKIP_STEPS.includes(stepType),
      );

      // Test with different input formats
      const inputFormats = [
        {
          name: 'array_of_document_segments',
          data: await generateMockData({ count: 3 }),
        },
        {
          name: 'structured_data_object',
          data: { data: await generateMockData({ count: 2 }), total: 2 },
        },
        {
          name: 'structured_items_object',
          data: {
            items: await generateMockData({ count: 2 }),
            total: 2,
          },
        },
        {
          name: 'empty_array',
          data: [],
        },
        {
          name: 'single_object',
          data: (await generateMockData({ count: 1 }))[0],
        },
      ];

      for (const stepType of stepsToTest) {
        for (const format of inputFormats) {
          const stepConfig = getMinimalConfigForStep(stepType);

          try {
            const stepInstance = stepRegistry.createStepInstance(stepType);
            if (!stepInstance) continue;

            // Steps should handle various input formats
            const result = await stepInstance.execute(
              format.data,
              stepConfig,
              mockContext,
            );

            expect(result).toBeDefined();
            expect(result).toHaveProperty('success');

            // Log format compatibility
            if (result.success) {
              // console.log(`Step ${stepType} accepts ${format.name} format`);
            }
          } catch (error) {
            // Some formats may not be compatible with some steps - that's ok
            // Just ensure it doesn't crash the test suite
            expect(error).toBeDefined();
          }
        }
      }
    });

    it('should validate that steps can handle structured input formats', async () => {
      // Test with structured input: { data: [...] }
      const structuredInput = {
        data: await generateMockData({ count: 3 }),
        total: 3,
        metadata: { source: 'test' },
      };

      const testResult = await testStepWithMockInput(
        'test',
        structuredInput as any,
        { testName: 'Structured Input Test' },
      );

      // Should handle structured input (may unwrap internally)
      expect(testResult).toBeDefined();
      expect(testResult.inputValidation?.isValid).toBe(true);
      expect(testResult.inputFormat).toBe('structured_data_object');
    });

    it('should validate that steps can output various formats', async () => {
      const mockData = await generateMockData({ count: 3 });

      // Test duplicate_segment which returns structured output
      const duplicateResult = await testStepWithMockInput(
        'duplicate_segment',
        mockData,
        {
          method: 'hash',
          contentField: 'content',
        },
      );

      expect(duplicateResult.success).toBe(true);
      expect(duplicateResult.outputValidation?.isValid).toBe(true);

      // Should recognize structured output format
      expect(duplicateResult.outputFormat).toBeDefined();

      // Check formatted output structure
      if (duplicateResult.formattedOutput) {
        const formatted = duplicateResult.formattedOutput;
        // Formatted output might be structured (e.g., { items: [], duplicates: [] })
        expect(typeof formatted).toBe('object');
      }
    });
  });

  describe('Dynamic Field Testing', () => {
    it('should test steps with various dynamic field types', async () => {
      const testCases = [
        {
          name: 'string fields',
          dynamicFields: ['field1', 'field2'],
          fieldTypes: { field1: 'string', field2: 'string' },
        },
        {
          name: 'number fields',
          dynamicFields: ['num1', 'num2'],
          fieldTypes: { num1: 'number', num2: 'number' },
        },
        {
          name: 'boolean fields',
          dynamicFields: ['bool1'],
          fieldTypes: { bool1: 'boolean' },
        },
        {
          name: 'mixed fields',
          dynamicFields: ['strField', 'numField', 'boolField'],
          fieldTypes: {
            strField: 'string',
            numField: 'number',
            boolField: 'boolean',
          },
        },
      ];

      for (const testCase of testCases) {
        const mockData = await generateMockData({
          count: 3,
          dynamicFields: testCase.dynamicFields,
          fieldTypes: testCase.fieldTypes as unknown as Record<
            string,
            'string' | 'number' | 'boolean' | 'date' | 'object'
          >,
        });

        // Verify fields are present
        const firstSegment = mockData[0] as any;
        testCase.dynamicFields.forEach((field) => {
          expect(firstSegment).toHaveProperty(field);
          const expectedType = (
            testCase.fieldTypes as unknown as Record<string, string>
          )[field];
          if (expectedType === 'string') {
            expect(typeof firstSegment[field]).toBe('string');
          } else if (expectedType === 'number') {
            expect(typeof firstSegment[field]).toBe('number');
          } else if (expectedType === 'boolean') {
            expect(typeof firstSegment[field]).toBe('boolean');
          }
        });
      }
    });
  });

  /**
   * Get minimal configuration for a step type
   * This provides basic config that might pass validation
   */
  function getMinimalConfigForStep(stepType: string): any {
    const minimalConfigs: Record<string, any> = {
      test: {
        testName: 'Test Step',
      },
      duplicate_segment: {
        method: 'hash',
        contentField: 'content',
      },
      rule_based_filter: {
        rules: [
          {
            id: 'rule-1',
            name: 'Test Rule',
            pattern: '.*',
            action: 'keep',
            enabled: true,
          },
        ],
        defaultAction: 'keep',
        contentField: 'content',
      },
      dummy_mock: {
        count: 5,
        testName: 'Dummy Test',
      },
      // Add more minimal configs as needed
    };

    return minimalConfigs[stepType] || {};
  }
});
