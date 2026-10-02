import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  classificationSchema,
  IMMUTABLE_RULES,
  type Classification,
} from "./contracts";
import type { CompanyProfile, KnowledgeEntry } from "./knowledge";

async function structured(input: unknown): Promise<Classification> {
  // Lazy config ensures missing Gemini credentials never affect purchases or unrelated pages.
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim();
  if (
    !apiKey ||
    !model ||
    !/^gemini-[a-z0-9.-]+$/.test(model) ||
    /preview|experimental/.test(model)
  )
    throw new Error("gemini_configuration_missing");
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: JSON.stringify(input),
    config: {
      systemInstruction: IMMUTABLE_RULES,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(classificationSchema),
      temperature: 0,
      maxOutputTokens: 2048,
      httpOptions: { timeout: 25000 },
    },
  });
  return classificationSchema.parse(JSON.parse(response.text || "null"));
}
export async function classifyEnquiry(
  message: string,
  profile: CompanyProfile,
  context: unknown,
): Promise<Classification> {
  return structured({
    stage: "classify",
    message,
    companyProfile: profile,
    recentBusinessContext: context,
    availableKnowledge: [],
  });
}
export async function selectApprovedAction(
  message: string,
  profile: CompanyProfile,
  classification: Classification,
  entries: KnowledgeEntry[],
) {
  // Equivalent controlled action planner. No built-in search, browsing, code execution or arbitrary functions.
  return structured({
    stage: "select_action",
    message,
    companyProfile: profile,
    priorClassification: classification,
    availableKnowledge: entries.map(
      ({ _id, title, businessUnit, topic, approvedAnswer }) => ({
        _id,
        title,
        businessUnit,
        topic,
        approvedAnswer,
      }),
    ),
  });
}
