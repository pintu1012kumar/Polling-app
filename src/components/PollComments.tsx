"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  MessageSquare,
  RefreshCw,
  Send,
  ArrowBigUp,
  ArrowBigDown,
  Flag,
  Trash2,
  Reply,
  Loader2,
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
  parent_id: string | null
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

const buildCommentTree = (comments: Comment[]): CommentTree[] => {
  const map: Record<string, CommentTree> = {}
  const tree: CommentTree[] = []

  comments.forEach(c => {
    map[c.id] = { ...c, children: [] }
  })

  comments.forEach(c => {
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id].children.push(map[c.id])
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
  newCommentContent,
  setNewCommentContent,
  onReply,
  onCancelReply,
  onPostReply,
  onVote,
  onDelete,
  onFlag,
  expandedComments,
  onToggleReplies,
  isPostingReply,
}: any) => {
  const isExpanded = expandedComments.has(comment.id)
  const isReplyingHere = replyingTo === comment.id

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-4">
        <Avatar className="w-9 h-9 flex-shrink-0">
          <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${comment.author_username}`} />
          <AvatarFallback>{comment.author_username.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
            <span className="font-semibold text-sm text-foreground truncate">{comment.author_username}</span>
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
            <Button variant="ghost" size="sm" className="h-auto p-1 text-xs hover:text-primary transition-colors"
              onClick={() => onVote(comment.id, "up")}>
              <ArrowBigUp className="w-4 h-4 mr-1" /> {comment.upvotes}
            </Button>
            <Button variant="ghost" size="sm" className="h-auto p-1 text-xs hover:text-primary transition-colors"
              onClick={() => onVote(comment.id, "down")}>
              <ArrowBigDown className="w-4 h-4 mr-1" /> {comment.downvotes}
            </Button>

            {!comment.is_deleted && (
              <>
                <Button variant="ghost" size="sm" className="h-auto p-1 text-xs hover:text-primary transition-colors"
                  onClick={() => onReply(comment.id)}>
                  <Reply className="w-4 h-4 mr-1" /> Reply
                </Button>

                {comment.children.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-auto p-1 text-xs hover:text-primary transition-colors"
                    onClick={() => onToggleReplies(comment.id)}>
                    <ChevronDown className={`w-4 h-4 mr-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    {isExpanded ? "Hide" : "View"} {comment.children.length}{" "}
                    {comment.children.length === 1 ? "reply" : "replies"}
                  </Button>
                )}

                {currentUserId === comment.user_id && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-auto p-1 text-xs text-black transition-colors">
                        <Trash2 className="w-4 h-4 mr-1" /> Delete
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
                        <AlertDialogAction onClick={() => onDelete(comment.id)} className="">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {currentUserId !== comment.user_id && (
                  <Button variant="ghost" size="sm" className="h-auto p-1 text-xs text-yellow-500 hover:text-yellow-600 transition-colors"
                    onClick={() => onFlag(comment.id)}>
                    <Flag className="w-4 h-4 mr-1" /> Flag
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Reply input */}
          {isReplyingHere && (
            <div className="mt-4 space-y-2">
              <Textarea
                placeholder={`Replying to ${comment.author_username}...`}
                value={newCommentContent}
                onChange={(e) => setNewCommentContent(e.target.value)}
                className="bg-muted"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={onCancelReply}>
                  Cancel
                </Button>
                <Button size="sm" onClick={onPostReply} disabled={isPostingReply} className="flex items-center gap-2">
                  {isPostingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {isPostingReply ? "Posting..." : "Reply"}
                </Button>
              </div>
            </div>
          )}

          {/* Nested replies */}
          {isExpanded && comment.children.length > 0 && (
            <div className="ml-4 mt-4 border-l-2 border-border pl-4">
              {comment.children.map((child: any) => (
                <CommentItem
                  key={child.id}
                  comment={child}
                  currentUserId={currentUserId}
                  replyingTo={replyingTo}
                  newCommentContent={newCommentContent}
                  setNewCommentContent={setNewCommentContent}
                  onReply={onReply}
                  onCancelReply={onCancelReply}
                  onPostReply={onPostReply}
                  onVote={onVote}
                  onDelete={onDelete}
                  onFlag={onFlag}
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
  const [newCommentContent, setNewCommentContent] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isPosting, setIsPosting] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())

  const fetchComments = async () => {
    setIsLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    setCurrentUserId(session?.user.id || null)

    const { data, error } = await supabase
      .from("comments")
      .select("*, profiles(username)")
      .eq("poll_id", pollId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error(error)
      toast.error("Failed to load comments", { description: error.message })
      setIsLoading(false)
      return
    }

    const mapped: Comment[] = data.map((c: any) => ({
      ...c,
      author_username: c.profiles.username,
    }))

    setComments(buildCommentTree(mapped))
    setIsLoading(false)
  }

  useEffect(() => {
    fetchComments()
  }, [pollId])

  const handlePostComment = async () => {
    if (!newCommentContent.trim()) {
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
      content: newCommentContent,
      parent_id: replyingTo,
    }

    const { error } = await supabase.from("comments").insert(newComment)
    if (error) {
      console.error(error)
      toast.error("Failed to post comment", { description: error.message })
    } else {
      setNewCommentContent("")
      setReplyingTo(null)
      fetchComments()
      toast.success("Comment posted successfully!")
    }
    setIsPosting(false)
  }

  const handleVote = async (id: string, type: "up" | "down") => {
    const { data, error } = await supabase.rpc("update_comment_vote", {
      comment_id: id,
      vote_type: type === "up" ? 1 : -1,
    })
    if (error) {
      console.error(error)
      toast.error("Failed to vote", { description: "You may have already voted on this comment." })
    } else {
      fetchComments()
    }
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("comments").delete().eq("id", id)
    if (error) {
      console.error(error)
      toast.error("Failed to delete comment")
    } else {
      fetchComments()
      toast.success("Comment deleted.")
    }
  }

  const handleFlag = async (id: string) => {
    const { error } = await supabase.from("comments").update({ is_flagged: true }).eq("id", id)
    if (error) {
      console.error(error)
      toast.error("Failed to flag comment")
    } else {
      fetchComments()
      toast.success("Comment flagged for review.")
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
    setNewCommentContent("")
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
      <div className="text-xl font-bold border-b pb-2 text-foreground">
        Comments ({comments.length})
      </div>

      {/* Root input */}
      <div className="p-4 rounded-lg border bg-card shadow-sm space-y-3">
        <Textarea
          placeholder="Write a new comment..."
          value={newCommentContent}
          onChange={(e) => setNewCommentContent(e.target.value)}
          className="bg-background min-h-[80px]"
        />
        <div className="flex justify-end gap-2">
          <Button onClick={handlePostComment} disabled={isPosting || !newCommentContent.trim()} className="flex items-center gap-2">
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
                newCommentContent={newCommentContent}
                setNewCommentContent={setNewCommentContent}
                onReply={setReplyingTo}
                onCancelReply={handleCancelReply}
                onPostReply={handlePostComment}
                onVote={handleVote}
                onDelete={handleDelete}
                onFlag={handleFlag}
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