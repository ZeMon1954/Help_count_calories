import { apiRequest } from './client';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodRecord {
  id: string;
  created_by: string | null;
  name: string;
  serving_size_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: string | null;
}

export interface FoodLogItem {
  id: string;
  food_id: string | null;
  food_name: string;
  quantity_g: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  input_method: 'ai' | 'manual';
}

export interface FoodLog {
  id: string;
  meal_type: MealType;
  eaten_at: string;
  note: string | null;
  items: FoodLogItem[];
}

export interface LoggedFoodItem extends FoodLogItem {
  log_id: string;
  meal_type: MealType;
  eaten_at: string;
  log_created_at: string;
  was_created: boolean;
}

export interface NutritionSummary {
  date: string;
  timezone_offset_minutes: number;
  consumed: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  targets: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  };
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function timezoneOffsetMinutes(date = new Date()) {
  return -date.getTimezoneOffset();
}

export async function searchFoods(
  accessToken: string,
  search = '',
  limit = 20,
  offset = 0,
) {
  const query = new URLSearchParams({
    search,
    limit: String(limit),
    offset: String(offset),
  });
  return (
    await apiRequest<{ items: FoodRecord[]; limit: number; offset: number }>(
      `foods?${query.toString()}`,
      { headers: authHeaders(accessToken) },
    )
  ).data;
}

export async function createCustomFood(
  accessToken: string,
  input: Omit<FoodRecord, 'id' | 'created_by' | 'source'>,
) {
  return (
    await apiRequest<FoodRecord>('foods', {
      method: 'POST',
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })
  ).data;
}
export async function fetchFavoriteFoods(accessToken:string){return (await apiRequest<{items:FoodRecord[]}>('foods/favorites',{headers:authHeaders(accessToken)})).data.items;}
export async function fetchRecentFoods(accessToken:string){return (await apiRequest<{items:FoodRecord[]}>('foods/recent',{headers:authHeaders(accessToken)})).data.items;}
export async function setFoodFavorite(accessToken:string,foodId:string,favorite:boolean){return (await apiRequest<{favorite:boolean}>(`foods/${encodeURIComponent(foodId)}/favorite`,{method:favorite?'PUT':'DELETE',headers:authHeaders(accessToken)})).data;}

export async function fetchFoodLogs(accessToken: string, date: Date) {
  const query = new URLSearchParams({
    date: localDateString(date),
    timezone_offset_minutes: String(timezoneOffsetMinutes(date)),
  });
  return (
    await apiRequest<{
      date: string;
      timezone_offset_minutes: number;
      logs: FoodLog[];
    }>(`food-logs?${query.toString()}`, {
      headers: authHeaders(accessToken),
    })
  ).data;
}

export async function fetchNutritionSummary(accessToken: string, date: Date) {
  const query = new URLSearchParams({
    date: localDateString(date),
    timezone_offset_minutes: String(timezoneOffsetMinutes(date)),
  });
  return (
    await apiRequest<NutritionSummary>(
      `nutrition/summary?${query.toString()}`,
      { headers: authHeaders(accessToken) },
    )
  ).data;
}

export async function deleteFoodLogItem(accessToken: string, itemId: string) {
  await apiRequest<unknown>(`food-logs/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export async function logCatalogFood(
  accessToken: string,
  input: {
    food_id: string;
    meal_type: MealType;
    quantity_g: number;
    eaten_at: string;
    client_request_id: string;
  },
) {
  return (
    await apiRequest<LoggedFoodItem>('food-logs/items', {
      method: 'POST',
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })
  ).data;
}

export async function updateFoodLogItemQuantity(
  accessToken: string,
  itemId: string,
  quantityG: number,
) {
  return (
    await apiRequest<FoodLogItem & { food_log_id: string }>(
      `food-logs/items/${encodeURIComponent(itemId)}`,
      {
        method: 'PATCH',
        headers: {
          ...authHeaders(accessToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quantity_g: quantityG }),
      },
    )
  ).data;
}

export function createClientRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function')
    return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
