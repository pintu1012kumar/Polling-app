'use client'

import type React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { convertFileUrlToHtml } from '@/lib/fileExtractor'
import { useRouter } from 'next/navigation'
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
  HourglassIcon,
  MessageCircle,
  Search,
  Filter,
  Eye,
  Clock,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatDistanceToNow } from 'date-fns'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import PollResultsGraph from '@/components/PollResultsGraph'
import PollComments from '../../../components/PollComments'
import { PostgrestError } from '@supabase/supabase-js'

// Interfaces for data types
interface Poll {
  id: string
  question: string
  option1: string
  option2: string
  option3: string
  option4: string
  poll_type: 'single' | 'multiple' | 'ranked'
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
  { value: 'technology', label: 'Technology' },
  { value: 'politics', label: 'Politics' },
  { value: 'sports', label: 'Sports' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'science', label: 'Science' },
]

// Poll status options for the new dropdown
const pollStatuses = [
  { value: 'all', label: 'All Polls' },
  { value: 'active', label: 'Active' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'expired', label: 'Expired' },
];

// File size constants in KB
const MIN_FILE_SIZE_KB = 10
const MAX_FILE_SIZE_KB = 5000

export default function AdminPollsPage() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', '', '', ''])
  const [pollType, setPollType] = useState<'single' | 'multiple' | 'ranked'>(
    'single',
  )
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalContent, setModalContent] = useState<string>('')
  const [modalTitle, setModalTitle] = useState<string>('')
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [createPollModalOpen, setCreatePollModalOpen] = useState(false)

  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false)
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false) // New state for comments modal

  const [selectedPoll, setSelectedPoll] = useState<Poll | null>(null)
  const [pollResults, setPollResults] = useState<PollResult[]>([])
  const [isResultsLoading, setIsResultsLoading] = useState(false)

  const [alert, setAlert] = useState<{
    show: boolean
    title: string
    description: string
    variant: 'default' | 'destructive'
  }>({
    show: false,
    title: '',
    description: '',
    variant: 'default',
  })

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pollToDelete, setPollToDelete] = useState<{
    id: string
    fileUrl?: string
  } | null>(null)

  const [isModalContentLoading, setIsModalContentLoading] = useState(false)
  const [startTime, setStartTime] = useState<string>('')
  const [endTime, setEndTime] = useState<string>('')
  const [tags, setTags] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'upcoming' | 'expired'>('all');


  const router = useRouter()

  const showAlert = (
    title: string,
    description: string,
    variant: 'default' | 'destructive' = 'default',
  ) => {
    setAlert({ show: true, title, description, variant })
    setTimeout(() => {
      setAlert((prev) => ({ ...prev, show: false }))
    }, 5000)
  }

  const confirmDeletePoll = (id: string, fileUrl?: string) => {
    setPollToDelete({ id, fileUrl })
    setShowDeleteConfirm(true)
  }

  const getPollStatus = useCallback((poll: Poll) => {
    const now = new Date()
    const startTime = poll.start_at ? new Date(poll.start_at) : null
    const endTime = poll.end_at ? new Date(poll.end_at) : null

    if (startTime && now < startTime) {
      return 'upcoming'
    }
    if (endTime && now > endTime) {
      return 'expired'
    }
    return 'active'
  }, []);

  const fetchPolls = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('polls').select('*').order('created_at', { ascending: false })

    if (searchQuery) {
      query = query.ilike('question', `%${searchQuery}%`)
    }

    if (selectedCategory && selectedCategory !== 'all') {
      query = query.contains('tags', [selectedCategory])
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching polls:', error.message)
      showAlert('Error', 'Failed to fetch polls.', 'destructive')
    } else {
      let filteredPolls = data || [];
      if (selectedStatus !== 'all') {
          filteredPolls = filteredPolls.filter(poll => getPollStatus(poll) === selectedStatus);
      }
      setPolls(filteredPolls);
    }
    setLoading(false)
  }, [searchQuery, selectedCategory, selectedStatus, getPollStatus])

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single()
      if (userError || !userData || userData.role !== 'admin') {
        showAlert(
          'Access Denied',
          'You do not have permission to view this page.',
          'destructive',
        )
        router.push('/login')
        return
      }
      fetchPolls()
      setIsAuthLoading(false)
    }
    checkAuth()
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        router.push('/login')
      }
    })
    return () => {
      listener.subscription.unsubscribe()
    }
  }, [router, fetchPolls])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPolls()
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, selectedCategory, selectedStatus, fetchPolls])

  const handleShowResults = async (poll: Poll) => {
    setSelectedPoll(poll)
    setIsResultsModalOpen(true)
    setIsResultsLoading(true)

    const { data: responses, error } = await supabase
      .from('poll_selected_options')
      .select('selected_option')
      .eq('poll_id', poll.id)

    if (error) {
      console.error('Error fetching poll results:', error)
      showAlert('Error', 'Failed to fetch poll results.', 'destructive')
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

  // New handler for comments modal
  const handleShowComments = (poll: Poll) => {
    setSelectedPoll(poll)
    setIsCommentsModalOpen(true)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      const fileSizeInKB = selectedFile.size / 1024
      if (fileSizeInKB < MIN_FILE_SIZE_KB || fileSizeInKB > MAX_FILE_SIZE_KB) {
        showAlert(
          'File Size Error',
          `File size must be between ${MIN_FILE_SIZE_KB} KB and ${MAX_FILE_SIZE_KB} KB.`,
          'destructive',
        )
        e.target.value = ''
        setFile(null)
        return
      }
      setFile(selectedFile)
    } else {
      setFile(null)
    }
  }

const handleSavePoll = async () => {
    if (!question.trim() || options.some((opt) => !opt.trim())) {
      showAlert('Validation Error', 'Please fill in the question and all 4 options.', 'destructive')
      return
    }

    if (!startTime || !endTime) {
      showAlert('Validation Error', 'Please set both start and end times.', 'destructive')
      return
    }

    const startDate = new Date(startTime)
    const endDate = new Date(endTime)

    if (endDate <= startDate) {
      showAlert('Validation Error', 'End time must be after start time.', 'destructive')
      return
    }

    setLoading(true)
    let fileUrl: string | null = null
    let fileType: string | null = null
    if (file) {
      try {
        const ext = file.name.split('.').pop()
        const uniqueName = `${crypto.randomUUID()}.${ext}`
        const filePath = `polls/${uniqueName}`
        const { error: uploadError } = await supabase.storage.from('poll-files').upload(filePath, file)
        if (uploadError) throw uploadError
        const { data } = supabase.storage.from('poll-files').getPublicUrl(filePath)
        fileUrl = data.publicUrl
        fileType = file.type
      } catch (err) {
        const error = err as PostgrestError
        console.error('File upload failed:', error.message)
        showAlert('Error', 'File upload failed. Please try again.', 'destructive')
        setLoading(false)
        return
      }
    }

    const tagsArray = tags ? [tags] : []

    const pollData = {
      question,
      option1: options[0],
      option2: options[1],
      option3: options[2],
      option4: options[3],
      poll_type: pollType,
      file_url: fileUrl,
      file_type: fileType,
      start_at: startTime,
      end_at: endTime,
      tags: tagsArray,
      status: 'open', // <-- ADD THIS LINE
    }

    if (editingId) {
      try {
        // Delete the old poll first to 'replace' it
        const { error: deleteError } = await supabase.from('polls').delete().eq('id', editingId)
        if (deleteError) throw deleteError

        // Then create the new poll with the updated data
        const { error: insertError } = await supabase.from('polls').insert([pollData])
        if (insertError) throw insertError

        showAlert('Success', 'Poll updated successfully. (Old version deleted)', 'default')
      } catch (err) {
        const error = err as PostgrestError
        console.error('Error during poll replacement:', error.message)
        showAlert('Error', 'Failed to update poll.', 'destructive')
      }
    } else {
      // Original logic for creating a new poll
      const { error } = await supabase.from('polls').insert([pollData])
      if (error) {
        console.error('Error creating poll:', error.message)
        showAlert('Error', 'Failed to create poll.', 'destructive')
      } else {
        showAlert('Success', 'Poll created successfully.', 'default')
      }
    }

    setLoading(false)
    resetForm()
    fetchPolls()
  }
  const handleDeletePoll = async (id: string, fileUrl?: string) => {
    try {
      if (fileUrl) {
        const filePath = fileUrl.split('/poll-files/')[1]
        if (filePath) {
          await supabase.storage.from('poll-files').remove([`polls/${filePath}`])
        }
      }
      await supabase.from('polls').delete().eq('id', id)
      showAlert('Success', 'Poll deleted successfully.', 'default')
      fetchPolls()
    } catch (err) {
      const error = err as PostgrestError
      console.error('Unexpected error deleting poll:', error.message)
      showAlert('Error', 'Failed to delete poll.', 'destructive')
    }
  }

  const handleEditPoll = (poll: Poll) => {
    setEditingId(poll.id)
    setQuestion(poll.question)
    setOptions([poll.option1, poll.option2, poll.option3, poll.option4])
    setPollType(poll.poll_type)
    setFile(null)
    setStartTime(poll.start_at ? poll.start_at.substring(0, 16) : '')
    setEndTime(poll.end_at ? poll.end_at.substring(0, 16) : '')
    setTags(poll.tags && poll.tags.length > 0 ? poll.tags[0] : '')
    setCreatePollModalOpen(true)
  }

  const resetForm = () => {
    setEditingId(null)
    setQuestion('')
    setOptions(['', '', '', ''])
    setPollType('single')
    setFile(null)
    setStartTime('')
    setEndTime('')
    setTags('')
    setCreatePollModalOpen(false)
  }

  const handleViewExtractedText = async (poll: Poll) => {
    if (!poll.file_url || !poll.file_type) return
    setModalTitle(`Extracted Text for: ${poll.question}`)
    setShowModal(true)
    setIsModalContentLoading(true)
    setModalContent('')
    try {
      const html = await convertFileUrlToHtml(poll.file_url, poll.file_type)
      setModalContent(html)
    } catch (err) {
      const error = err as Error
      setModalContent('Failed to extract text.')
      showAlert('Error', `Failed to extract text from the file: ${error.message}`, 'destructive')
    } finally {
      setIsModalContentLoading(false)
    }
  }

  const handleDirectDownload = async (fileUrl: string) => {
    try {
      const response = await fetch(fileUrl)
      const blob = await response.blob()
      const filename = fileUrl.split('/').pop()
      const a = document.createElement('a')
      a.href = window.URL.createObjectURL(blob)
      a.download = filename || 'download'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (error) {
      const err = error as Error
      console.error('Error downloading the file:', err.message)
      showAlert('Error', 'Failed to download the file.', 'destructive')
    }
  }

  if (isAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-background to-muted/20">
        <div className="flex flex-col items-center space-y-6 rounded-xl bg-card p-8 shadow-lg border">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-accent border-t-transparent"></div>
          <div className="space-y-2 text-center">
            <h3 className="text-xl font-bold text-foreground">
              Loading Admin Panel
            </h3>
            <p className="text-sm text-muted-foreground">
              Please wait while we verify your access...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">


      {alert.show && (
        <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-bottom-2">
          <Alert variant={alert.variant} className="w-[380px] border-2 shadow-xl">
            <Terminal className="h-5 w-5" />
            <AlertTitle className="font-semibold">{alert.title}</AlertTitle>
            <AlertDescription className="mt-1">
              {alert.description}
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-6 py-8">
        
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4 mb-6">
            <Card className="bg-gradient-to-br from-card to-card/80 border transition-colors hover:border-accent/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Total Polls
                    </p>
                    <p className="text-xl font-bold text-foreground">{polls.length}</p>
                  </div>
                  <BarChartIcon className="h-6 w-6 text-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-card/80 border transition-colors hover:border-accent/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Active Polls
                    </p>
                    <p className="text-xl font-bold text-foreground">
                      {polls.filter((poll) => getPollStatus(poll) === "active").length}
                    </p>
                  </div>
                  <Clock className="h-6 w-6 text-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-card/80 border transition-colors hover:border-accent/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Upcoming
                    </p>
                    <p className="text-xl font-bold text-foreground">
                      {polls.filter((poll) => getPollStatus(poll) === "upcoming").length}
                    </p>
                  </div>
                  <Calendar className="h-6 w-6 text-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-card/80 border transition-colors hover:border-accent/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Expired
                    </p>
                    <p className="text-xl font-bold text-foreground">
                      {polls.filter((poll) => getPollStatus(poll) === "expired").length}
                    </p>
                  </div>
                  <HourglassIcon className="h-6 w-6 text-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="mb-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              {/* Left Section: Search + Filters */}
              <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
                  <Input
                    placeholder="Search polls by question..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 border-2 bg-card focus:border-accent transition-colors"
                  />
                </div>

                {/* Category Filter Dropdown */}
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-[200px] border-2 pl-10 bg-card focus:border-accent">
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

                {/* Status Filter Dropdown */}
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
                  <Select
                    value={selectedStatus}
                    onValueChange={(value) => setSelectedStatus(value as 'all' | 'active' | 'upcoming' | 'expired')}
                  >
                    <SelectTrigger className="w-[180px] border-2 pl-10 bg-card focus:border-accent">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      {pollStatuses.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Right Section: Create Poll Button */}
              <Button
                onClick={() => {
                  resetForm()
                  const now = new Date()
                  const defaultEnd = new Date(now.getTime() + 4 * 60 * 60 * 1000)
                  setStartTime(now.toISOString().substring(0, 16))
                  setEndTime(defaultEnd.toISOString().substring(0, 16))
                  setCreatePollModalOpen(true)
                  setTimeout(() => document.getElementById("question")?.focus(), 100)
                }}
                className="bg-accent text-accent-foreground transition-all duration-200 hover:bg-accent/90 hover:shadow-xl shadow-lg"
                size="lg"
              >
                <PlusCircle className="mr-2 h-5 w-5" />
                Create Poll
              </Button>
            </div>
          </div>
          

          {polls.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
              {polls.map((poll) => {
                const status = getPollStatus(poll)
                return (
                  <Card
                    key={poll.id}
                    className="group border-2 bg-gradient-to-br from-card to-card/80 transition-all duration-300 hover:border-accent/50 hover:shadow-xl"
                  >
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="mb-3 line-clamp-2 text-foreground text-lg font-bold">
                            {poll.question}
                          </CardTitle>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="bg-muted/50 text-xs">
                              <Calendar className="mr-1 h-3 w-3 text-foreground" />
                              {new Date(poll.created_at).toLocaleDateString()}
                            </Badge>

                            {(poll.tags || []).map((tag) => (
                              <Badge
                                key={tag}
                                className=" text-xs"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {status === 'active' && (
                              <Badge className="  text-xs">
                                <HourglassIcon className="mr-1 h-3 w-3" />
                                Active
                              </Badge>
                            )}
                            {status === 'upcoming' && (
                              <Badge variant="outline" className=" text-xs">
                                <Calendar className="mr-1 h-3 w-3" />
                                Upcoming
                              </Badge>
                            )}
                            {status === 'expired' && (
                              <Badge className="text-xs">
                                <HourglassIcon className="mr-1 h-3 w-3" />
                                Expired
                              </Badge>
                            )}
                          </div>
                        </div>
                        {poll.file_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewExtractedText(poll)}
                            className="ml-2 flex-shrink-0 "
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="space-y-2 text-sm text-foreground">

                        {status === 'active' && (
                          <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
                            <HourglassIcon className="h-3 w-3" />
                            Expires{' '}
                            {formatDistanceToNow(new Date(poll.end_at || ''), {
                              addSuffix: true,
                            })}
                          </p>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="flex flex-1 flex-col justify-between">
                      <div className="mb-4 space-y-3">
                        {[poll.option1, poll.option2, poll.option3, poll.option4].map(
                          (option, idx) => (
                            <div
                              key={idx}
                              className="flex items-center rounded-lg border border-border/50 bg-muted/30 p-3 transition-colors hover:border-accent/30"
                            >
                              <span className="truncate text-sm font-medium text-foreground">
                                {option}
                              </span>
                            </div>
                          ),
                        )}
                      </div>

                      <Separator className="my-4" />

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {poll.file_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDirectDownload(poll.file_url!)}
                              className="hover:bg-accent/10 hover:text-foreground"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShowResults(poll)}
                            className="hover:bg-accent/10 hover:text-foreground"
                          >
                            <TrendingUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShowComments(poll)}
                            className="hover:bg-accent/10 hover:text-foreground"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditPoll(poll)}
                            className=" hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => confirmDeletePoll(poll.id, poll.file_url)}
                            className="hover:bg-red-50 hover:text-foreground"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card className="border-2 border-dashed border-muted-foreground/20 bg-gradient-to-br from-card to-muted/10">
              <CardContent className="flex flex-col items-center justify-center py-20">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-accent/10">
                  <BarChartIcon className="h-10 w-10 text-foreground" />
                </div>
                <h3 className="mb-3 text-2xl font-bold text-foreground">
                  No polls yet
                </h3>
                <p className="max-w-md text-balance text-center text-muted-foreground">
                  Get started by creating your first poll using the Create Poll
                  button above.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal for viewing extracted text */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader className="p-6">
            <DialogTitle className="text-2xl font-bold">
              {modalTitle}
            </DialogTitle>
            <DialogDescription>Document content preview</DialogDescription>
          </DialogHeader>
          {isModalContentLoading ? (
            <div className="flex h-[50vh] items-center justify-center">
              <div className="flex flex-col items-center space-y-4">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                <p className="text-muted-foreground">Loading document...</p>
              </div>
            </div>
          ) : (
            <div className="max-h-[calc(90vh-100px)] overflow-y-auto p-6">
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: modalContent }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog for showing poll results */}
      <Dialog open={isResultsModalOpen} onOpenChange={setIsResultsModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader className="space-y-3">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <DialogTitle className="text-xl font-bold">
                Poll Results
              </DialogTitle>
            </div>
            <DialogDescription className="font-semibold">
              {selectedPoll?.question}
            </DialogDescription>
          </DialogHeader>
          <PollResultsGraph
            pollResults={pollResults}
            isLoading={isResultsLoading}
            pollQuestion={selectedPoll?.question || ''}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog for showing comments */}
      <Dialog open={isCommentsModalOpen} onOpenChange={setIsCommentsModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          {/* <DialogHeader>
            <DialogTitle className="text-2xl">Comments</DialogTitle>
          </DialogHeader> */}
          <div className="py-4">
            {selectedPoll && <PollComments pollId={selectedPoll.id} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog for delete confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-3">
            <div className="flex items-center space-x-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full ">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Delete Poll</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. This will permanently delete the
                  poll and all its responses.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="mt-6 flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pollToDelete) {
                  handleDeletePoll(pollToDelete.id, pollToDelete.fileUrl)
                  setPollToDelete(null)
                  setShowDeleteConfirm(false)
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Poll
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createPollModalOpen} onOpenChange={setCreatePollModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto border-2">
          <DialogHeader className="pb-6 space-y-4">
            <div className="flex items-center space-x-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                <PlusCircle className="h-6 w-6 text-accent" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold text-foreground">
                  Create New Poll
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Fill out the details to create a new poll
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-2 space-y-6">
            <div className="space-y-3">
              <Label htmlFor="question" className="text-base font-semibold text-foreground">
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
                className="border-2 bg-card focus:border-accent transition-colors"
              />
              <p className="flex justify-between text-sm text-muted-foreground">
                <span>Enter your poll question</span>
                <span className={question.length > 40 ? 'text-amber-600' : ''}>
                  {question.length}/50 characters
                </span>
              </p>
            </div>

            <div className="space-y-4">
              <Label className="text-base font-semibold text-foreground">
                Answer Options
              </Label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                      className="border-2 bg-card focus:border-accent transition-colors"
                    />
                    <p className="flex justify-end text-xs text-muted-foreground">
                      <span className={opt.length > 8 ? 'text-amber-600' : ''}>
                        {opt.length}/10 characters
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="poll_type" className="text-base font-semibold text-foreground">
                Poll Type
              </Label>
              <Select
                value={pollType}
                onValueChange={(value) =>
                  setPollType(value as 'single' | 'multiple' | 'ranked')
                }
              >
                <SelectTrigger id="poll_type" className="border-2 bg-card focus:border-accent transition-colors">
                  <SelectValue placeholder="Select poll type" />
                </SelectTrigger>
                <SelectContent className="border-2 bg-card">
                  <SelectItem value="single">Single Choice</SelectItem>
                  <SelectItem value="multiple">Multiple Choice</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Choose if users can select one or multiple options.
              </p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="category" className="text-base font-semibold text-foreground">
                Category
              </Label>
              <Select value={tags} onValueChange={setTags}>
                <SelectTrigger id="category" className="border-2 bg-card focus:border-accent transition-colors">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent className="border-2 bg-card">
                  <SelectItem value="all">All Categories</SelectItem>
                  {pollCategories.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Select a predefined category for your poll.
              </p>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold text-foreground">
                Poll Schedule
              </Label>
              <p className="text-sm text-muted-foreground">
                Set the start and end dates/times for the poll.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="start_time" className="text-foreground">
                    Start Time
                  </Label>
                  <Input
                    id="start_time"
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="border-2 bg-card focus:border-accent transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_time" className="text-foreground">
                    End Time
                  </Label>
                  <Input
                    id="end_time"
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="border-2 bg-card focus:border-accent transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="file" className="text-base font-semibold text-foreground">
                Supporting Document
              </Label>
              <div className="relative">
                <Input
                  id="file"
                  type="file"
                  onChange={handleFileChange}
                  className="border-2 bg-card focus:border-accent transition-colors"
                />
                {file && (
                  <div className="mt-3 rounded-lg border border-border/50 bg-muted/20 p-3">
                    <p className="flex items-center text-sm text-foreground">
                      <FileText className="mr-2 h-4 w-4" />
                      <span className="font-medium">{file.name}</span>
                      <span className="ml-2 text-muted-foreground">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </p>
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Upload a document to support your poll (optional, 10 KB - 5000
                KB).
              </p>
            </div>

            <Separator className="my-6" />

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Button
                onClick={handleSavePoll}
                disabled={loading}
                className="flex-1 bg-accent text-accent-foreground shadow-lg hover:bg-accent/90"
              >
                {loading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : editingId ? (
                  <>
                    <Pencil className="mr-2 h-4 w-4" />
                    <span>Update Poll</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    <span>Create Poll</span>
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={resetForm}
                className="flex-1 border-2 bg-transparent transition-colors hover:border-accent"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}