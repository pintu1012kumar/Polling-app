"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      alert("Logout failed: " + error.message);
      console.error(error);
      return;
    }

    // Immediately redirect to login without refreshing the page
    router.push("/login");
  };

  return (
    <Button onClick={handleLogout} >
      Log Out
    </Button>
  );
}
