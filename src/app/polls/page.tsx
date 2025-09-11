"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { CheckCheck, Download, FileText, X, TrendingUp } from "lucide-react";
import { PollResultsModal } from "@/components/polls/PollResultsModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { convertFileUrlToHtml } from "@/lib/fileExtractor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  const [votedPolls, setVotedPolls] = useState<Set<string>>(new Set());
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [userVotes, setUserVotes] = useState<Record<string, string>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPoll, setSelectedPoll] = useState<Poll | null>(null);
  const [showFileModal, setShowFileModal] = useState(false);
  const [fileModalContent, setFileModalContent] = useState<string>("Loading...");
  const [fileModalTitle, setFileModalTitle] = useState<string>("");

  const router = useRouter();

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
          alert("Failed to fetch user role");
          router.push("/login");
          return;
        }

        if (userData.role === "admin") {
          router.push("/admin/polls");
        } else if (userData.role === "user") {
          fetchPolls(session.user.id);
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

  const handleVote = async (pollId: string) => {
    if (!selectedOption[pollId]) return alert("Please select an option!");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push("/login");
      return;
    }

    if (votedPolls.has(pollId)) {
      alert("You have already voted on this poll!");
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
      alert("Failed to submit vote. Please try again.");
    } else {
      alert("Vote submitted successfully!");
      setVotedPolls((prev) => new Set(prev).add(pollId));
      setUserVotes((prev) => ({ ...prev, [pollId]: selectedOption[pollId] }));
      setSelectedOption((prev) => ({ ...prev, [pollId]: "" }));
    }
  };

  const openResultsModal = (poll: Poll) => {
    setSelectedPoll(poll);
    setIsModalOpen(true);
  };

  const closeResultsModal = () => {
    setIsModalOpen(false);
    setSelectedPoll(null);
  };

  const handleViewFile = async (poll: Poll) => {
    if (!poll.file_url || !poll.file_type) return;
    setShowFileModal(true);
    setFileModalTitle(`Description for: ${poll.question}`);
    setFileModalContent("Loading...");
    if (poll.file_type.startsWith('image/')) {
      setFileModalContent(`<img src="${poll.file_url}" alt="Poll description" class="w-full h-auto object-contain rounded-md" />`);
    } else {
      try {
        const html = await convertFileUrlToHtml(poll.file_url, poll.file_type);
        setFileModalContent(html);
      } catch (err) {
        setFileModalContent("Failed to extract text.");
      }
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
      alert('Failed to download the file.');
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
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8 text-center">Available Polls</h1>
      <div className="space-y-8">
        {polls.map((poll) => {
          const hasVoted = votedPolls.has(poll.id);
          const votedOption = userVotes[poll.id];

          return (
            <Card key={poll.id} className="p-6">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="flex justify-between items-center text-xl font-semibold text-gray-800">
                  <span>{poll.question}</span>
                  {hasVoted && (
                    <div className="flex items-center text-green-500 font-medium text-sm">
                      <CheckCheck className="w-5 h-5 mr-1" /> Voted
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[poll.option1, poll.option2, poll.option3, poll.option4].map((opt, idx) => {
                    const isSelected = selectedOption[poll.id] === opt;
                    const isVotedOption = hasVoted && votedOption === opt;

                    return (
                      <button
                        key={idx}
                        className={`
                          w-full p-4 rounded-lg text-left transition-colors duration-200
                          ${hasVoted 
                            ? 'bg-gray-100 cursor-not-allowed' 
                            : isSelected 
                              ? 'bg-blue-100 border-2 border-blue-500 text-blue-800' 
                              : 'bg-gray-50 hover:bg-gray-100'
                          }
                          ${isVotedOption ? 'border-2 border-green-500 bg-green-50' : ''}
                        `}
                        onClick={() => !hasVoted && setSelectedOption(prev => ({ ...prev, [poll.id]: opt }))}
                        disabled={hasVoted}
                      >
                        <div className="flex items-center justify-between">
                          <span>{opt}</span>
                          {isVotedOption && (
                            <CheckCheck className="text-green-600 w-5 h-5 ml-2" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {poll.file_url && (
                  <div className="flex space-x-2 items-center mt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDirectDownload(poll.file_url!)}
                      className="flex items-center space-x-1 text-blue-600 hover:bg-blue-50"
                    >
                      <Download size={18} />
                      <span>Download File</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewFile(poll)}
                      className="flex items-center space-x-1 text-blue-600 hover:bg-blue-50"
                    >
                      <FileText size={18} />
                      <span>View File</span>
                    </Button>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 mt-6">
                  {!hasVoted && (
                    <Button className="flex-1" onClick={() => handleVote(poll.id)}>
                      Submit Vote
                    </Button>
                  )}
                  <Button variant="outline" className="flex-1" onClick={() => openResultsModal(poll)}>
                    Show Results
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {selectedPoll && (
        <PollResultsModal
          pollId={selectedPoll.id}
          question={selectedPoll.question}
          options={[selectedPoll.option1, selectedPoll.option2, selectedPoll.option3, selectedPoll.option4]}
          isOpen={isModalOpen}
          onClose={closeResultsModal}
        />
      )}
      {showFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl p-6 overflow-hidden">
            <button
              onClick={() => setShowFileModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-20"
              aria-label="Close modal"
            >
              <X size={28} />
            </button>
            <div className="overflow-y-auto max-h-[calc(90vh-3rem)] pr-4">
              <h2 className="text-2xl font-bold mb-4 text-gray-800">
                {fileModalTitle}
              </h2>
              <div
                className="prose max-w-none text-gray-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: fileModalContent }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 