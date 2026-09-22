import type { Env } from '../config/env.js';
import type { NutritionAnalysisInput } from '../schemas/nutrition-analysis.js';

export interface NutritionAnalysisResult {
  bmr: number;
  tdee: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  weekly_weight_change_kg: number;
  explanation: string;
  tips: string[];
  ai_generated: boolean;
}

const activityFactors: Record<NutritionAnalysisInput['activity_level'], number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
};

const goalAdjustments: Record<NutritionAnalysisInput['goal'], number> = {
  lose_fat: -0.15,
  build_muscle: 0.08,
  maintain: 0,
};

export function calculateNutritionTargets(
  input: NutritionAnalysisInput,
): NutritionAnalysisResult {
  const sexOffset = input.sex === 'male' ? 5 : -161;
  const bmr = Math.round(
    10 * input.weight_kg + 6.25 * input.height_cm - 5 * input.age + sexOffset,
  );
  const tdee = Math.round(bmr * activityFactors[input.activity_level]);
  const minimumCalories = input.sex === 'male' ? 1500 : 1200;
  const calories = Math.max(
    minimumCalories,
    Math.round((tdee * (1 + goalAdjustments[input.goal])) / 10) * 10,
  );
  const proteinPerKg = input.goal === 'maintain' ? 1.6 : 2;
  const protein_g = Math.round(input.weight_kg * proteinPerKg);
  const fat_g = Math.round(input.weight_kg * 0.8);
  const carbs_g = Math.max(
    0,
    Math.round((calories - protein_g * 4 - fat_g * 9) / 4),
  );
  const weeklyWeightChangeKg =
    Math.round((((calories - tdee) * 7) / 7_700) * 100) / 100;
  const goalText = {
    lose_fat: 'ลดไขมันโดยรักษามวลกล้ามเนื้อ',
    build_muscle: 'เพิ่มกล้ามเนื้อโดยควบคุมการเพิ่มไขมัน',
    maintain: 'รักษาน้ำหนักและองค์ประกอบร่างกาย',
  }[input.goal];

  return {
    bmr,
    tdee,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    weekly_weight_change_kg: weeklyWeightChangeKg,
    explanation: `เป้าหมายนี้ออกแบบเพื่อ${goalText} โดยเริ่มจากพลังงานที่ร่างกายใช้ประมาณ ${tdee} kcal ต่อวัน`,
    tips: [
      'ติดตามน้ำหนักเฉลี่ย 7 วัน แทนการดูน้ำหนักเพียงวันเดียว',
      'ทำตามเป้าหมายอย่างน้อย 14 วันก่อนพิจารณาปรับแคลอรี',
      'ตัวเลขนี้เป็นค่าประมาณ ไม่ใช่คำแนะนำทางการแพทย์',
    ],
    ai_generated: false,
  };
}

interface GeminiEnvelope {
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
}

export interface NutritionAnalysisService {
  analyze(input: NutritionAnalysisInput): Promise<NutritionAnalysisResult>;
}

export function createNutritionAnalysisService(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): NutritionAnalysisService {
  return {
    async analyze(input) {
      const result = calculateNutritionTargets(input);
      if (!env.GEMINI_API_KEY) return result;

      try {
        const model = encodeURIComponent(env.GEMINI_MODEL);
        const response = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'x-goog-api-key': env.GEMINI_API_KEY,
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
            body: JSON.stringify({
              contents: [{
                role: 'user',
                parts: [{ text: `อธิบายผลโภชนาการนี้เป็นภาษาไทยอย่างกระชับ ห้ามแก้ตัวเลขและห้ามวินิจฉัยโรค: ${JSON.stringify({ input, targets: result })}` }],
              }],
              generationConfig: {
                responseMimeType: 'application/json',
                responseJsonSchema: {
                  type: 'object',
                  properties: {
                    explanation: { type: 'string' },
                    tips: { type: 'array', maxItems: 4, items: { type: 'string' } },
                  },
                  required: ['explanation', 'tips'],
                },
                temperature: 0.2,
                maxOutputTokens: 500,
              },
            }),
          },
        );
        if (!response.ok) return result;
        const envelope = (await response.json()) as GeminiEnvelope;
        const text = envelope.candidates?.[0]?.content?.parts?.find(
          (part) => typeof part.text === 'string',
        )?.text;
        if (typeof text !== 'string') return result;
        const parsed = JSON.parse(text) as { explanation?: unknown; tips?: unknown };
        if (
          typeof parsed.explanation !== 'string' ||
          !Array.isArray(parsed.tips) ||
          !parsed.tips.every((tip) => typeof tip === 'string')
        ) return result;
        return {
          ...result,
          explanation: parsed.explanation.slice(0, 1000),
          tips: parsed.tips.slice(0, 4).map((tip) => tip.slice(0, 300)),
          ai_generated: true,
        };
      } catch {
        return result;
      }
    },
  };
}
