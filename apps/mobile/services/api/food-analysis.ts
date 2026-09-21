import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { apiRequest } from './client';

export interface FoodAnalysisItem {
  name: string;
  estimated_quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  nutrition_source: 'ai_estimate';
}

export interface FoodAnalysisResult {
  food_name: string;
  items: FoodAnalysisItem[];
  total: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  confidence: 'low' | 'medium' | 'high';
  warnings: string[];
  nutrition_source: 'ai_estimate';
}

export interface LocalImage {
  uri: string;
  mimeType: string;
  fileName: string;
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function analyzeFoodPhoto(accessToken: string, image: LocalImage) {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const response = await fetch(image.uri);
    form.append('image', await response.blob(), image.fileName);
  } else {
    const file = new File(image.uri);
    form.append('image', file, image.fileName);
  }
  return (
    await apiRequest<FoodAnalysisResult>(
      'food-analyses',
      {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: form,
      },
      Platform.OS === 'web' ? fetch : (expoFetch as typeof fetch),
    )
  ).data;
}
