import { z } from 'zod';

export const physiqueAnalysisQuerySchema = z
  .object({
    weight_kg: z.coerce.number().min(30).max(500),
    sex: z.enum(['male', 'female']),
  })
  .strict();

export const aiPhysiqueAnalysisSchema = z
  .object({
    photo_suitable: z.boolean(),
    confidence: z.enum(['low', 'medium', 'high']),
    observations: z.array(z.string().trim().min(1).max(300)).max(5),
    recommendations: z.array(z.string().trim().min(1).max(300)).max(5),
    warnings: z.array(z.string().trim().min(1).max(300)).max(5),
  })
  .strict();

export type AiPhysiqueAnalysis = z.infer<typeof aiPhysiqueAnalysisSchema>;
