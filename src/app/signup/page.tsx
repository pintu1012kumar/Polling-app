"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
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

const FormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, { message: "Password must be at least 8 characters." }),
});

export default function SignupPage() {
  const router = useRouter();

  // Redirect logged-in users to /dashboard
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) router.push("/dashboard");
    };
    checkUser();
  }, [router]);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { email: "", password: "" },
  });

  // const onSubmit = async (data: z.infer<typeof FormSchema>) => {
  //   const { email, password } = data;

  //   const { data: signUpData, error } = await supabase.auth.signUp({
  //     email,
  //     password,
  //   });

  //   if (error) {
  //     alert("Sign-up failed: " + error.message);
  //     return;
  //   }

  //   // ✅ Insert into users table with default role "user"
  //   if (signUpData.user) {
  //     const { error: insertError } = await supabase
  //       .from("users")
  //       .insert([
  //         {
  //           id: signUpData.user.id, // same as auth user id
  //           email: email,
  //           role: "user", // default role
  //         },
  //       ]);

  //     if (insertError) {
  //       console.error("Error inserting role:", insertError.message);
  //     }
  //   }

  //   alert("Sign-up successful! Please check your email for confirmation.");
  //   router.push("/login");
  // };


const onSubmit = async (data: z.infer<typeof FormSchema>) => {
  const { email, password } = data;

  const { data: signUpData, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    alert("Sign-up failed: " + error.message);
    return;
  }

  if (signUpData.user) {
    // Insert into users table
    const { error: insertError } = await supabase
      .from("users")
      .insert([
        {
          id: signUpData.user.id, // FK → auth.users.id
          role: "user",           // optional, since default is 'user'
        },
      ]);

    if (insertError) {
      console.error("Error inserting into users table:", insertError.message);
    } else {
      console.log("User row created in users table!");
    }
  }

  alert("Sign-up successful! Please check your email for confirmation.");
  router.push("/login");
};


  return (
    <div className="flex items-center justify-center min-h-screen">
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
              <Button type="submit" className="w-full">
                Sign Up
              </Button>
            </form>
          </Form>
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
