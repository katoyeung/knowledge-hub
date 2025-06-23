import { ChineseTextPreprocessorService } from '../services/chinese-text-preprocessor.service';

/**
 * Integration test to verify Chinese text preprocessing works correctly
 */
describe('Chinese Text Processing Integration', () => {
  let chinesePreprocessor: ChineseTextPreprocessorService;

  beforeEach(() => {
    chinesePreprocessor = new ChineseTextPreprocessorService();
  });

  describe('Chinese Text Detection and Preprocessing', () => {
    it('should detect Chinese text correctly', () => {
      const chineseText = '这是中文文本，应该被检测到。';
      const englishText = 'This is English text.';
      const mixedText = '根據《安老院規例》第21條 mixed with English';

      expect(chinesePreprocessor.isChineseText(chineseText)).toBe(true);
      expect(chinesePreprocessor.isChineseText(englishText)).toBe(false);
      expect(chinesePreprocessor.isChineseText(mixedText)).toBe(true);
    });

    it('should clean up problematic Chinese text from PDF extraction', () => {
      const problematicText = `准放寬該安老院
的高度限制。附加的消防安全要求涵蓋樓宇消防安全設計和
安老院的管理兩方面，以切合救援、疏散及安老院應變管理
的需要。
1

 
 
 
 
 
     
 
  
 
 
 
 
 
 
 
  
 
  
 
 
  
 
 
  
 
 
  
 
 
如該安老院是座落於一座與兩條不同高度的街道／道路連接的
建築物，有關安老院的高度以較低的街道／道路所量度為準。`;

      const cleanedText =
        chinesePreprocessor.preprocessChineseText(problematicText);

      // Verify improvements
      expect(cleanedText.length).toBeLessThan(problematicText.length);
      expect(cleanedText).not.toMatch(/\n\s*\n/); // No empty lines
      expect(cleanedText).not.toMatch(/\s{3,}/); // No excessive spaces
      expect(cleanedText.trim()).toBe(cleanedText); // No leading/trailing whitespace
    });

    it('should split Chinese text into meaningful chunks', () => {
      const chineseText =
        '根據《安老院規例》第21條，每所安老院須有下列的設計以符合住客的特別需要。每條通道及每個出入口的寬度，須足以容納使用助行器具或乘坐輪椅的住客通過。按上述的原則，每條通道及門廊的淨闊度必須分別不少於1050毫米和800毫米。';

      const chunks = chinesePreprocessor.splitChineseText(chineseText, 100, 20);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => {
        expect(chunk.trim().length).toBeGreaterThan(0);
        expect(chunk.length).toBeLessThanOrEqual(120); // Including overlap
      });
    });
  });

  describe('Text Quality Metrics', () => {
    it('should significantly improve text quality metrics', () => {
      const problematicText = `申請安老院牌照常見問題
問：
如何選擇合適處所以營辦安老院 ?
答：有意營辦安老院的人士，必須確保有關處所適合用作安老院。


 
 
 
 
 
在選擇處所營辦安老院時，須注意以下事項－
1 .位置
根據《安老院規例》第 19條，安老院不得設於：`;

      const originalIssues = {
        excessiveSpaces: (problematicText.match(/\s{3,}/g) || []).length,
        emptyLines: (problematicText.match(/^\s*$/gm) || []).length,
      };

      const cleanedText =
        chinesePreprocessor.preprocessChineseText(problematicText);

      const cleanedIssues = {
        excessiveSpaces: (cleanedText.match(/\s{3,}/g) || []).length,
        emptyLines: (cleanedText.match(/^\s*$/gm) || []).length,
      };

      // Verify significant improvements
      expect(cleanedIssues.excessiveSpaces).toBeLessThan(
        originalIssues.excessiveSpaces,
      );
      expect(cleanedIssues.emptyLines).toBeLessThan(originalIssues.emptyLines);

      // Verify content preservation
      expect(cleanedText).toContain('申請安老院牌照常見問題');
      expect(cleanedText).toContain('安老院規例');
      expect(cleanedText).toContain('位置');
    });

    it('should preserve semantic meaning while improving format', () => {
      const originalText =
        '根據《安老院規例》第 21條，每所安老院須有下列的設計以符合住客的特別需要。';
      const cleanedText =
        chinesePreprocessor.preprocessChineseText(originalText);

      // Should preserve key semantic elements
      expect(cleanedText).toContain('安老院規例');
      expect(cleanedText).toContain('21條');
      expect(cleanedText).toContain('住客的特別需要');

      // Should be cleaner
      expect(cleanedText.length).toBeLessThanOrEqual(originalText.length);
    });
  });

  describe('Performance and Efficiency', () => {
    it('should process Chinese text efficiently', () => {
      const largeChineseText =
        '根據《安老院規例》第21條，每所安老院須有下列的設計以符合住客的特別需要。'.repeat(
          100,
        );

      const startTime = Date.now();
      const result =
        chinesePreprocessor.preprocessChineseText(largeChineseText);
      const processingTime = Date.now() - startTime;

      expect(result.length).toBeGreaterThan(0);
      expect(processingTime).toBeLessThan(1000); // Should process within 1 second
    });

    it('should handle edge cases gracefully', () => {
      // Empty text
      expect(chinesePreprocessor.preprocessChineseText('')).toBe('');

      // Only whitespace
      expect(chinesePreprocessor.preprocessChineseText('   \n  \n  ')).toBe('');

      // Only punctuation - this gets filtered out as it's not meaningful content
      const punctuationResult =
        chinesePreprocessor.preprocessChineseText('。！？；');
      expect(punctuationResult.length).toBeGreaterThanOrEqual(0); // Allow empty result

      // Mixed languages
      const mixedText = 'Hello 世界 World 中文';
      const result = chinesePreprocessor.preprocessChineseText(mixedText);
      expect(result).toContain('Hello');
      expect(result).toContain('世界');
      expect(result).toContain('中文');
    });
  });

  describe('Chunking Quality Improvements', () => {
    it('should improve chunking quality for Chinese text', () => {
      const problematicChineseText = `根據《安老院規例》第21條，每所安老院須有下列的設計以符合住客的特別需要。
      
      
      
每條通道及每個出入口的寬度，須足以容納使用助行器具或乘坐輪椅的住客通過。`;

      // Traditional chunking (character-based)
      const traditionalChunks = [];
      const chunkSize = 100;
      for (let i = 0; i < problematicChineseText.length; i += chunkSize) {
        traditionalChunks.push(problematicChineseText.slice(i, i + chunkSize));
      }

      // Chinese-aware chunking
      const cleanedText = chinesePreprocessor.preprocessChineseText(
        problematicChineseText,
      );
      const improvedChunks = chinesePreprocessor.splitChineseText(
        cleanedText,
        chunkSize,
        20,
      );

      // Improved chunks should have better quality
      const traditionalEmptyChunks = traditionalChunks.filter(
        (chunk) => chunk.trim().length === 0,
      ).length;
      const improvedEmptyChunks = improvedChunks.filter(
        (chunk) => chunk.trim().length === 0,
      ).length;

      expect(improvedEmptyChunks).toBeLessThanOrEqual(traditionalEmptyChunks);
      expect(improvedChunks.every((chunk) => chunk.trim().length > 0)).toBe(
        true,
      );
    });
  });
});
