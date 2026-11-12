import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Terminal,
  Cpu,
  MapPin,
  Check,
  Copy,
  ChevronDown,
  ChevronRight,
  Layers,
  ArrowRight,
  AlertTriangle,
  Compass,
  Database,
  Sparkles,
  RotateCcw,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  AerodromeDataset,
  TaxiRouteResult,
  AnyDO272Feature,
} from '../types/do272';
import {
  AgentMessage,
  REGISTERED_MCP_TOOLS,
  runMCPAgent,
  AgentMapSyncPayload,
} from '../services/mcpAgentService';

interface MCPAgentChatProps {
  dataset: AerodromeDataset;
  onApplyMapGeometry: (payload: AgentMapSyncPayload) => void;
  onNavigateToMap?: () => void;
}

export const MCPAgentChat: React.FC<MCPAgentChatProps> = ({
  dataset,
  onApplyMapGeometry,
  onNavigateToMap,
}) => {
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content: `DO-272 Model Context Protocol (MCP) AI Client initialized for **${dataset.name} (${dataset.icao})**.

I am connected to the local DO-272 MCP Tool Server exposing 5 standards-compliant spatial analysis capabilities. You can command me to audit aerodrome geometries, calculate optimal ground taxiway paths, evaluate 3D FAA Part 77 obstacle clearance surfaces, or execute spatial PostGIS queries.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      thought: `Initialized stdio connection with DO-272 MCP server registry. 5 spatial analysis tools loaded for aerodrome ${dataset.icao}.`,
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [openThoughts, setOpenThoughts] = useState<Record<string, boolean>>({});
  const [openJsonRpc, setOpenJsonRpc] = useState<Record<string, boolean>>({});
  const [copiedPayloadId, setCopiedPayloadId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputPrompt).trim();
    if (!query || isProcessing) return;

    const userMsg: AgentMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsProcessing(true);

    try {
      const response = await runMCPAgent(query, dataset, messages);
      setMessages((prev) => [...prev, response]);

      // Automatically open thought for the newest response
      setOpenThoughts((prev) => ({ ...prev, [response.id]: true }));
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `MCP Tool execution failed: ${errorMsg}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyJsonRpc = (id: string, payload: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedPayloadId(id);
    setTimeout(() => setCopiedPayloadId(null), 2000);
  };

  const handleSyncToMap = (payload: AgentMapSyncPayload) => {
    onApplyMapGeometry(payload);
    if (onNavigateToMap) {
      onNavigateToMap();
    }
  };

  const quickPrompts = [
    {
      label: 'Audit DO-272 Quality',
      prompt: `Audit ${dataset.icao} against RTCA DO-272 data quality requirements and report geometric inconsistencies.`,
    },
    {
      label: 'Find Ground Taxi Route',
      prompt: `Calculate shortest ground taxi route from parking stand to runway holding position at ${dataset.icao}.`,
    },
    {
      label: 'Check Part 77 Obstacles',
      prompt: `Evaluate vertical structures at ${dataset.icao} for Part 77 approach surface penetrations.`,
    },
    {
      label: 'Spatial PostGIS SQL',
      prompt: `SELECT designator, lengthMeters, pcnRating FROM runways WHERE lengthMeters > 2500`,
    },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-slate-950 border border-slate-800 rounded-xl overflow-hidden font-sans">
      {/* Top Telemetry Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span className="font-semibold text-white tracking-wide">MCP Client Agent</span>
          </div>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400 font-mono">stdio: mcp_server.py</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400 font-mono tabular-nums">
            {REGISTERED_MCP_TOOLS.length} Tools Registered
          </span>
        </div>

        <div className="flex items-center gap-3 text-slate-400">
          <span className="font-mono">
            Active Aerodrome: <strong className="text-cyan-300">{dataset.icao}</strong>
          </span>
          <button
            onClick={() =>
              setMessages([
                {
                  id: 'reset-1',
                  role: 'assistant',
                  content: `Conversation reset. MCP Client ready for queries regarding **${dataset.name} (${dataset.icao})**.`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
              ])
            }
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors cursor-pointer"
            title="Clear Chat History"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Feed</span>
          </button>
        </div>
      </div>

      {/* Preset Query Action Bar */}
      <div className="bg-slate-950/70 border-b border-slate-900 px-5 py-2 flex items-center gap-2 overflow-x-auto text-xs">
        <span className="text-slate-500 whitespace-nowrap text-[11px] font-mono uppercase tracking-wider">
          Suggested Prompts:
        </span>
        {quickPrompts.map((qp, idx) => (
          <button
            key={idx}
            disabled={isProcessing}
            onClick={() => handleSendMessage(qp.prompt)}
            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 rounded-md transition-colors whitespace-nowrap cursor-pointer text-xs"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Scrollable Message Feed */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            {/* Role Header */}
            <div className="flex items-center gap-2 mb-1.5 px-1 text-[11px] text-slate-400 font-mono">
              {msg.role === 'user' ? (
                <span>Operator</span>
              ) : (
                <div className="flex items-center gap-1.5 text-cyan-400 font-medium">
                  <Bot className="w-3.5 h-3.5" />
                  <span>DO-272 MCP Agent</span>
                </div>
              )}
              <span className="text-slate-600">·</span>
              <span className="tabular-nums text-slate-500">{msg.timestamp}</span>
            </div>

            {/* Message Body */}
            {msg.role === 'user' ? (
              <div className="max-w-2xl bg-cyan-950/50 border border-cyan-800/60 rounded-xl px-4 py-3 text-slate-100 text-sm leading-relaxed shadow-sm">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-3xl w-full bg-slate-900/90 border border-slate-800 rounded-xl p-4.5 space-y-4 text-sm text-slate-200 shadow-md">
                {/* Collapsible Agent Reasoning / Thought */}
                {msg.thought && (
                  <div className="bg-slate-950 rounded-lg border border-slate-800/80 overflow-hidden text-xs">
                    <button
                      onClick={() =>
                        setOpenThoughts((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                      }
                      className="w-full flex items-center justify-between px-3.5 py-2 bg-slate-950 hover:bg-slate-900/60 transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="font-mono text-[11px] font-semibold text-slate-300">
                          Agent Strategy & Reasoning Trace
                        </span>
                      </div>
                      {openThoughts[msg.id] ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </button>
                    {openThoughts[msg.id] && (
                      <div className="p-3 border-t border-slate-800/80 font-mono text-slate-400 text-[11px] leading-relaxed bg-black/30">
                        {msg.thought}
                      </div>
                    )}
                  </div>
                )}

                {/* Tool Invocations Telemetry */}
                {msg.toolInvocations && msg.toolInvocations.length > 0 && (
                  <div className="space-y-2">
                    {msg.toolInvocations.map((inv, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-950 border border-cyan-900/40 rounded-lg overflow-hidden text-xs"
                      >
                        <div className="flex items-center justify-between px-3.5 py-2 bg-slate-950 border-b border-slate-800/70">
                          <div className="flex items-center gap-2">
                            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="font-mono font-semibold text-emerald-300">
                              MCP Tool Call:
                            </span>
                            <code className="text-cyan-300 font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                              {inv.toolName}()
                            </code>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-slate-400 tabular-nums text-[11px]">
                              {inv.latencyMs}ms
                            </span>
                            <button
                              onClick={() =>
                                setOpenJsonRpc((prev) => ({
                                  ...prev,
                                  [`${msg.id}-${idx}`]: !prev[`${msg.id}-${idx}`],
                                }))
                              }
                              className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                            >
                              {openJsonRpc[`${msg.id}-${idx}`]
                                ? 'Hide JSON-RPC'
                                : 'Inspect JSON-RPC 2.0'}
                            </button>
                          </div>
                        </div>

                        {/* Expandable JSON-RPC 2.0 Inspector */}
                        {openJsonRpc[`${msg.id}-${idx}`] && (
                          <div className="p-3 bg-black/40 border-t border-slate-800 space-y-2 font-mono text-[11px]">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 font-semibold">
                                Request Payload (JSON-RPC 2.0):
                              </span>
                              <button
                                onClick={() =>
                                  handleCopyJsonRpc(`${msg.id}-${idx}`, inv.jsonRpcPayload)
                                }
                                className="flex items-center gap-1 text-[10px] text-slate-300 hover:text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700 cursor-pointer"
                              >
                                {copiedPayloadId === `${msg.id}-${idx}` ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy JSON</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <pre className="p-2.5 bg-slate-900 rounded border border-slate-800 text-cyan-300 overflow-x-auto max-h-48">
                              {JSON.stringify(inv.jsonRpcPayload, null, 2)}
                            </pre>
                            <span className="text-slate-400 font-semibold block pt-1">
                              Response Payload:
                            </span>
                            <pre className="p-2.5 bg-slate-900 rounded border border-slate-800 text-emerald-300 overflow-x-auto max-h-48">
                              {JSON.stringify(inv.result, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Main Content Body */}
                <div className="whitespace-pre-line leading-relaxed text-slate-200">
                  {msg.content}
                </div>

                {/* Map Synchronization Action CTA */}
                {msg.mapSyncPayload && (
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-400 font-mono">
                      {msg.mapSyncPayload.description}
                    </span>
                    <button
                      onClick={() => handleSyncToMap(msg.mapSyncPayload!)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium transition-colors shadow-sm cursor-pointer shrink-0"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Sync & View on Map</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="flex items-start gap-3 text-slate-400 text-xs font-mono">
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-2.5 rounded-lg shadow-sm">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
              <span>Autonomous MCP Agent reasoning and invoking spatial tools...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Prompt Control Bar */}
      <div className="p-4 bg-slate-900 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Ask the DO-272 MCP Agent (e.g., 'Audit KSFO for compliance', 'Find taxi route from Gate A1', 'Check Part 77 obstacles')..."
              disabled={isProcessing}
              className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={!inputPrompt.trim() || isProcessing}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:pointer-events-none text-white rounded-lg text-sm font-medium transition-colors cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>Send</span>
          </button>
        </form>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 px-1 font-mono">
          <span>Model Context Protocol (JSON-RPC 2.0 over stdio/IPC)</span>
          <span>RTCA DO-272 / EUROCAE ED-99 Spatial Engine</span>
        </div>
      </div>
    </div>
  );
};
