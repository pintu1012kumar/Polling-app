"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  MessageSquare,
  Loader2,
  Send,
  Reply,
  Trash2,
  ChevronDown,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { formatDistanceToNow } from "date-fns"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"

// Interfaces
interface Comment {
  id: string
  content: string
  user_id: string
  poll_id: string
  parent_comment_id: string | null
  upvotes: number
  downvotes: number
  created_at: string
  is_flagged: boolean
  is_deleted: boolean
  author_username: string
}

interface CommentTree extends Comment {
  children: CommentTree[]
}

interface PollCommentsProps {
  pollId: string
}

interface CommentItemProps {
  comment: CommentTree
  currentUserId: string | null
  replyingTo: string | null
  replyContent: string
  setReplyContent: (content: string) => void
  onReply: (id: string) => void
  onCancelReply: () => void
  onPostReply: (source: "reply") => void
  onVote: (id: string, type: "up" | "down") => void
  onDelete: (id: string) => void
  expandedComments: Set<string>
  onToggleReplies: (id: string) => void
  isPostingReply: boolean
}

// Define the type for the data returned from the query
interface CommentDataFromSupabase {
  id: string
  content: string
  user_id: string
  poll_id: string
  parent_comment_id: string | null
  upvotes: number
  downvotes: number
  created_at: string
  is_flagged: boolean
  is_deleted: boolean
  profiles: { username: string | null } | null
}

const buildCommentTree = (comments: Comment[]): CommentTree[] => {
  const map: Record<string, CommentTree> = {}
  const tree: CommentTree[] = []

  comments.forEach(c => {
    map[c.id] = { ...c, children: [] }
  })

  comments.forEach(c => {
    if (c.parent_comment_id && map[c.parent_comment_id]) {
      map[c.parent_comment_id].children.push(map[c.id])
    } else {
      tree.push(map[c.id])
    }
  })

  return tree
}

