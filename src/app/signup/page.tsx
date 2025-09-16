"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState, useEffect } from "react";
import * as z from "zod";
import { useRouter } from "next/navigation";
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

// Form Schema with password confirmation validation
const FormSchema = z
  .object({
    email: z.string().email({ message: "Invalid email address." }),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters." }),
    passwordConfirm: z.string().min(8, { message: "Please confirm your password." }),
  })
  .superRefine(({ password, passwordConfirm }, ctx) => {
    if (password !== passwordConfirm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["passwordConfirm"],
      });
    }
  });

export default function SignupPage() {
  const router = useRouter();
  const [alert, setAlert] = useState({
    show: false,
    title: "",
    description: "",
    variant: "default" as "default" | "destructive",
  });

  const showAlert = (
    title: string,
    description: string,
    variant: "default" | "destructive"
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
        router.push("/polls");
      }
    };
    checkUser();
    
    // Auth listener to handle both password and OAuth sign-ins
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session) {
          // Check if user profile exists in public.users table
          const { data: userData, error: userError } = await supabase
            .from("users")
            .select("id")
            .eq("id", session.user.id);

          if (userError) {
            console.error("Error fetching user profile:", userError.message);
            // Don't block navigation, just log the error
          }

          if (!userData || userData.length === 0) {
            // User profile doesn't exist, create it
            const { error: insertError } = await supabase
              .from("users")
              .insert([
                {
                  id: session.user.id,
                  role: "user",
                },
              ]);

            if (insertError) {
              console.error("Error inserting user into 'users' table:", insertError.message);
              // Handle error, maybe show an alert
            } else {
              console.log("User successfully created in 'users' table!");
            }
          }
          router.push("/polls");
        }
      }
    );
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { email: "", password: "", passwordConfirm: "" },
  });

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    const { email, password } = data;

    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      showAlert("Sign-up Failed", error.message, "destructive");
      return;
    }

    if (signUpData.user) {
      const { error: insertError } = await supabase
        .from("users")
        .insert([
          {
            id: signUpData.user.id,
            role: "user",
          },
        ]);

      if (insertError) {
        console.error("Error inserting into users table:", insertError.message);
        showAlert("Error", "Failed to create user profile.", "destructive");
      } else {
        console.log("User row created in users table!");
        showAlert("Success", "Sign-up successful! Please check your email for confirmation.", "default");
        setTimeout(() => {
          router.push("/login");
        }, 2000);
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
          <CardTitle>Sign Up</CardTitle>
          <CardDescription>Create a new account</CardDescription>
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
              <FormField
                control={form.control}
                name="passwordConfirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full">
                Sign Up with Email
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
            Sign Up with Google
          </Button>
          <div className="mt-4 text-center text-sm">
            Already have an account?{" "}
            <Link href="/login" className="underline">
              Log in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}