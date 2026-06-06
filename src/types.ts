/**
 * Tipos del backend. La forma de `Schedule` (camelCase) coincide con lo que
 * la app espera. Las filas de Postgres vienen en snake_case y se mapean.
 */

export type RepeatType = 'once' | 'daily' | 'weekly' | 'monthly';
export type ScheduleStatus = 'scheduled' | 'sent' | 'failed' | 'disabled';

export type Schedule = {
  id: string;
  userId: string;
  title: string;
  message: string;
  contactName: string;
  contactNumber: string;
  scheduleDate: string; // ISO
  repeatType: RepeatType;
  enabled: boolean;
  status: ScheduleStatus;
  lastSentAt: string | null;
  createdAt: string;
};

export type ScheduleRow = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  contact_name: string;
  contact_number: string;
  schedule_date: string | Date;
  repeat_type: RepeatType;
  enabled: boolean;
  status: ScheduleStatus;
  last_sent_at: string | Date | null;
  created_at: string | Date;
};

const toIso = (v: string | Date | null): string | null =>
  v == null ? null : new Date(v).toISOString();

export function rowToSchedule(r: ScheduleRow): Schedule {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    message: r.message,
    contactName: r.contact_name,
    contactNumber: r.contact_number,
    scheduleDate: toIso(r.schedule_date)!,
    repeatType: r.repeat_type,
    enabled: r.enabled,
    status: r.status,
    lastSentAt: toIso(r.last_sent_at),
    createdAt: toIso(r.created_at)!,
  };
}

export type ScheduleInput = {
  title: string;
  message: string;
  contactName: string;
  contactNumber: string;
  scheduleDate: string;
  repeatType: RepeatType;
  enabled: boolean;
};
