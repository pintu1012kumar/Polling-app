"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import LogoutButton from "./LogoutButton"; // Import the new component
import { Button } from "@/components/ui/button"; // Import the Button component

interface User {
  email: string | undefined;
  role: string | undefined;
}

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Fetch the user session from Supabase
    const fetchUser = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (session) {
        // You'll need to fetch the user's role from your database table
        // For this example, we'll assume the role is stored in a separate table.
        // You might need to adjust this based on your database schema.
        const { data: userData, error: userError } = await supabase
          .from("users") // Assuming you have a 'profiles' table with user roles
          .select("role")
          .eq("id", session.user.id)
          .single();

        setUser({
          email: session.user.email,
          role: userData?.role || "user",
        });
      } else if (error) {
        console.error("Error fetching session:", error.message);
        setUser(null);
      } else {
        setUser(null);
      }
    };
    fetchUser();

    // Listen for auth state changes (e.g., login, logout)
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
      } else if (event === "SIGNED_IN") {
        fetchUser(); // Re-fetch user on sign-in
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  return (
    <nav className="sticky top-0 z-50 text-black bg-gray-100 p-4 flex justify-between items-center ">
      <div className="text-xl font-bold">
        <Link href="/">Polling App</Link>
      </div>
      <div className="flex items-center space-x-4">
        {user ? (
          <>
            <span className="text-sm"><strong>User:</strong> {user.email}</span>
            <span className="text-sm"><strong>Role:</strong> {user.role}</span>
            <LogoutButton />
          </>
        ) : (
          <Link href="/login" >
            <Button>
              Login
            </Button>
          </Link>
        )}
        
      </div>
    </nav>
  );
}