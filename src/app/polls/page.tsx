"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import {
  CheckCheck,
  Download,
  FileText,
  X,
  RefreshCw,
  Terminal,
  BarChartIcon,
  Vote,
  Loader2,
  Calendar,
  HourglassIcon,
  TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { convertFileUrlToHtml } from "../../lib/fileExtractor"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { formatDistanceToNow } from "date-fns"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
  const [selectedPoll, setSelectedPoll] = useState<Poll | null>(null)
  const [pollResults, setPollResults] = useState<PollResult[]>([])
  const [isResultsLoading, setIsResultsLoading] = useState(false)

  // New state for search and filter
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")

  const [alert, setAlert] = useState<{
    show: boolean
    title: string
    description: string
    variant: "default" | "destructive"
  }>({
    show: false,
    title: "",
    description: "",
    variant: "default",
  })

  const router = useRouter()

  const showAlert = (title: string, description: string, variant: "default" | "destructive" = "default") => {
    setAlert({ show: true, title, description, variant })
    setTimeout(() => {
      setAlert((prev) => ({ ...prev, show: false }))
    }, 5000)
  }

  // Helper function to get poll status
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

  // Fetches polls and user votes
  const fetchPolls = async (userId: string) => {
    let query = supabase.from("polls").select("*").order("created_at", { ascending: false })

    const now = new Date().toISOString()
    // Filter to show only active or upcoming polls to the user
    query = query.or(`end_at.gte.${now},end_at.is.null`)

    if (searchQuery) {
      query = query.ilike("question", `%${searchQuery}%`)
    }

   if (selectedCategory && selectedCategory !== "all") {
  query = query.contains("tags", [selectedCategory]);
}

    const { data: pollData, error: pollError } = await query

    const { data: responseData, error: responseError } = await supabase
      .from("poll_selected_options")
      .select("poll_id, selected_option")
      .eq("user_id", userId)

    if (pollError || responseError) {
      console.error(pollError || responseError)
      showAlert("Error", "Failed to fetch polls.", "destructive")
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
  }

  // Authentication and role check
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
          showAlert("Error", "Failed to fetch user role", "destructive")
          router.push("/login")
          return
        }

        if (userData.role === "admin") {
          router.push("/admin/polls")
        } else if (userData.role === "moderator") {
          router.push("/moderate")
        } else if (userData.role === "user") {
          fetchPolls(session.user.id)
        } else {
          showAlert("Error", "Unknown user role", "destructive")
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
  }, [router])

  // New useEffect hook to trigger fetch on search or filter change with debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session) {
        fetchPolls(session.user.id)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, selectedCategory])

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
      showAlert("Error", "Failed to fetch poll results.", "destructive")
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

  const handleVote = async (pollId: string, pollType: "single" | "multiple" | "ranked") => {
    const optionsToSubmit = selectedOptions[pollId] || []

    if (optionsToSubmit.length === 0) {
      showAlert("Info", "Please select at least one option!", "default")
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      router.push("/login")
      return
    }

    if (votedPolls.has(pollId)) {
      showAlert("Info", "You have already voted on this poll!", "default")
      return
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
      showAlert("Error", "Failed to submit vote. Please try again.", "destructive")
    } else {
      showAlert("Success", "Vote submitted successfully!", "default")
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
      const poll = polls.find((p) => p.id === pollId)

      if (poll?.poll_type === "single" && !isSelected) {
        return {
          ...prev,
          [pollId]: [option],
        }
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
    } catch (error) {
      console.error("Error downloading the file:", error)
      showAlert("Error", "Failed to download the file.", "destructive")
    }
  }

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading polls...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {alert.show && (
          <div className="fixed bottom-4 right-4 z-[9999]">
            <Alert variant={alert.variant} className="w-[300px]">
              <Terminal className="h-4 w-4" />
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>{alert.description}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Available Polls</h1>
          <p className="text-muted-foreground">Cast your vote on the latest polls</p>
        </div>

        {/* Search and Filter UI */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
          <div className="w-full sm:w-1/2">
            <Input
              placeholder="Search polls..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-1/2 md:w-1/4">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
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
        </div>

        {polls.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Vote className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No polls available</h3>
              <p className="text-muted-foreground">Check back later for new polls to vote on.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {polls.map((poll) => {
              const hasVoted = votedPolls.has(poll.id)
              const votedOptions = userVotes[poll.id] || []
              const hasPendingVotes = selectedOptions[poll.id]?.length > 0
              const status = getPollStatus(poll)
              const isActive = status === "active"

              return (
                <Card key={poll.id} className="transition-all duration-200 hover:shadow-md">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <CardTitle className="text-xl leading-tight">{poll.question}</CardTitle>
                      {status === "upcoming" && (
                        <Badge variant="outline" className="flex items-center gap-1 shrink-0">
                          <Calendar className="w-3 h-3 mr-1" />
                          Upcoming
                        </Badge>
                      )}
                      {status === "active" && (
                        <Badge variant="default" className="flex items-center gap-1 shrink-0">
                          <HourglassIcon className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      )}
                      {status === "expired" && (
                        <Badge variant="destructive" className="flex items-center gap-1 shrink-0">
                          <HourglassIcon className="w-3 h-3 mr-1" />
                          Expired
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(poll.tags || []).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1 space-y-1">
                      <p>
                        **Start:** {poll.start_at ? new Date(poll.start_at).toLocaleString() : "Not specified"}
                      </p>
                      <p>
                        **End:** {poll.end_at ? new Date(poll.end_at).toLocaleString() : "Not specified"}
                      </p>
                      {isActive && (
                        <p className="text-xs font-semibold text-primary">
                          Expires {formatDistanceToNow(new Date(poll.end_at!), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      {[poll.option1, poll.option2, poll.option3, poll.option4].map((opt, idx) => {
                        const isVotedOption = hasVoted && votedOptions.includes(opt)
                        const isSelected = selectedOptions[poll.id]?.includes(opt)

                        return (
                          <div
                            key={idx}
                            className={`flex items-center space-x-3 p-4 rounded-lg border-2 transition-all duration-200 ${
                              hasVoted
                                ? isVotedOption
                                  ? "border-primary bg-primary/5"
                                  : "border-muted bg-muted/30 opacity-60"
                                : isSelected
                                ? "border-primary bg-primary/5"
                                : "border-muted hover:border-muted-foreground/30 hover:bg-muted/50"
                            } ${!isActive && "pointer-events-none opacity-50"}`}
                            onClick={() => isActive && !hasVoted && handleToggleOption(poll.id, opt)}
                          >
                            <Checkbox
                              id={`${poll.id}-option-${idx}`}
                              checked={isSelected || isVotedOption}
                              onCheckedChange={() => handleToggleOption(poll.id, opt)}
                              disabled={!isActive || hasVoted}
                            />
                            <Label htmlFor={`${poll.id}-option-${idx}`} className="flex-1 cursor-pointer font-medium">
                              {opt}
                            </Label>
                            {isVotedOption && <CheckCheck className="h-4 w-4 text-primary shrink-0" />}
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
                      <div className="flex flex-wrap gap-2">
                        {poll.file_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDirectDownload(poll.file_url!)}
                            className="flex items-center gap-2"
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </Button>
                        )}
                        {poll.file_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewFile(poll)}
                            className="flex items-center gap-2"
                          >
                            <FileText className="h-4 w-4" />
                            View File
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleShowResults(poll)}
                          className="flex items-center gap-2"
                        >
                          <BarChartIcon className="h-4 w-4" />
                          Results
                        </Button>
                      </div>

                      {isActive && !hasVoted && (
                        <Button
                          onClick={() => handleVote(poll.id, poll.poll_type)}
                          disabled={isSubmitting || !hasPendingVotes}
                          className="w-full sm:w-auto"
                          size="default"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...
                            </>
                          ) : (
                            "Submit Vote"
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Dialogs remain the same as before */}
        <Dialog open={isResultsModalOpen} onOpenChange={setIsResultsModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader className="space-y-3">
              <DialogTitle className="text-2xl">Poll Results</DialogTitle>
              <DialogDescription className="text-base font-medium text-foreground">
                {selectedPoll?.question}
              </DialogDescription>
              <Separator />
            </DialogHeader>
            {isResultsLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading results...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pollResults} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                      <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={80} fontSize={12} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="votes" fill="hsl(var(--primary))" name="Votes" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-center text-sm text-muted-foreground">
                  Total votes: {pollResults.reduce((sum, result) => sum + result.votes, 0)}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {showFileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
            <div className="relative bg-background w-full max-w-4xl max-h-[90vh] rounded-lg shadow-2xl overflow-hidden border">
              <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex justify-between items-center p-6 border-b z-10">
                <h2 className="text-xl font-semibold">{fileModalTitle}</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowFileModal(false)} className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {isFileLoading ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-muted-foreground">Loading file content...</p>
                </div>
              ) : (
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: fileModalContent }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}