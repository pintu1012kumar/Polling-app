"use client"

import { useState } from "react"
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, LineChart, Line } from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Terminal, Loader2, Download, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// Interfaces for data types
interface PollResult {
  name: string
  votes: number
  category?: string
  createdAt?: string // Used to sort data for line chart
}

interface PollResultsGraphProps {
  pollResults: PollResult[]
  isLoading: boolean
  pollQuestion: string
}

// Reusable color palette for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8A2BE2', '#6A5ACD', '#DC143C', '#228B22'];

export default function PollResultsGraph({
  pollResults,
  isLoading,
  pollQuestion,
}: PollResultsGraphProps) {
  const [chartType, setChartType] = useState<"bar" | "pie" | "line">("bar")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")

  // Function to filter and sort the data
  const getFilteredData = () => {
    let data = pollResults;
    if (selectedCategory !== "all") {
      data = data.filter(result => result.category === selectedCategory);
    }
    // To make the line chart look like the image, the data should be sorted by a continuous value like date.
    // If your data has a 'createdAt' field, you can sort it like this:
    // data.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return data;
  }

  const filteredData = getFilteredData();
  const categories = [...new Set(pollResults.map(result => result.category))].filter(Boolean) as string[];

  const exportToCsv = () => {
    if (!filteredData || filteredData.length === 0) {
      return
    }

    const headers = ["Option", "Votes", "Category"]
    const rows = filteredData.map(result => [result.name, result.votes, result.category || ''])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `${pollQuestion.replace(/\s+/g, '_').toLowerCase()}_results.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading results...</p>
      </div>
    )
  }

  const hasNoVotes = !filteredData || filteredData.length === 0 || filteredData.every(result => result.votes === 0);

  if (hasNoVotes) {
    return (
      <Alert variant="destructive">
        <Terminal className="h-4 w-4" />
        <AlertTitle>No Results Found!</AlertTitle>
        <AlertDescription>
          There are no votes recorded for this poll yet based on the current filters.
        </AlertDescription>
      </Alert>
    )
  }

  const totalVotes = filteredData.reduce((sum, result) => sum + result.votes, 0)

  return (
    <Card className="border-none shadow-none">
      <CardContent className="p-0 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Tabs value={chartType} onValueChange={(value) => setChartType(value as "bar" | "pie" | "line")}>
            <TabsList>
              <TabsTrigger value="bar">Bar Chart</TabsTrigger>
              <TabsTrigger value="pie">Pie Chart</TabsTrigger>
              <TabsTrigger value="line">Line Chart</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Popover>
              {/* <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Filter className="mr-2 h-4 w-4" />
                  Filters
                </Button>
              </PopoverTrigger> */}
              <PopoverContent className="w-56" align="end">
                <div className="grid gap-2">
                  <h4 className="font-medium leading-none">Filters</h4>
                  <div className="grid gap-2">
                    {categories.length > 0 && (
                      <div className="grid grid-cols-3 items-center gap-4">
                        <span className="text-sm font-medium">Category</span>
                        <Select onValueChange={setSelectedCategory} defaultValue="all">
                          <SelectTrigger className="col-span-2 h-8">
                            <SelectValue placeholder="All Categories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {categories.map(category => (
                              <SelectItem key={category} value={category}>{category}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Button onClick={exportToCsv} className="flex items-center gap-2" size="sm">
              <Download className="w-4 h-4" />
              CSV
            </Button>
          </div>
        </div>
        <Separator />
        
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "bar" ? (
              <BarChart data={filteredData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={80} fontSize={12} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="votes" fill="hsl(var(--primary))" name="Votes" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : chartType === "pie" ? (
              <PieChart>
                <Pie
                  dataKey="votes"
                  nameKey="name"
                  data={filteredData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  fill="#8884d8"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {filteredData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            ) : (
             <LineChart
  data={filteredData}
  margin={{ top: 20, right: 30, left: 20, bottom: 40 }}
>
  <XAxis
    dataKey="name"
    interval={0}
    angle={-45}
    textAnchor="end"
    height={60}
    fontSize={12}
    stroke="#000" // Black axis line & labels
  />
  <YAxis allowDecimals={false} stroke="#000" />
  <Tooltip />

  {/* Solid black line with round dots */}
  <Line
    type="monotone"
    dataKey="votes"
    stroke="#000"
    strokeWidth={3}
    dot={{ r: 6, fill: "#000", stroke: "#000" }}   // black filled dots
    activeDot={{ r: 8, fill: "#000", stroke: "#000" }}
  />
</LineChart>

            )}
          </ResponsiveContainer>
        </div>
        <div className="text-center text-sm text-muted-foreground">
          Total votes: {totalVotes}
        </div>
      </CardContent>
    </Card>
  )
}