const CommentItem = ({
  comment,
  currentUserId,
  replyingTo,
  replyContent,
  setReplyContent,
  onReply,
  onCancelReply,
  onPostReply,
  onVote,
  onDelete,
  expandedComments,
  onToggleReplies,
  isPostingReply,
}: CommentItemProps) => {
  const isExpanded = expandedComments.has(comment.id)
  const isReplyingHere = replyingTo === comment.id

  const authorUsername = comment.author_username || 'Guest'
  const authorInitials = authorUsername.slice(0, 2).toUpperCase()

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-4">
        <Avatar className="w-9 h-9 flex-shrink-0">
          <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${authorUsername}`} />
          <AvatarFallback>{authorInitials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
            <span className="font-semibold text-sm text-foreground truncate">{authorUsername}</span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
          </div>
          <div className="text-sm text-foreground mb-3 break-words">
            {comment.is_deleted ? (
              <span className="text-muted-foreground italic">This comment has been deleted.</span>
            ) : (
              comment.content
            )}
          </div>

          <div className="flex items-center gap-2 text-muted-foreground text-xs flex-wrap">
            {!comment.is_deleted && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1 text-xs hover:text-primary transition-colors"
                  onClick={() => onReply(comment.id)}
                >
                  <span className="flex items-center gap-1">
                    <Reply className="w-4 h-4" /> Reply
                  </span>
                </Button>

                {comment.children.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-1 text-xs hover:text-primary transition-colors"
                    onClick={() => onToggleReplies(comment.id)}
                  >
                    <span className="flex items-center gap-1">
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      {isExpanded ? "Hide" : "View"} {comment.children.length}{" "}
                      {comment.children.length === 1 ? "reply" : "replies"}
                    </span>
                  </Button>
                )}

                {currentUserId === comment.user_id && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-auto p-1 text-xs text-black transition-colors">
                        <span className="flex items-center gap-1">
                          <Trash2 className="w-4 h-4" /> Delete
                        </span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action will permanently delete your comment from the database.
                          You will not be able to recover this comment.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete(comment.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </>
            )}
          </div>

          {isReplyingHere && (
            <div className="mt-4 space-y-2">
              <Textarea
                placeholder={`Replying to ${authorUsername}...`}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="bg-muted"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={onCancelReply}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => onPostReply("reply")}
                  disabled={isPostingReply || !replyContent.trim()}
                  className="flex items-center gap-2"
                >
                  {isPostingReply ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Posting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Reply</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {isExpanded && comment.children.length > 0 && (
            <div className="ml-4 mt-4 border-l-2 border-border pl-4">
              {comment.children.map((child: CommentTree) => (
                <CommentItem
                  key={child.id}
                  comment={child}
                  currentUserId={currentUserId}
                  replyingTo={replyingTo}
                  replyContent={replyContent}
                  setReplyContent={setReplyContent}
                  onReply={onReply}
                  onCancelReply={onCancelReply}
                  onPostReply={onPostReply}
                  onVote={onVote}
                  onDelete={onDelete}
                  expandedComments={expandedComments}
                  onToggleReplies={onToggleReplies}
                  isPostingReply={isPostingReply}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PollComments({ pollId }: PollCommentsProps) {
  const [comments, setComments] = useState<CommentTree[]>([])
  const [mainCommentContent, setMainCommentContent] = useState("")
  const [replyContent, setReplyContent] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isPosting, setIsPosting] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())

  const fetchComments = useCallback(async () => {
    setIsLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    setCurrentUserId(session?.user.id || null)

    const { data, error } = await supabase
      .from("poll_comments")
      .select("*, profiles(username)")
      .eq("poll_id", pollId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error(error)
      toast.error("Failed to load comments", { description: error.message })
      setIsLoading(false)
      return
    }

    const mapped: Comment[] = (data as unknown as CommentDataFromSupabase[]).map(c => ({
      ...c,
      author_username: c.profiles?.username || 'Guest',
    }));

    setComments(buildCommentTree(mapped))
    setIsLoading(false)
  }, [pollId])

  useEffect(() => {
    fetchComments()
  }, [pollId, fetchComments])

  const handlePostComment = async (source: "root" | "reply") => {
    const content = source === "reply" ? replyContent : mainCommentContent

    if (!content.trim()) {
      toast.warning("Comment cannot be empty")
      return
    }

    setIsPosting(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      toast.error("Authentication required", { description: "You must be logged in to comment." })
      setIsPosting(false)
      return
    }

    const newComment = {
      user_id: session.user.id,
      poll_id: pollId,
      content: content,
      parent_comment_id: source === "reply" ? replyingTo : null,
    }

    const { error } = await supabase.from("poll_comments").insert(newComment)
    if (error) {
      console.error(error)
      toast.error("Failed to post comment", { description: error.message })
    } else {
      if (source === "reply") {
        setReplyContent("")
      } else {
        setMainCommentContent("")
      }
      setReplyingTo(null)
      fetchComments()
      toast.success(`Comment posted from ${source === "reply" ? "reply" : "main"} input!`)
    }
    setIsPosting(false)
  }

  const handleVote = async (id: string, type: "up" | "down") => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      toast.error("Authentication required", { description: "You must be logged in to vote." })
      return
    }

    const { error } = await supabase.rpc("update_comment_vote", {
      comment_id_param: id,
      vote_type_param: type === "up" ? 1 : -1,
      user_id_param: session.user.id
    })

    if (error) {
      console.error(error)
      toast.error("Failed to vote", { description: "You may have already voted on this comment." })
    } else {
      fetchComments()
      toast.success("Vote registered!")
    }
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("poll_comments").delete().eq("id", id)
    if (error) {
      console.error(error)
      toast.error("Failed to delete comment")
    } else {
      fetchComments()
      toast.success("Comment deleted.")
    }
  }

  const handleToggleReplies = (id: string) => {
    setExpandedComments(prev => {
      const copy = new Set(prev)
      if (copy.has(id)) copy.delete(id)
      else copy.add(id)
      return copy
    })
  }

  const handleCancelReply = () => {
    setReplyingTo(null)
    setReplyContent("")
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading comments...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-xl font-bold border-b pb-2 text-foreground flex items-center justify-between">
        Comments ({comments.length})
      </div>

      {/* Root input */}
      <div className="p-4 rounded-lg border bg-card shadow-sm space-y-3">
        <Textarea
          placeholder="Write a new comment..."
          value={mainCommentContent}
          onChange={(e) => setMainCommentContent(e.target.value)}
          className="bg-background min-h-[80px]"
        />
        <div className="flex justify-end gap-2">
          <Button
            onClick={() => handlePostComment("root")}
            disabled={isPosting || !mainCommentContent.trim()}
            className="flex items-center gap-2"
          >
            {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isPosting ? "Posting..." : "Submit"}
          </Button>
        </div>
      </div>

      {/* Scrollable section */}
      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
        {comments.length === 0 ? (
          <Alert className="text-center py-8">
            <MessageSquare className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <AlertTitle>No Comments Yet</AlertTitle>
            <AlertDescription>Be the first to leave a comment. Your voice matters!</AlertDescription>
          </Alert>
        ) : (
          comments.map(c => (
            <div key={c.id}>
              <CommentItem
                comment={c}
                currentUserId={currentUserId}
                replyingTo={replyingTo}
                replyContent={replyContent}
                setReplyContent={setReplyContent}
                onReply={setReplyingTo}
                onCancelReply={handleCancelReply}
                onPostReply={handlePostComment}
                onVote={handleVote}
                onDelete={handleDelete}
                expandedComments={expandedComments}
                onToggleReplies={handleToggleReplies}
                isPostingReply={isPosting}
              />
              <div className="border-b last:border-b-0 border-border"></div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
