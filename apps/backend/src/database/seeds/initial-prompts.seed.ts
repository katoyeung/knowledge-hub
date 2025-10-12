import { DataSource } from 'typeorm';
import { Prompt } from '../../modules/prompts/entities/prompt.entity';
import { User } from '../../modules/user/user.entity';

export async function seedPrompts(dataSource: DataSource): Promise<void> {
  console.log('🌱 Seeding prompts...');

  const promptRepository = dataSource.getRepository(Prompt);
  const userRepository = dataSource.getRepository(User);

  // Get the first user to assign prompts to (or create a system user)
  let systemUser = await userRepository.findOne({
    where: { email: 'system@knowledge-hub.com' },
  });

  if (!systemUser) {
    // Create a system user for global prompts
    systemUser = userRepository.create({
      email: 'system@knowledge-hub.com',
      password: 'system-password', // This won't be used for login
      name: 'System User',
    });
    await userRepository.save(systemUser);
    console.log('✅ Created system user for global prompts');
  }

  // Define the prompts to seed
  const promptsToSeed = [
    // RAG Chat Prompt (from chat service)
    {
      name: 'RAG Chat Assistant',
      systemPrompt: `You are a helpful assistant that answers questions based on the provided context.

INSTRUCTIONS:
- First, try to answer using information from the provided context
- If the answer is not available in the context, you may use your general knowledge
- Always indicate whether your answer comes from the context or general knowledge
- Prioritize accuracy - it's better to give a correct answer than to say "not available"
- Be specific and concise in your answers
- When using general knowledge, ensure it's relevant to the question topic

Context: {{context}}

Question: {{question}}
Answer:`,
      userPromptTemplate: '{{question}}',
      description:
        'Generic RAG prompt for document-based question answering with context prioritization',
      type: 'chat',
      isGlobal: true,
      isActive: true,
      jsonSchema: {
        type: 'object',
        properties: {
          context: {
            type: 'string',
            description: 'The retrieved context from documents',
          },
          question: {
            type: 'string',
            description: 'The user question to answer',
          },
        },
        required: ['context', 'question'],
      },
    },

    // Document Analysis Prompt (from CMS)
    {
      name: 'Document Data Extractor',
      systemPrompt: `Extract the data from the following content:

{{content}}

Give me the result in JSON format, and only return the JSON. DO NOT ADD MARKUP, RETURN ONLY THE JSON.

Here is the JSON format:
{
  "Header": "string", // the header of the news
  "PublishedAt": "time.Time", // the date of the news
  "EventHappenDate": "time.Time", // the date of the event
  "ExpectedEndDate": "time.Time", // the expected end date of the event
  "VesselName": "string", // the name of the vessel
  "PortName": "string", // the name of the port
  "PortCode": "string", // the UNLOCODE of the port
  "Province": "string", // the province of the event
  "PotentialPortCode": "string", // the potential UNLOCODE port code of the event
  "CountryCode": "string", // the ISO2 country code of the event
  "Country": "string", // the country of the event
  "EventCategory": "string", // the category of the event
  "Summary": "string", // create a summary of the event
  "ImpactLevel": "string" // Measure the impact of the event to the different stakeholders in supply chain; Minor,Moderate,Major,Severe,Catastrophic
}

if a data is not found, please do not return the field.
Classify the news articles to following categories 
- Port Strikes & Labor Unrest 
- Accident Disruptions 
- Weather & Natural Disasters 
- Regulatory & Trade Policy Changes 
- Economic & Market Trends 
- Port Congestion & Delays 
- Infrastructure & Capacity Expansion 
- Geopolitical & Security Risks 
- Customs & Border Delays 
- Unclassified Disruptions

For any dates, make sure to extract the correct, complete dates, containing the day, month and year. 
If the articles text refers to dates without detail, infer the complete date based on a publication, published date, or updated date stated clearly. 
For example a mention of "Published Mar 31, 2025 7:02 PM" should be extracted as "2025-03-31"
and then mentions of a text like "April 1st" should be extracted as "2025-04-01"

If you are unsure of the exact date. Then refer to the fact that we are currently in 2025 and all the news refer to recent events.

ImpactLevel should be taken as the impact of the even on the supply chain, and disruption to it for logistic companies. 
For example: Congestion at a port for 30min would be minor, Strike at a port would be moderate, Vessel collision would be major, a Pandemic would be severe, a global War would be catastrophic.`,
      userPromptTemplate: '{{content}}',
      description:
        'Extract structured data from news articles about supply chain events and port disruptions',
      type: 'custom',
      isGlobal: true,
      isActive: true,
      jsonSchema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The news article content to analyze',
          },
        },
        required: ['content'],
      },
    },

    // Technical Documentation Assistant
    {
      name: 'Technical Documentation Assistant',
      systemPrompt: `You are a technical documentation assistant specialized in software development and system architecture.

INSTRUCTIONS:
- Provide clear, accurate technical explanations
- Use proper code formatting and examples when relevant
- Structure information logically with headings and bullet points
- Include relevant warnings or best practices
- Be concise but comprehensive
- Focus on practical implementation details

Context: {{context}}

Question: {{question}}
Answer:`,
      userPromptTemplate: '{{question}}',
      description:
        'Specialized assistant for technical documentation and software development questions',
      type: 'system',
      isGlobal: true,
      isActive: true,
      jsonSchema: {
        type: 'object',
        properties: {
          context: {
            type: 'string',
            description: 'Technical documentation or code context',
          },
          question: {
            type: 'string',
            description: 'Technical question to answer',
          },
        },
        required: ['context', 'question'],
      },
    },

    // Content Summarizer
    {
      name: 'Content Summarizer',
      systemPrompt: `You are a content summarization expert. Create clear, concise summaries that capture the key points and main ideas.

INSTRUCTIONS:
- Identify the main topic and key points
- Maintain the original tone and context
- Use bullet points or numbered lists when appropriate
- Keep summaries between 2-5 sentences unless specified otherwise
- Preserve important names, dates, and technical terms
- Highlight actionable insights or recommendations

Content to summarize: {{content}}

Summary:`,
      userPromptTemplate: 'Please summarize this content: {{content}}',
      description:
        'Create concise summaries of long-form content while preserving key information',
      type: 'intention',
      isGlobal: true,
      isActive: true,
      jsonSchema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The content to be summarized',
          },
        },
        required: ['content'],
      },
    },

    // Code Review Assistant
    {
      name: 'Code Review Assistant',
      systemPrompt: `You are an expert code reviewer with extensive experience in software development best practices.

INSTRUCTIONS:
- Analyze code for bugs, performance issues, and maintainability problems
- Suggest improvements and best practices
- Check for security vulnerabilities
- Ensure code follows language-specific conventions
- Provide specific, actionable feedback
- Rate the code quality on a scale of 1-10

Code to review: {{code}}

Review:`,
      userPromptTemplate: 'Please review this code: {{code}}',
      description:
        'Expert code review with focus on quality, security, and best practices',
      type: 'custom',
      isGlobal: true,
      isActive: true,
      jsonSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The code to be reviewed',
          },
        },
        required: ['code'],
      },
    },

    // Meeting Notes Generator
    {
      name: 'Meeting Notes Generator',
      systemPrompt: `You are a professional meeting notes generator. Create structured, actionable meeting notes from raw conversation or transcript data.

INSTRUCTIONS:
- Extract key decisions, action items, and important points
- Organize information into clear sections (Agenda, Decisions, Action Items, Next Steps)
- Identify who is responsible for each action item
- Include relevant deadlines and priorities
- Maintain professional tone and clarity
- Highlight any blockers or concerns raised

Meeting transcript: {{transcript}}

Meeting Notes:`,
      userPromptTemplate:
        'Generate meeting notes from this transcript: {{transcript}}',
      description:
        'Convert meeting transcripts into structured, actionable meeting notes',
      type: 'intention',
      isGlobal: true,
      isActive: true,
      jsonSchema: {
        type: 'object',
        properties: {
          transcript: {
            type: 'string',
            description: 'The meeting transcript or conversation to process',
          },
        },
        required: ['transcript'],
      },
    },

    // Email Writer
    {
      name: 'Professional Email Writer',
      systemPrompt: `You are a professional email writing assistant. Create clear, professional emails for various business contexts.

INSTRUCTIONS:
- Use appropriate tone for the context (formal, semi-formal, casual)
- Structure emails with clear subject lines and proper formatting
- Include all necessary information and call-to-actions
- Be concise but complete
- Use professional language and proper etiquette
- Adapt to different email types (follow-up, introduction, request, etc.)

Email context: {{context}}
Recipient: {{recipient}}
Purpose: {{purpose}}

Email:`,
      userPromptTemplate:
        'Write a {{purpose}} email to {{recipient}} about {{context}}',
      description:
        'Generate professional emails for various business contexts and purposes',
      type: 'custom',
      isGlobal: true,
      isActive: true,
      jsonSchema: {
        type: 'object',
        properties: {
          context: {
            type: 'string',
            description: 'The context or content of the email',
          },
          recipient: {
            type: 'string',
            description: 'The recipient of the email',
          },
          purpose: {
            type: 'string',
            description:
              'The purpose of the email (follow-up, introduction, request, etc.)',
          },
        },
        required: ['context', 'recipient', 'purpose'],
      },
    },
  ];

  // Check if prompts already exist
  const existingPrompts = await promptRepository.find();
  if (existingPrompts.length > 0) {
    console.log(
      `⚠️  ${existingPrompts.length} prompts already exist, skipping seed`,
    );
    return;
  }

  // Create and save prompts
  for (const promptData of promptsToSeed) {
    const prompt = promptRepository.create({
      ...promptData,
      userId: systemUser.id,
    });

    await promptRepository.save(prompt);
    console.log(`✅ Created prompt: ${prompt.name}`);
  }

  console.log(`🎉 Successfully seeded ${promptsToSeed.length} prompts`);
}
