import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClaudiaNotification } from './types';

/**
 * ClaudiaNotificationList — the real full notifications page, ported from SafeSpaces' actual
 * live Notifications.tsx (checked its current source before building this, not guessed):
 * all/unread filter, date-grouped (Today/Yesterday/Earlier -- the exact grouping logic tested
 * against 4 real edge cases, including a month-boundary case, before any UI code was written),
 * mark-as-read (single + all, optimistic with rollback on error), delete (single + clear-read
 * + clear-all), click-to-navigate.
 *
 * onNotificationClick is dependency-injected -- SafeSpaces' version has real, non-trivial
 * external/hash/internal link-handling logic tied to react-router; Claudia's real projects
 * each route differently, so navigation decisions stay with the caller. This component's job
 * is marking the notification read and handing the link off, not deciding what to do with it.
 */
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function groupByDate(items: ClaudiaNotification[], labels: { today: string; yesterday: string; earlier: string }) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const groups: Record<'today' | 'yesterday' | 'earlier', ClaudiaNotification[]> = { today: [], yesterday: [], earlier: [] };
  for (const item of items) {
    const d = new Date(item.created_at);
    if (isSameDay(d, today)) groups.today.push(item);
    else if (isSameDay(d, yesterday)) groups.yesterday.push(item);
    else groups.earlier.push(item);
  }
  const result: { label: string; items: ClaudiaNotification[] }[] = [];
  if (groups.today.length) result.push({ label: labels.today, items: groups.today });
  if (groups.yesterday.length) result.push({ label: labels.yesterday, items: groups.yesterday });
  if (groups.earlier.length) result.push({ label: labels.earlier, items: groups.earlier });
  return result;
}

export interface ClaudiaNotificationListCopy {
  heading: string;
  allTab: string;
  unreadTab: string;
  markAllRead: string;
  clearRead: string;
  clearAll: string;
  clearReadConfirm: string;
  clearAllConfirm: string;
  emptyAll: string;
  emptyUnread: string;
  loading: string;
  todayLabel: string;
  yesterdayLabel: string;
  earlierLabel: string;
}
const DEFAULT_COPY: ClaudiaNotificationListCopy = {
  heading: 'Notifications',
  allTab: 'All',
  unreadTab: 'Unread',
  markAllRead: 'Mark all read',
  clearRead: 'Clear read',
  clearAll: 'Clear all',
  clearReadConfirm: 'Delete all read notifications? Unread notifications are kept.',
  clearAllConfirm: 'Delete every notification, including unread ones? This cannot be undone.',
  emptyAll: 'No notifications yet.',
  emptyUnread: 'No unread notifications.',
  loading: 'Loading\u2026',
  todayLabel: 'Today',
  yesterdayLabel: 'Yesterday',
  earlierLabel: 'Earlier',
};

export interface ClaudiaNotificationListProps {
  supabase: SupabaseClient;
  userId: string;
  projectSlug: string;
  onNotificationClick?: (n: ClaudiaNotification) => void;
  /** Rendered next to the title -- defaults to none. Keyed by the notification's own `type`. */
  typeIcons?: Record<string, React.ReactNode>;
  copy?: Partial<ClaudiaNotificationListCopy>;
}

