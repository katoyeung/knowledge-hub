import { Test, TestingModule } from '@nestjs/testing';
import { SimplePdfParserService } from './simple-pdf-parser.service';
import * as fs from 'fs';

// Mock for pdf-parse
jest.mock('pdf-parse', () => {
  return jest.fn().mockImplementation((buffer: Buffer) => {
    return Promise.resolve({
      text: 'Sample PDF content for testing.\n\nThis is a simple PDF document that contains basic text content.',
      numpages: 1,
      info: {
        Title: 'Test Document',
        Author: 'Test Author',
        Creator: 'Test Creator',
        CreationDate: new Date('2024-01-01'),
        ModDate: new Date('2024-01-15'),
      },
    });
  });
});

// Mock fs
jest.mock('fs');

describe('SimplePdfParserService', () => {
  let service: SimplePdfParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SimplePdfParserService],
    }).compile();

    service = module.get<SimplePdfParserService>(SimplePdfParserService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractTextFromPdf', () => {
    const mockFilePath = '/test/sample.pdf';
    const mockFileStats = { size: 1024 * 10 }; // 10KB

    beforeEach(() => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue(mockFileStats);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        Buffer.from('mock pdf data'),
      );
    });

    it('should successfully extract text from PDF file', async () => {
      const result = await service.extractTextFromPdf(mockFilePath);

      expect(result.success).toBe(true);
      expect(result.content).toContain('Sample PDF content for testing');
      expect(result.metadata.totalPages).toBe(1);
      expect(result.metadata.totalWords).toBeGreaterThan(0);
      expect(result.metadata.totalCharacters).toBeGreaterThan(0);
      expect(result.metadata.fileSize).toBe(mockFileStats.size);
      expect(result.metadata.title).toBe('Test Document');
      expect(result.metadata.author).toBe('Test Author');
      expect(result.metadata.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle file not found error', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = await service.extractTextFromPdf('/nonexistent/file.pdf');

      expect(result.success).toBe(false);
      expect(result.content).toBe('');
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('File not found');
    });

    it('should handle PDF parsing errors', async () => {
      const pdfParse = require('pdf-parse');
      pdfParse.mockImplementationOnce(() => {
        throw new Error('Invalid PDF format');
      });

      const result = await service.extractTextFromPdf(mockFilePath);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Invalid PDF format');
    });

    it('should calculate word count correctly', async () => {
      const result = await service.extractTextFromPdf(mockFilePath);

      expect(result.success).toBe(true);
      expect(result.metadata.totalWords).toBe(16); // Based on the mock content
    });
  });

  describe('extractTextFromBuffer', () => {
    const mockBuffer = Buffer.from('mock pdf data');

    it('should successfully extract text from PDF buffer', async () => {
      const result = await service.extractTextFromBuffer(mockBuffer);

      expect(result.success).toBe(true);
      expect(result.content).toContain('Sample PDF content for testing');
      expect(result.metadata.totalPages).toBe(1);
      expect(result.metadata.totalWords).toBeGreaterThan(0);
      expect(result.metadata.fileSize).toBe(mockBuffer.length);
      expect(result.metadata.title).toBe('Test Document');
      expect(result.metadata.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle PDF parsing errors from buffer', async () => {
      const pdfParse = require('pdf-parse');
      pdfParse.mockImplementationOnce(() => {
        throw new Error('Corrupted PDF buffer');
      });

      const result = await service.extractTextFromBuffer(mockBuffer);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Corrupted PDF buffer');
    });
  });

  describe('word counting', () => {
    it('should handle empty content', async () => {
      const pdfParse = require('pdf-parse');
      pdfParse.mockImplementationOnce(() =>
        Promise.resolve({
          text: '',
          numpages: 1,
          info: {},
        }),
      );

      const result = await service.extractTextFromBuffer(Buffer.from('test'));

      expect(result.success).toBe(true);
      expect(result.content).toBe('');
      expect(result.metadata.totalWords).toBe(0);
      expect(result.metadata.totalCharacters).toBe(0);
    });

    it('should handle whitespace-only content', async () => {
      const pdfParse = require('pdf-parse');
      pdfParse.mockImplementationOnce(() =>
        Promise.resolve({
          text: '   \n\n  \t  ',
          numpages: 1,
          info: {},
        }),
      );

      const result = await service.extractTextFromBuffer(Buffer.from('test'));

      expect(result.success).toBe(true);
      expect(result.metadata.totalWords).toBe(0);
    });
  });

  describe('metadata extraction', () => {
    it('should handle missing PDF metadata gracefully', async () => {
      const pdfParse = require('pdf-parse');
      pdfParse.mockImplementationOnce(() =>
        Promise.resolve({
          text: 'Some content',
          numpages: 2,
          info: null,
        }),
      );

      const result = await service.extractTextFromBuffer(Buffer.from('test'));

      expect(result.success).toBe(true);
      expect(result.metadata.totalPages).toBe(2);
      expect(result.metadata.title).toBeUndefined();
      expect(result.metadata.author).toBeUndefined();
      expect(result.metadata.creator).toBeUndefined();
    });
  });
});
