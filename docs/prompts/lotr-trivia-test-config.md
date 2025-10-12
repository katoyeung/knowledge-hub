# Lord of the Rings Trivia Test Configuration

## Overview

This document contains the optimal configuration for the Lord of the Rings trivia performance test, which achieved 100% accuracy with excellent response times.

## Test Configuration

### Model Settings

- **LLM Provider**: DashScope
- **Model**: Qwen Flash (`qwen-flash`)
- **Temperature**: 0.1 (for deterministic responses)
- **Max Tokens**: 8192
- **Context Window**: 128000

### Embedding Settings

- **Embedding Model**: Xenova/bge-m3
- **Embedding Provider**: local
- **Text Splitter**: recursive_character
- **Chunk Size**: 1000
- **Chunk Overlap**: 200

### Retrieval Settings

- **Max Chunks**: 5
- **Similarity Threshold**: 30%
- **Average Chunks Used**: 4.5

## Test Results

### Performance Metrics

- **Accuracy**: 10/10 (100%)
- **Average Response Time**: 4.2 seconds
- **Total Chunks Analyzed**: 45
- **High Quality Chunks (>70%)**: 25/45 (55.6%)
- **Average Similarity Score**: 70%

### Test Questions

1. Which wizard lived in Orthanc? → Saruman ✅
2. What was the name of the inn in the village of Bree? → The Prancing Pony ✅
3. What was Gandalf's sword's name? → Glamdring ✅
4. Who married Aragorn? → Arwen ✅
5. Which type of blade was Frodo stabbed with? → Morgul-knife ✅
6. What food does Gollum like? → Raw fish and rabbits ✅
7. What was Gollum's real name? → Sméagol ✅
8. What did Frodo see on the ring after Gandalf threw it into the fire? → Fiery letters in the language of Mordor ✅
9. What was the full name of Pippin? → Peregrin Took ✅
10. Which eagle rescued Gandalf from the tower of Isengard? → Gwaihir ✅

## Configuration Comparison

| Model          | Provider      | Accuracy | Response Time | Speed         |
| -------------- | ------------- | -------- | ------------- | ------------- |
| **Qwen Flash** | **DashScope** | **100%** | **4.2s**      | **Fastest**   |
| Qwen3 30B A3B  | OpenRouter    | 100%     | 12.7s         | 3x slower     |
| Gemma 2 9B     | OpenRouter    | 70%      | 4.6s          | Similar speed |

## Key Insights

### Optimal Settings

- **5 chunks** provides the perfect balance of context and performance
- **Qwen Flash** delivers perfect accuracy with ultra-fast response times
- **DashScope API** provides reliable and consistent performance
- **BGE-M3 embeddings** work excellently with the local provider

### Chunk Analysis

- **High similarity chunks (>70%)**: 55.6% - excellent retrieval quality
- **Medium similarity chunks (50-70%)**: 44.4% - good supporting context
- **Low similarity chunks (<50%)**: 0% - no noise in retrieval
- **Average relevant chunks**: 4.5 out of 5 - efficient utilization

### Performance Characteristics

- **Consistent accuracy** across all question types
- **Fast inference** without sacrificing quality
- **Efficient resource usage** with optimal chunk count
- **Reliable reasoning** for complex trivia questions

## Recommendations

### For Production Use

1. **Use Qwen Flash with DashScope provider** for best speed/accuracy balance
2. **Set maxChunks to 5** for optimal performance
3. **Use temperature 0.1** for deterministic responses
4. **Maintain BGE-M3 embeddings** with local provider
5. **Keep recursive_character splitter** with 1000 chunk size, 200 overlap

### For Different Use Cases

- **Higher accuracy needs**: Consider Qwen3 30B A3B (100% accuracy, slower)
- **Faster responses needed**: Qwen Flash is already optimal
- **Cost optimization**: Qwen Flash provides best value
- **Different domains**: Test with domain-specific questions using same config

## Test Code Location

- **File**: `apps/backend/test/simple-chat-e2e.e2e-spec.ts`
- **Test Name**: "Simple Chat E2E Tests"
- **Configuration**: 20 chunks, 30% similarity threshold, recursive_character splitter, Qwen Flash LLM

## Prompt Engineering

### Current Prompt Strategy

The system uses a hybrid RAG prompt that:

- **Prioritizes context-based answers** from provided chunks
- **Falls back to general knowledge** when context is insufficient
- **Maintains high accuracy** (100% in testing)
- **Provides transparency** about information sources
- **Works generically** for any domain or topic

### Generic RAG Prompt Template

```
You are a helpful assistant that answers questions based on the provided context.

INSTRUCTIONS:
- First, try to answer using information from the provided context
- If the answer is not available in the context, you may use your general knowledge
- Always indicate whether your answer comes from the context or general knowledge
- Prioritize accuracy - it's better to give a correct answer than to say "not available"
- Be specific and concise in your answers
- When using general knowledge, ensure it's relevant to the question topic

Context: [retrieved chunks]

Question: [user question]
Answer:
```

## Last Updated

- **Date**: $(date)
- **Test Status**: ✅ PASSED
- **Configuration**: Optimized for production use
- **Prompt**: Generic hybrid RAG with context-first approach