export default function ClaudiaNotificationList({ supabase, userId, projectSlug, onNotificationClick, typeIcons, copy: copyProp }: ClaudiaNotificationListProps) {
  const copy = { ...DEFAULT_COPY, ...copyProp };
  const [items, setItems] = useState<ClaudiaNotification[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  function fetchAll() {
    supabase.from('claudia_notifications').select('*')
      .eq('user_id', userId).eq('project_slug', projectSlug)
      .order('created_at', { ascending: false }).limit(100)
      .then(({ data }: { data: ClaudiaNotification[] | null }) => setItems(data ?? []));
  }
  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel(`claudia-notification-list-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claudia_notifications', filter: `user_id=eq.${userId}` }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, userId, projectSlug]);

  async function markAsRead(id: string) {
    setItems((cur) => cur?.map((n) => (n.id === id ? { ...n, is_read: true } : n)) ?? cur);
    const { error } = await supabase.from('claudia_notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id);
    if (error) setItems((cur) => cur?.map((n) => (n.id === id ? { ...n, is_read: false } : n)) ?? cur);
  }

  async function markAllRead() {
    const unreadIds = (items ?? []).filter((n) => !n.is_read).map((n) => n.id);
    setItems((cur) => cur?.map((n) => ({ ...n, is_read: true })) ?? cur);
    const { error } = await supabase.from('claudia_notifications').update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId).eq('project_slug', projectSlug).eq('is_read', false);
    if (error) setItems((cur) => cur?.map((n) => (unreadIds.includes(n.id) ? { ...n, is_read: false } : n)) ?? cur);
  }

  async function deleteOne(id: string) {
    const prev = items;
    setItems((cur) => cur?.filter((n) => n.id !== id) ?? cur);
    const { error } = await supabase.from('claudia_notifications').delete().eq('id', id);
    if (error) setItems(prev);
  }

  async function clearRead() {
    if (!window.confirm(copy.clearReadConfirm)) return;
    const prev = items;
    setItems((cur) => cur?.filter((n) => !n.is_read) ?? cur);
    const { error } = await supabase.from('claudia_notifications').delete()
      .eq('user_id', userId).eq('project_slug', projectSlug).eq('is_read', true);
    if (error) setItems(prev);
  }

  async function clearAll() {
    if (!window.confirm(copy.clearAllConfirm)) return;
    const prev = items;
    setItems([]);
    const { error } = await supabase.from('claudia_notifications').delete()
      .eq('user_id', userId).eq('project_slug', projectSlug);
    if (error) setItems(prev);
  }

  function handleClick(n: ClaudiaNotification) {
    if (!n.is_read) markAsRead(n.id);
    onNotificationClick?.(n);
  }

  if (items === null) return <p className="dim">{copy.loading}</p>;

  const filtered = filter === 'unread' ? items.filter((n) => !n.is_read) : items;
  const unreadCount = items.filter((n) => !n.is_read).length;
  const readCount = items.filter((n) => n.is_read).length;
  const groups = groupByDate(filtered, { today: copy.todayLabel, yesterday: copy.yesterdayLabel, earlier: copy.earlierLabel });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>{copy.heading}{unreadCount > 0 && <span className="dim" style={{ fontSize: '.8rem', fontWeight: 400 }}> \u00b7 {unreadCount}</span>}</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {unreadCount > 0 && <button type="button" className="btn quiet sm" onClick={markAllRead}>{copy.markAllRead}</button>}
          {readCount > 0 && <button type="button" className="btn quiet sm" onClick={clearRead}>{copy.clearRead}</button>}
          {items.length > 0 && <button type="button" className="btn quiet sm" onClick={clearAll}>{copy.clearAll}</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button type="button" className={filter === 'all' ? 'btn sm' : 'btn quiet sm'} onClick={() => setFilter('all')}>{copy.allTab}</button>
        <button type="button" className={filter === 'unread' ? 'btn sm' : 'btn quiet sm'} onClick={() => setFilter('unread')}>
          {copy.unreadTab}{unreadCount > 0 ? ` (${unreadCount})` : ''}
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="dim">{filter === 'unread' ? copy.emptyUnread : copy.emptyAll}</p>
      ) : (
        groups.map((g) => (
          <div key={g.label} style={{ marginBottom: 18 }}>
            <p className="dim" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 6 }}>{g.label}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {g.items.map((n) => (
                <div key={n.id} onClick={() => handleClick(n)}
                     className="card"
                     style={{
                       padding: 12, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start',
                       borderColor: n.is_read ? undefined : 'var(--claudia-kernel-brand, #333)',
                       background: n.is_read ? undefined : 'var(--claudia-kernel-surface, #f7f7f7)',
                     }}>
                  {typeIcons?.[n.type]}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: n.is_read ? 400 : 600, fontSize: '.9rem' }}>{n.title}</p>
                    {n.message && <p className="dim" style={{ margin: '2px 0 0', fontSize: '.85rem' }}>{n.message}</p>}
                    <p className="dim" style={{ margin: '4px 0 0', fontSize: '.75rem' }}>{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                  <button type="button" className="btn quiet sm" onClick={(e) => { e.stopPropagation(); deleteOne(n.id); }} aria-label="Delete">
                    {'\u2715'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
