import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EntityProcessingPolicy } from '../interfaces/entity-processing-policy.interface';
import { PostProcessingPolicy } from '../policies/post-processing-policy';
import { SegmentProcessingPolicy } from '../policies/segment-processing-policy';

/**
 * Factory to get appropriate processing policy based on entity type
 * Similar to StepFactory in pipeline module
 */
@Injectable()
export class ProcessingPolicyFactory {
  private readonly logger = new Logger(ProcessingPolicyFactory.name);
  private readonly policies: Map<string, EntityProcessingPolicy> = new Map();

  constructor(
    private readonly postProcessingPolicy: PostProcessingPolicy,
    private readonly segmentProcessingPolicy: SegmentProcessingPolicy,
  ) {
    // Register policies
    this.registerPolicy(postProcessingPolicy);
    this.registerPolicy(segmentProcessingPolicy);
  }

  /**
   * Register a processing policy
   */
  registerPolicy(policy: EntityProcessingPolicy): void {
    const entityType = policy.getEntityType();
    this.policies.set(entityType, policy);
    this.logger.log(
      `Registered processing policy for entity type: ${entityType}`,
    );
  }

  /**
   * Get processing policy for entity type
   */
  getPolicy(entityType: string): EntityProcessingPolicy {
    const policy = this.policies.get(entityType);

    if (!policy) {
      const availableTypes = Array.from(this.policies.keys()).join(', ');
      throw new NotFoundException(
        `No processing policy found for entity type: ${entityType}. Available types: ${availableTypes}`,
      );
    }

    return policy;
  }

  /**
   * Get all registered entity types
   */
  getRegisteredEntityTypes(): string[] {
    return Array.from(this.policies.keys());
  }
}
