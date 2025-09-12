"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
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
  BarChart as BarChartIcon,
  Terminal,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Interfaces for data types
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

interface PollResult {
  name: string;
  votes: number;
}

export default function AdminPollsPage() {
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

  // State for the poll results modal
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
  const [selectedPoll, setSelectedPoll] = useState<Poll | null>(null);
  const [pollResults, setPollResults] = useState<PollResult[]>([]);
  const [isResultsLoading, setIsResultsLoading] = useState(false);

  // State for shadcn alert
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

  // State for shadcn delete confirmation dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pollToDelete, setPollToDelete] = useState<{
    id: string;
    fileUrl?: string;
  } | null>(null);

  const [isModalContentLoading, setIsModalContentLoading] = useState(false); // New state for modal loading

  const router = useRouter();

  // Helper function to show alerts
  const showAlert = (
    title: string,
    description: string,
    variant: "default" | "destructive" = "default"
  ) => {
    setAlert({ show: true, title, description, variant });
    setTimeout(() => {
      setAlert((prev) => ({ ...prev, show: false }));
    }, 5000); // Alert disappears after 5 seconds
  };

  // Helper function to handle delete confirmation
  const confirmDeletePoll = (id: string, fileUrl?: string) => {
    setPollToDelete({ id, fileUrl });
    setShowDeleteConfirm(true);
  };

  // Authentication and role check
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("role")
        .eq("id", session.user.id)
        .single();
      if (userError || !userData || userData.role !== "admin") {
        showAlert(
          "Access Denied",
          "You do not have permission to view this page.",
          "destructive"
        );
        router.push("/login");
        return;
      }
      fetchPolls();
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

  // Fetches all polls for the admin dashboard
  const fetchPolls = async () => {
    const { data, error } = await supabase
      .from("polls")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching polls:", error.message);
      showAlert("Error", "Failed to fetch polls.", "destructive");
    } else {
      setPolls(data || []);
    }
  };

  const handleShowResults = async (poll: Poll) => {
    setSelectedPoll(poll);
    setIsResultsModalOpen(true);
    setIsResultsLoading(true);

    const { data: responses, error } = await supabase
      .from("poll_responses")
      .select("selected_option")
      .eq("poll_id", poll.id);

    if (error) {
      console.error("Error fetching poll results:", error);
      showAlert("Error", "Failed to fetch poll results.", "destructive");
      setIsResultsLoading(false);
      return;
    }

    const voteCounts = responses.reduce((acc, current) => {
      acc[current.selected_option] = (acc[current.selected_option] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const chartData = [
      poll.option1,
      poll.option2,
      poll.option3,
      poll.option4,
    ].map((option) => ({
      name: option,
      votes: voteCounts[option] || 0,
    }));

    setPollResults(chartData);
    setIsResultsLoading(false);
  };

  const handleSavePoll = async () => {
    if (!question.trim() || options.some((opt) => !opt.trim())) {
      showAlert(
        "Validation Error",
        "Please fill in the question and all 4 options.",
        "destructive"
      );
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
        showAlert(
          "Error",
          "File upload failed. Please try again.",
          "destructive"
        );
        setLoading(false);
        return;
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
      if (error) {
        console.error("Error updating poll:", error.message);
        showAlert("Error", "Failed to update poll.", "destructive");
      } else {
        showAlert("Success", "Poll updated successfully.", "default");
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
      if (error) {
        console.error("Error creating poll:", error.message);
        showAlert("Error", "Failed to create poll.", "destructive");
      } else {
        showAlert("Success", "Poll created successfully.", "default");
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
      showAlert("Success", "Poll deleted successfully.", "default");
      fetchPolls();
    } catch (err) {
      console.error("Unexpected error deleting poll:", err);
      showAlert("Error", "Failed to delete poll.", "destructive");
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
    setIsModalContentLoading(true); // Set loading to true
    setModalContent(""); // Clear previous content
    try {
      const html = await convertFileUrlToHtml(poll.file_url, poll.file_type);
      setModalContent(html);
    } catch (err) {
      setModalContent("Failed to extract text.");
      showAlert("Error", "Failed to extract text from the file.", "destructive");
    } finally {
      setIsModalContentLoading(false); // Set loading to false when done
    }
  };

  const handleDirectDownload = async (fileUrl: string) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const filename = fileUrl.split('/').pop();
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = filename || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading the file:', error);
      showAlert("Error", "Failed to download the file.", "destructive");
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="flex flex-col items-center">
          <RefreshCw className="h-10 w-10 text-black animate-spin" />
          <span className="mt-4 text-xl font-medium text-gray-700">
            Loading...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      {/* Shadcn Alert */}
      {alert.show && (
        <div className="fixed bottom-4 right-4 z-[9999]">
          <Alert variant={alert.variant} className="w-[300px]">
            <Terminal className="h-4 w-4" />
            <AlertTitle>{alert.title}</AlertTitle>
            <AlertDescription>{alert.description}</AlertDescription>
          </Alert>
        </div>
      )}

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Form Card */}
        <Card className="md:col-span-1 h-fit sticky top-8">
          <CardHeader>
            <CardTitle className="text-center">{editingId ? "Edit Poll" : "Create New Poll"}</CardTitle>
            <CardDescription className="text-center">
              Fill out the details to create a new poll.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="question">Poll Question</Label>
                <Input
                  id="question"
                  type="text"
                  placeholder="Enter poll question"
                  value={question}
                  onChange={(e) => {
                    if (e.target.value.length <= 50) {
                      setQuestion(e.target.value);
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Options</Label>
                {options.map((opt, idx) => (
                  <Input
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
                  />
                ))}
              </div>
              <div className="grid w-full max-w-sm items-center gap-3">
                <Label htmlFor="file">Description File</Label>
                <Input
                  id="file"
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
              <Button
                onClick={handleSavePoll}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : editingId ? (
                  <>
                    <Pencil className="h-4 w-4 mr-2" />
                    <span>Update Poll</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    <span>Create Poll</span>
                  </>
                )}
              </Button>
              {editingId && (
                <Button
                  variant="secondary"
                  onClick={resetForm}
                  className="w-full mt-2"
                >
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Existing Polls Card List */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-center">Existing Polls</CardTitle>
            <CardDescription className="text-center">
              Manage all created polls.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-6">
              {polls.length > 0 ? (
                polls.map((poll) => (
                  <Card key={poll.id} className="p-6">
                    <CardHeader className="p-0 mb-0">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-xl font-bold">
                          {poll.question}
                        </CardTitle>
                        {/* Description button on the top right */}
                        {poll.file_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewExtractedText(poll)}
                            className="flex items-center space-x-1"
                          >
                            <FileText size={18} />
                            <span>Description</span>
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ul className="list-disc ml-5 text-gray-700 space-y-1">
                        <li>{poll.option1}</li>
                        <li>{poll.option2}</li>
                        <li>{poll.option3}</li>
                        <li>{poll.option4}</li>
                      </ul>
                      
                      <div className="mt-4 flex justify-between items-center">
                        {/* Download button on the bottom left */}
                        <div className="flex space-x-2">
                          {poll.file_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDirectDownload(poll.file_url!)}
                              className="p-0 text-gray-500 hover:text-black"
                            >
                              <Download size={18} />
                              <span>Download File</span>
                            </Button>
                          )}
                        </div>
                        
                        {/* Remaining buttons on the bottom right */}
                        <div className="flex space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-0 text-gray-500 hover:text-black"
                            onClick={() => handleShowResults(poll)}
                          >
                            <BarChartIcon size={18} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditPoll(poll)}
                            className="p-0 text-gray-500 hover:text-black"
                          >
                            <Pencil size={18} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => confirmDeletePoll(poll.id, poll.file_url)}
                            className="p-0 text-gray-500 hover:text-black"
                          >
                            <Trash2 size={18} />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p className="text-center text-gray-500 text-lg">
                  No polls created yet.
                </p>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* File Viewer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

          {/* Modal container */}
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden">
            
            {/* Sticky Header with Title + Close Button */}
            <div className="sticky top-0 bg-white flex justify-between items-center p-4 border-b z-10">
              <h2 className="text-xl font-bold text-gray-800">
                {modalTitle}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close modal"
              >
                <X size={24} />
              </button>
            </div>

            {/* Conditional Content based on loading state */}
            {isModalContentLoading ? (
              <div className="flex justify-center items-center h-[50vh]">
                <RefreshCw className="h-10 w-10 text-black animate-spin" />
              </div>
            ) : (
              // Scrollable Content
              <div className="p-4 overflow-y-auto max-h-[calc(90vh-70px)]">
                <div
                  className="prose max-w-none text-gray-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: modalContent }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Poll Results Modal */}
      <Dialog open={isResultsModalOpen} onOpenChange={setIsResultsModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Poll Results
            </DialogTitle>
            <DialogDescription className="text-gray-800 font-semibold">{selectedPoll?.question}</DialogDescription>
          </DialogHeader>
          {isResultsLoading ? (
            <div className="flex justify-center items-center h-48">
              Loading results...
            </div>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pollResults} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                  <XAxis dataKey="name" interval={0} angle={-30} textAnchor="end" height={50} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="votes" fill="#3b82f6" name="Votes" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the poll.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pollToDelete) {
                  handleDeletePoll(pollToDelete.id, pollToDelete.fileUrl);
                  setPollToDelete(null);
                  setShowDeleteConfirm(false);
                }
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}