import { Test, TestingModule } from '@nestjs/testing';
import { PostContentExtractionStrategy } from './post-content-extraction-strategy';
import { Post } from '../../../../posts/entities/post.entity';
import { PostStatus } from '../../../../posts/enums/post-status.enum';

describe('PostContentExtractionStrategy', () => {
  let strategy: PostContentExtractionStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PostContentExtractionStrategy],
    }).compile();

    strategy = module.get<PostContentExtractionStrategy>(
      PostContentExtractionStrategy,
    );
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('should return correct entity type', () => {
    expect(strategy.getEntityType()).toBe('post');
  });

  describe('extractContent', () => {
    it('should extract content from post with all fields', () => {
      const post: Partial<Post> = {
        id: 'post-1',
        title: 'Test Post Title',
        source: 'facebook',
        provider: 'google api',
        postedAt: new Date('2024-01-01'),
        meta: {
          content: 'This is the post content',
          author: 'John Doe',
        },
      };

      const content = strategy.extractContent(post as Post);

      expect(content).toContain('Title: Test Post Title');
      expect(content).toContain('Content: This is the post content');
      expect(content).toContain('Source: facebook');
      expect(content).toContain('Provider: google api');
      expect(content).toContain('Posted At:');
    });

    it('should extract content from post with minimal fields', () => {
      const post: Partial<Post> = {
        id: 'post-2',
        title: 'Minimal Post',
      };

      const content = strategy.extractContent(post as Post);

      expect(content).toContain('Title: Minimal Post');
    });

    it('should include additional meta fields', () => {
      const post: Partial<Post> = {
        id: 'post-3',
        title: 'Post with Meta',
        meta: {
          content: 'Main content',
          customField: 'custom value',
          anotherField: 123,
        },
      };

      const content = strategy.extractContent(post as Post);

      expect(content).toContain('Title: Post with Meta');
      expect(content).toContain('Content: Main content');
      expect(content).toContain('customField');
      expect(content).toContain('anotherField');
    });
  });

  describe('getEntityId', () => {
    it('should return post id', () => {
      const post: Partial<Post> = {
        id: 'post-123',
      };

      expect(strategy.getEntityId(post as Post)).toBe('post-123');
    });
  });

  describe('extractTemplateVariables', () => {
    it('should extract all template variables', () => {
      const post: Partial<Post> = {
        id: 'post-1',
        title: 'Test Post',
        source: 'twitter',
        provider: 'lenx api',
        postedAt: new Date('2024-01-01T12:00:00Z'),
        meta: {
          content: 'Post content',
          author: 'Jane Doe',
          platform: 'Twitter',
          engagement: '1000',
        },
      };

      const variables = strategy.extractTemplateVariables(post as Post);

      expect(variables.title).toBe('Test Post');
      expect(variables.source).toBe('twitter');
      expect(variables.provider).toBe('lenx api');
      expect(variables.postedAt).toBeDefined();
      expect(variables.date).toBeDefined();
      expect(variables.content).toBe('Post content');
      expect(variables.author).toBe('Jane Doe');
      expect(variables.platform).toBe('Twitter');
      expect(variables.engagement).toBe('1000');
    });

    it('should handle missing fields gracefully', () => {
      const post: Partial<Post> = {
        id: 'post-2',
        title: 'Minimal Post',
      };

      const variables = strategy.extractTemplateVariables(post as Post);

      expect(variables.title).toBe('Minimal Post');
      expect(variables.source).toBeUndefined();
      expect(variables.provider).toBeUndefined();
    });
  });
});
