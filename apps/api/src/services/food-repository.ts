import type { Env } from '../config/env.js';
import type {
  CreateFoodInput,
  LogCatalogFoodInput,
} from '../schemas/food.js';

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

export interface FoodLogItemRecord {
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

export interface FoodLogRecord {
  id: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  eaten_at: string;
  note: string | null;
  items: FoodLogItemRecord[];
}

export interface LoggedFoodRecord extends FoodLogItemRecord {
  log_id: string;
  meal_type: FoodLogRecord['meal_type'];
  eaten_at: string;
  log_created_at: string;
  was_created: boolean;
}

export interface FoodRepository {
  searchFoods(input: {
    userId: string;
    accessToken: string;
    search: string;
    limit: number;
    offset: number;
  }): Promise<{ items: FoodRecord[]; limit: number; offset: number }>;
  createFood(input: {
    userId: string;
    accessToken: string;
    food: CreateFoodInput;
  }): Promise<FoodRecord>;
  getFoodLogs(input: {
    userId: string;
    accessToken: string;
    startUtc: string;
    endUtc: string;
  }): Promise<FoodLogRecord[]>;
  deleteFoodLogItem(input: {
    userId: string;
    accessToken: string;
    itemId: string;
  }): Promise<boolean>;
  logCatalogFood(input: {
    accessToken: string;
    food: LogCatalogFoodInput;
  }): Promise<LoggedFoodRecord>;
  updateFoodLogItemQuantity(input: {
    accessToken: string;
    itemId: string;
    quantityG: number;
  }): Promise<FoodLogItemRecord & { food_log_id: string }>;
  getFavoriteFoods(input:{accessToken:string}):Promise<FoodRecord[]>;
  getRecentFoods(input:{accessToken:string}):Promise<FoodRecord[]>;
  setFavorite(input:{userId:string;accessToken:string;foodId:string;favorite:boolean}):Promise<boolean>;
}

export class FoodRepositoryError extends Error {
  constructor(
    readonly status: number,
    readonly databaseCode?: string,
  ) {
    super('Food repository request failed');
  }
}

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapFood(row: Record<string, unknown>): FoodRecord {
  return {
    id: String(row.id),
    created_by: typeof row.created_by === 'string' ? row.created_by : null,
    name: String(row.name),
    serving_size_g: numeric(row.serving_size_g),
    calories: numeric(row.calories),
    protein_g: numeric(row.protein_g),
    carbs_g: numeric(row.carbs_g),
    fat_g: numeric(row.fat_g),
    source: typeof row.source === 'string' ? row.source : null,
  };
}

function mapItem(row: Record<string, unknown>): FoodLogItemRecord {
  return {
    id: String(row.id),
    food_id: typeof row.food_id === 'string' ? row.food_id : null,
    food_name: String(row.food_name),
    quantity_g:
      row.quantity_g === null || row.quantity_g === undefined
        ? null
        : numeric(row.quantity_g),
    calories: numeric(row.calories),
    protein_g: numeric(row.protein_g),
    carbs_g: numeric(row.carbs_g),
    fat_g: numeric(row.fat_g),
    input_method: row.input_method === 'ai' ? 'ai' : 'manual',
  };
}

export function createFoodRepository(
  env: Env,
  fetchImplementation: typeof fetch = fetch,
): FoodRepository {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    const unavailable = async () => {
      throw new FoodRepositoryError(503);
    };
    return {
      searchFoods: unavailable,
      createFood: unavailable,
      getFoodLogs: unavailable,
      deleteFoodLogItem: unavailable,
      logCatalogFood: unavailable,
      updateFoodLogItemQuantity: unavailable,
      getFavoriteFoods: unavailable,
      getRecentFoods: unavailable,
      setFavorite: unavailable,
    };
  }

  const baseUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
  const request = async <T>(
    path: string,
    accessToken: string,
    init?: RequestInit,
  ): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImplementation(`${baseUrl}/${path}`, {
        ...init,
        headers: {
          apikey: env.SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          ...init?.headers,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new FoodRepositoryError(502);
    }
    if (!response.ok) {
      let databaseCode: string | undefined;
      try {
        const errorBody = (await response.json()) as { code?: unknown };
        if (typeof errorBody.code === 'string') databaseCode = errorBody.code;
      } catch {
        // Keep provider error details private; only the stable SQLSTATE is used.
      }
      throw new FoodRepositoryError(response.status, databaseCode);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  };

  return {
    async searchFoods({ userId, accessToken, search, limit, offset }) {
      const params = new URLSearchParams({
        select:
          'id,name,serving_size_g,calories,protein_g,carbs_g,fat_g,source,created_by',
        or: `(created_by.is.null,created_by.eq.${userId})`,
        order: 'name.asc',
        limit: String(limit),
        offset: String(offset),
      });
      if (search) params.set('name', `ilike.*${search.replaceAll('*', '')}*`);
      const rows = await request<Record<string, unknown>[]>(
        `foods?${params.toString()}`,
        accessToken,
      );
      return { items: rows.map(mapFood), limit, offset };
    },

    async createFood({ userId, accessToken, food }) {
      const rows = await request<Record<string, unknown>[]>(
        'foods',
        accessToken,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            ...food,
            created_by: userId,
            source: 'manual',
          }),
        },
      );
      if (!rows[0]) throw new FoodRepositoryError(502);
      return mapFood(rows[0]);
    },

