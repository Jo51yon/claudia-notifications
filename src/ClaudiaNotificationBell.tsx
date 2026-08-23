import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ClaudiaNotificationBell — unread-count bell with a real-time subscription. Ported from
 * SafeSpaces' real, live NotificationBell.tsx (checked its actual current source before
 * building this): fetch the unread count, subscribe to postgres_changes on the notifications
 * table filtered to this user, refetch on any change rather than trying to track deltas
 * client-side (simpler, and correct even if a change arrives while the tab was backgrounded).
 *
 * onClick is dependency-injected, not hardcoded navigation -- SafeSpaces' version used
 * react-router's <Link to="/notifications">; Claudia's real projects each route differently
 * (PETGI/Lintel/S3Photobook are not on react-router). A caller decides what "open
 * notifications" means for their own app.
 */
export interface ClaudiaNotificationBellProps {
  supabase: SupabaseClient;
  userId: string;
  projectSlug: string;
  onClick: () => void;
  label?: string;
}

export default function ClaudiaNotificationBell({ supabase, userId, projectSlug, onClick, label = 'Notifications' }: ClaudiaNotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    function fetchUnread() {
      supabase.from('claudia_notifications').select('*', { count: 'exact', head: true })
        .eq('user_id', userId).eq('project_slug', projectSlug).eq('is_read', false)
        .then(({ count }: { count: number | null }) => { if (!cancelled) setUnreadCount(count ?? 0); });
    }
    fetchUnread();

    const channel = supabase
      .channel(`claudia-notification-bell-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claudia_notifications', filter: `user_id=eq.${userId}` }, fetchUnread)
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [supabase, userId, projectSlug]);

  return (
    <button type="button" onClick={onClick} title={label}
            style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'inline-flex' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unreadCount > 0 && (
        <span style={{
          position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, padding: '0 3px',
          borderRadius: 8, background: 'var(--claudia-kernel-alert, #b42318)', color: '#fff',
          fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
