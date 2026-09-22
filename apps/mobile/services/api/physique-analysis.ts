import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { apiRequest } from './client';
import type { LocalImage } from './food-analysis';

export interface PhysiqueAnalysisResult {
  measurement: { id: string; weightKg: number; recordedAt: string };
  nutrition: {
    bmr: number;
    tdee: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    weekly_weight_change_kg: number;
  };
  visual: {
    photo_suitable: true;
    confidence: 'low' | 'medium' | 'high';
    observations: string[];
    recommendations: string[];
    warnings: string[];
  };
  image_retained: false;
}

export async function analyzePhysiquePhoto(
  accessToken: string,
  image: LocalImage,
  weightKg: number,
  sex: 'male' | 'female',
) {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const response = await fetch(image.uri);
    form.append('image', await response.blob(), image.fileName);
  } else {
    form.append('image', new File(image.uri), image.fileName);
  }
  const query = new URLSearchParams({
    weight_kg: String(weightKg),
    sex,
  });
  return (
    await apiRequest<PhysiqueAnalysisResult>(
      `progress/physique-analysis?${query.toString()}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      },
      Platform.OS === 'web' ? fetch : (expoFetch as typeof fetch),
    )
  ).data;
}
