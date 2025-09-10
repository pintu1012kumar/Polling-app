// src/app/polls/page.tsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface Poll {
  id: string;
  question: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  file_url?: string;
  file_type?: string;
  created_at: string;
}

export default function PollsPage() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [selectedOption, setSelectedOption] = useState<Record<string, string>>({});
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const router = useRouter();

  // Authentication check useEffect
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
      } else {
        fetchPolls();
      }
      setIsAuthLoading(false);
    };

    checkAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        router.push("/login");
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [router]);

  const fetchPolls = async () => {
    const { data, error } = await supabase
      .from("polls")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setPolls(data);
  };

  const handleVote = async (pollId: string) => {
    if (!selectedOption[pollId]) return alert("Please select an option!");

    const { error } = await supabase.from("poll_responses").insert([
      {
        poll_id: pollId,
        selected_option: selectedOption[pollId],
      },
    ]);

    if (error) {
      console.error(error);
    } else {
      alert("Vote submitted successfully!");
      setSelectedOption((prev) => ({ ...prev, [pollId]: "" }));
    }
  };

  // Render a loading spinner or message while authentication is being checked
  if (isAuthLoading) {
    return (
      <div className="flex justify-center items-center h-screen text-lg">
        Loading...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Available Polls</h1>

      <div className="space-y-6">
        {polls.map((poll) => (
          <div key={poll.id} className="border p-4 rounded-lg shadow">
            <h2 className="text-lg font-semibold">{poll.question}</h2>

            <div className="mt-3 space-y-2">
              {[poll.option1, poll.option2, poll.option3, poll.option4].map((opt, idx) => (
                <label key={idx} className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name={`poll-${poll.id}`}
                    value={opt}
                    checked={selectedOption[poll.id] === opt}
                    onChange={(e) =>
                      setSelectedOption((prev) => ({ ...prev, [poll.id]: e.target.value }))
                    }
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>

            {poll.file_url && (
              <a
                href={poll.file_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline mt-3 block"
              >
                View {poll.file_type}
              </a>
            )}

            <Button className="mt-3" onClick={() => handleVote(poll.id)}>
              Submit Vote
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}