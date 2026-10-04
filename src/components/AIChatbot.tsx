import { useState, useEffect, useRef } from "react";
import { fetchChatHistory, saveChatMessage, getChatStreamUrl, clearChatHistory, fetchChatSessions, fetchBusinessContext, getAuthToken, type ChatSession, type DataSource } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Loader2, Sparkles, Trash2, History, Plus, MessageSquare, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

export default function AIChatbot({ fullHeight = false }: { fullHeight?: boolean }) {
  const [sessionId, setSessionId] = useState("default");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load list of past sessions
  const loadSessions = async () => {
    try {
      const data = await fetchChatSessions();
      setSessions(data || []);
    } catch (err) {
      console.error("Failed to load chat sessions:", err);
    }
  };

  // Load history for active session ID
  const loadHistory = async (sid: string) => {
    try {
      const data = await fetchChatHistory(sid);
      if (data && data.length > 0) {
        setMessages(data.map(d => ({ role: d.role as "user" | "assistant", content: d.content })));
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to load chat history:", err);
      setMessages([]);
    }
  };

  useEffect(() => {
    loadSessions();
    loadHistory(sessionId);
    fetchBusinessContext().then((context) => setDataSources(context.sources)).catch(() => setDataSources([]));
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleNewChat = () => {
    const newId = `session_${Date.now()}`;
    setSessionId(newId);
    setMessages([]);
    setShowHistory(false);
    toast.success("Started a new chat session");
  };

  const handleSelectSession = (sid: string) => {
    setSessionId(sid);
    setShowHistory(false);
  };

  const handleClearCurrentSession = async () => {
    try {
      await clearChatHistory(sessionId);
      setMessages([]);
      await loadSessions();
      toast.success("Chat history cleared");
    } catch (err: any) {
      toast.error(err.message || "Failed to clear chat history");
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sid: string) => {
    e.stopPropagation();
    try {
      await clearChatHistory(sid);
      if (sid === sessionId) {
        setMessages([]);
      }
      await loadSessions();
      toast.success("Conversation deleted");
    } catch (err: any) {
      toast.error("Failed to delete conversation");
    }
  };

  const send = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    let assistantSoFar = "";
    try {
      await saveChatMessage("user", userMsg.content, sessionId);
      const resp = await fetch(getChatStreamUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        body: JSON.stringify({ messages: newMessages, session_id: sessionId }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Failed to get response");
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          let parsed: any;
          try {
            parsed = JSON.parse(jsonStr);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            assistantSoFar += content;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
              }
              return [...prev, { role: "assistant", content: assistantSoFar }];
            });
          }
        }
      }

      // Refresh sessions list to show newly created conversation title
      loadSessions();
    } catch (e: any) {
      toast.error(e.message || "Failed to get AI response");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      className={cn(
        "glow-card flex flex-col transition-all duration-300 relative overflow-hidden bg-card border border-border",
        fullHeight ? "h-full" : "h-[500px]"
      )}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Top Header Bar */}
      <div className={cn(
        "flex items-center justify-between p-4 border-b border-border transition-all bg-card/80 backdrop-blur-md z-10",
        fullHeight ? "bg-accent/20" : ""
      )}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-display text-base font-semibold text-foreground">Ask Your Data</h3>
        </div>

        <div className="flex items-center gap-2">
          {/* New Chat Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewChat}
            className="h-8 gap-1 text-xs border-primary/30 text-primary hover:bg-primary/10"
            title="Start a new chat"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Chat</span>
          </Button>

          {/* Previous Chats History Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadSessions();
              setShowHistory(!showHistory);
            }}
            className={cn(
              "h-8 gap-1.5 text-xs text-muted-foreground transition-colors",
              showHistory && "bg-primary/10 text-primary border-primary/30"
            )}
            title="View previous chats history"
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Previous Chats</span>
          </Button>

          {/* Clear Current Chat Button */}
          {messages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearCurrentSession}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
              title="Clear current chat"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Body (Chat Area + Slide-over History Drawer) */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        
        {/* Chat Messages Scroll Container */}
        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6 max-w-4xl mx-auto">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-14 w-14 rounded-2xl bg-blue-50 border border-blue-200/60 flex items-center justify-center mb-4 shadow-sm">
                  <Bot className="h-7 w-7 text-blue-600" />
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-1">What would you like to know about your business?</h4>
                <p className="text-xs text-slate-500 max-w-sm mb-6">
                  Ask in natural language or any script — English, Hindi (हिंदी), Telugu (తెలుగు), Tamil (தமிழ்), Spanish.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-lg w-full">
                  {[
                    "📊 Analyze my profit margin & cash flow",
                    "🚨 What caused my recent expense spike?",
                    "🏷️ Suggest pricing strategy for low-selling products",
                    "💡 How can I increase monthly revenue by 10%?",
                  ].map((promptText, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setInput(promptText.slice(3).trim());
                      }}
                      className="text-left p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-blue-50 hover:border-blue-200/80 text-xs font-semibold text-slate-700 hover:text-blue-700 transition-all shadow-2xs"
                    >
                      {promptText}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="rounded-full bg-primary h-8 w-8 flex items-center justify-center shrink-0 self-start shadow-lg shadow-primary/20">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <div className={cn(
                  "rounded-2xl p-4 max-w-[85%] text-sm shadow-sm transition-all animate-in fade-in slide-in-from-bottom-2",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-none"
                    : "bg-accent/80 backdrop-blur-sm text-foreground border border-border/50 rounded-tl-none"
                )}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm prose-slate max-w-none text-slate-800">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="leading-relaxed">{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="rounded-full bg-secondary h-8 w-8 flex items-center justify-center shrink-0 self-start shadow-md">
                    <User className="h-4 w-4 text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-4">
                <div className="rounded-full bg-primary/10 h-8 w-8 flex items-center justify-center shrink-0 self-start">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="rounded-2xl bg-accent/80 p-4 border border-border/50 rounded-tl-none">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Previous Chats History Drawer Slide-Over */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute inset-y-0 right-0 w-80 sm:w-96 bg-card border-l border-border shadow-2xl z-20 flex flex-col"
            >
              <div className="p-4 border-b border-border flex items-center justify-between bg-accent/20">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-sm">Previous Conversations</h4>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowHistory(false)} className="h-7 w-7">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <ScrollArea className="flex-1 p-3">
                <div className="space-y-2">
                  {sessions.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-xs">
                      No previous chat history found.
                    </div>
                  ) : (
                    sessions.map((s) => {
                      const isActive = s.session_id === sessionId;
                      return (
                        <div
                          key={s.session_id}
                          onClick={() => handleSelectSession(s.session_id)}
                          className={cn(
                            "p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start justify-between group",
                            isActive
                              ? "bg-primary/10 border-primary/40 text-foreground shadow-xs"
                              : "border-border/60 bg-background/50 hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 pr-2">
                            <MessageSquare className={cn("h-4 w-4 shrink-0 mt-0.5", isActive ? "text-primary" : "text-muted-foreground")} />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate leading-snug">
                                {s.title || "Chat Session"}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {s.message_count} messages
                              </p>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => handleDeleteSession(e, s.session_id)}
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all shrink-0"
                            title="Delete this session"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })
                  )}
                  {msg.role === "assistant" && (() => {
                    const citedIds = [...new Set((msg.content.match(/\[S\d+\]/g) || []).map((citation) => citation.slice(1, -1)))];
                    const citedSources = citedIds.map((id) => dataSources.find((source) => source.id === id)).filter((source): source is DataSource => Boolean(source));
                    return citedSources.length > 0 ? (
                      <div className="mt-2 border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
                        Sources: {citedSources.map((source) => `${source.id} ${source.label}`).join(" · ")}
                      </div>
                    ) : null;
                  })()}
                </div>
              </ScrollArea>

              <div className="p-3 border-t border-border bg-accent/10">
                <Button onClick={handleNewChat} className="w-full h-9 text-xs gap-1.5 font-bold">
                  <Plus className="h-4 w-4" /> Start New Conversation
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Input Area */}
      <div className={cn(
        "p-6 border-t border-border transition-all z-10",
        fullHeight ? "bg-accent/10" : ""
      )}>
        <div className="max-w-4xl mx-auto flex gap-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about revenue, expenses, products, or trends..."
            className="flex-1 bg-background h-12 shadow-inner border-border focus:ring-primary"
            disabled={isLoading}
          />
          <Button onClick={send} disabled={isLoading || !input.trim()} size="icon" className="shrink-0 h-12 w-12 rounded-xl shadow-lg shadow-primary/20">
            <Send className="h-5 w-5" />
          </Button>
        </div>
        {fullHeight && (
          <p className="text-[10px] text-muted-foreground text-center mt-4 uppercase tracking-widest font-bold opacity-50">
            Business answers use company-scoped data and cite supporting sources.
          </p>
        )}
      </div>
    </motion.div>
  );
}
