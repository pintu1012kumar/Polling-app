import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

interface PollResultsModalProps {
  pollId: string;
  question: string;
  options: string[];
  isOpen: boolean;
  onClose: () => void;
}

interface PollData {
  name: string;
  votes: number;
}

export const PollResultsModal = ({ pollId, question, options, isOpen, onClose }: PollResultsModalProps) => {
  const [data, setData] = useState<PollData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const fetchResults = async () => {
      setLoading(true);
      const { data: responses, error } = await supabase
        .from("poll_responses")
        .select("selected_option")
        .eq("poll_id", pollId);

      if (error) {
        console.error("Error fetching poll results:", error);
        setLoading(false);
        return;
      }

      // Count votes for each option
      const voteCounts = responses.reduce((acc, current) => {
        acc[current.selected_option] = (acc[current.selected_option] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Format data for the chart
      const chartData = options.map((option) => ({
        name: option,
        votes: voteCounts[option] || 0,
      }));

      setData(chartData);
      setLoading(false);
    };

    fetchResults();
  }, [pollId, options, isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Poll Results</DialogTitle>
          <DialogDescription className="text-gray-800 font-semibold">{question}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center items-center h-40">Loading results...</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="votes" fill="#3b82f6" name="Votes" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </DialogContent>
    </Dialog>
  );
};