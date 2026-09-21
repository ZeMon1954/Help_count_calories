import type { Env } from '../config/env.js';

export interface ReminderRecord { id:string; type:'meal'|'workout'|'weight'; title:string; time:string; days_of_week:number[]; enabled:boolean }
export interface SettingsSnapshot { units:'metric'|'imperial'; targets:{calories:number|null;protein_g:number|null;carbs_g:number|null;fat_g:number|null}; reminders:ReminderRecord[] }
export interface SettingsRepository {
  get(userId:string, token:string):Promise<SettingsSnapshot>;
  setUnits(userId:string, token:string, units:'metric'|'imperial'):Promise<void>;
  setTargets(token:string, targets:SettingsSnapshot['targets'] & {calories:number;protein_g:number;carbs_g:number;fat_g:number}):Promise<void>;
  createReminder(userId:string, token:string, input:Omit<ReminderRecord,'id'>):Promise<ReminderRecord>;
  updateReminder(userId:string, token:string, id:string, input:Omit<ReminderRecord,'id'>):Promise<ReminderRecord|null>;
  deleteReminder(userId:string, token:string, id:string):Promise<boolean>;
}
export class SettingsRepositoryError extends Error { constructor(readonly status:number){super('Settings repository request failed')} }
const num=(v:unknown)=>v==null?null:Number(v);
export function createSettingsRepository(env:Env, fetchImpl:typeof fetch=fetch):SettingsRepository {
  if(!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY){const no=async()=>{throw new SettingsRepositoryError(503)};return {get:no,setUnits:no,setTargets:no,createReminder:no,updateReminder:no,deleteReminder:no}}
  const base=`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1`;
  const req=async<T>(path:string,token:string,init?:RequestInit):Promise<T>=>{let res:Response;try{res=await fetchImpl(`${base}/${path}`,{...init,headers:{apikey:env.SUPABASE_ANON_KEY!,Authorization:`Bearer ${token}`,Accept:'application/json',...init?.headers},signal:AbortSignal.timeout(10000)})}catch{throw new SettingsRepositoryError(502)}if(!res.ok)throw new SettingsRepositoryError(res.status);if(res.status===204)return undefined as T;return await res.json() as T};
  const mapReminder=(r:Record<string,unknown>):ReminderRecord=>({id:String(r.id),type:r.type as ReminderRecord['type'],title:String(r.title),time:String(r.time).slice(0,5),days_of_week:Array.isArray(r.days_of_week)?r.days_of_week.map(Number):[],enabled:r.enabled===true});
  return {
    async get(userId,token){const u=encodeURIComponent(userId);const [s,g,r]=await Promise.all([req<Record<string,unknown>[]>(`user_settings?select=units&user_id=eq.${u}&limit=1`,token),req<Record<string,unknown>[]>(`user_goals?select=calorie_target,protein_target_g,carbs_target_g,fat_target_g&user_id=eq.${u}&ended_at=is.null&limit=1`,token),req<Record<string,unknown>[]>(`reminders?select=id,type,title,time,days_of_week,enabled&user_id=eq.${u}&order=time.asc`,token)]);return {units:s[0]?.units==='imperial'?'imperial':'metric',targets:{calories:num(g[0]?.calorie_target),protein_g:num(g[0]?.protein_target_g),carbs_g:num(g[0]?.carbs_target_g),fat_g:num(g[0]?.fat_target_g)},reminders:r.map(mapReminder)}} ,
    async setUnits(userId,token,units){await req('user_settings?on_conflict=user_id',token,{method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:userId,units,updated_at:new Date().toISOString()})})},
    async setTargets(token,t){const ok=await req<boolean>('rpc/update_nutrition_targets',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_calories:t.calories,p_protein_g:t.protein_g,p_carbs_g:t.carbs_g,p_fat_g:t.fat_g})});if(ok!==true)throw new SettingsRepositoryError(502)},
    async createReminder(userId,token,input){const rows=await req<Record<string,unknown>[]>('reminders',token,{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({...input,user_id:userId})});if(!rows[0])throw new SettingsRepositoryError(502);return mapReminder(rows[0])},
    async updateReminder(userId,token,id,input){const rows=await req<Record<string,unknown>[]>(`reminders?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,token,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(input)});return rows[0]?mapReminder(rows[0]):null},
    async deleteReminder(userId,token,id){const rows=await req<Record<string,unknown>[]>(`reminders?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,token,{method:'DELETE',headers:{Prefer:'return=representation'}});return rows.length===1}
  };
}
