// src/app/admin/polls/page.tsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { convertFileUrlToHtml } from "@/lib/fileExtractor";
import { Modal } from "@/components/ui/modal";
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
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState<string>("Loading...");
  const [modalTitle, setModalTitle] = useState<string>("");
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const router = useRouter();

  // Authentication and role check useEffect
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
      } else {
        // Fetch user role
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("role")
          .eq("id", session.user.id)
          .single();

        if (userError || !userData) {
          alert("Failed to fetch user role");
          router.push("/login");
          return;
        }

        if (userData.role === "user") {
          router.push("/polls");
        } else if (userData.role === "admin") {
          fetchPolls();
        } else {
          alert("Unknown user role");
          router.push("/login");
        }
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
    if (error) console.error("Error fetching polls:", error.message);
    else setPolls(data || []);
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

        const { error: uploadError } = await supabase.storage
          .from("poll-files")
          .upload(filePath, file);
        if (uploadError) throw uploadError;

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
      const { error } = await supabase.from("polls").upsert({
        id: editingId,
        question,
        option1: options[0],
        option2: options[1],
        option3: options[2],
        option4: options[3],
        ...(fileUrl && { file_url: fileUrl }),
        ...(fileType && { file_type: fileType }),
      });
      if (error) console.error("Error updating poll:", error.message);
      else {
        resetForm();
        fetchPolls();
      }
    } else {
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
      if (error) console.error("Error creating poll:", error.message);
      else {
        resetForm();
        fetchPolls();
      }
    }

    setLoading(false);
  };

  const handleDeletePoll = async (id: string, fileUrl?: string) => {
    try {
      if (fileUrl) {
        const filePath = fileUrl.split("/poll-files/")[1];
        if (filePath) {
          await supabase.storage.from("poll-files").remove([`polls/${filePath}`]);
        }
      }
      await supabase.from("polls").delete().eq("id", id);
      fetchPolls();
    } catch (err) {
      console.error("Unexpected error deleting poll:", err);
    }
  };

  const handleEditPoll = (poll: Poll) => {
    setEditingId(poll.id);
    setQuestion(poll.question);
    setOptions([poll.option1, poll.option2, poll.option3, poll.option4]);
    setFile(null);
  };

  const resetForm = () => {
    setEditingId(null);
    setQuestion("");
    setOptions(["", "", "", ""]);
    setFile(null);
  };

  const handleViewExtractedText = async (poll: Poll) => {
    if (!poll.file_url || !poll.file_type) return;
    setModalTitle(`Extracted Text for: ${poll.question}`);
    setShowModal(true);
    try {
      const html = await convertFileUrlToHtml(poll.file_url, poll.file_type);
      setModalContent(html);
    } catch (err) {
      setModalContent("Failed to extract text.");
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
    <div className="p-6 max-w-7xl mx-auto flex flex-col md:flex-row space-y-8 md:space-y-0 md:space-x-8 items-start">
      {/* Left Column: Form */}
      <div className="md:w-1/3 p-6 bg-white rounded-xl shadow-lg border border-gray-200">
        <h1 className="text-xl font-semibold mb-6 text-center">Admin: Manage Polls</h1>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Poll question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full border border-gray-300 p-2 rounded-md focus:ring-blue-500 focus:border-blue-500"
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
              className="w-full border border-gray-300 p-2 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          ))}
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <Button onClick={handleSavePoll} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-md">
            {loading ? "Saving..." : editingId ? "Update Poll" : "Create Poll"}
          </Button>
          {editingId && (
            <Button variant="secondary" onClick={resetForm} className="w-full mt-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 rounded-md">
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Right Column: Existing Polls */}
      <div className="flex-1 p-6 bg-white rounded-xl shadow-lg border border-gray-200">
        <h2 className="text-xl font-semibold mb-6 text-center">Existing Polls</h2>
        <ul className="space-y-4">
          {polls.map((poll) => (
            <li
              key={poll.id}
              className="p-4 rounded-lg shadow-sm border border-gray-200 bg-gray-50"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-lg mb-1">{poll.question}</h3>
                  <ul className="list-disc ml-5 text-gray-700 space-y-1">
                    <li>{poll.option1}</li>
                    <li>{poll.option2}</li>
                    <li>{poll.option3}</li>
                    <li>{poll.option4}</li>
                  </ul>
                  {poll.file_url && (
                    <div className="flex space-x-2 items-center mt-3">
                      <a
                        href={poll.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline font-medium"
                      >
                        Download File
                      </a>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewExtractedText(poll)}
                        className="text-blue-600 border-blue-600 hover:bg-blue-50"
                      >
                        View Text
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col space-y-2 ml-4">
                  <Button
                    onClick={() => handleEditPoll(poll)}
                    className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleDeletePoll(poll.id, poll.file_url)}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-4xl max-h-[80vh] rounded-lg shadow-lg p-6 relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 p-2 text-2xl font-semibold z-20 bg-white rounded-full leading-none"
            >
              &times;
            </button>
            <div className="overflow-y-auto max-h-[calc(80vh-4rem)]">
              <h2 className="text-xl font-bold mb-4">{modalTitle}</h2>
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: modalContent }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}