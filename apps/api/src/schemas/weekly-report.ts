import { z } from 'zod';

export const weeklyReportQuerySchema = z.object({
  date: z.iso.date(),
  weeks: z.coerce.number().int().min(1).max(12).default(8),
  timezone_offset_minutes: z.coerce.number().int().min(-840).max(840).default(0),
});
