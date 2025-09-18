"use client"

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Bell, BellRing, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  link: string | null
  read_at: string | null
  created_at: string
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const fetchNotifications = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('Error fetching notifications:', error)
        toast.error('Failed to fetch notifications.')
      } else {
        // Filter notifications on the client-side as per your request to disable RLS
        const userNotifications = data.filter(n => n.user_id === user.id)
        setNotifications(userNotifications)
        const unread = userNotifications.filter(n => n.read_at === null).length
        setUnreadCount(unread)
      }
      setLoading(false)
    }

    fetchNotifications()

    // Real-time listener for notifications
    const channel = supabase
      .channel('notifications-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload: any) => {
          const newNotif = payload.new as Notification;
          // Check for user ID in real-time updates as RLS is off
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (user && newNotif.user_id === user.id) {
              setNotifications(prev => [newNotif, ...prev]);
              setUnreadCount(prev => prev + 1);
            }
          });
        }
      )
      .subscribe()
    
    return () => {
      channel.unsubscribe()
    }
  }, [])

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
    
    if (error) {
      console.error('Failed to mark notification as read:', error)
    } else {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      setUnreadCount(prev => prev > 0 ? prev - 1 : 0)
    }
  }

  const markAllAsRead = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null)
    
    if (error) {
      console.error('Failed to mark all notifications as read:', error)
    } else {
      setUnreadCount(0)
      setNotifications(prev => prev.map(n => n.read_at === null ? { ...n, read_at: new Date().toISOString() } : n))
    }
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full focus-visible:ring-0">
          <div className="relative">
            <Bell className="h-6 w-6 text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end" forceMount>
        <div className="flex items-center justify-between p-2">
          <DropdownMenuLabel className="font-bold">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button variant="link" size="sm" onClick={markAllAsRead}>
              Mark all as read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <DropdownMenuItem disabled>
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
            </DropdownMenuItem>
          ) : notifications.length === 0 ? (
            <DropdownMenuItem disabled className="text-muted-foreground">
              No new notifications.
            </DropdownMenuItem>
          ) : (
            notifications.map((notif) => (
              <DropdownMenuItem
                key={notif.id}
                onClick={() => notif.read_at === null && markAsRead(notif.id)}
                className={`flex flex-col items-start space-y-1 p-3 transition-colors ${
                  notif.read_at === null ? 'bg-primary/5 hover:bg-primary/10' : 'opacity-70 hover:opacity-100'
                } cursor-pointer`}
              >
                <div className="flex items-center space-x-2 w-full">
                  {!notif.read_at && <BellRing className="h-4 w-4 text-primary" />}
                  <span className="font-semibold">{notif.title}</span>
                </div>
                <p className="text-sm text-foreground">{notif.message}</p>
                {notif.link && (
                  <Link href={notif.link} className="text-xs text-blue-500 hover:underline">
                    View
                  </Link>
                )}
                <span className="text-xs text-muted-foreground self-end">
                  {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}