"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { CheckCheck, Download, FileText, X, RefreshCw, Terminal, BarChart as BarChartIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { convertFileUrlToHtml } from "@/lib/fileExtractor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

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

export default function PollsPage() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [selectedOption, setSelectedOption] = useState<Record<string, string>>({});
  const [votedPolls, setVotedPolls] = useState<Set<string>>(new Set());
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [userVotes, setUserVotes] = useState<Record<string, string>>({});
  
  // States for the File Modal
  const [showFileModal, setShowFileModal] = useState(false);
  const [fileModalContent, setFileModalContent] = useState<string>("");
  const [fileModalTitle, setFileModalTitle] = useState<string>("");
  const [isFileLoading, setIsFileLoading] = useState(false);

  // States for the Poll Results Modal
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

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
      } else {
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("role")
          .eq("id", session.user.id)
          .single();

        if (userError || !userData) {
          showAlert("Error", "Failed to fetch user role", "destructive");
          router.push("/login");
          return;
        }

        if (userData.role === "admin") {
          router.push("/admin/polls");
        } else if (userData.role === "user") {
          fetchPolls(session.user.id);
        } else {
          showAlert("Error", "Unknown user role", "destructive");
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

  const fetchPolls = async (userId: string) => {
    const { data: pollData, error: pollError } = await supabase
      .from("polls")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: responseData, error: responseError } = await supabase
      .from("poll_responses")
      .select("poll_id, selected_option")
      .eq("user_id", userId);

    if (pollError || responseError) {
      console.error(pollError || responseError);
      showAlert("Error", "Failed to fetch polls.", "destructive");
      return;
    }

    if (pollData) setPolls(pollData);

    if (responseData) {
      const votedIds = new Set(responseData.map((response) => response.poll_id));
      setVotedPolls(votedIds);

      const votes = responseData.reduce((acc, current) => {
        acc[current.poll_id] = current.selected_option;
        return acc;
      }, {} as Record<string, string>);
      setUserVotes(votes);
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

  const handleVote = async (pollId: string) => {
    if (!selectedOption[pollId]) {
      showAlert("Info", "Please select an option!", "default");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push("/login");
      return;
    }

    if (votedPolls.has(pollId)) {
      showAlert("Info", "You have already voted on this poll!", "default");
      return;
    }

    const { error } = await supabase.from("poll_responses").insert([
      {
        poll_id: pollId,
        user_id: session.user.id,
        selected_option: selectedOption[pollId],
      },
    ]);

    if (error) {
      console.error(error);
      showAlert("Error", "Failed to submit vote. Please try again.", "destructive");
    } else {
      showAlert("Success", "Vote submitted successfully!", "default");
      setVotedPolls((prev: Set<string>) => new Set(prev).add(pollId));
      setUserVotes((prev: Record<string, string>) => ({ ...prev, [pollId]: selectedOption[pollId] }));
      setSelectedOption((prev: Record<string, string>) => ({ ...prev, [pollId]: "" }));
    }
  };

  const handleViewFile = async (poll: Poll) => {
    if (!poll.file_url || !poll.file_type) return;

    setShowFileModal(true);
    setFileModalTitle(`Description for: ${poll.question}`);
    setIsFileLoading(true);
    setFileModalContent("");

    try {
      if (poll.file_type.startsWith('image/')) {
        setFileModalContent(`<img src="${poll.file_url}" alt="Poll description" class="w-full h-auto object-contain rounded-md" />`);
      } else {
        const html = await convertFileUrlToHtml(poll.file_url, poll.file_type);
        setFileModalContent(html);
      }
    } catch (err) {
      setFileModalContent("Failed to load file content.");
    } finally {
      setIsFileLoading(false);
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
      <div className="flex justify-center items-center h-screen text-lg">
        Loading...
      </div>
    );
  }

  return (
    <div className="p-4 max-w-xl mx-auto">
      {/* Shadcn Alert */}
      {alert.show && (
        <div className="fixed top-4 right-4 z-[9999]">
          <Alert variant={alert.variant} className="w-[300px]">
            <Terminal className="h-4 w-4" />
            <AlertTitle>{alert.title}</AlertTitle>
            <AlertDescription>{alert.description}</AlertDescription>
          </Alert>
        </div>
      )}

      <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">Available Polls</h1>
      <div className="space-y-6">
        {polls.map((poll) => {
          const hasVoted = votedPolls.has(poll.id);
          const votedOption = userVotes[poll.id];

          return (
            <Card key={poll.id} className="p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300">
              <CardHeader className="p-0 mb-3">
                <CardTitle className="flex justify-between items-center text-lg font-semibold text-gray-800">
                  <span>{poll.question}</span>
                  {hasVoted && (
                    <div className="flex items-center text-black font-medium text-sm">
                      <CheckCheck className="w-4 h-4 mr-1" /> Voted
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <RadioGroup
                  onValueChange={(value) => setSelectedOption((prev) => ({ ...prev, [poll.id]: value }))}
                  value={selectedOption[poll.id] || ""}
                  className="grid grid-cols-1 gap-2"
                  disabled={hasVoted}
                >
                  {[poll.option1, poll.option2, poll.option3, poll.option4].map((opt, idx) => {
                    const isVotedOption = hasVoted && votedOption === opt;
                    const isSelected = selectedOption[poll.id] === opt;

                    return (
                      <div key={idx} className={`flex items-center space-x-2 p-3 rounded-md transition-colors duration-200
                        ${hasVoted
                            ? isVotedOption
                              ? 'bg-gray-100 text-black-800'
                              : 'bg-gray-50 text-gray-500 cursor-not-allowed'
                            : isSelected
                              ? 'bg-gray-100 border-2 border-black'
                              : 'bg-gray-50 hover:bg-gray-100'
                        }
                      `}>
                        <RadioGroupItem
                          value={opt}
                          id={`${poll.id}-option-${idx}`}
                          className="!pointer-events-auto"
                        />
                        <Label
                          htmlFor={`${poll.id}-option-${idx}`}
                          className="w-full cursor-pointer text-sm font-normal"
                        >
                          {opt}
                        </Label>
                        {isVotedOption && (
                            <CheckCheck className="text-black w-4 h-4 ml-auto" />
                        )}
                      </div>
                    );
                  })}
                </RadioGroup>

                {poll.file_url && (
                  <div className="flex space-x-2 items-center mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDirectDownload(poll.file_url!)}
                      className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900"
                    >
                      <Download size={16} />
                      <span>Download File</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewFile(poll)}
                      className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900"
                    >
                      <FileText size={16} />
                      <span>View File</span>
                    </Button>
                  </div>
                )}

                <div className="flex justify-between items-center mt-4">
                  <Button variant="ghost" onClick={() => handleShowResults(poll)}>
                    <BarChartIcon size={16} className="mr-2" />
                    Show Results
                  </Button>
                  {!hasVoted && (
                    <Button onClick={() => handleVote(poll.id)}>
                      Submit Vote
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
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
              <RefreshCw className="h-10 w-10 text-black-500 animate-spin" />
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

      {/* File Viewer Modal */}
      {showFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden">
            <div className="sticky top-0 bg-white flex justify-between items-center p-4 border-b z-10">
              <h2 className="text-xl font-bold text-gray-800">
                {fileModalTitle}
              </h2>
              <button
                onClick={() => setShowFileModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close modal"
              >
                <X size={24} />
              </button>
            </div>
            
            {isFileLoading ? (
              <div className="flex justify-center items-center h-[50vh]">
                <RefreshCw className="h-10 w-10 text-black animate-spin" />
              </div>
            ) : (
              <div className="p-4 overflow-y-auto max-h-[calc(90vh-70px)]">
                <div
                  className="prose max-w-none text-gray-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: fileModalContent }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}