"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { convertFileUrlToHtml } from "@/lib/fileExtractor"
import { useRouter } from "next/navigation"
import {
  PlusCircle,
  Pencil,
  Trash2,
  FileText,
  Download,
  X,
  RefreshCw,
  BarChartIcon,
  Terminal,
  Calendar,
  TrendingUp,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

// Interfaces for data types
interface Poll {
  id: string
  question: string
  option1: string
  option2: string
  option3: string
  option4: string
  file_url?: string
  file_type?: string
  created_at: string
}

interface PollResult {
  name: string
  votes: number
}

export default function AdminPollsPage() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [question, setQuestion] = useState("")
  const [options, setOptions] = useState(["", "", "", ""])
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalContent, setModalContent] = useState<string>("Loading...")
  const [modalTitle, setModalTitle] = useState<string>("")
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [createPollModalOpen, setCreatePollModalOpen] = useState(false)

  // State for the poll results modal
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false)
  const [selectedPoll, setSelectedPoll] = useState<Poll | null>(null)
  const [pollResults, setPollResults] = useState<PollResult[]>([])
  const [isResultsLoading, setIsResultsLoading] = useState(false)

  // State for shadcn alert
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

  // State for shadcn delete confirmation dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pollToDelete, setPollToDelete] = useState<{
    id: string
    fileUrl?: string
  } | null>(null)

  const [isModalContentLoading, setIsModalContentLoading] = useState(false) // New state for modal loading

  const router = useRouter()

  // Helper function to show alerts
  const showAlert = (title: string, description: string, variant: "default" | "destructive" = "default") => {
    setAlert({ show: true, title, description, variant })
    setTimeout(() => {
      setAlert((prev) => ({ ...prev, show: false }))
    }, 5000) // Alert disappears after 5 seconds
  }

  // Helper function to handle delete confirmation
  const confirmDeletePoll = (id: string, fileUrl?: string) => {
    setPollToDelete({ id, fileUrl })
    setShowDeleteConfirm(true)
  }

  // Authentication and role check
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        router.push("/login")
        return
      }
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("role")
        .eq("id", session.user.id)
        .single()
      if (userError || !userData || userData.role !== "admin") {
        showAlert("Access Denied", "You do not have permission to view this page.", "destructive")
        router.push("/login")
        return
      }
      fetchPolls()
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

  // Fetches all polls for the admin dashboard
  const fetchPolls = async () => {
    const { data, error } = await supabase.from("polls").select("*").order("created_at", { ascending: false })
    if (error) {
      console.error("Error fetching polls:", error.message)
      showAlert("Error", "Failed to fetch polls.", "destructive")
    } else {
      setPolls(data || [])
    }
  }

  const handleShowResults = async (poll: Poll) => {
    setSelectedPoll(poll)
    setIsResultsModalOpen(true)
    setIsResultsLoading(true)

    const { data: responses, error } = await supabase
      .from("poll_responses")
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

  const handleSavePoll = async () => {
    if (!question.trim() || options.some((opt) => !opt.trim())) {
      showAlert("Validation Error", "Please fill in the question and all 4 options.", "destructive")
      return
    }
    setLoading(true)
    let fileUrl: string | null = null
    let fileType: string | null = null
    if (file) {
      try {
        const ext = file.name.split(".").pop()
        const uniqueName = `${crypto.randomUUID()}.${ext}`
        const filePath = `polls/${uniqueName}`
        const { error: uploadError } = await supabase.storage.from("poll-files").upload(filePath, file)
        if (uploadError) throw uploadError
        const { data } = supabase.storage.from("poll-files").getPublicUrl(filePath)
        fileUrl = data.publicUrl
        fileType = file.type
      } catch (err) {
        console.error("File upload failed:", err)
        showAlert("Error", "File upload failed. Please try again.", "destructive")
        setLoading(false)
        return
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
      })
      if (error) {
        console.error("Error updating poll:", error.message)
        showAlert("Error", "Failed to update poll.", "destructive")
      } else {
        showAlert("Success", "Poll updated successfully.", "default")
        resetForm()
        fetchPolls()
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
      ])
      if (error) {
        console.error("Error creating poll:", error.message)
        showAlert("Error", "Failed to create poll.", "destructive")
      } else {
        showAlert("Success", "Poll created successfully.", "default")
        resetForm()
        fetchPolls()
      }
    }
    setLoading(false)
  }

  const handleDeletePoll = async (id: string, fileUrl?: string) => {
    try {
      if (fileUrl) {
        const filePath = fileUrl.split("/poll-files/")[1]
        if (filePath) {
          await supabase.storage.from("poll-files").remove([`polls/${filePath}`])
        }
      }
      await supabase.from("polls").delete().eq("id", id)
      showAlert("Success", "Poll deleted successfully.", "default")
      fetchPolls()
    } catch (err) {
      console.error("Unexpected error deleting poll:", err)
      showAlert("Error", "Failed to delete poll.", "destructive")
    }
  }

  const handleEditPoll = (poll: Poll) => {
    setEditingId(poll.id)
    setQuestion(poll.question)
    setOptions([poll.option1, poll.option2, poll.option3, poll.option4])
    setFile(null)
    setCreatePollModalOpen(true)
  }

  const resetForm = () => {
    setEditingId(null)
    setQuestion("")
    setOptions(["", "", "", ""])
    setFile(null)
    setCreatePollModalOpen(false)
  }

  const handleViewExtractedText = async (poll: Poll) => {
    if (!poll.file_url || !poll.file_type) return
    setModalTitle(`Extracted Text for: ${poll.question}`)
    setShowModal(true)
    setIsModalContentLoading(true) // Set loading to true
    setModalContent("") // Clear previous content
    try {
      const html = await convertFileUrlToHtml(poll.file_url, poll.file_type)
      setModalContent(html)
    } catch (err) {
      setModalContent("Failed to extract text.")
      showAlert("Error", "Failed to extract text from the file.", "destructive")
    } finally {
      setIsModalContentLoading(false) // Set loading to false when done
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
      <div className="flex justify-center items-center h-screen">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <div className="text-center">
            <h3 className="text-lg font-semibold">Loading Admin Panel</h3>
            <p className="text-sm text-muted-foreground">Please wait while we verify your access...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b sticky top-0 z-40 bg-background">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-end">
            <Button
              onClick={() => {
                resetForm()
                setCreatePollModalOpen(true)
                setTimeout(() => document.getElementById("question")?.focus(), 100)
              }}
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Create Poll
            </Button>
          </div>
        </div>
      </div>

      {/* Shadcn Alert */}
      {alert.show && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <Alert variant={alert.variant} className="w-[350px]">
            <Terminal className="h-4 w-4" />
            <AlertTitle>{alert.title}</AlertTitle>
            <AlertDescription>{alert.description}</AlertDescription>
          </Alert>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold">Your Polls</h2>
              <p className="text-muted-foreground mt-1">Manage and analyze all your created polls</p>
            </div>
            <Badge variant="outline" className="px-4 py-2">
              {polls.length} {polls.length === 1 ? "Poll" : "Polls"}
            </Badge>
          </div>

          {polls.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {polls.map((poll) => (
                <Card key={poll.id}>
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg font-bold line-clamp-2 mb-3">{poll.question}</CardTitle>
                        <div className="flex items-center flex-wrap gap-2">
                          <Badge variant="secondary" className="text-xs">
                            <Calendar className="w-3 h-3 mr-1" />
                            {new Date(poll.created_at).toLocaleDateString()}
                          </Badge>
                          {poll.file_url && (
                            <Badge variant="outline" className="text-xs">
                              <FileText className="w-3 h-3 mr-1" />
                              Document
                            </Badge>
                          )}
                        </div>
                      </div>
                      {poll.file_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewExtractedText(poll)}
                          className="flex-shrink-0 ml-2"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {[poll.option1, poll.option2, poll.option3, poll.option4].map((option, idx) => (
                        <div key={idx} className="flex items-center p-3 bg-muted rounded-lg">
                          <span className="text-sm font-medium truncate">{option}</span>
                        </div>
                      ))}
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1">
                        {poll.file_url && (
                          <Button variant="ghost" size="sm" onClick={() => handleDirectDownload(poll.file_url!)}>
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => handleShowResults(poll)}>
                          <TrendingUp className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEditPoll(poll)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => confirmDeletePoll(poll.id, poll.file_url)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-20">
                <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
                  <BarChartIcon className="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 className="text-2xl font-bold mb-3">No polls yet</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Get started by creating your first poll using the Create Poll button above.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal for viewing extracted text */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50"></div>
          <div className="relative bg-background w-full max-w-4xl max-h-[90vh] rounded-lg shadow-lg overflow-hidden border">
            <div className="sticky top-0 bg-background flex justify-between items-center p-6 border-b">
              <div>
                <h2 className="text-xl font-bold">{modalTitle}</h2>
                <p className="text-sm text-muted-foreground">Document content preview</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {isModalContentLoading ? (
              <div className="flex justify-center items-center h-[50vh]">
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-muted-foreground">Loading document...</p>
                </div>
              </div>
            ) : (
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
                <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: modalContent }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialog for showing poll results */}
      <Dialog open={isResultsModalOpen} onOpenChange={setIsResultsModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader className="space-y-3">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5" />
              <DialogTitle className="text-xl font-bold">Poll Results</DialogTitle>
            </div>
            <DialogDescription className="font-semibold">{selectedPoll?.question}</DialogDescription>
          </DialogHeader>
          {isResultsLoading ? (
            <div className="flex justify-center items-center h-48">
              <div className="flex flex-col items-center space-y-4">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-muted-foreground">Loading results...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pollResults} margin={{ top: 20, right: 10, left: 10, bottom: 60 }}>
                    <XAxis
                      dataKey="name"
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="votes" fill="hsl(var(--primary))" name="Votes" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {pollResults.map((result, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium">{result.name}</span>
                    <Badge variant="secondary">{result.votes} votes</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog for delete confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-3">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>Delete Poll</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. This will permanently delete the poll and all its responses.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="flex justify-end space-x-3 mt-6">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pollToDelete) {
                  handleDeletePoll(pollToDelete.id, pollToDelete.fileUrl)
                  setPollToDelete(null)
                  setShowDeleteConfirm(false)
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Poll
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Poll Modal Dialog */}
      <Dialog open={createPollModalOpen} onOpenChange={setCreatePollModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <PlusCircle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold">Create New Poll</DialogTitle>
                <DialogDescription>Fill out the details to create a new poll</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-3">
              <Label htmlFor="question" className="text-base font-semibold">
                Poll Question
              </Label>
              <Input
                id="question"
                type="text"
                placeholder="What would you like to ask?"
                value={question}
                onChange={(e) => {
                  if (e.target.value.length <= 50) {
                    setQuestion(e.target.value)
                  }
                }}
              />
              <p className="text-sm flex justify-between text-muted-foreground">
                <span>Enter your poll question</span>
                <span>{question.length}/50 characters</span>
              </p>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">Answer Options</Label>
              <div className="grid grid-cols-2 gap-3">
                {options.map((opt, idx) => (
                  <div key={idx} className="space-y-2">
                    <Input
                      type="text"
                      placeholder={`Option ${idx + 1}`}
                      value={opt}
                      onChange={(e) => {
                        if (e.target.value.length <= 10) {
                          const newOpts = [...options]
                          newOpts[idx] = e.target.value
                          setOptions(newOpts)
                        }
                      }}
                    />
                    <p className="text-xs flex justify-end text-muted-foreground">
                      <span>{opt.length}/10 characters</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="file" className="text-base font-semibold">
                Supporting Document
              </Label>
              <div className="relative">
                <Input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                {file && (
                  <div className="mt-3 p-3 rounded-lg border">
                    <p className="text-sm flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      <span className="font-medium">{file.name}</span>
                      <span className="ml-2 text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                    </p>
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Upload a document to support your poll (optional)</p>
            </div>

            <Separator />

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <Button onClick={handleSavePoll} disabled={loading} className="flex-1">
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
              <Button variant="outline" onClick={resetForm} className="flex-1 bg-transparent">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
