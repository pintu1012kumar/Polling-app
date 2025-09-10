// src/app/admin/polls/page.tsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { convertFileUrlToHtml } from "@/lib/fileExtractor";
import { useRouter } from "next/navigation";
import {
  PlusCircle,
  Pencil,
  Trash2,
  FileText,
  Download,
  X,
  RefreshCw,
} from "lucide-react";

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
      const {
        data: { session },
      } = await supabase.auth.getSession();
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

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session) {
          router.push("/login");
        }
      }
    );

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
    setModalContent("Loading...");
    try {
      const html = await convertFileUrlToHtml(poll.file_url, poll.file_type);
      setModalContent(html);
    } catch (err) {
      setModalContent("Failed to extract text.");
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="flex flex-col items-center">
          <RefreshCw className="h-10 w-10 text-blue-500 animate-spin" />
          <span className="mt-4 text-xl font-medium text-gray-700">
            Loading...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Form Card */}
        <div className="md:col-span-1 p-6 bg-white rounded-2xl shadow-xl border border-gray-200 h-fit sticky top-8">
          <h1 className="text-2xl font-bold mb-6 text-gray-800 text-center">
            {editingId ? "Edit Poll" : "Create New Poll"}
          </h1>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Enter poll question"
              value={question}
              onChange={(e) => {
                if (e.target.value.length <= 50) {
                  setQuestion(e.target.value);
                }
              }}
              className="w-full border border-gray-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            />
            {options.map((opt, idx) => (
              <input
                key={idx}
                type="text"
                placeholder={`Option ${idx + 1}`}
                value={opt}
                onChange={(e) => {
                  if (e.target.value.length <= 10) {
                    const newOpts = [...options];
                    newOpts[idx] = e.target.value;
                    setOptions(newOpts);
                  }
                }}
                className="w-full border border-gray-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
              />
            ))}
            <div className="relative border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-blue-500 transition-colors duration-200">
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center">
                <PlusCircle className="h-6 w-6 text-gray-400" />
                <span className="mt-2 text-sm text-gray-600">
                  {file ? file.name : "Click to add a file (optional)"}
                </span>
              </div>
            </div>
            <Button
              onClick={handleSavePoll}
              disabled={loading}
              className="w-full text-white font-bold py-3 rounded-xl flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : editingId ? (
                <>
                  <Pencil className="h-4 w-4" />
                  <span>Update Poll</span>
                </>
              ) : (
                <>
                  <PlusCircle className="h-4 w-4" />
                  <span>Create Poll</span>
                </>
              )}
            </Button>
            {editingId && (
              <Button
                variant="secondary"
                onClick={resetForm}
                className="w-full mt-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-xl"
              >
                Cancel
              </Button>
            )}
          </div>
        </div>

        {/* Existing Polls Card List */}
        <div className="md:col-span-2 p-6 bg-white rounded-2xl shadow-xl border border-gray-200">
          <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">
            Existing Polls
          </h2>
          <ul className="space-y-6">
            {polls.length > 0 ? (
              polls.map((poll) => (
                <li
                  key={poll.id}
                  className="p-6 rounded-xl shadow-lg border border-gray-200 bg-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center"
                >
                  <div className="flex-1 mb-4 md:mb-0">
                    <h3 className="font-bold text-xl mb-2 text-gray-800">
                      {poll.question}
                    </h3>
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
                          download
                          className="flex items-center space-x-1 text-blue-600 hover:underline font-medium"
                        >
                          <Download size={18} />
                          <span>Download File</span>
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewExtractedText(poll)}
                          className="flex items-center space-x-1 text-blue-600 hover:bg-blue-50"
                        >
                          <FileText size={18} />
                          <span>View File</span>
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      onClick={() => handleEditPoll(poll)}
                      className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-xl flex items-center space-x-1"
                    >
                      <Pencil size={18} />
                      <span>Edit</span>
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleDeletePoll(poll.id, poll.file_url)}
                      className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-xl flex items-center space-x-1"
                    >
                      <Trash2 size={18} />
                      <span>Delete</span>
                    </Button>
                  </div>
                </li>
              ))
            ) : (
              <p className="text-center text-gray-500 text-lg">
                No polls created yet.
              </p>
            )}
          </ul>
        </div>
      </div>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl p-6 overflow-hidden">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-20"
              aria-label="Close modal"
            >
              <X size={28} />
            </button>
            <div className="overflow-y-auto max-h-[calc(90vh-3rem)] pr-4">
              <h2 className="text-2xl font-bold mb-4 text-gray-800">
                {modalTitle}
              </h2>
              <div
                className="prose max-w-none text-gray-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: modalContent }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}