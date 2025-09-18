"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import {
  CheckCheck,
  Download,
  X,
  Vote,
  Loader2,
  Calendar,
  HourglassIcon,
  MessageCircle,
  Search,
  Filter,
  TrendingUp,
  Clock,
  Eye,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { convertFileUrlToHtml } from "@/lib/fileExtractor"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import PollResultsGraph from "@/components/PollResultsGraph"
import PollComments from "../../components/PollComments"
import { toast } from "sonner"

// Interfaces for data types
interface Poll {
  id: string
  question: string
  option1: string
  option2: string
  option3: string
  option4: string
  poll_type: "single" | "multiple" | "ranked"
  file_url?: string
  file_type?: string
  created_at: string
  start_at?: string
  end_at?: string
  tags?: string[]
}

interface PollResult {
  name: string
  votes: number
}

// Predefined categories for the dropdown
const pollCategories = [
  { value: "technology", label: "Technology" },
  { value: "politics", label: "Politics" },
  { value: "sports", label: "Sports" },
  { value: "entertainment", label: "Entertainment" },
  { value: "science", label: "Science" },
]

export default function PollsPage() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({})
  const [votedPolls, setVotedPolls] = useState<Set<string>>(new Set())
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [userVotes, setUserVotes] = useState<Record<string, string[]>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [showFileModal, setShowFileModal] = useState(false)
  const [fileModalContent, setFileModalContent] = useState<string>("")
  const [fileModalTitle, setFileModalTitle] = useState<string>("")
  const [isFileLoading, setIsFileLoading] = useState(false)

  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false)
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false)

  const [selectedPoll, setSelectedPoll] = useState<Poll | null>(null)
  const [pollResults, setPollResults] = useState<PollResult[]>([])
  const [isResultsLoading, setIsResultsLoading] = useState(false)

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")

  const router = useRouter()

  const getPollStatus = (poll: Poll) => {
    const now = new Date()
    const startTime = poll.start_at ? new Date(poll.start_at) : null
    const endTime = poll.end_at ? new Date(poll.end_at) : null

    if (startTime && now < startTime) {
      return "upcoming"
    }
    if (endTime && now > endTime) {
      return "expired"
    }
    return "active"
  }

  const fetchPolls = useCallback(
    async (userId: string) => {
      let query = supabase.from("polls").select("*").order("created_at", { ascending: false })

      const now = new Date().toISOString()
      query = query.or(`end_at.gte.${now},end_at.is.null`)

      if (searchQuery) {
        query = query.ilike("question", `%${searchQuery}%`)
      }

      if (selectedCategory && selectedCategory !== "all") {
        query = query.contains("tags", [selectedCategory])
      }

      const { data: pollData, error: pollError } = await query

      const { data: responseData, error: responseError } = await supabase
        .from("poll_selected_options")
        .select("poll_id, selected_option")
        .eq("user_id", userId)

      if (pollError || responseError) {
        console.error(pollError || responseError)
        toast.error("Failed to fetch polls.", { description: pollError?.message || responseError?.message })
        return
      }

      if (pollData) setPolls(pollData)

      if (responseData) {
        const votedIds = new Set(responseData.map((response) => response.poll_id))
        setVotedPolls(votedIds)

        const votes = responseData.reduce(
          (acc, current) => {
            if (!acc[current.poll_id]) {
              acc[current.poll_id] = []
            }
            acc[current.poll_id].push(current.selected_option)
            return acc
          },
          {} as Record<string, string[]>,
        )
        setUserVotes(votes)
      }
    },
    [searchQuery, selectedCategory],
  )

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        router.push("/login")
      } else {
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("role")
          .eq("id", session.user.id)
          .single()

        if (userError || !userData) {
          toast.error("Failed to fetch user role", { description: userError?.message })
          router.push("/login")
          return
        }

        if (userData.role === "admin") {
          router.push("/admin/polls")
        } else if (userData.role === "moderator") {
          router.push("/moderator")
        } else if (userData.role === "user") {
          fetchPolls(session.user.id)
        } else {
          toast.error("Unknown user role", { description: "Please contact support." })
          router.push("/login")
        }
      }
      setIsAuthLoading(false)
    }

    checkAuth()

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        router.push("/login")
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [router, fetchPolls])

  const handleShowResults = async (poll: Poll) => {
    setSelectedPoll(poll)
    setIsResultsModalOpen(true)
    setIsResultsLoading(true)

    const { data: responses, error } = await supabase
      .from("poll_selected_options")
      .select("selected_option")
      .eq("poll_id", poll.id)

    if (error) {
      console.error("Error fetching poll results:", error)
      toast.error("Failed to fetch poll results.", { description: error.message })
      setIsResultsLoading(false)
      return
    }

    const voteCounts = responses.reduce(
      (acc, current) => {
        acc[current.selected_option] = (acc[current.selected_option] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    const chartData = [poll.option1, poll.option2, poll.option3, poll.option4].map((option) => ({
      name: option,
      votes: voteCounts[option] || 0,
    }))

    setPollResults(chartData)
    setIsResultsLoading(false)
  }

  const handleShowComments = (poll: Poll) => {
    setSelectedPoll(poll)
    setIsCommentsModalOpen(true)
  }

const handleVote = async (pollId: string, pollType: "single" | "multiple" | "ranked") => {
  const optionsToSubmit = selectedOptions[pollId] || []

  if (optionsToSubmit.length === 0) {
    toast.info("Please select at least one option!")
    return
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    router.push("/login")
    return
  }

  // This is the crucial check that prevents the duplicate vote
  if (votedPolls.has(pollId)) {
    toast.info("You have already voted on this poll!")
    return // Stop the function here to prevent the database call.
  }

  setIsSubmitting(true)

  const votesToInsert = optionsToSubmit.map((option) => ({
    poll_id: pollId,
    user_id: session.user.id,
    selected_option: option,
  }))

  const { error } = await supabase.from("poll_selected_options").insert(votesToInsert)

  if (error) {
    console.error(error)
    toast.error("Failed to submit vote. Please try again.", { description: error.message })
  } else {
    toast.success("Vote submitted successfully!")
    setVotedPolls((prev) => new Set(prev).add(pollId))
    setUserVotes((prev) => ({ ...prev, [pollId]: optionsToSubmit }))
    setSelectedOptions((prev) => ({ ...prev, [pollId]: [] }))
  }

  setIsSubmitting(false)
}

  const handleToggleOption = (pollId: string, option: string) => {
    setSelectedOptions((prev) => {
      const currentSelections = prev[pollId] || []
      const isSelected = currentSelections.includes(option)
      const poll = polls.find(p => p.id === pollId);

      if (poll?.poll_type === "single") {
        return {
          ...prev,
          [pollId]: isSelected ? [] : [option],
        };
      }

      if (isSelected) {
        return {
          ...prev,
          [pollId]: currentSelections.filter((opt) => opt !== option),
        }
      } else {
        return {
          ...prev,
          [pollId]: [...currentSelections, option],
        }
      }
    })
  }

  const handleViewFile = async (poll: Poll) => {
    if (!poll.file_url || !poll.file_type) return

    setShowFileModal(true)
    setFileModalTitle(`Description for: ${poll.question}`)
    setIsFileLoading(true)
    setFileModalContent("")

    try {
      if (poll.file_type.startsWith("image/")) {
        setFileModalContent(
          `<img src="${poll.file_url}" alt="Poll description" class="w-full h-auto object-contain rounded-md" />`,
        )
      } else {
        const html = await convertFileUrlToHtml(poll.file_url, poll.file_type)
        setFileModalContent(html)
      }
    } catch (err) {
      setFileModalContent("Failed to load file content.")
    } finally {
      setIsFileLoading(false)
    }
  }

  const handleDirectDownload = async (fileUrl: string) => {
    try {
      const response = await fetch(fileUrl)
      const blob = await response.blob()
      const filename = fileUrl.split("/").pop()
      const a = document.createElement("a")
      a.href = window.URL.createObjectURL(blob)
      a.download = filename || "download"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      toast.success("File download started.")
    } catch (error) {
      console.error("Error downloading the file:", error)
      toast.error("Failed to download the file.", { description: "Please check the file's availability." })
    }
  }

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-muted/20">
        <div className="flex flex-col items-center space-y-6 p-8 rounded-xl bg-card shadow-lg border-2">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
          <div className="text-center space-y-2">
            <h3 className="text-xl font-bold text-foreground">Loading Polls</h3>
            <p className="text-sm text-muted-foreground">Please wait while we load the latest polls...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-accent/10 rounded-full mb-4">
            <Vote className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-black">Available Polls</h1>
          <p className="text-xl text-black max-w-2xl mx-auto text-balance">
            Cast your vote on the latest polls and make your voice heard
          </p>
        </div>

        <div className="mb-12 space-y-4">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            <div className="flex-1 max-w-md relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                placeholder="Search polls by question..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 bg-card border-2 focus:border-accent transition-colors text-base"
              />
            </div>
            <div className="flex gap-3 items-center">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-[220px] h-12 pl-12 bg-card border-2 focus:border-accent">
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {pollCategories.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedCategory && selectedCategory !== "all" && (
                <Button
                  variant="outline"
                  onClick={() => setSelectedCategory("all")}
                  className="h-12 border-2 hover:border-accent transition-colors"
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear Filter
                </Button>
              )}
            </div>
          </div>
        </div>

        {polls.length === 0 ? (
          <Card className="text-center py-16 border-2 border-dashed border-muted-foreground/20 bg-gradient-to-br from-card to-muted/10">
            <CardContent>
              <div className="w-24 h-24 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Vote className="h-12 w-12 text-accent" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-black">No polls available</h3>
              <p className="text-black text-lg max-w-md mx-auto text-balance">
                Check back later for new polls to vote on.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Accordion type="multiple" className="space-y-4">
            {polls.map((poll) => {
              const hasVoted = votedPolls.has(poll.id)
              const votedOptions = userVotes[poll.id] || []
              const hasPendingVotes = selectedOptions[poll.id]?.length > 0
              const status = getPollStatus(poll)
              const isActive = status === "active"
              const isMultiple = poll.poll_type === "multiple"
              const selectedThisSession = selectedOptions[poll.id] || []

              return (
                <AccordionItem
                  key={poll.id}
                  value={poll.id}
                  className="border border-border rounded-lg bg-card shadow-sm hover:shadow-md transition-shadow"
                >
                  <AccordionTrigger className="px-6 py-4 hover:no-underline">
                    <div className="flex items-center justify-between w-full text-left">
                      <div className="flex-1 pr-4">
                        <h3 className="text-lg font-bold text-black text-balance">{poll.question}</h3>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {status === "upcoming" && (
                            <Badge
                              variant="outline"
                              className="flex items-center gap-1 border-blue-200 text-blue-700 bg-blue-50 text-xs"
                            >
                              <Calendar className="w-3 h-3" />
                              Upcoming
                            </Badge>
                          )}
                          {status === "active" && (
                            <Badge className="flex items-center gap-1 bg-green-100 text-green-800 border-green-200 text-xs">
                              <HourglassIcon className="w-3 h-3" />
                              Active
                            </Badge>
                          )}
                          {status === "expired" && (
                            <Badge variant="destructive" className="flex items-center gap-1 text-xs">
                              <HourglassIcon className="w-3 h-3" />
                              Expired
                            </Badge>
                          )}
                          <Badge variant="secondary" className="bg-accent/10 text-accent border-accent/20 text-xs">
                            {isMultiple ? "Multiple" : "Single"}
                          </Badge>
                          {hasVoted && (
                            <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                              <CheckCheck className="w-3 h-3 mr-1" />
                              Voted
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="px-6 pb-6">
                    <div className="space-y-4">
                      <Separator />

                      {/* Poll timing information */}
                      <div className="space-y-2 text-sm text-black bg-muted/20 p-4 rounded-lg">
                        <p className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-accent" />
                          <span className="font-medium">Start:</span>{" "}
                          {poll.start_at ? new Date(poll.start_at).toLocaleDateString() : "Not specified"}
                        </p>
                        <p className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-accent" />
                          <span className="font-medium">End:</span>{" "}
                          {poll.end_at ? new Date(poll.end_at).toLocaleDateString() : "Not specified"}
                        </p>
                      </div>

                      {/* Poll options */}
                      <div className="space-y-3">
                        <h4 className="font-semibold text-black">Options:</h4>
                        {[poll.option1, poll.option2, poll.option3, poll.option4].map((opt, idx) => {
                          const isVotedOption = hasVoted && votedOptions.includes(opt)
                          const isSelected = selectedThisSession.includes(opt)

                          return (
                            <div
                              key={idx}
                              className={`flex items-center space-x-3 p-4 rounded-lg border transition-all duration-200 cursor-pointer ${
                                hasVoted
                                  ? isVotedOption
                                    ? "border-accent bg-accent/5 shadow-sm"
                                    : "border-muted bg-muted/20 opacity-60"
                                  : isSelected
                                    ? "border-accent bg-accent/5 shadow-sm"
                                    : "border-muted hover:border-accent/50 hover:bg-muted/30"
                              } ${!isActive && "pointer-events-none opacity-50"}`}
                              onClick={() => isActive && !hasVoted && handleToggleOption(poll.id, opt)}
                            >
                              <Checkbox
                                id={`${poll.id}-option-${idx}`}
                                checked={isSelected || isVotedOption}
                                onCheckedChange={() => handleToggleOption(poll.id, opt)}
                                disabled={!isActive || hasVoted}
                                className="w-5 h-5"
                              />
                              <Label
                                htmlFor={`${poll.id}-option-${idx}`}
                                className="flex-1 cursor-pointer font-medium text-black"
                              >
                                {opt}
                              </Label>
                              {isVotedOption && <CheckCheck className="h-5 w-5 text-accent shrink-0" />}
                            </div>
                          )
                        })}
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-col gap-4 pt-4">
                        <div className="flex flex-wrap gap-2">
                          {poll.file_url && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewFile(poll)}
                                className="flex items-center gap-2"
                              >
                                <Eye className="h-4 w-4" />
                                View File
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDirectDownload(poll.file_url!)}
                                className="flex items-center gap-2"
                              >
                                <Download className="h-4 w-4" />
                                Download
                              </Button>
                            </>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleShowResults(poll)}
                            className="flex items-center gap-2"
                          >
                            <TrendingUp className="h-4 w-4" />
                            View Results
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleShowComments(poll)}
                            className="flex items-center gap-2"
                          >
                            <MessageCircle className="h-4 w-4" />
                            Comments
                          </Button>
                        </div>

                        {isActive && !hasVoted && (
                          <Button
                            onClick={() => handleVote(poll.id, poll.poll_type)}
                            disabled={isSubmitting || !hasPendingVotes}
                            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                          >
                            {isSubmitting ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Submitting Vote...
                              </>
                            ) : (
                              <>
                                <Vote className="h-4 w-4 mr-2" />
                                Submit Vote
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        )}

        {/* Modals */}
        <Dialog open={isResultsModalOpen} onOpenChange={setIsResultsModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">Poll Results</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <PollResultsGraph
                pollResults={pollResults}
                isLoading={isResultsLoading}
                pollQuestion={selectedPoll?.question || ""}
              />
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isCommentsModalOpen} onOpenChange={setIsCommentsModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">Comments</DialogTitle>
            </DialogHeader>
            <div className="py-4">{selectedPoll && <PollComments pollId={selectedPoll.id} />}</div>
          </DialogContent>
        </Dialog>

        {/* File Modal */}
        <Dialog open={showFileModal} onOpenChange={setShowFileModal}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="text-2xl">{fileModalTitle}</DialogTitle>
            </DialogHeader>
            {isFileLoading ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading file content...</p>
              </div>
            ) : (
              <div className="p-2 overflow-y-auto max-h-[calc(80vh-80px)]">
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: fileModalContent }}
                />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}