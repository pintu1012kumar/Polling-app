"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";

const FormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, { message: "Password must be at least 8 characters." }),
});

export default function LoginPage() {
  const router = useRouter();

  const [alert, setAlert] = useState<{
    show: boolean;
    title: string;
    description: string;
    variant: "default" | "destructive";
  }>({
    show: false,
    title: "",
    description: "",
    variant: "default",
  });

  const showAlert = (
    title: string,
    description: string,
    variant: "default" | "destructive" = "default"
  ) => {
    setAlert({ show: true, title, description, variant });
    setTimeout(() => {
      setAlert((prev) => ({ ...prev, show: false }));
    }, 5000);
  };

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        // Check if user profile exists in public.users table
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("role")
          .eq("id", data.user.id);
        
        if (userError) {
          console.error("Error fetching user role:", userError.message);
          showAlert("Error", "Failed to get user details.", "destructive");
          return;
        }

        if (userData.length === 0) {
          // User profile doesn't exist, create it
          const { error: insertError } = await supabase
            .from("users")
            .insert([{ id: data.user.id, role: "user" }]);

          if (insertError) {
            console.error("Error inserting user profile:", insertError.message);
            showAlert("Error", "Failed to create user profile. Please try again.", "destructive");
            return;
          }
          router.push("/polls");
          return;
        }

        // User profile exists, get the role and redirect
        const role = userData[0]?.role;
        if (role === "admin") {
          router.push("/admin/polls");
        } else if (role === "user") {
          router.push("/polls");
        } else {
          showAlert("Error", "Unknown user role.", "destructive");
        }
      }
    };
    checkUser();
  }, [router]);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    const { email, password } = data;
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      showAlert("Login Failed", error.message, "destructive");
    } else {
      showAlert("Success", "Login successful!", "default");
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();
        if (userError) {
          showAlert("Error", userError.message, "destructive");
          return;
        }
        if (userData.role === "admin") {
          router.push("/admin/polls");
        } else if (userData.role === "user") {
          router.push("/polls");
        } else {
          showAlert("Error", "Unknown user role.", "destructive");
        }
      }
    }
  };

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/polls`,
      },
    });
    if (error) {
      showAlert("Google Sign-in Failed", error.message, "destructive");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      {alert.show && (
        <div className="fixed bottom-4 right-4 z-[9999]">
          <Alert variant={alert.variant} className="w-[300px]">
            <Terminal className="h-4 w-4" />
            <AlertTitle>{alert.title}</AlertTitle>
            <AlertDescription>{alert.description}</AlertDescription>
          </Alert>
        </div>
      )}
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Log In</CardTitle>
          <CardDescription>Log in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="you@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full">
                Log In with Email
              </Button>
            </form>
          </Form>
          <div className="relative mt-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>
          <Button onClick={handleGoogleSignIn} className="w-full mt-4">
            Log In with Google
          </Button>
          <div className="mt-4 text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="underline">
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}