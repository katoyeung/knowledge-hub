import { streamText } from "ai";
import { NextRequest } from "next/server";

// Use Node.js runtime instead of Edge for better compatibility
// export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      datasetId,
      documentIds,
      segmentIds,
      maxChunks,
      temperature,
      conversationId,
      conversationTitle,
      includeConversationHistory,
      conversationHistoryLimit,
      messages,
    } = body;

    // Get auth token from headers
    const authToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!authToken) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Get the last user message from the messages array
    const userMessages = messages.filter(
      (m: { role: string }) => m.role === "user"
    );
    const lastUserMessage = userMessages[userMessages.length - 1];

    if (!lastUserMessage) {
      return new Response("No user message found", { status: 400 });
    }

    // Call the backend streaming endpoint
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const response = await fetch(`${backendUrl}/chat/with-documents/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        message: lastUserMessage.content,
        datasetId,
        documentIds: documentIds || [],
        segmentIds: segmentIds || [],
        maxChunks: maxChunks || 5,
        temperature: temperature || 0.7,
        conversationId,
        conversationTitle,
        includeConversationHistory: includeConversationHistory !== false,
        conversationHistoryLimit: conversationHistoryLimit || 10,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: errorText || "Backend request failed" }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const reader = response.body?.getReader();

    if (!reader) {
      return new Response("No response body", { status: 500 });
    }

    // Use streamText with a custom model that reads from the backend stream
    const result = streamText({
      model: {
        provider: "custom",
        doStream: async () => {
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();
          let buffer = "";

          const stream = new ReadableStream({
            async start(controller) {
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n");
                  buffer = lines.pop() || "";

                  for (const line of lines) {
                    if (line.startsWith("data: ")) {
                      try {
                        const eventData = JSON.parse(line.slice(6));

                        if (eventData.type === "token" && eventData.content) {
                          controller.enqueue(encoder.encode(eventData.content));
                        } else if (eventData.type === "error") {
                          controller.error(
                            new Error(eventData.error || "Unknown error")
                          );
                          return;
                        }
                      } catch {
                        continue;
                      }
                    }
                  }
                }
                controller.close();
              } catch (error) {
                controller.error(error);
              }
            },
          });

          return {
            stream,
            rawCall: {
              rawPrompt: null,
              rawSettings: {},
            },
          };
        },
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
