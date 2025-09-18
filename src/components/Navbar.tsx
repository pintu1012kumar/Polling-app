"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Notifications from "./Notifications";

const LogoutButton = () => {
  const router = useRouter();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };
  return (
    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
      <LogOut className="mr-2 h-4 w-4" />
      Log Out
    </DropdownMenuItem>
  );
};

interface UserProfile {
  id: string;
  email: string | undefined;
  role: string | undefined;
  name?: string;
  profile_picture_url?: string;
  bio?: string;
}

export default function Navbar() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    const fetchUserProfile = async () => {
      setIsAuthLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session && session.user) {
        const { data: profileData, error: profileError } = await supabase
          .from("users")
          .select("role, name, profile_picture_url, bio")
          .eq("id", session.user.id)
          .single();

        const userEmail = session.user.email;
        const defaultName = session.user.user_metadata.full_name || session.user.email?.split('@')[0] || "User";
        const defaultAvatar = session.user.user_metadata.avatar_url || "";
        
        if (profileError) {
          console.error("Error fetching user profile:", profileError.message);
          setUser({
            id: session.user.id,
            email: userEmail,
            role: "user",
            name: defaultName,
            profile_picture_url: defaultAvatar,
          });
        } else {
          setUser({
            id: session.user.id,
            email: userEmail,
            role: profileData?.role || "user",
            name: profileData?.name || defaultName,
            profile_picture_url: profileData?.profile_picture_url || defaultAvatar,
            bio: profileData?.bio,
          });
        }
      } else {
        setUser(null);
      }
      setIsAuthLoading(false);
    };

    fetchUserProfile();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
      } else if (event === "SIGNED_IN") {
        fetchUserProfile();
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const getInitials = (name?: string) => {
    if (!name) return "U";
    const parts = name.split(" ");
    if (parts.length > 1) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0][0].toUpperCase();
  };

  return (
    <nav className="sticky top-0 z-50 text-black bg-gray-100 p-4 flex justify-between items-center ">
      <div className="text-xl font-bold">
        <Link href="/">Polling App</Link>
      </div>
      <div className="flex items-center space-x-4">
        {isAuthLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        ) : user ? (
          <>
            <Notifications />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full focus-visible:ring-0">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.profile_picture_url} alt={user.name || "User"} />
                    <AvatarFallback className="bg-primary/20 text-primary">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium leading-none">{user.name || "Guest User"}</p>
                      {user.role && <Badge variant="secondary" className="text-xs">{user.role}</Badge>}
                    </div>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <LogoutButton />
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <Link href="/login" passHref>
            <Button>
              Login
            </Button>
          </Link>
        )}
      </div>
    </nav>
  );
}