    async getFoodLogs({ userId, accessToken, startUtc, endUtc }) {
      const params = new URLSearchParams({
        select:
          'id,meal_type,eaten_at,note,items:food_log_items(id,food_id,food_name,quantity_g,calories,protein_g,carbs_g,fat_g,input_method)',
        user_id: `eq.${userId}`,
        eaten_at: `gte.${startUtc}`,
        order: 'eaten_at.asc',
      });
      params.append('eaten_at', `lt.${endUtc}`);
      const rows = await request<Record<string, unknown>[]>(
        `food_logs?${params.toString()}`,
        accessToken,
      );
      return rows.map((row) => ({
        id: String(row.id),
        meal_type: row.meal_type as FoodLogRecord['meal_type'],
        eaten_at: String(row.eaten_at),
        note: typeof row.note === 'string' ? row.note : null,
        items: Array.isArray(row.items)
          ? row.items.map((item) => mapItem(item as Record<string, unknown>))
          : [],
      }));
    },

    async deleteFoodLogItem({ accessToken, itemId }) {
      const params = new URLSearchParams({ id: `eq.${itemId}`, select: 'id' });
      const rows = await request<Record<string, unknown>[]>(
        `food_log_items?${params.toString()}`,
        accessToken,
        { method: 'DELETE', headers: { Prefer: 'return=representation' } },
      );
      return rows.length === 1;
    },

    async logCatalogFood({ accessToken, food }) {
      const rows = await request<Record<string, unknown>[]>(
        'rpc/log_catalog_food',
        accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_food_id: food.food_id,
            p_meal_type: food.meal_type,
            p_quantity_g: food.quantity_g,
            p_eaten_at: food.eaten_at,
            p_client_request_id: food.client_request_id,
          }),
        },
      );
      const row = rows[0];
      if (!row) throw new FoodRepositoryError(502);
      return {
        ...mapItem({ ...row, id: row.item_id }),
        log_id: String(row.log_id),
        meal_type: row.meal_type as FoodLogRecord['meal_type'],
        eaten_at: String(row.eaten_at),
        log_created_at: String(row.log_created_at),
        was_created: row.was_created === true,
      };
    },

    async updateFoodLogItemQuantity({ accessToken, itemId, quantityG }) {
      const rows = await request<Record<string, unknown>[]>(
        'rpc/update_food_log_item_quantity',
        accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_item_id: itemId, p_quantity_g: quantityG }),
        },
      );
      const row = rows[0];
      if (!row) throw new FoodRepositoryError(502);
      return {
        ...mapItem({ ...row, id: row.item_id }),
        food_log_id: String(row.food_log_id),
      };
    },
    async getFavoriteFoods({accessToken}) {
      const rows=await request<Record<string,unknown>[]>('food_favorites?select=food:foods(id,name,serving_size_g,calories,protein_g,carbs_g,fat_g,source,created_by)&order=created_at.desc',accessToken);
      return rows.flatMap(row=>row.food&&typeof row.food==='object'?[mapFood(row.food as Record<string,unknown>)]:[]);
    },
    async getRecentFoods({accessToken}) {
      const rows=await request<Record<string,unknown>[]>('food_logs?select=items:food_log_items(food:foods(id,name,serving_size_g,calories,protein_g,carbs_g,fat_g,source,created_by))&order=eaten_at.desc&limit=20',accessToken);
      const unique=new Map<string,FoodRecord>();
      for(const log of rows) for(const item of Array.isArray(log.items)?log.items:[]){const food=(item as Record<string,unknown>).food;if(food&&typeof food==='object'){const mapped=mapFood(food as Record<string,unknown>);if(!unique.has(mapped.id))unique.set(mapped.id,mapped)}}
      return [...unique.values()].slice(0,10);
    },
    async setFavorite({userId,accessToken,foodId,favorite}) {
      if(favorite){await request('food_favorites?on_conflict=user_id,food_id',accessToken,{method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates'},body:JSON.stringify({user_id:userId,food_id:foodId})});return true;}
      const rows=await request<Record<string,unknown>[]>(`food_favorites?user_id=eq.${encodeURIComponent(userId)}&food_id=eq.${encodeURIComponent(foodId)}`,accessToken,{method:'DELETE',headers:{Prefer:'return=representation'}});return rows.length===1;
    },
  };
}

export function dateRangeFromLocalDate(
  date: string,
  timezoneOffsetMinutes: number,
) {
  const localMidnightAsUtc = Date.parse(`${date}T00:00:00.000Z`);
  const start = new Date(localMidnightAsUtc - timezoneOffsetMinutes * 60_000);
  const end = new Date(start.valueOf() + 24 * 60 * 60 * 1000);
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}
