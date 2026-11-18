// Modüller arası paylaşılan arayüz durumu (veri değil).
import { dayAt } from './core.js';
import { get } from './store.js';

export const ctx = {
  tab: 'plan',
  mode: 'day',
  day: null,
  month: null,
  pop: null,      // az önce tamamlanan satır (animasyon)
  enter: null,    // az önce eklenen plan (animasyon)
  noteQuery: '',
  showDone: false,
  swipedAt: 0,
  render: () => {},
  go: () => {},
};
export const tz = () => get().prefs.timeZone;
export const today = () => dayAt(Date.now(), tz());
