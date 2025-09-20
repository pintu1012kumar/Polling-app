// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import type { Database } from "../../../database.types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Placeholder for your email sending logic.
async function sendEmail(to: string, subject: string, body: string) {
  console.log(`Sending email to ${to} with subject: ${subject}`);
  // Implement your email sending logic here.
}

serve(async (req: Request) => {
  const supabaseClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
    },
  });

  try {
    const payload = await req.json();
    const eventType = payload.table;
    const newRecord = payload.record;
    
    // Check if the user performing the action is an admin by their username
    const { data: adminProfile, error: adminProfileError } = await supabaseClient
      .from('profiles')
      .select('username')
      .eq('id', newRecord.user_id)
      .single();

    //  <-- UPDATE THIS LINE WITH YOUR REAL ADMIN USERNAME -->
    const isAdmin = adminProfile?.username === 'pintu1012kumar@gmail.com';

    // --- Handling Admin Actions ---
    if (isAdmin) {
      if (eventType === "polls") {
        
        // Fetch only users with the 'user' role from the 'users' table
        const { data: allUsers, error: usersError } = await supabaseClient
          .from('users')
          .select('id, role'); // Role is needed for filtering

        if (usersError || !allUsers) {
          console.error("Error fetching all user IDs for broadcast:", usersError);
          return new Response("Failed to fetch users", { status: 500 });
        }
        
        // Filter users to get only the 'user' role IDs
        const userIds = allUsers.filter(u => u.role === 'user').map(u => u.id);
        
        // Fetch the profiles of the users we just found
        const { data: allUserProfiles, error: profilesError } = await supabaseClient
          .from('profiles')
          .select('username')
          .in('id', userIds);

        if (profilesError || !allUserProfiles) {
          console.error("Error fetching user profiles for broadcast:", profilesError);
          return new Response("Failed to fetch profiles", { status: 500 });
        }

        let action = '';
        let pollTitle = '';

        if (payload.type === 'INSERT') {
          action = 'created';
          pollTitle = newRecord.title;
        } else if (payload.type === 'UPDATE') {
          action = 'updated';
          pollTitle = newRecord.title;
        } else if (payload.type === 'DELETE') {
          action = 'deleted';
          pollTitle = payload.old_record.title;
        }

        for (const profile of allUserProfiles) {
           console.log('Sending email to:', profile.username);
           const emailSubject = `Admin Alert: A Poll has been ${action}!`;
           const emailBody = `Hello,\n\nAn admin has ${action} the poll titled "${pollTitle}".\n\nVisit the app to see the changes.`;
           
           if (profile.username) {
             await sendEmail(profile.username, emailSubject, emailBody);
           }
        }
        console.log(`Email notification broadcast to all users for a poll ${action}.`);
      }
    }
    
    // ... rest of the code is unchanged ...
    switch (eventType) {
      case "polls":
        if (!isAdmin && newRecord.status === 'open') {
          const { data: userCategories, error: userCatError } = await supabaseClient
            .from('user_categories')
            .select('user_id')
            .eq('category_id', newRecord.category_id);
          
          if (userCatError) throw userCatError;

          for (const userCat of userCategories) {
            const notification = {
              user_id: userCat.user_id,
              title: "New Poll Created!",
              message: `A new poll titled "${newRecord.title}" has been created in a category you follow.`,
              link: `/polls/${newRecord.id}`,
            };
            await supabaseClient.from('notifications').insert([notification]);
          }
        }
        break;
      case "poll_comments":
        if (newRecord.parent_comment_id) {
          const { data: parentComment, error: commentError } = await supabaseClient
            .from('poll_comments')
            .select('user_id')
            .eq('id', newRecord.parent_comment_id)
            .single();

          if (commentError) throw commentError;
          
          const recipientUserId = parentComment.user_id;
          if (recipientUserId !== newRecord.user_id) {
            const notification = {
              user_id: recipientUserId,
              title: "New Comment Reply",
              message: `Someone replied to your comment.`,
              link: `/polls/${newRecord.poll_id}`,
            };
            await supabaseClient.from('notifications').insert([notification]);
          }
        }
        break;
      default:
        console.log("No handler for this event type:", eventType);
        return new Response("No handler", { status: 200 });
    }
    
    return new Response(JSON.stringify({ message: "Notification handled" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error handling notification:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});