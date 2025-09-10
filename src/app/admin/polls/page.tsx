"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

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
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  // Track editing state
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPolls();
  }, []);

  const fetchPolls = async () => {
    const { data, error } = await supabase
      .from("polls")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching polls:", error.message);
    } else {
      setPolls(data || []);
    }
  };

  const handleSavePoll = async () => {
    if (!question.trim() || options.some((opt) => !opt.trim())) {
      alert("Please fill in the question and all 4 options.");
      return;
    }

    setLoading(true);

    let fileUrl: string | null = null;
    let fileType: string | null = null;

    if (file) {
      try {
        const ext = file.name.split(".").pop();
        const uniqueName = `${crypto.randomUUID()}.${ext}`;
        const filePath = `polls/${uniqueName}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from("poll-files")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data } = supabase.storage
          .from("poll-files")
          .getPublicUrl(filePath);

        fileUrl = data.publicUrl;
        fileType = file.type;
      } catch (err) {
        console.error("File upload failed:", err);
      }
    }

    if (editingId) {
      // ✅ Update existing poll using upsert with id
      const { error } = await supabase.from("polls").upsert({
        id: editingId, // include id so Supabase updates instead of inserting
        question,
        option1: options[0],
        option2: options[1],
        option3: options[2],
        option4: options[3],
        ...(fileUrl && { file_url: fileUrl }),
        ...(fileType && { file_type: fileType }),
      });

      if (error) {
        console.error("Error updating poll:", error.message);
      } else {
        resetForm();
        fetchPolls();
      }
    } else {
      // Create new poll
      const { error } = await supabase.from("polls").insert([
        {
          question,
          option1: options[0],
          option2: options[1],
          option3: options[2],
          option4: options[3],
          file_url: fileUrl,
          file_type: fileType,
        },
      ]);

      if (error) {
        console.error("Error creating poll:", error.message);
      } else {
        resetForm();
        fetchPolls();
      }
    }

    setLoading(false);
  };

  const handleDeletePoll = async (id: string, fileUrl?: string) => {
    try {
      // Delete file from storage if exists
      if (fileUrl) {
        const filePath = fileUrl.split("/poll-files/")[1];
        if (filePath) {
          const { error: storageError } = await supabase.storage
            .from("poll-files")
            .remove([`polls/${filePath.split("polls/")[1]}`]);

          if (storageError) {
            console.error(
              "Error deleting file from storage:",
              storageError.message
            );
          }
        }
      }

      // Delete poll record
      const { error } = await supabase.from("polls").delete().eq("id", id);
      if (error) {
        console.error("Error deleting poll:", error.message);
      } else {
        fetchPolls();
      }
    } catch (err) {
      console.error("Unexpected error deleting poll:", err);
    }
  };

  const handleEditPoll = (poll: Poll) => {
    setEditingId(poll.id);
    setQuestion(poll.question);
    setOptions([poll.option1, poll.option2, poll.option3, poll.option4]);
    setFile(null); // new file optional
  };

  const resetForm = () => {
    setEditingId(null);
    setQuestion("");
    setOptions(["", "", "", ""]);
    setFile(null);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Admin: Manage Polls</h1>

      {/* Create / Edit Poll Form */}
      <div className="space-y-4 border p-4 rounded-lg shadow">
        <input
          type="text"
          placeholder="Poll question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="w-full border p-2 rounded"
        />

        {options.map((opt, idx) => (
          <input
            key={idx}
            type="text"
            placeholder={`Option ${idx + 1}`}
            value={opt}
            onChange={(e) => {
              const newOpts = [...options];
              newOpts[idx] = e.target.value;
              setOptions(newOpts);
            }}
            className="w-full border p-2 rounded"
          />
        ))}

        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        <div className="flex space-x-2">
          <Button onClick={handleSavePoll} disabled={loading}>
            {loading ? "Saving..." : editingId ? "Update Poll" : "Create Poll"}
          </Button>
          {editingId && (
            <Button variant="secondary" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Existing Polls */}
      <h2 className="text-xl font-semibold mt-6">Existing Polls</h2>
      <ul className="space-y-3 mt-3">
        {polls.map((poll) => (
          <li
            key={poll.id}
            className="border p-3 rounded flex justify-between items-start"
          >
            <div>
              <p className="font-bold">{poll.question}</p>
              <ul className="list-disc ml-5">
                <li>{poll.option1}</li>
                <li>{poll.option2}</li>
                <li>{poll.option3}</li>
                <li>{poll.option4}</li>
              </ul>

              {poll.file_url &&
                (poll.file_type?.startsWith("image/") ? (
                  <img
                    src={poll.file_url}
                    alt="Poll Attachment"
                    className="mt-2 max-w-xs rounded"
                  />
                ) : (
                  <a
                    href={poll.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline mt-2 block"
                  >
                    Download File
                  </a>
                ))}
            </div>
            <div className="flex flex-col space-y-2">
              <Button onClick={() => handleEditPoll(poll)}>Edit</Button>
              <Button
                variant="destructive"
                onClick={() => handleDeletePoll(poll.id, poll.file_url)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
